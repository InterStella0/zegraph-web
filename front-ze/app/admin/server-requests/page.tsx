'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from 'components/ui/table';
import { Button } from 'components/ui/button';
import { Badge } from 'components/ui/badge';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from 'components/ui/dropdown-menu';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from 'components/ui/select';
import { MoreVertical, CheckCircle, XCircle } from 'lucide-react';
import { formatDate } from '../components/utils';
import { fetchApiUrl } from 'utils/generalUtils';
import type { ServerRequestAdmin, ServerRequestsPaginated, ServerRequestStatus } from 'types/admin';

const STATUS_BADGE: Record<ServerRequestStatus, { variant: "default" | "secondary" | "outline" | "destructive"; label: string }> = {
    pending: { variant: 'default', label: 'Pending' },
    approved: { variant: 'secondary', label: 'Approved' },
    rejected: { variant: 'outline', label: 'Rejected' },
};

export default function ServerRequestsPage() {
    const [requests, setRequests] = useState<ServerRequestAdmin[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<string>('pending');

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const params = statusFilter && statusFilter !== 'all' ? { status: statusFilter } : {};
            const data = await fetchApiUrl('/admin/server-requests', { params });
            setRequests((data as ServerRequestsPaginated).requests || []);
        } catch (error) {
            console.error('Failed to fetch server requests:', error);
        } finally {
            setLoading(false);
        }
    }, [statusFilter]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const updateStatus = async (requestId: string, status: 'approved' | 'rejected') => {
        try {
            await fetchApiUrl(`/admin/server-requests/${requestId}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status }),
            });
            fetchData();
        } catch (error) {
            console.error('Failed to update server request status:', error);
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
                <h1 className="text-3xl font-bold mb-2">Server Nominations</h1>
                <p className="text-muted-foreground">
                    Review community-submitted server tracking requests.
                </p>
            </div>

            <div className="mb-4">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
                    </SelectContent>
                </Select>
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
                        <TableRow>
                            <TableCell colSpan={8} className="text-center text-muted-foreground">
                                No server nominations found
                            </TableCell>
                        </TableRow>
                    ) : (
                        requests.map((req) => {
                            const badge = STATUS_BADGE[req.status];
                            return (
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
                                        <Badge variant={badge.variant}>{badge.label}</Badge>
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                        {formatDate(req.created_at)}
                                    </TableCell>
                                    <TableCell>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon">
                                                    <MoreVertical className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem
                                                    onClick={() => updateStatus(req.id, 'approved')}
                                                    disabled={req.status === 'approved'}
                                                >
                                                    <CheckCircle className="mr-2 h-4 w-4 text-green-500" />
                                                    Approve
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    onClick={() => updateStatus(req.id, 'rejected')}
                                                    disabled={req.status === 'rejected'}
                                                    className="text-destructive focus:text-destructive"
                                                >
                                                    <XCircle className="mr-2 h-4 w-4" />
                                                    Reject
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            );
                        })
                    )}
                </TableBody>
            </Table>
        </div>
    );
}
