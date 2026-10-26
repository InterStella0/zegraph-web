'use client';

import { useState } from 'react';
import { TableCell, TableRow } from 'components/ui/table';
import { Button } from 'components/ui/button';
import { Input } from 'components/ui/input';
import { CheckCircle, XCircle, Eye } from 'lucide-react';
import { ActionItem, AdminHeader, AdminSpinner, AdminTable, logFailure, RowActions, runAction } from '../../components/AdminUI';
import { StatusBadge } from '../../components/StatusBadge';
import { StatusFilter, useStatusList } from '../../components/StatusFilter';
import { formatDate, formatReasonLabel } from '../../components/utils';
import { sendJson } from 'lib/sendJson';
import type { MapMusicReportAdmin, ReportStatus } from 'types/admin';
import type { UpdateMapMusicDto } from 'types/maps';

const HEADERS = ['Music Track', 'Issue', 'Reporter', 'Current Video', 'Suggested URL', 'Status', 'Date', 'Actions'];

export default function MusicReportsPage() {
  const { data: reports, loading, reload: fetchData, statusFilter, setStatusFilter, updateStatus } =
    useStatusList<MapMusicReportAdmin>('/admin/reports/music', 'reports', 'music reports');

  // The music track whose YouTube video ID is being edited inline, with the draft ID.
  const [editing, setEditing] = useState<{ musicId: string; videoId: string } | null>(null);

  const setReportStatus = (reportId: string, status: ReportStatus) =>
    updateStatus(reportId, status, { failure: logFailure('Failed to update report status:') });

  const updateMusicYoutube = (musicId: string, youtubeId: string) => runAction(
    () => sendJson(`/admin/music/${musicId}/youtube`, 'PUT', { youtube_music: youtubeId || null } as UpdateMapMusicDto),
    () => {
      setEditing(null);
      fetchData();
    },
    { failure: logFailure('Failed to update music YouTube ID:') },
  );

  if (loading) return <AdminSpinner />;

  return (
    <div>
      <AdminHeader
        className="mb-6"
        title="Music Reports"
        description="Manage reported music tracks and update YouTube video IDs."
      />

      <StatusFilter value={statusFilter} onChange={setStatusFilter} />

      <AdminTable headers={HEADERS} rows={reports} empty="No music reports found">
        {(report) => (
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
              {editing?.musicId === report.music_id ? (
                <div className="flex gap-2 items-center">
                  <Input
                    value={editing.videoId}
                    onChange={(e) => setEditing({ ...editing, videoId: e.target.value })}
                    placeholder="YouTube video ID"
                    className="max-w-[200px]"
                  />
                  <Button size="sm" onClick={() => updateMusicYoutube(report.music_id, editing.videoId)}>
                    Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
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
                    onClick={() => setEditing({ musicId: report.music_id, videoId: report.current_youtube_music || '' })}
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
              <RowActions>
                <ActionItem icon={CheckCircle} onClick={() => setReportStatus(report.id, 'resolved')}>
                  Mark Resolved
                </ActionItem>
                <ActionItem icon={XCircle} onClick={() => setReportStatus(report.id, 'dismissed')}>
                  Dismiss
                </ActionItem>
                {report.suggested_youtube_url && (
                  <ActionItem icon={Eye} onClick={() => window.open(report.suggested_youtube_url!, '_blank')}>
                    Open Suggested URL
                  </ActionItem>
                )}
              </RowActions>
            </TableCell>
          </TableRow>
        )}
      </AdminTable>
    </div>
  );
}
