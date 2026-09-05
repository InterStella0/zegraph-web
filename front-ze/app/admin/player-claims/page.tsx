'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
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
import { toast } from 'sonner';
import { formatDate } from '../components/utils';
import { fetchApiUrl } from 'utils/generalUtils';
import type { PlayerClaimAdmin, PlayerClaimsPaginated, PlayerClaimStatus } from 'types/admin';

const STATUS_BADGE: Record<PlayerClaimStatus, { variant: "default" | "secondary" | "outline" | "destructive"; label: string }> = {
    pending: { variant: 'default', label: 'Pending' },
    approved: { variant: 'secondary', label: 'Approved' },
    rejected: { variant: 'outline', label: 'Rejected' },
};

export default function PlayerClaimsPage() {
    const [claims, setClaims] = useState<PlayerClaimAdmin[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<string>('pending');

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const params = statusFilter && statusFilter !== 'all' ? { status: statusFilter } : {};
            const data = await fetchApiUrl('/admin/player-claims', { params });
            setClaims((data as PlayerClaimsPaginated).claims || []);
        } catch (error) {
            console.error('Failed to fetch player claims:', error);
        } finally {
            setLoading(false);
        }
    }, [statusFilter]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const updateStatus = async (claimId: string, status: 'approved' | 'rejected') => {
        try {
            await fetchApiUrl(`/admin/player-claims/${claimId}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status }),
            });
            toast.success(status === 'approved' ? 'Claim approved and profile linked' : 'Claim rejected');
            fetchData();
        } catch (error: any) {
            // Approving fails for real reasons a moderator needs to read — most often the claimer
            // has no player record yet, so there is nothing to link to.
            console.error('Failed to update claim status:', error);
            toast.error('Failed to update claim', {
                description: error?.message || 'Please try again later.',
            });
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
                <h1 className="text-3xl font-bold mb-2">Profile Claims</h1>
                <p className="text-muted-foreground">
                    Players asking to have a name-tracked profile linked to their Steam account.
                    Approving links the profile and merges its playtime.
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
                        <TableHead>Claimer</TableHead>
                        <TableHead>Claimed profile</TableHead>
                        <TableHead>Server</TableHead>
                        <TableHead>Note</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {claims.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={7} className="text-center text-muted-foreground">
                                No profile claims found
                            </TableCell>
                        </TableRow>
                    ) : (
                        claims.map((claim) => {
                            const badge = STATUS_BADGE[claim.status];
                            return (
                                <TableRow key={claim.id}>
                                    <TableCell className="text-sm">
                                        <div className="font-medium">{claim.claimer_name || 'Unknown'}</div>
                                        <a
                                            href={`https://steamcommunity.com/profiles/${claim.user_id}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs text-muted-foreground font-mono hover:underline"
                                        >
                                            {claim.user_id}
                                        </a>
                                    </TableCell>
                                    <TableCell className="text-sm">
                                        <div className="font-medium">{claim.player_name || 'Unknown'}</div>
                                        <Link
                                            href={`/servers/${claim.server_id}/players/${claim.player_id}`}
                                            className="text-xs text-muted-foreground font-mono hover:underline"
                                        >
                                            {claim.player_id}
                                        </Link>
                                    </TableCell>
                                    <TableCell className="text-sm">
                                        {claim.server_name || claim.server_id}
                                    </TableCell>
                                    <TableCell>
                                        {claim.note ? (
                                            <p className="text-sm text-muted-foreground max-w-[240px] truncate" title={claim.note}>
                                                {claim.note}
                                            </p>
                                        ) : (
                                            <span className="text-muted-foreground text-sm">—</span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={badge.variant}>{badge.label}</Badge>
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                        {formatDate(claim.created_at)}
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
                                                    onClick={() => updateStatus(claim.id, 'approved')}
                                                    disabled={claim.status === 'approved'}
                                                >
                                                    <CheckCircle className="mr-2 h-4 w-4 text-green-500" />
                                                    Approve &amp; link
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    onClick={() => updateStatus(claim.id, 'rejected')}
                                                    disabled={claim.status === 'rejected'}
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
