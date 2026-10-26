'use client';

import { useState } from 'react';
import { TableCell, TableRow } from 'components/ui/table';
import { Button } from 'components/ui/button';
import { Badge } from 'components/ui/badge';
import { Eye, Plus } from 'lucide-react';
import { fetchApiUrl } from 'utils/generalUtils';
import {
  ActionItem, AdminHeader, AdminSpinner, AdminTable, EditDeleteItems, logFailure, OptionSelect, RowActions, runAction,
  useAdminData, useDialogTarget,
} from '../components/AdminUI';
import { CreateEditAnnouncementDialog } from './CreateEditAnnouncementDialog';
import { AnnouncementsDialog } from 'components/announcements/AnnouncementDialog';
import { isVideoUrl } from 'components/announcements/AnnouncementMarkdown';
import type { Announcement, AnnouncementsPaginated, AnnouncementStatusFilter } from 'types/announcements';
import dayjs from "lib/dayjs";

const STATUS_FILTERS = ['All', 'Active', 'Scheduled', 'Expired', 'Hidden'].map((status): [string, string] => [status, status]);

const STATUS_VARIANTS = {
  Hidden: 'secondary',
  Scheduled: 'outline',
  Expired: 'destructive',
  Active: 'default',
} as const;

function announcementStatus(announcement: Announcement): keyof typeof STATUS_VARIANTS {
  const now = dayjs();
  if (announcement.hidden) return 'Hidden';
  if (dayjs(announcement.published_at).isAfter(now)) return 'Scheduled';
  if (announcement.expires_at && dayjs(announcement.expires_at).isBefore(now)) return 'Expired';
  return 'Active';
}

const formatDate = (dateString: string) => dayjs(dateString).format('MMM D, YYYY HH:mm');

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
  const dialog = useDialogTarget<Announcement>();
  const [previewing, setPreviewing] = useState<Announcement | null>(null);

  const { data: announcements, loading, reload: fetchData } = useAdminData<Announcement[]>(
    '/admin/announcements',
    (data) => (data as AnnouncementsPaginated).announcements || [],
    [],
    'announcements',
    statusFilter !== 'All' ? { status: statusFilter } : {},
  );

  const deleteAnnouncement = (id: string) => runAction(() => fetchApiUrl(`/admin/announcements/${id}`, { method: 'DELETE' }), fetchData, {
    confirm: 'Are you sure you want to delete this announcement?',
    failure: logFailure('Failed to delete announcement:'),
  });

  if (loading) return <AdminSpinner />;

  return (
    <div>
      <AdminHeader
        className="mb-6"
        title="Announcements"
        description="Manage site-wide announcements and scheduled messages."
        action={
          <Button onClick={() => dialog.show(null)}>
            <Plus className="mr-2 h-4 w-4" />
            New Announcement
          </Button>
        }
      />

      <div className="mb-4">
        <OptionSelect
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as AnnouncementStatusFilter)}
          options={STATUS_FILTERS}
          className="w-48"
        />
      </div>

      <AdminTable
        headers={['Type', 'Title/Content', 'Published', 'Expires', 'Status', 'Actions']}
        rows={announcements}
        empty="No announcements found"
      >
        {(announcement) => {
          const media = firstMedia(announcement.text);
          const status = announcementStatus(announcement);
          return (
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
                  onClick={() => dialog.show(announcement)}
                >
                  {media && <MediaThumbnail url={media} />}
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
              <TableCell>
                <Badge variant={STATUS_VARIANTS[status]}>{status}</Badge>
              </TableCell>
              <TableCell>
                <RowActions>
                  {announcement.type === 'Rich' && (
                    <ActionItem icon={Eye} onClick={() => setPreviewing(announcement)}>Preview</ActionItem>
                  )}
                  <EditDeleteItems
                    onEdit={() => dialog.show(announcement)}
                    onDelete={() => deleteAnnouncement(announcement.id)}
                  />
                </RowActions>
              </TableCell>
            </TableRow>
          );
        }}
      </AdminTable>

      {dialog.open && (
        <CreateEditAnnouncementDialog
          key={dialog.item?.id ?? 'new'}
          open
          onOpenChange={dialog.setOpen}
          announcement={dialog.item}
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
