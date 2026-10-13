'use client';

import { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/ui/table';
import { Button } from 'components/ui/button';
import { Badge } from 'components/ui/badge';
import { DropdownMenuItem } from 'components/ui/dropdown-menu';
import { Eye, Plus } from 'lucide-react';
import { fetchApiUrl } from 'utils/generalUtils';
import { AdminHeader, AdminSpinner, EditDeleteItems, EmptyRow, RowActions, useAdminData } from '../components/AdminUI';
import { CreateEditAnnouncementDialog } from './CreateEditAnnouncementDialog';
import { AnnouncementsDialog } from 'components/announcements/AnnouncementDialog';
import { isVideoUrl } from 'components/announcements/AnnouncementMarkdown';
import type { Announcement, AnnouncementsPaginated, AnnouncementStatusFilter } from 'types/announcements';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/ui/select';
import dayjs from 'dayjs';

function plainSnippet(markdown: string) {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/[*_~`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstMedia(markdown: string) {
  return /!\[[^\]]*\]\(\s*([^)\s]+)/.exec(markdown)?.[1] ?? null;
}

function MediaThumbnail({ url }: { url: string }) {
  const className = 'h-12 w-16 shrink-0 rounded border bg-muted object-cover';
  if (isVideoUrl(url)) {
    return <video src={url} className={className} muted preload="metadata" />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className={className} loading="lazy" />;
}

export default function AnnouncementsAdminPage() {
  const [statusFilter, setStatusFilter] = useState<AnnouncementStatusFilter>('Active');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [previewing, setPreviewing] = useState<Announcement | null>(null);

  const { data: announcements, loading, reload: fetchData } = useAdminData<Announcement[]>(
    '/admin/announcements',
    (data) => (data as AnnouncementsPaginated).announcements || [],
    [],
    'announcements',
    statusFilter !== 'All' ? { status: statusFilter } : {},
  );

  const deleteAnnouncement = async (id: string) => {
    if (!confirm('Are you sure you want to delete this announcement?')) return;

    try {
      await fetchApiUrl(`/admin/announcements/${id}`, { method: 'DELETE' });
      fetchData();
    } catch (error) {
      console.error('Failed to delete announcement:', error);
    }
  };

  const getStatusBadge = (announcement: Announcement) => {
    const now = dayjs();
    const publishedAt = dayjs(announcement.published_at);
    const expiresAt = announcement.expires_at ? dayjs(announcement.expires_at) : null;

    if (announcement.hidden){
      return <Badge variant="secondary">Hidden</Badge>
    }
    if (publishedAt.isAfter(now)) {
      return <Badge variant="outline">Scheduled</Badge>
    }
    if (expiresAt && expiresAt.isBefore(now)) {
      return <Badge variant="destructive">Expired</Badge>
    }
    return <Badge variant="default">Active</Badge>
  };

  const formatDate = (dateString: string) => {
    return dayjs(dateString).format('MMM D, YYYY HH:mm');
  };

  if (loading) return <AdminSpinner />;

  return (
    <div>
      <AdminHeader
        className="mb-6"
        title="Announcements"
        description="Manage site-wide announcements and scheduled messages."
        action={
          <Button onClick={() => { setEditingAnnouncement(null); setDialogOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            New Announcement
          </Button>
        }
      />

      <div className="mb-4">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as AnnouncementStatusFilter)}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All</SelectItem>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Scheduled">Scheduled</SelectItem>
            <SelectItem value="Expired">Expired</SelectItem>
            <SelectItem value="Hidden">Hidden</SelectItem>
           </SelectContent>
        </Select>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Type</TableHead>
            <TableHead>Title/Content</TableHead>
            <TableHead>Published</TableHead>
            <TableHead>Expires</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {announcements.length === 0 ? (
            <EmptyRow colSpan={6}>No announcements found</EmptyRow>
          ) : (
            announcements.map((announcement) => (
              <TableRow key={announcement.id}>
                <TableCell>
                  <Badge variant={announcement.type === 'Rich' ? 'default' : 'outline'}>
                    {announcement.type === 'Rich' ? 'Popup' : 'Banner'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <button
                    type="button"
                    className="flex max-w-xl items-center gap-3 text-left"
                    onClick={() => { setEditingAnnouncement(announcement); setDialogOpen(true); }}
                  >
                    {firstMedia(announcement.text) && <MediaThumbnail url={firstMedia(announcement.text)} />}
                    <div className="min-w-0">
                      {announcement.type === 'Rich' && announcement.title && (
                        <div className="font-medium truncate">{announcement.title}</div>
                      )}
                      <div className="text-sm text-muted-foreground line-clamp-2">
                        {plainSnippet(announcement.text)}
                      </div>
                    </div>
                  </button>
                </TableCell>
                <TableCell>{formatDate(announcement.published_at)}</TableCell>
                <TableCell>
                  {announcement.expires_at ? formatDate(announcement.expires_at) : 'Never'}
                </TableCell>
                <TableCell>{getStatusBadge(announcement)}</TableCell>
                <TableCell>
                  <RowActions>
                    {announcement.type === 'Rich' && (
                      <DropdownMenuItem onClick={() => setPreviewing(announcement)}>
                        <Eye className="mr-2 h-4 w-4" />
                        Preview
                      </DropdownMenuItem>
                    )}
                    <EditDeleteItems
                      onEdit={() => { setEditingAnnouncement(announcement); setDialogOpen(true); }}
                      onDelete={() => deleteAnnouncement(announcement.id)}
                    />
                  </RowActions>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {dialogOpen && (
        <CreateEditAnnouncementDialog
          key={editingAnnouncement?.id ?? 'new'}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          announcement={editingAnnouncement}
          onSuccess={fetchData}
        />
      )}

      {previewing && (
        <AnnouncementsDialog
          announcements={[previewing]}
          open
          onOpenChange={(open) => !open && setPreviewing(null)}
        />
      )}
    </div>
  );
}
