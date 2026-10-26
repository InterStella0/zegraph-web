'use client';

import Link from 'next/link';
import { TableCell, TableRow } from 'components/ui/table';
import { toast } from 'sonner';
import { formatDate } from '../components/utils';
import { AdminHeader, AdminSpinner, AdminTable } from '../components/AdminUI';
import { ReviewActions, REVIEW_STATUSES } from '../components/ReviewActions';
import { StatusBadge } from '../components/StatusBadge';
import { StatusFilter, useStatusList } from '../components/StatusFilter';
import type { PlayerClaimAdmin } from 'types/admin';

const HEADERS = ['Claimer', 'Claimed profile', 'Server', 'Note', 'Status', 'Date', 'Actions'];

export default function PlayerClaimsPage() {
    const { data: claims, loading, statusFilter, setStatusFilter, updateStatus } =
        useStatusList<PlayerClaimAdmin>('/admin/player-claims', 'claims', 'player claims');

    const review = (claimId: string, status: 'approved' | 'rejected') => updateStatus(claimId, status, {
        success: status === 'approved' ? 'Claim approved and profile merged' : 'Claim rejected',
        failure: (error: any) => {
            console.error('Failed to update claim status:', error);
            toast.error('Failed to update claim', {
                description: error?.message || 'Please try again later.',
            });
        },
    });

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

            <StatusFilter value={statusFilter} onChange={setStatusFilter} options={REVIEW_STATUSES} />

            <AdminTable headers={HEADERS} rows={claims} empty="No profile claims found">
                {(claim) => (
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
                            <StatusBadge status={claim.status} />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                            {formatDate(claim.created_at)}
                        </TableCell>
                        <TableCell>
                            <ReviewActions
                                status={claim.status}
                                onUpdate={(status) => review(claim.id, status)}
                                approveLabel="Approve & merge"
                            />
                        </TableCell>
                    </TableRow>
                )}
            </AdminTable>
        </div>
    );
}
