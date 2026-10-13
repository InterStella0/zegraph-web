'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from 'components/ui/table';
import { toast } from 'sonner';
import { formatDate } from '../components/utils';
import { AdminHeader, AdminSpinner, EmptyRow, useAdminData } from '../components/AdminUI';
import { ReviewActions, ReviewBadge, REVIEW_STATUSES } from '../components/ReviewActions';
import { StatusFilter } from '../components/StatusFilter';
import { fetchApiUrl } from 'utils/generalUtils';
import type { PlayerClaimAdmin, PlayerClaimsPaginated } from 'types/admin';

export default function PlayerClaimsPage() {
    const [statusFilter, setStatusFilter] = useState<string>('pending');
    const { data: claims, loading, reload: fetchData } = useAdminData<PlayerClaimAdmin[]>(
        '/admin/player-claims',
        (data) => (data as PlayerClaimsPaginated).claims || [],
        [],
        'player claims',
        statusFilter && statusFilter !== 'all' ? { status: statusFilter } : {},
    );

    const updateStatus = async (claimId: string, status: 'approved' | 'rejected') => {
        try {
            await fetchApiUrl(`/admin/player-claims/${claimId}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status }),
            });
            toast.success(status === 'approved' ? 'Claim approved and profile merged' : 'Claim rejected');
            fetchData();
        } catch (error: any) {
            console.error('Failed to update claim status:', error);
            toast.error('Failed to update claim', {
                description: error?.message || 'Please try again later.',
            });
        }
    };

    if (loading) return <AdminSpinner />;

    return (
        <div>
            <AdminHeader
                className="mb-6"
                title="Profile Claims"
                description={<>
                    Players asking to have a name-tracked profile linked to their Steam account.
                    Approving moves the profile&apos;s sessions onto the Steam account and renames it
                    to <span className="font-mono">[merged_&lt;uuid&gt;] &lt;name&gt;</span>.
                </>}
            />

            <div className="mb-4">
                <StatusFilter value={statusFilter} onChange={setStatusFilter} options={REVIEW_STATUSES} />
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
                        <EmptyRow colSpan={7}>No profile claims found</EmptyRow>
                    ) : (
                        claims.map((claim) => (
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
                                    <ReviewBadge status={claim.status} />
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                    {formatDate(claim.created_at)}
                                </TableCell>
                                <TableCell>
                                    <ReviewActions
                                        status={claim.status}
                                        onUpdate={(status) => updateStatus(claim.id, status)}
                                        approveLabel="Approve & merge"
                                    />
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
        </div>
    );
}
