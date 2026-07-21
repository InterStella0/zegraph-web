'use client';

import { useState, useEffect, useCallback } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/ui/table';
import { Button } from 'components/ui/button';
import { Badge } from 'components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from 'components/ui/dropdown-menu';
import { MoreVertical, Plus, Pencil, Trash2 } from 'lucide-react';
import { fetchApiUrl } from 'utils/generalUtils';
import { CreateEditAnnouncementDialog } from './CreateEditAnnouncementDialog';
import type { Announcement, AnnouncementsPaginated, AnnouncementStatusFilter } from 'types/announcements';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/ui/select';
import dayjs from 'dayjs';

export default function AnnouncementsAdminPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<AnnouncementStatusFilter>('Active');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = statusFilter !== 'All' ? { status: statusFilter  } : {};
      const data = await fetchApiUrl('/admin/announcements', { params });
      setAnnouncements((data as AnnouncementsPaginated).announcements || []);
    } catch (error) {
      console.error('Failed to fetch announcements:', error);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

    // Note: We don't have show field in the response, so we determine status by dates only
    if (publishedAt.isAfter(now)) {
      return <Badge variant="outline">Scheduled</Badge>
    }
    if (expiresAt && expiresAt.isBefore(now)) {
      return <Badge variant="destructive">Expired</Badge>
    }
    if (announcement.hidden){
      return <Badge variant="destructive">Hidden</Badge>
    }
    return <Badge variant="default">Active</Badge>
  };

  const formatDate = (dateString: string) => {
    return dayjs(dateString).format('MMM D, YYYY HH:mm');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Announcements</h1>
          <p className="text-muted-foreground">
            Manage site-wide announcements and scheduled messages.
          </p>
        </div>
        <Button onClick={() => { setEditingAnnouncement(null); setDialogOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" />
          New Announcement
        </Button>
      </div>

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
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                No announcements found
              </TableCell>
            </TableRow>
          ) : (
            announcements.map((announcement) => (
              <TableRow key={announcement.id}>
                <TableCell>
                  <Badge variant={announcement.type === 'Rich' ? 'default' : 'outline'}>
                    {announcement.type}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div>
                    {announcement.type === 'Rich' && announcement.title && (
                      <div className="font-medium">{announcement.title}</div>
                    )}
                    <div className="text-sm text-muted-foreground truncate max-w-md">
                      {announcement.text.substring(0, 100)}
                      {announcement.text.length > 100 && '...'}
                    </div>
                  </div>
                </TableCell>
                <TableCell>{formatDate(announcement.published_at)}</TableCell>
                <TableCell>
                  {announcement.expires_at ? formatDate(announcement.expires_at) : 'Never'}
                </TableCell>
                <TableCell>{getStatusBadge(announcement)}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => { setEditingAnnouncement(announcement); setDialogOpen(true); }}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => deleteAnnouncement(announcement.id)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <CreateEditAnnouncementDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        announcement={editingAnnouncement}
        onSuccess={fetchData}
      />
    </div>
  );
}
