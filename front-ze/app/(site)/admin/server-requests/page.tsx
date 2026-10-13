'use client';

import { useState } from 'react';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from 'components/ui/table';
import { Badge } from 'components/ui/badge';
import { formatDate } from '../components/utils';
import { AdminHeader, AdminSpinner, EmptyRow, useAdminData } from '../components/AdminUI';
import { ReviewActions, ReviewBadge, REVIEW_STATUSES } from '../components/ReviewActions';
import { StatusFilter } from '../components/StatusFilter';
import { sendJson } from 'lib/sendJson';
import type { ServerRequestAdmin, ServerRequestsPaginated } from 'types/admin';

export default function ServerRequestsPage() {
    const [statusFilter, setStatusFilter] = useState<string>('pending');
    const { data: requests, loading, reload: fetchData } = useAdminData<ServerRequestAdmin[]>(
        '/admin/server-requests',
        (data) => (data as ServerRequestsPaginated).requests || [],
        [],
        'server requests',
        statusFilter && statusFilter !== 'all' ? { status: statusFilter } : {},
    );

    const updateStatus = async (requestId: string, status: 'approved' | 'rejected') => {
        try {
            await sendJson(`/admin/server-requests/${requestId}/status`, 'PUT', { status });
            fetchData();
        } catch (error) {
            console.error('Failed to update server request status:', error);
        }
    };

    if (loading) return <AdminSpinner />;

    return (
        <div>
            <AdminHeader
                className="mb-6"
                title="Server Nominations"
                description="Review community-submitted server tracking requests."
            />

            <div className="mb-4">
                <StatusFilter value={statusFilter} onChange={setStatusFilter} options={REVIEW_STATUSES} />
            </div>

            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Submitter</TableHead>
                        <TableHead>Community</TableHead>
                        <TableHead>Servers</TableHead>
                        <TableHead>Game</TableHead>
                        <TableHead>Elaboration</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {requests.length === 0 ? (
                        <EmptyRow colSpan={8}>No server nominations found</EmptyRow>
                    ) : (
                        requests.map((req) => (
                            <TableRow key={req.id}>
                                <TableCell className="text-sm">
                                    {req.submitter_name || req.user_id}
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-2">
                                        {req.icon_url && (
                                            <img
                                                src={req.icon_url}
                                                alt={req.community_name}
                                                className="h-6 w-6 rounded object-cover flex-shrink-0"
                                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                            />
                                        )}
                                        <span className="font-medium">{req.community_name}</span>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="space-y-1">
                                        {req.servers.map((s, i) => (
                                            <div key={i} className="text-sm">
                                                <span className="font-mono">{s.ip}:{s.port}</span>
                                                <span className="text-muted-foreground ml-1">→ {s.readable_link}</span>
                                            </div>
                                        ))}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <Badge variant="outline" className="uppercase text-xs">
                                        {req.game_type}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    {req.elaboration ? (
                                        <p className="text-sm text-muted-foreground max-w-[200px] truncate" title={req.elaboration}>
                                            {req.elaboration}
                                        </p>
                                    ) : (
                                        <span className="text-muted-foreground text-sm">—</span>
                                    )}
                                </TableCell>
                                <TableCell>
                                    <ReviewBadge status={req.status} />
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                    {formatDate(req.created_at)}
                                </TableCell>
                                <TableCell>
                                    <ReviewActions status={req.status} onUpdate={(status) => updateStatus(req.id, status)} />
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
        </div>
    );
}
