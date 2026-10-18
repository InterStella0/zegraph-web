'use client';

import { useState, useEffect, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from 'components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/ui/table';
import { Button } from 'components/ui/button';
import { Badge } from 'components/ui/badge';
import { Input } from 'components/ui/input';
import { Label } from 'components/ui/label';
import { Switch } from 'components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from 'components/ui/select';
import { DropdownMenuItem } from 'components/ui/dropdown-menu';
import { Plus, Pencil, Trash2, Link2, Link2Off, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { fetchApiUrl } from 'utils/generalUtils';
import { sendJson } from 'lib/sendJson';
import { AdminHeader, AdminSpinner, EmptyRow, Field, FormDialog, RowActions, useDialogTarget, useResetForm, useSave } from '../components/AdminUI';

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

const GAME_OPTIONS: { value: string; label: string }[] = [
  { value: '730_cs2', label: 'CS2 (730)' },
  { value: '730_csgo', label: 'CS:GO (730)' },
  { value: '240', label: 'CS:S (240)' },
];

function CommunityDialog({
  open, onOpenChange, community, onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  community: AdminCommunity | null;
  onSuccess: () => void;
}) {
  const isEdit = community !== null;
  const [form, set] = useResetForm(open, community, () => ({
    name: community?.name ?? '',
    shortenName: community?.shorten_name ?? '',
    iconUrl: community?.icon_url ?? '',
  }));
  const { name, shortenName, iconUrl } = form;
  const { submitting, save } = useSave(onSuccess, onOpenChange);
  const [uploadingIcon, setUploadingIcon] = useState(false);

  const handleSubmit = () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    if (shortenName.length > 20) { toast.error('Short name must be 20 chars or fewer'); return; }
    return save(() => sendJson(isEdit ? `/admin/servers/communities/${community!.id}` : '/admin/servers/communities', isEdit ? 'PUT' : 'POST', {
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
    try {
      const res = await fetch(`/api/admin/servers/communities/${community.id}/icon`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error(await res.text());
      const updated: AdminCommunity = await res.json();
      set('iconUrl')(updated.icon_url ?? '');
      toast.success('Icon uploaded');
      onSuccess();
    } catch {
      toast.error('Failed to upload icon');
    } finally {
      setUploadingIcon(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={<>{isEdit ? 'Edit' : 'Create'} Community</>}
      description={isEdit ? 'Update community details.' : 'Add a new community. You can add servers to it after creation.'}
      onSubmit={handleSubmit}
      submitting={submitting}
      submitLabel={isEdit ? 'Update' : 'Create'}
    >
      <Field label="Name *">
        <Input value={name} onChange={e => set('name')(e.target.value)} placeholder="e.g. GFL" />
      </Field>
      <Field label={<>Short Name <span className="text-muted-foreground text-xs">(max 20 chars)</span></>}>
        <Input value={shortenName} onChange={e => set('shortenName')(e.target.value)} placeholder="e.g. GFL" maxLength={20} />
      </Field>
      <Field label="Icon URL">
        <Input value={iconUrl} onChange={e => set('iconUrl')(e.target.value)} placeholder="https://..." />
      </Field>
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

function ServerBrowserDialog({
  open, onOpenChange, entry, onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entry: AdminServerBrowser | null;
  onSuccess: () => void;
}) {
  const isEdit = entry !== null;
  const [form, set] = useResetForm(open, entry, () => ({
    ip: entry ? entry.ip : '',
    port: entry ? String(entry.port) : '',
    tracking: entry ? entry.tracking : true,
    cooldownType: entry ? entry.cooldown_type : 'unknown',
  }));
  const { ip, port, tracking, cooldownType } = form;
  const { submitting, save } = useSave(onSuccess, onOpenChange);

  const handleSubmit = () => {
    if (!ip.trim()) { toast.error('IP is required'); return; }
    const portNum = parseInt(port, 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      toast.error('Port must be between 1 and 65535');
      return;
    }
    return save(() => isEdit
      ? sendJson(`/admin/servers/browser?ip=${encodeURIComponent(entry!.ip)}&port=${entry!.port}`, 'PUT', { tracking, cooldown_type: cooldownType })
      : sendJson('/admin/servers/browser', 'POST', { ip: ip.trim(), port: portNum, tracking, cooldown_type: cooldownType }), isEdit ? 'Entry updated' : 'Entry added', 'Failed to save entry');
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={<>{isEdit ? 'Edit' : 'Add'} Server Browser Entry</>}
      description={isEdit
        ? 'Update tracking and cooldown settings.'
        : 'Add an IP:Port for the scraper to track. The scraper picks up entries where tracking is enabled.'}
      onSubmit={handleSubmit}
      submitting={submitting}
      submitLabel={isEdit ? 'Update' : 'Add'}
    >
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <Field label="IP Address *">
          <Input
            value={ip} onChange={e => set('ip')(e.target.value)}
            placeholder="1.2.3.4" disabled={isEdit}
          />
        </Field>
        <Field label="Port *">
          <Input
            value={port} onChange={e => set('port')(e.target.value)}
            type="number" min={1} max={65535} placeholder="27015"
            disabled={isEdit} className="w-24"
          />
        </Field>
      </div>
      <Field label="Cooldown Tracking">
        <Select value={cooldownType} onValueChange={set('cooldownType')}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unknown">Unknown</SelectItem>
            <SelectItem value="datetime">By Datetime</SelectItem>
            <SelectItem value="map_count">By Map Count</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <div className="flex items-center gap-3">
        <Switch checked={tracking} onCheckedChange={set('tracking')} id="tracking-toggle" />
        <Label htmlFor="tracking-toggle">Tracking enabled</Label>
      </div>
    </FormDialog>
  );
}

function EditServerNameDialog({
  open, onOpenChange, server, onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  server: AdminServer | null;
  onSuccess: () => void;
}) {
  const [form, set] = useResetForm(open, server, () => ({
    name: server?.server_name ?? '',
    readableLink: server?.readable_link ?? '',
    externalSourceUrl: server?.external_source_url ?? '',
  }));
  const { name, readableLink, externalSourceUrl } = form;
  const { submitting, save } = useSave(onSuccess, onOpenChange);

  const handleSubmit = () => {
    if (!server) return;
    return save(() => sendJson(`/admin/servers/raw/${server.server_id}`, 'PUT', { server_name: name || null, readable_link: readableLink.trim(), external_source_url: externalSourceUrl.trim() }), 'Server updated', (err) => toast.error(err instanceof Error ? err.message : 'Failed to update server'));
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      className="max-w-sm"
      title="Edit Server"
      description={server?.server_fullname ?? server?.server_id}
      onSubmit={handleSubmit}
      submitting={submitting}
      submitLabel="Update"
      footerClassName="flex justify-end gap-2"
    >
      <Field label="Display Name">
        <Input value={name} onChange={e => set('name')(e.target.value)} placeholder="e.g. ZE Server #1" />
      </Field>
      <Field label="Readable Link (URL slug)">
        <Input
          value={readableLink}
          onChange={e => set('readableLink')(e.target.value)}
          placeholder="e.g. gfl-ze"
          maxLength={20}
        />
        <p className="text-xs text-muted-foreground">
          Changes the server&apos;s URL. Leave empty to clear (URL falls back to the server ID).
        </p>
      </Field>
      <Field label="External Stats Link">
        <Input
          value={externalSourceUrl}
          onChange={e => set('externalSourceUrl')(e.target.value)}
          placeholder="https://example.com/players/{player_id}"
        />
        <p className="text-xs text-muted-foreground">
          Opened from &quot;Reported by …&quot; on player pages. <code>{'{player_id}'}</code> is replaced with the player&apos;s ID. Leave empty to show no link.
        </p>
      </Field>
    </FormDialog>
  );
}

function EditMetadataDialog({
  open, onOpenChange, server, onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  server: AdminServer | null;
  onSuccess: () => void;
}) {
  const [form, set] = useResetForm(open, server, () => ({
    website: server?.server_website ?? '',
    discordLink: server?.server_discord_link ?? '',
    source: server?.server_source ?? '',
    timezone: server?.timezone ?? '',
    game: server?.game ?? '730_cs2',
    sourceById: server?.source_by_id ?? false,
  }));
  const { website, discordLink, source, timezone, game, sourceById } = form;
  const { submitting, save } = useSave(onSuccess, onOpenChange);

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
      open={open}
      onOpenChange={onOpenChange}
      title="Edit Server Metadata"
      description={server?.server_fullname ?? server?.server_id}
      onSubmit={handleSubmit}
      submitting={submitting}
      submitLabel="Update"
    >
      <Field label="Website">
        <Input value={website} onChange={e => set('website')(e.target.value)} placeholder="https://..." />
      </Field>
      <Field label="Discord Link">
        <Input value={discordLink} onChange={e => set('discordLink')(e.target.value)} placeholder="https://discord.gg/..." />
      </Field>
      <Field label="Source">
        <Input value={source} onChange={e => set('source')(e.target.value)} placeholder="e.g. gameme" />
      </Field>
      <Field label="Timezone">
        <Input value={timezone} onChange={e => set('timezone')(e.target.value)} placeholder="e.g. America/New_York" />
      </Field>
      <Field label="Game">
        <Select value={game} onValueChange={set('game')}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GAME_OPTIONS.map(g => (
              <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <div className="flex items-center gap-3">
        <Switch checked={sourceById} onCheckedChange={set('sourceById')} id="source-by-id-toggle" />
        <Label htmlFor="source-by-id-toggle">Source by ID</Label>
      </div>
    </FormDialog>
  );
}

function SetCommunityDialog({
  open, onOpenChange, server, communities, onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  server: AdminServer | null;
  communities: AdminCommunity[];
  onSuccess: () => void;
}) {
  const [{ communityId }, set] = useResetForm(open, server, () => ({
    communityId: server?.community_id ?? '__none__',
  }));
  const { submitting, save } = useSave(onSuccess, onOpenChange);

  const handleSubmit = () => {
    if (!server) return;
    return save(() => sendJson(`/admin/servers/raw/${server.server_id}/community`, 'PUT', { community_id: communityId === '__none__' ? null : communityId }), 'Community assignment updated', 'Failed to update community');
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      className="max-w-sm"
      title="Set Community"
      description={server?.server_fullname ?? server?.server_id}
      onSubmit={handleSubmit}
      submitting={submitting}
      submitLabel="Update"
      footerClassName="flex justify-end gap-2"
    >
      <Field label="Community">
        <Select value={communityId} onValueChange={set('communityId')}>
          <SelectTrigger>
            <SelectValue placeholder="None (detached)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">— None (detach) —</SelectItem>
            {communities.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.name ?? c.id}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </FormDialog>
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
      setCommunities((comms as AdminCommunity[]) ?? []);
      setBrowsers((brows as AdminServerBrowser[]) ?? []);
      setServers((srvs as AdminServer[]) ?? []);
    } catch {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const remove = async (message: string, endpoint: string, success: string, failure: string) => {
    if (!confirm(message)) return;
    try {
      await fetchApiUrl(endpoint, { method: 'DELETE' });
      toast.success(success);
      fetchAll();
    } catch {
      toast.error(failure);
    }
  };

  const deleteCommunity = (id: string, name: string | null) => remove(
    `Delete community "${name ?? id}"?\n\nThis will cascade and remove all linked server_browser entries and server records.`,
    `/admin/servers/communities/${id}`, 'Community deleted', 'Failed to delete community',
  );

  const deleteBrowser = (ip: string, port: number) => remove(
    `Remove ${ip}:${port} from tracking? This stops the scraper from discovering this server.`,
    `/admin/servers/browser?ip=${encodeURIComponent(ip)}&port=${port}`, 'Entry removed', 'Failed to remove entry',
  );

  const deleteServer = (id: string, name: string | null) => remove(
    `Delete scraped server "${name ?? id}"?\n\nThis removes all scraped session data for this server.`,
    `/admin/servers/raw/${id}`, 'Server deleted', 'Failed to delete server',
  );

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
          <div className="flex justify-end mb-4">
            <Button onClick={() => commDialog.show(null)}>
              <Plus className="mr-2 h-4 w-4" />
              New Community
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Short Name</TableHead>
                <TableHead>Icon URL</TableHead>
                <TableHead>Servers</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {communities.length === 0 ? (
                <EmptyRow colSpan={5}>No communities found</EmptyRow>
              ) : communities.map(c => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell>{c.shorten_name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground text-xs">{c.icon_url ?? '—'}</TableCell>
                  <TableCell>{c.server_count}</TableCell>
                  <TableCell>
                    <RowActions>
                      <DropdownMenuItem onClick={() => commDialog.show(c)}>
                        <Pencil className="mr-2 h-4 w-4" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => deleteCommunity(c.id, c.name)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" /> Delete
                      </DropdownMenuItem>
                    </RowActions>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="browser">
          <div className="flex justify-end mb-4">
            <Button onClick={() => browserDialog.show(null)}>
              <Plus className="mr-2 h-4 w-4" />
              Add IP:Port
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>IP Address</TableHead>
                <TableHead>Port</TableHead>
                <TableHead>Tracking</TableHead>
                <TableHead>Cooldown Type</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {browsers.length === 0 ? (
                <EmptyRow colSpan={5}>No entries found</EmptyRow>
              ) : browsers.map(b => (
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
                      <DropdownMenuItem onClick={() => browserDialog.show(b)}>
                        <Pencil className="mr-2 h-4 w-4" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => deleteBrowser(b.ip, b.port)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" /> Delete
                      </DropdownMenuItem>
                    </RowActions>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="servers">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Full Name</TableHead>
                <TableHead>Display Name</TableHead>
                <TableHead>IP:Port</TableHead>
                <TableHead>Community</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {servers.length === 0 ? (
                <EmptyRow colSpan={6}>No scraped servers found</EmptyRow>
              ) : servers.map(s => {
                const community = communities.find(c => c.id === s.community_id);
                return (
                  <TableRow key={s.server_id}>
                    <TableCell className="font-medium max-w-70 truncate" title={s.server_fullname ?? s.server_id}>
                      {s.server_fullname ?? <span className="text-muted-foreground font-mono text-xs">{s.server_id}</span>}
                    </TableCell>
                    <TableCell className="max-w-50 truncate" title={s.server_name ?? undefined}>
                      {s.server_name ?? <span className="text-muted-foreground">—</span>}
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
                        <DropdownMenuItem onClick={() => editNameDialog.show(s)}>
                          <Pencil className="mr-2 h-4 w-4" /> Edit Name & Link
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => metadataDialog.show(s)}>
                          <Settings className="mr-2 h-4 w-4" /> Edit Metadata
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setCommunityDialog.show(s)}>
                          {s.community_id
                            ? <><Link2Off className="mr-2 h-4 w-4" /> Change Community</>
                            : <><Link2 className="mr-2 h-4 w-4" /> Assign Community</>
                          }
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => deleteServer(s.server_id, s.server_name ?? s.server_fullname)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Delete Scraped Data
                        </DropdownMenuItem>
                      </RowActions>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>

      <CommunityDialog
        open={commDialog.open}
        onOpenChange={commDialog.setOpen}
        community={commDialog.item}
        onSuccess={fetchAll}
      />
      <ServerBrowserDialog
        open={browserDialog.open}
        onOpenChange={browserDialog.setOpen}
        entry={browserDialog.item}
        onSuccess={fetchAll}
      />
      <EditServerNameDialog
        open={editNameDialog.open}
        onOpenChange={editNameDialog.setOpen}
        server={editNameDialog.item}
        onSuccess={fetchAll}
      />
      <SetCommunityDialog
        open={setCommunityDialog.open}
        onOpenChange={setCommunityDialog.setOpen}
        server={setCommunityDialog.item}
        communities={communities}
        onSuccess={fetchAll}
      />
      <EditMetadataDialog
        open={metadataDialog.open}
        onOpenChange={metadataDialog.setOpen}
        server={metadataDialog.item}
        onSuccess={fetchAll}
      />
    </div>
  );
}
