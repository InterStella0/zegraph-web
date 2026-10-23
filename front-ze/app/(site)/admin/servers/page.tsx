'use client';

import { useState, useEffect, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from 'components/ui/tabs';
import { TableCell, TableRow } from 'components/ui/table';
import { Button } from 'components/ui/button';
import { Badge } from 'components/ui/badge';
import { Input } from 'components/ui/input';
import { Label } from 'components/ui/label';
import { Switch } from 'components/ui/switch';
import { Plus, Pencil, Trash2, Link2, Link2Off, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { fetchApiUrl } from 'utils/generalUtils';
import { sendJson } from 'lib/sendJson';
import {
  ActionItem, AdminHeader, AdminSpinner, AdminTable, EditDeleteItems, Field, FormDialog, InputField, OptionSelect, postForm,
  RowActions, runAction, upsertJson, useDialogTarget, useFormDialog, type CrudDialogProps,
} from '../components/AdminUI';

interface AdminCommunity {
  id: string;
  name: string | null;
  shorten_name: string | null;
  icon_url: string | null;
  server_count: number;
}

interface AdminServerBrowser {
  ip: string;
  port: number;
  tracking: boolean;
  cooldown_type: 'unknown' | 'datetime' | 'map_count';
}

interface AdminServer {
  server_id: string;
  server_name: string | null;
  server_fullname: string | null;
  server_ip: string | null;
  server_port: number | null;
  community_id: string | null;
  online: boolean | null;
  readable_link: string | null;
  external_source_url: string | null;
  server_website: string | null;
  server_discord_link: string | null;
  server_source: string | null;
  timezone: string | null;
  game: string | null;
  source_by_id: boolean | null;
}

const COOLDOWN_LABELS: Record<string, string> = {
  unknown: 'Unknown',
  datetime: 'By Datetime',
  map_count: 'By Map Count',
};

const GAME_OPTIONS: [string, string][] = [
  ['730_cs2', 'CS2 (730)'],
  ['730_csgo', 'CS:GO (730)'],
  ['240', 'CS:S (240)'],
];

const NONE = '__none__';

const DASH = <span className="text-muted-foreground">—</span>;

const browserQuery = (entry: AdminServerBrowser) => `?ip=${encodeURIComponent(entry.ip)}&port=${entry.port}`;

const serverLabel = (server: AdminServer | null) => server?.server_fullname ?? server?.server_id;

function CommunityDialog(props: CrudDialogProps<AdminCommunity>) {
  const community = props.item;
  const isEdit = community !== null;
  const { form, set, bind, save, dialog } = useFormDialog(props, () => ({
    name: community?.name ?? '',
    shortenName: community?.shorten_name ?? '',
    iconUrl: community?.icon_url ?? '',
  }));
  const { name, shortenName, iconUrl } = form;
  const [uploadingIcon, setUploadingIcon] = useState(false);

  const handleSubmit = () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    if (shortenName.length > 20) { toast.error('Short name must be 20 chars or fewer'); return; }
    return save(() => upsertJson('/admin/servers/communities', community?.id, {
      name: name.trim(),
      shorten_name: shortenName || null,
      icon_url: iconUrl || null,
    }), isEdit ? 'Community updated' : 'Community created', 'Failed to save community');
  };

  const handleIconUpload = async (file: File) => {
    if (!community) return;
    const formData = new FormData();
    formData.append('icon', file);
    setUploadingIcon(true);
    await runAction(async () => {
      const updated = await postForm<AdminCommunity>(`/admin/servers/communities/${community.id}/icon`, formData);
      set('iconUrl')(updated.icon_url ?? '');
    }, props.onSuccess, { success: 'Icon uploaded', failure: 'Failed to upload icon' });
    setUploadingIcon(false);
  };

  return (
    <FormDialog
      {...dialog}
      title={<>{isEdit ? 'Edit' : 'Create'} Community</>}
      description={isEdit ? 'Update community details.' : 'Add a new community. You can add servers to it after creation.'}
      onSubmit={handleSubmit}
      submitLabel={isEdit ? 'Update' : 'Create'}
    >
      <InputField label="Name *" {...bind('name')} placeholder="e.g. GFL" />
      <InputField
        label={<>Short Name <span className="text-muted-foreground text-xs">(max 20 chars)</span></>}
        {...bind('shortenName')}
        placeholder="e.g. GFL"
        maxLength={20}
      />
      <InputField label="Icon URL" {...bind('iconUrl')} placeholder="https://..." />
      {isEdit && (
        <Field label="Upload Icon">
          <div className="flex items-center gap-3">
            {iconUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={iconUrl} alt="icon" className="w-10 h-10 rounded object-cover border" />
            )}
            <Input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={uploadingIcon}
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) handleIconUpload(file);
                e.target.value = '';
              }}
            />
          </div>
        </Field>
      )}
    </FormDialog>
  );
}

function ServerBrowserDialog(props: CrudDialogProps<AdminServerBrowser>) {
  const entry = props.item;
  const isEdit = entry !== null;
  const { form, set, bind, save, dialog } = useFormDialog(props, () => ({
    ip: entry ? entry.ip : '',
    port: entry ? String(entry.port) : '',
    tracking: entry ? entry.tracking : true,
    cooldownType: entry ? entry.cooldown_type : 'unknown',
  }));
  const { ip, port, tracking, cooldownType } = form;

  const handleSubmit = () => {
    if (!ip.trim()) { toast.error('IP is required'); return; }
    const portNum = parseInt(port, 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      toast.error('Port must be between 1 and 65535');
      return;
    }
    return save(() => isEdit
      ? sendJson(`/admin/servers/browser${browserQuery(entry)}`, 'PUT', { tracking, cooldown_type: cooldownType })
      : sendJson('/admin/servers/browser', 'POST', { ip: ip.trim(), port: portNum, tracking, cooldown_type: cooldownType }), isEdit ? 'Entry updated' : 'Entry added', 'Failed to save entry');
  };

  return (
    <FormDialog
      {...dialog}
      title={<>{isEdit ? 'Edit' : 'Add'} Server Browser Entry</>}
      description={isEdit
        ? 'Update tracking and cooldown settings.'
        : 'Add an IP:Port for the scraper to track. The scraper picks up entries where tracking is enabled.'}
      onSubmit={handleSubmit}
      submitLabel={isEdit ? 'Update' : 'Add'}
    >
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <InputField label="IP Address *" {...bind('ip')} placeholder="1.2.3.4" disabled={isEdit} />
        <InputField
          label="Port *"
          {...bind('port')}
          type="number" min={1} max={65535} placeholder="27015"
          disabled={isEdit} className="w-24"
        />
      </div>
      <Field label="Cooldown Tracking">
        <OptionSelect value={cooldownType} onChange={set('cooldownType')} options={Object.entries(COOLDOWN_LABELS)} />
      </Field>
      <div className="flex items-center gap-3">
        <Switch checked={tracking} onCheckedChange={set('tracking')} id="tracking-toggle" />
        <Label htmlFor="tracking-toggle">Tracking enabled</Label>
      </div>
    </FormDialog>
  );
}

function EditServerNameDialog(props: CrudDialogProps<AdminServer>) {
  const server = props.item;
  const { form, bind, save, dialog } = useFormDialog(props, () => ({
    name: server?.server_name ?? '',
    readableLink: server?.readable_link ?? '',
    externalSourceUrl: server?.external_source_url ?? '',
  }));
  const { name, readableLink, externalSourceUrl } = form;

  const handleSubmit = () => {
    if (!server) return;
    return save(() => sendJson(`/admin/servers/raw/${server.server_id}`, 'PUT', { server_name: name || null, readable_link: readableLink.trim(), external_source_url: externalSourceUrl.trim() }), 'Server updated', (err) => toast.error(err instanceof Error ? err.message : 'Failed to update server'));
  };

  return (
    <FormDialog
      {...dialog}
      className="max-w-sm"
      title="Edit Server"
      description={serverLabel(server)}
      onSubmit={handleSubmit}
      submitLabel="Update"
      footerClassName="flex justify-end gap-2"
    >
      <InputField label="Display Name" {...bind('name')} placeholder="e.g. ZE Server #1" />
      <Field label="Readable Link (URL slug)">
        <Input {...bind('readableLink')} placeholder="e.g. gfl-ze" maxLength={20} />
        <p className="text-xs text-muted-foreground">
          Changes the server&apos;s URL. Leave empty to clear (URL falls back to the server ID).
        </p>
      </Field>
      <Field label="External Stats Link">
        <Input {...bind('externalSourceUrl')} placeholder="https://example.com/players/{player_id}" />
        <p className="text-xs text-muted-foreground">
          Opened from &quot;Reported by …&quot; on player pages. <code>{'{player_id}'}</code> is replaced with the player&apos;s ID. Leave empty to show no link.
        </p>
      </Field>
    </FormDialog>
  );
}

function EditMetadataDialog(props: CrudDialogProps<AdminServer>) {
  const server = props.item;
  const { form, set, bind, save, dialog } = useFormDialog(props, () => ({
    website: server?.server_website ?? '',
    discordLink: server?.server_discord_link ?? '',
    source: server?.server_source ?? '',
    timezone: server?.timezone ?? '',
    game: server?.game ?? '730_cs2',
    sourceById: server?.source_by_id ?? false,
  }));
  const { website, discordLink, source, timezone, game, sourceById } = form;

  const handleSubmit = () => {
    if (!server) return;
    return save(() => sendJson(`/admin/servers/raw/${server.server_id}/metadata`, 'PUT', {
        server_website: website.trim() || null,
        server_discord_link: discordLink.trim() || null,
        server_source: source.trim() || null,
        timezone: timezone.trim() || null,
        game,
        source_by_id: sourceById,
      }), 'Server metadata updated', 'Failed to update metadata');
  };

  return (
    <FormDialog
      {...dialog}
      title="Edit Server Metadata"
      description={serverLabel(server)}
      onSubmit={handleSubmit}
      submitLabel="Update"
    >
      <InputField label="Website" {...bind('website')} placeholder="https://..." />
      <InputField label="Discord Link" {...bind('discordLink')} placeholder="https://discord.gg/..." />
      <InputField label="Source" {...bind('source')} placeholder="e.g. gameme" />
      <InputField label="Timezone" {...bind('timezone')} placeholder="e.g. America/New_York" />
      <Field label="Game">
        <OptionSelect value={game} onChange={set('game')} options={GAME_OPTIONS} />
      </Field>
      <div className="flex items-center gap-3">
        <Switch checked={sourceById} onCheckedChange={set('sourceById')} id="source-by-id-toggle" />
        <Label htmlFor="source-by-id-toggle">Source by ID</Label>
      </div>
    </FormDialog>
  );
}

function SetCommunityDialog({ communities, ...props }: CrudDialogProps<AdminServer> & { communities: AdminCommunity[] }) {
  const server = props.item;
  const { form: { communityId }, set, save, dialog } = useFormDialog(props, () => ({
    communityId: server?.community_id ?? NONE,
  }));

  const handleSubmit = () => {
    if (!server) return;
    return save(() => sendJson(`/admin/servers/raw/${server.server_id}/community`, 'PUT', { community_id: communityId === NONE ? null : communityId }), 'Community assignment updated', 'Failed to update community');
  };

  return (
    <FormDialog
      {...dialog}
      className="max-w-sm"
      title="Set Community"
      description={serverLabel(server)}
      onSubmit={handleSubmit}
      submitLabel="Update"
      footerClassName="flex justify-end gap-2"
    >
      <Field label="Community">
        <OptionSelect
          value={communityId}
          onChange={set('communityId')}
          options={[[NONE, '— None (detach) —'], ...communities.map((c): [string, string] => [c.id, c.name ?? c.id])]}
          placeholder="None (detached)"
        />
      </Field>
    </FormDialog>
  );
}

function AddButton({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <div className="flex justify-end mb-4">
      <Button onClick={onClick}>
        <Plus className="mr-2 h-4 w-4" />
        {children}
      </Button>
    </div>
  );
}

export default function ServersAdminPage() {
  const [communities, setCommunities] = useState<AdminCommunity[]>([]);
  const [browsers, setBrowsers] = useState<AdminServerBrowser[]>([]);
  const [servers, setServers] = useState<AdminServer[]>([]);
  const [loading, setLoading] = useState(true);

  const commDialog = useDialogTarget<AdminCommunity>();
  const browserDialog = useDialogTarget<AdminServerBrowser>();
  const editNameDialog = useDialogTarget<AdminServer>();
  const setCommunityDialog = useDialogTarget<AdminServer>();
  const metadataDialog = useDialogTarget<AdminServer>();

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [comms, brows, srvs] = await Promise.all([
        fetchApiUrl('/admin/servers/communities'),
        fetchApiUrl('/admin/servers/browser'),
        fetchApiUrl('/admin/servers/raw'),
      ]);
      setCommunities(comms ?? []);
      setBrowsers(brows ?? []);
      setServers(srvs ?? []);
    } catch {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const remove = (question: string, endpoint: string, success: string, failure: string) =>
    runAction(() => fetchApiUrl(endpoint, { method: 'DELETE' }), fetchAll, { confirm: question, success, failure });

  if (loading) return <AdminSpinner />;

  return (
    <div>
      <AdminHeader
        className="mb-6"
        title="Server Management"
        description="Manage communities, scraper tracking entries, and scraped server data."
      />

      <Tabs defaultValue="communities">
        <TabsList className="mb-4">
          <TabsTrigger value="communities">Communities ({communities.length})</TabsTrigger>
          <TabsTrigger value="browser">Server Browser ({browsers.length})</TabsTrigger>
          <TabsTrigger value="servers">Scraped Servers ({servers.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="communities">
          <AddButton onClick={() => commDialog.show(null)}>New Community</AddButton>
          <AdminTable headers={['Name', 'Short Name', 'Icon URL', 'Servers', 'Actions']} rows={communities} empty="No communities found">
            {c => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name ?? DASH}</TableCell>
                <TableCell>{c.shorten_name ?? DASH}</TableCell>
                <TableCell className="max-w-xs truncate text-muted-foreground text-xs">{c.icon_url ?? '—'}</TableCell>
                <TableCell>{c.server_count}</TableCell>
                <TableCell>
                  <RowActions>
                    <EditDeleteItems
                      onEdit={() => commDialog.show(c)}
                      onDelete={() => remove(
                        `Delete community "${c.name ?? c.id}"?\n\nThis will cascade and remove all linked server_browser entries and server records.`,
                        `/admin/servers/communities/${c.id}`, 'Community deleted', 'Failed to delete community',
                      )}
                    />
                  </RowActions>
                </TableCell>
              </TableRow>
            )}
          </AdminTable>
        </TabsContent>

        <TabsContent value="browser">
          <AddButton onClick={() => browserDialog.show(null)}>Add IP:Port</AddButton>
          <AdminTable headers={['IP Address', 'Port', 'Tracking', 'Cooldown Type', 'Actions']} rows={browsers} empty="No entries found">
            {b => (
              <TableRow key={`${b.ip}:${b.port}`}>
                <TableCell className="font-mono">{b.ip}</TableCell>
                <TableCell className="font-mono">{b.port}</TableCell>
                <TableCell>
                  <Badge variant={b.tracking ? 'default' : 'secondary'}>
                    {b.tracking ? 'Tracking' : 'Paused'}
                  </Badge>
                </TableCell>
                <TableCell>{COOLDOWN_LABELS[b.cooldown_type] ?? b.cooldown_type}</TableCell>
                <TableCell>
                  <RowActions>
                    <EditDeleteItems
                      onEdit={() => browserDialog.show(b)}
                      onDelete={() => remove(
                        `Remove ${b.ip}:${b.port} from tracking? This stops the scraper from discovering this server.`,
                        `/admin/servers/browser${browserQuery(b)}`, 'Entry removed', 'Failed to remove entry',
                      )}
                    />
                  </RowActions>
                </TableCell>
              </TableRow>
            )}
          </AdminTable>
        </TabsContent>

        <TabsContent value="servers">
          <AdminTable
            headers={['Full Name', 'Display Name', 'IP:Port', 'Community', 'Status', 'Actions']}
            rows={servers}
            empty="No scraped servers found"
          >
            {s => {
              const community = communities.find(c => c.id === s.community_id);
              return (
                <TableRow key={s.server_id}>
                  <TableCell className="font-medium max-w-70 truncate" title={s.server_fullname ?? s.server_id}>
                    {s.server_fullname ?? <span className="text-muted-foreground font-mono text-xs">{s.server_id}</span>}
                  </TableCell>
                  <TableCell className="max-w-50 truncate" title={s.server_name ?? undefined}>
                    {s.server_name ?? DASH}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {s.server_ip && s.server_port ? `${s.server_ip}:${s.server_port}` : '—'}
                  </TableCell>
                  <TableCell>
                    {community
                      ? <Badge variant="outline">{community.name ?? community.id}</Badge>
                      : <span className="text-muted-foreground text-sm">Unassigned</span>
                    }
                  </TableCell>
                  <TableCell>
                    <Badge variant={s.online ? 'default' : 'secondary'}>
                      {s.online ? 'Online' : 'Offline'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <RowActions>
                      <ActionItem icon={Pencil} onClick={() => editNameDialog.show(s)}>Edit Name & Link</ActionItem>
                      <ActionItem icon={Settings} onClick={() => metadataDialog.show(s)}>Edit Metadata</ActionItem>
                      <ActionItem icon={s.community_id ? Link2Off : Link2} onClick={() => setCommunityDialog.show(s)}>
                        {s.community_id ? 'Change Community' : 'Assign Community'}
                      </ActionItem>
                      <ActionItem
                        icon={Trash2}
                        destructive
                        onClick={() => remove(
                          `Delete scraped server "${s.server_name ?? s.server_fullname ?? s.server_id}"?\n\nThis removes all scraped session data for this server.`,
                          `/admin/servers/raw/${s.server_id}`, 'Server deleted', 'Failed to delete server',
                        )}
                      >
                        Delete Scraped Data
                      </ActionItem>
                    </RowActions>
                  </TableCell>
                </TableRow>
              );
            }}
          </AdminTable>
        </TabsContent>
      </Tabs>

      <CommunityDialog {...commDialog.dialogProps(fetchAll)} />
      <ServerBrowserDialog {...browserDialog.dialogProps(fetchAll)} />
      <EditServerNameDialog {...editNameDialog.dialogProps(fetchAll)} />
      <SetCommunityDialog {...setCommunityDialog.dialogProps(fetchAll)} communities={communities} />
      <EditMetadataDialog {...metadataDialog.dialogProps(fetchAll)} />
    </div>
  );
}
