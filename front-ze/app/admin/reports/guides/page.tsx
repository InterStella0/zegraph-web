'use client';

import { useState, useEffect, useCallback } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/ui/table';
import { Button } from 'components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from 'components/ui/dropdown-menu';
import { MoreVertical, CheckCircle, XCircle, Eye, Ban } from 'lucide-react';
import { StatusBadge } from '../../components/StatusBadge';
import { StatusFilter } from '../../components/StatusFilter';
import { BanUserDialog } from '../../components/BanUserDialog';
import { formatDate } from '../../components/utils';
import { fetchApiUrl } from 'utils/generalUtils';
import type { GuideReportAdmin, GuideReportsPaginated, ReportStatus } from 'types/admin';

export default function GuideReportsPage() {
  const [reports, setReports] = useState<GuideReportAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('pending');

  // Ban dialog state
  const [banDialogOpen, setBanDialogOpen] = useState(false);
  const [banUserId, setBanUserId] = useState<string>('');
  const [banUserName, setBanUserName] = useState<string>('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = statusFilter && statusFilter !== 'all' ? { status: statusFilter } : {};
      const data = await fetchApiUrl('/admin/reports/guides', { params });
      setReports((data as GuideReportsPaginated).reports || []);
    } catch (error) {
      console.error('Failed to fetch guide reports:', error);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const updateStatus = async (reportId: string, status: ReportStatus) => {
    try {
      await fetchApiUrl(`/admin/reports/guides/${reportId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      fetchData();
    } catch (error) {
      console.error('Failed to update report status:', error);
    }
  };

  const openBanDialog = (userId: string, userName: string | null) => {
    setBanUserId(userId);
    setBanUserName(userName || '');
    setBanDialogOpen(true);
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
        <h1 className="text-3xl font-bold mb-2">Guide Reports</h1>
        <p className="text-muted-foreground">
          Manage reported guides and take moderation actions.
        </p>
      </div>

      <div className="mb-4">
        <StatusFilter value={statusFilter} onChange={setStatusFilter} />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Guide</TableHead>
            <TableHead>Reporter</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {reports.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                No guide reports found
              </TableCell>
            </TableRow>
          ) : (
            reports.map((report) => (
              <TableRow key={report.id}>
                <TableCell>
                  <div>
                    <div className="font-medium">{report.guide_title || 'Deleted Guide'}</div>
                    <div className="text-sm text-muted-foreground">{report.guide_map_name}</div>
                  </div>
                </TableCell>
                <TableCell>{report.reporter_name || report.reporter_id}</TableCell>
                <TableCell>
                  <div className="max-w-xs">
                    <div className="font-medium">{report.reason}</div>
                    <div className="text-sm text-muted-foreground truncate">{report.details}</div>
                  </div>
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
                      <DropdownMenuItem
                        onClick={() => window.open(`/maps/${report.guide_map_name}/guides/${report.guide_id}`, '_blank')}
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        View Guide
                      </DropdownMenuItem>
                      {report.guide_author_id && (
                        <DropdownMenuItem
                          onClick={() => openBanDialog(report.guide_author_id!, report.guide_author_name)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Ban className="mr-2 h-4 w-4" />
                          Ban Guide Author
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

      <BanUserDialog
        isOpen={banDialogOpen}
        onClose={() => setBanDialogOpen(false)}
        userId={banUserId}
        userName={banUserName}
        onSuccess={fetchData}
      />
    </div>
  );
}
