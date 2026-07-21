'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from 'components/ui/dialog';
import { Button } from 'components/ui/button';
import { Input } from 'components/ui/input';
import { Textarea } from 'components/ui/textarea';
import { Label } from 'components/ui/label';
import { toast } from 'sonner';
import { fetchApiUrl } from 'utils/generalUtils';
import type { Donor } from './page';
import dayjs from 'dayjs';

interface CreateEditDonorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  donor: Donor | null;
  onSuccess: () => void;
}

export function CreateEditDonorDialog({
  open,
  onOpenChange,
  donor,
  onSuccess,
}: CreateEditDonorDialogProps) {
  const isEdit = donor !== null;

  const [displayName, setDisplayName] = useState('');
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [donatedAt, setDonatedAt] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (donor) {
      setDisplayName(donor.display_name);
      setAmount(String(donor.amount));
      setMessage(donor.message ?? '');
      setDonatedAt(dayjs(donor.donated_at).format('YYYY-MM-DD'));
    } else {
      setDisplayName('');
      setAmount('');
      setMessage('');
      setDonatedAt(dayjs().format('YYYY-MM-DD'));
    }
  }, [donor, open]);

  const handleSubmit = async () => {
    if (displayName.trim().length === 0) {
      toast.error('Display name is required');
      return;
    }
    if (displayName.length > 100) {
      toast.error('Display name must be 100 characters or fewer');
      return;
    }
    const parsedAmount = parseFloat(amount);
    if (!isEdit && (isNaN(parsedAmount) || parsedAmount < 0)) {
      toast.error('Amount must be a non-negative number');
      return;
    }

    setSubmitting(true);
    try {
      if (isEdit) {
        const payload: Record<string, unknown> = {
          display_name: displayName,
          message: message || null,
          donated_at: donatedAt ? dayjs(donatedAt).toISOString() : undefined,
        };
        if (amount !== '') payload.amount = parsedAmount;
        await fetchApiUrl(`/admin/donors/${donor.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        toast.success('Donor updated successfully');
      } else {
        await fetchApiUrl('/admin/donors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            display_name: displayName,
            amount: parsedAmount,
            message: message || null,
            donated_at: donatedAt ? dayjs(donatedAt).toISOString() : undefined,
          }),
        });
        toast.success('Donor added successfully');
      }

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      toast.error('Failed to save donor');
      console.error(error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit' : 'Add'} Donor</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update donor details' : 'Add a new donor to the supporters list'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Display Name *</Label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Alice"
              maxLength={100}
            />
          </div>

          <div className="space-y-2">
            <Label>Amount (private, used for ranking)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 5.00"
            />
          </div>

          <div className="space-y-2">
            <Label>Message (optional)</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Optional message from donor"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Donated At</Label>
            <Input
              type="date"
              value={donatedAt}
              onChange={(e) => setDonatedAt(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Saving...' : isEdit ? 'Update' : 'Add'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
