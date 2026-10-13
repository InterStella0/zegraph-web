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
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from 'components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from 'components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from 'components/ui/dropdown-menu';
import { MoreVertical, Plus, Pencil, Trash2, Link2, Link2Off, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { fetchApiUrl } from 'utils/generalUtils';

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Community dialog ─────────────────────────────────────────────────────────

function CommunityDialog({
  open, onOpenChange, community, onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  community: AdminCommunity | null;
  onSuccess: () => void;
}) {
  const isEdit = community !== null;
  const [name, setName] = useState('');
  const [shortenName, setShortenName] = useState('');
  const [iconUrl, setIconUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploadingIcon, setUploadingIcon] = useState(false);

  useEffect(() => {
    if (community) {
      setName(community.name ?? '');
      setShortenName(community.shorten_name ?? '');
      setIconUrl(community.icon_url ?? '');
    } else {
      setName(''); setShortenName(''); setIconUrl('');
    }
  }, [community, open]);

  const handleSubmit = async () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    if (shortenName.length > 20) { toast.error('Short name must be 20 chars or fewer'); return; }
    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        shorten_name: shortenName || null,
        icon_url: iconUrl || null,
      };
      if (isEdit) {
        await fetchApiUrl(`/admin/servers/communities/${community!.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        toast.success('Community updated');
      } else {
        await fetchApiUrl('/admin/servers/communities', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        toast.success('Community created');
      }
      onSuccess();
      onOpenChange(false);
    } catch {
      toast.error('Failed to save community');
    } finally {
      setSubmitting(false);
    }
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
      setIconUrl(updated.icon_url ?? '');
      toast.success('Icon uploaded');
      onSuccess();
    } catch {
      toast.error('Failed to upload icon');
    } finally {
      setUploadingIcon(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit' : 'Create'} Community</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update community details.' : 'Add a new community. You can add servers to it after creation.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. GFL" />
          </div>
          <div className="space-y-2">
            <Label>Short Name <span className="text-muted-foreground text-xs">(max 20 chars)</span></Label>
            <Input value={shortenName} onChange={e => setShortenName(e.target.value)} placeholder="e.g. GFL" maxLength={20} />
          </div>
          <div className="space-y-2">
            <Label>Icon URL</Label>
            <Input value={iconUrl} onChange={e => setIconUrl(e.target.value)} placeholder="https://..." />
          </div>
          {isEdit && (
            <div className="space-y-2">
              <Label>Upload Icon</Label>
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
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Saving...' : isEdit ? 'Update' : 'Create'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Server Browser dialog ────────────────────────────────────────────────────

function ServerBrowserDialog({
  open, onOpenChange, entry, onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entry: AdminServerBrowser | null;
  onSuccess: () => void;
}) {
  const isEdit = entry !== null;
  const [ip, setIp] = useState('');
  const [port, setPort] = useState('');
  const [tracking, setTracking] = useState(true);
  const [cooldownType, setCooldownType] = useState<string>('unknown');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (entry) {
      setIp(entry.ip);
      setPort(String(entry.port));
      setTracking(entry.tracking);
      setCooldownType(entry.cooldown_type);
    } else {
      setIp(''); setPort(''); setTracking(true); setCooldownType('unknown');
    }
  }, [entry, open]);

  const handleSubmit = async () => {
    if (!ip.trim()) { toast.error('IP is required'); return; }
    const portNum = parseInt(port, 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      toast.error('Port must be between 1 and 65535');
      return;
    }
    setSubmitting(true);
    try {
      if (isEdit) {
        await fetchApiUrl(`/admin/servers/browser?ip=${encodeURIComponent(entry!.ip)}&port=${entry!.port}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tracking, cooldown_type: cooldownType }),
        });
        toast.success('Entry updated');
      } else {
        await fetchApiUrl('/admin/servers/browser', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ip: ip.trim(), port: portNum, tracking, cooldown_type: cooldownType }),
        });
        toast.success('Entry added');
      }
      onSuccess();
      onOpenChange(false);
    } catch {
      toast.error('Failed to save entry');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit' : 'Add'} Server Browser Entry</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update tracking and cooldown settings.'
              : 'Add an IP:Port for the scraper to track. The scraper picks up entries where tracking is enabled.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div className="space-y-2">
              <Label>IP Address *</Label>
              <Input
                value={ip} onChange={e => setIp(e.target.value)}
                placeholder="1.2.3.4" disabled={isEdit}
              />
            </div>
            <div className="space-y-2">
              <Label>Port *</Label>
              <Input
                value={port} onChange={e => setPort(e.target.value)}
                type="number" min={1} max={65535} placeholder="27015"
                disabled={isEdit} className="w-24"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Cooldown Tracking</Label>
            <Select value={cooldownType} onValueChange={setCooldownType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unknown">Unknown</SelectItem>
                <SelectItem value="datetime">By Datetime</SelectItem>
                <SelectItem value="map_count">By Map Count</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={tracking} onCheckedChange={setTracking} id="tracking-toggle" />
            <Label htmlFor="tracking-toggle">Tracking enabled</Label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Saving...' : isEdit ? 'Update' : 'Add'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit server name dialog ──────────────────────────────────────────────────

function EditServerNameDialog({
  open, onOpenChange, server, onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  server: AdminServer | null;
  onSuccess: () => void;
}) {
  const [name, setName] = useState('');
  const [readableLink, setReadableLink] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setName(server?.server_name ?? '');
    setReadableLink(server?.readable_link ?? '');
  }, [server, open]);

  const handleSubmit = async () => {
    if (!server) return;
    setSubmitting(true);
    try {
      await fetchApiUrl(`/admin/servers/raw/${server.server_id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ server_name: name || null, readable_link: readableLink.trim() }),
      });
      toast.success('Server updated');
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update server');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit Server</DialogTitle>
          <DialogDescription>{server?.server_fullname ?? server?.server_id}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Display Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. ZE Server #1" />
          </div>
          <div className="space-y-2">
            <Label>Readable Link (URL slug)</Label>
            <Input
              value={readableLink}
              onChange={e => setReadableLink(e.target.value)}
              placeholder="e.g. gfl-ze"
              maxLength={20}
            />
            <p className="text-xs text-muted-foreground">
              Changes the server&apos;s URL. Leave empty to clear (URL falls back to the server ID).
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Saving...' : 'Update'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit server metadata dialog ──────────────────────────────────────────────

function EditMetadataDialog({
  open, onOpenChange, server, onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  server: AdminServer | null;
  onSuccess: () => void;
}) {
  const [website, setWebsite] = useState('');
  const [discordLink, setDiscordLink] = useState('');
  const [source, setSource] = useState('');
  const [timezone, setTimezone] = useState('');
  const [game, setGame] = useState('730_cs2');
  const [sourceById, setSourceById] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setWebsite(server?.server_website ?? '');
    setDiscordLink(server?.server_discord_link ?? '');
    setSource(server?.server_source ?? '');
    setTimezone(server?.timezone ?? '');
    setGame(server?.game ?? '730_cs2');
    setSourceById(server?.source_by_id ?? false);
  }, [server, open]);

  const handleSubmit = async () => {
    if (!server) return;
    setSubmitting(true);
    try {
      await fetchApiUrl(`/admin/servers/raw/${server.server_id}/metadata`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          server_website: website.trim() || null,
          server_discord_link: discordLink.trim() || null,
          server_source: source.trim() || null,
          timezone: timezone.trim() || null,
          game,
          source_by_id: sourceById,
        }),
      });
      toast.success('Server metadata updated');
      onSuccess();
      onOpenChange(false);
    } catch {
      toast.error('Failed to update metadata');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Server Metadata</DialogTitle>
          <DialogDescription>{server?.server_fullname ?? server?.server_id}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Website</Label>
            <Input value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://..." />
          </div>
          <div className="space-y-2">
            <Label>Discord Link</Label>
            <Input value={discordLink} onChange={e => setDiscordLink(e.target.value)} placeholder="https://discord.gg/..." />
          </div>
          <div className="space-y-2">
            <Label>Source</Label>
            <Input value={source} onChange={e => setSource(e.target.value)} placeholder="e.g. gameme" />
          </div>
          <div className="space-y-2">
            <Label>Timezone</Label>
            <Input value={timezone} onChange={e => setTimezone(e.target.value)} placeholder="e.g. America/New_York" />
          </div>
          <div className="space-y-2">
            <Label>Game</Label>
            <Select value={game} onValueChange={setGame}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GAME_OPTIONS.map(g => (
                  <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={sourceById} onCheckedChange={setSourceById} id="source-by-id-toggle" />
            <Label htmlFor="source-by-id-toggle">Source by ID</Label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Saving...' : 'Update'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Set community dialog ─────────────────────────────────────────────────────

function SetCommunityDialog({
  open, onOpenChange, server, communities, onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  server: AdminServer | null;
  communities: AdminCommunity[];
  onSuccess: () => void;
}) {
  const [communityId, setCommunityId] = useState<string>('__none__');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setCommunityId(server?.community_id ?? '__none__');
  }, [server, open]);

  const handleSubmit = async () => {
    if (!server) return;
    setSubmitting(true);
    try {
      await fetchApiUrl(`/admin/servers/raw/${server.server_id}/community`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ community_id: communityId === '__none__' ? null : communityId }),
      });
      toast.success('Community assignment updated');
      onSuccess();
      onOpenChange(false);
    } catch {
      toast.error('Failed to update community');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Set Community</DialogTitle>
          <DialogDescription>{server?.server_fullname ?? server?.server_id}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Community</Label>
            <Select value={communityId} onValueChange={setCommunityId}>
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
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Saving...' : 'Update'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ServersAdminPage() {
  const [communities, setCommunities] = useState<AdminCommunity[]>([]);
  const [browsers, setBrowsers] = useState<AdminServerBrowser[]>([]);
  const [servers, setServers] = useState<AdminServer[]>([]);
  const [loading, setLoading] = useState(true);

  const [commDialog, setCommDialog] = useState(false);
  const [editingComm, setEditingComm] = useState<AdminCommunity | null>(null);

  const [browserDialog, setBrowserDialog] = useState(false);
  const [editingBrowser, setEditingBrowser] = useState<AdminServerBrowser | null>(null);

  const [editNameDialog, setEditNameDialog] = useState(false);
  const [editingServer, setEditingServer] = useState<AdminServer | null>(null);

  const [setCommunityDialog, setSetCommunityDialog] = useState(false);
  const [communityTargetServer, setCommunityTargetServer] = useState<AdminServer | null>(null);

  const [metadataDialog, setMetadataDialog] = useState(false);
  const [metadataServer, setMetadataServer] = useState<AdminServer | null>(null);

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

  const deleteCommunity = async (id: string, name: string | null) => {
    if (!confirm(`Delete community "${name ?? id}"?\n\nThis will cascade and remove all linked server_browser entries and server records.`)) return;
    try {
      await fetchApiUrl(`/admin/servers/communities/${id}`, { method: 'DELETE' });
      toast.success('Community deleted');
      fetchAll();
    } catch {
      toast.error('Failed to delete community');
    }
  };

  const deleteBrowser = async (ip: string, port: number) => {
    if (!confirm(`Remove ${ip}:${port} from tracking? This stops the scraper from discovering this server.`)) return;
    try {
      await fetchApiUrl(`/admin/servers/browser?ip=${encodeURIComponent(ip)}&port=${port}`, { method: 'DELETE' });
      toast.success('Entry removed');
      fetchAll();
    } catch {
      toast.error('Failed to remove entry');
    }
  };

  const deleteServer = async (id: string, name: string | null) => {
    if (!confirm(`Delete scraped server "${name ?? id}"?\n\nThis removes all scraped session data for this server.`)) return;
    try {
      await fetchApiUrl(`/admin/servers/raw/${id}`, { method: 'DELETE' });
      toast.success('Server deleted');
      fetchAll();
    } catch {
      toast.error('Failed to delete server');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Server Management</h1>
        <p className="text-muted-foreground">
          Manage communities, scraper tracking entries, and scraped server data.
        </p>
      </div>

      <Tabs defaultValue="communities">
        <TabsList className="mb-4">
          <TabsTrigger value="communities">Communities ({communities.length})</TabsTrigger>
          <TabsTrigger value="browser">Server Browser ({browsers.length})</TabsTrigger>
          <TabsTrigger value="servers">Scraped Servers ({servers.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="communities">
          <div className="flex justify-end mb-4">
            <Button onClick={() => { setEditingComm(null); setCommDialog(true); }}>
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
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">No communities found</TableCell>
                </TableRow>
              ) : communities.map(c => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell>{c.shorten_name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground text-xs">{c.icon_url ?? '—'}</TableCell>
                  <TableCell>{c.server_count}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { setEditingComm(c); setCommDialog(true); }}>
                          <Pencil className="mr-2 h-4 w-4" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => deleteCommunity(c.id, c.name)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="browser">
          <div className="flex justify-end mb-4">
            <Button onClick={() => { setEditingBrowser(null); setBrowserDialog(true); }}>
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
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">No entries found</TableCell>
                </TableRow>
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
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { setEditingBrowser(b); setBrowserDialog(true); }}>
                          <Pencil className="mr-2 h-4 w-4" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => deleteBrowser(b.ip, b.port)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">No scraped servers found</TableCell>
                </TableRow>
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
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => { setEditingServer(s); setEditNameDialog(true); }}>
                            <Pencil className="mr-2 h-4 w-4" /> Edit Name & Link
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setMetadataServer(s); setMetadataDialog(true); }}>
                            <Settings className="mr-2 h-4 w-4" /> Edit Metadata
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setCommunityTargetServer(s); setSetCommunityDialog(true); }}>
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
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>

      <CommunityDialog
        open={commDialog}
        onOpenChange={setCommDialog}
        community={editingComm}
        onSuccess={fetchAll}
      />
      <ServerBrowserDialog
        open={browserDialog}
        onOpenChange={setBrowserDialog}
        entry={editingBrowser}
        onSuccess={fetchAll}
      />
      <EditServerNameDialog
        open={editNameDialog}
        onOpenChange={setEditNameDialog}
        server={editingServer}
        onSuccess={fetchAll}
      />
      <SetCommunityDialog
        open={setCommunityDialog}
        onOpenChange={setSetCommunityDialog}
        server={communityTargetServer}
        communities={communities}
        onSuccess={fetchAll}
      />
      <EditMetadataDialog
        open={metadataDialog}
        onOpenChange={setMetadataDialog}
        server={metadataServer}
        onSuccess={fetchAll}
      />
    </div>
  );
}
