'use client';

import { TableCell, TableRow } from 'components/ui/table';
import { Badge } from 'components/ui/badge';
import { formatDate } from '../components/utils';
import { AdminHeader, AdminSpinner, AdminTable, logFailure } from '../components/AdminUI';
import { ReviewActions, REVIEW_STATUSES } from '../components/ReviewActions';
import { StatusBadge } from '../components/StatusBadge';
import { StatusFilter, useStatusList } from '../components/StatusFilter';
import type { ServerRequestAdmin } from 'types/admin';

const HEADERS = ['Submitter', 'Community', 'Servers', 'Game', 'Elaboration', 'Status', 'Date', 'Actions'];

export default function ServerRequestsPage() {
    const { data: requests, loading, statusFilter, setStatusFilter, updateStatus } =
        useStatusList<ServerRequestAdmin>('/admin/server-requests', 'requests', 'server requests');

    if (loading) return <AdminSpinner />;

    return (
        <div>
            <AdminHeader
                className="mb-6"
                title="Server Nominations"
                description="Review community-submitted server tracking requests."
            />

            <StatusFilter value={statusFilter} onChange={setStatusFilter} options={REVIEW_STATUSES} />

            <AdminTable headers={HEADERS} rows={requests} empty="No server nominations found">
                {(req) => (
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
                            <StatusBadge status={req.status} />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                            {formatDate(req.created_at)}
                        </TableCell>
                        <TableCell>
                            <ReviewActions
                                status={req.status}
                                onUpdate={(status) => updateStatus(req.id, status, {
                                    failure: logFailure('Failed to update server request status:'),
                                })}
                            />
                        </TableCell>
                    </TableRow>
                )}
            </AdminTable>
        </div>
    );
}
