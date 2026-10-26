'use client';

import { CheckCircle, XCircle } from 'lucide-react';
import { ActionItem, RowActions } from './AdminUI';

export const REVIEW_STATUSES: [string, string][] = [['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected']];

export function ReviewActions({ status, onUpdate, approveLabel = 'Approve' }: {
  status: 'pending' | 'approved' | 'rejected';
  onUpdate: (status: 'approved' | 'rejected') => void;
  approveLabel?: string;
}) {
  return (
    <RowActions>
      <ActionItem
        icon={CheckCircle}
        iconClassName="text-green-500"
        onClick={() => onUpdate('approved')}
        disabled={status === 'approved'}
      >
        {approveLabel}
      </ActionItem>
      <ActionItem icon={XCircle} onClick={() => onUpdate('rejected')} disabled={status === 'rejected'} destructive>
        Reject
      </ActionItem>
    </RowActions>
  );
}
