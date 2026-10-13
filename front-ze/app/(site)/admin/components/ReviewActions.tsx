'use client';

import { Badge } from 'components/ui/badge';
import { DropdownMenuItem } from 'components/ui/dropdown-menu';
import { CheckCircle, XCircle } from 'lucide-react';
import { RowActions } from './AdminUI';

type ReviewStatus = 'pending' | 'approved' | 'rejected';

export const REVIEW_STATUSES: [string, string][] = [['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected']];

const STATUS_BADGE: Record<ReviewStatus, { variant: "default" | "secondary" | "outline" | "destructive"; label: string }> = {
  pending: { variant: 'default', label: 'Pending' },
  approved: { variant: 'secondary', label: 'Approved' },
  rejected: { variant: 'outline', label: 'Rejected' },
};

export function ReviewBadge({ status }: { status: ReviewStatus }) {
  const badge = STATUS_BADGE[status];
  return <Badge variant={badge.variant}>{badge.label}</Badge>;
}

export function ReviewActions({ status, onUpdate, approveLabel = 'Approve' }: {
  status: ReviewStatus;
  onUpdate: (status: 'approved' | 'rejected') => void;
  approveLabel?: string;
}) {
  return (
    <RowActions>
      <DropdownMenuItem
        onClick={() => onUpdate('approved')}
        disabled={status === 'approved'}
      >
        <CheckCircle className="mr-2 h-4 w-4 text-green-500" />
        {approveLabel}
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={() => onUpdate('rejected')}
        disabled={status === 'rejected'}
        className="text-destructive focus:text-destructive"
      >
        <XCircle className="mr-2 h-4 w-4" />
        Reject
      </DropdownMenuItem>
    </RowActions>
  );
}
