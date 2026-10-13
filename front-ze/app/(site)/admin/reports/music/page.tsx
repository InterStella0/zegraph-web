'use client';

import { useState, useEffect, useCallback } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/ui/table';
import { Button } from 'components/ui/button';
import { Input } from 'components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from 'components/ui/dropdown-menu';
import { MoreVertical, CheckCircle, XCircle, Eye } from 'lucide-react';
import { StatusBadge } from '../../components/StatusBadge';
import { StatusFilter } from '../../components/StatusFilter';
import { formatDate, formatReasonLabel } from '../../components/utils';
import { fetchApiUrl } from 'utils/generalUtils';
import type { MapMusicReportAdmin, MapMusicReportsPaginated, ReportStatus } from 'types/admin';
import type { UpdateMapMusicDto } from 'types/maps';

export default function MusicReportsPage() {
  const [reports, setReports] = useState<MapMusicReportAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('pending');

  // Music editing state
  const [editingMusicId, setEditingMusicId] = useState<string | null>(null);
  const [youtubeVideoId, setYoutubeVideoId] = useState<string>('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = statusFilter && statusFilter !== 'all' ? { status: statusFilter } : {};
      const data = await fetchApiUrl('/admin/reports/music', { params });
      setReports((data as MapMusicReportsPaginated).reports || []);
    } catch (error) {
      console.error('Failed to fetch music reports:', error);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const updateStatus = async (reportId: string, status: ReportStatus) => {
    try {
      await fetchApiUrl(`/admin/reports/music/${reportId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      fetchData();
    } catch (error) {
      console.error('Failed to update report status:', error);
    }
  };

  const updateMusicYoutube = async (musicId: string, youtubeId: string | null) => {
    try {
      await fetchApiUrl(`/admin/music/${musicId}/youtube`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ youtube_music: youtubeId || null } as UpdateMapMusicDto),
      });
      setEditingMusicId(null);
      setYoutubeVideoId('');
      fetchData();
    } catch (error) {
      console.error('Failed to update music YouTube ID:', error);
    }
  };

  const startEditingMusic = (musicId: string, currentYoutubeId: string | null) => {
    setEditingMusicId(musicId);
    setYoutubeVideoId(currentYoutubeId || '');
  };

  const cancelEditing = () => {
    setEditingMusicId(null);
    setYoutubeVideoId('');
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
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Music Reports</h1>
        <p className="text-muted-foreground">
          Manage reported music tracks and update YouTube video IDs.
        </p>
      </div>

      <div className="mb-4">
        <StatusFilter value={statusFilter} onChange={setStatusFilter} />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Music Track</TableHead>
            <TableHead>Issue</TableHead>
            <TableHead>Reporter</TableHead>
            <TableHead>Current Video</TableHead>
            <TableHead>Suggested URL</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {reports.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground">
                No music reports found
              </TableCell>
            </TableRow>
          ) : (
            reports.map((report) => (
              <TableRow key={report.id}>
                <TableCell>
                  <div>
                    <div className="font-medium max-w-xs truncate">
                      {report.music_name}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Used in: {report.associated_maps.slice(0, 2).join(', ')}
                      {report.associated_maps.length > 2 && ` +${report.associated_maps.length - 2} more`}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="max-w-xs">
                    <div className="font-medium">
                      {formatReasonLabel(report.reason)}
                    </div>
                    {report.details && (
                      <div className="text-sm text-muted-foreground truncate">
                        {report.details}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>{report.reporter_name || report.reporter_id}</TableCell>
                <TableCell>
                  {editingMusicId === report.music_id ? (
                    <div className="flex gap-2 items-center">
                      <Input
                        value={youtubeVideoId}
                        onChange={(e) => setYoutubeVideoId(e.target.value)}
                        placeholder="YouTube video ID"
                        className="max-w-[200px]"
                      />
                      <Button
                        size="sm"
                        onClick={() => updateMusicYoutube(report.music_id, youtubeVideoId)}
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={cancelEditing}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-2 items-center">
                      {report.current_youtube_music ? (
                        <a
                          href={`https://www.youtube.com/watch?v=${report.current_youtube_music}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs bg-muted px-2 py-1 rounded text-primary hover:underline font-mono"
                        >
                          {report.current_youtube_music}
                        </a>
                      ) : (
                        <code className="text-xs bg-muted px-2 py-1 rounded">None</code>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => startEditingMusic(report.music_id, report.current_youtube_music)}
                      >
                        Edit
                      </Button>
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  {report.suggested_youtube_url ? (
                    <a
                      href={report.suggested_youtube_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline text-sm truncate max-w-[150px] block"
                    >
                      View
                    </a>
                  ) : (
                    <span className="text-muted-foreground text-sm">None</span>
                  )}
                </TableCell>
                <TableCell>
                  <StatusBadge status={report.status as ReportStatus} />
                </TableCell>
                <TableCell>{formatDate(report.created_at)}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => updateStatus(report.id, 'resolved')}>
                        <CheckCircle className="mr-2 h-4 w-4" />
                        Mark Resolved
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => updateStatus(report.id, 'dismissed')}>
                        <XCircle className="mr-2 h-4 w-4" />
                        Dismiss
                      </DropdownMenuItem>
                      {report.suggested_youtube_url && (
                        <DropdownMenuItem
                          onClick={() => window.open(report.suggested_youtube_url!, '_blank')}
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          Open Suggested URL
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
