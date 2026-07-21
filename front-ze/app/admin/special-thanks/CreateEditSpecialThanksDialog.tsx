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
import type { SpecialThanks } from './page';

interface CreateEditSpecialThanksDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: SpecialThanks | null;
  onSuccess: () => void;
}

export function CreateEditSpecialThanksDialog({
  open,
  onOpenChange,
  entry,
  onSuccess,
}: CreateEditSpecialThanksDialogProps) {
  const isEdit = entry !== null;

  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (entry) {
      setDisplayName(entry.display_name);
      setDescription(entry.description);
    } else {
      setDisplayName('');
      setDescription('');
    }
  }, [entry, open]);

  const handleSubmit = async () => {
    if (displayName.trim().length === 0) {
      toast.error('Display name is required');
      return;
    }
    if (displayName.length > 100) {
      toast.error('Display name must be 100 characters or fewer');
      return;
    }
    if (description.trim().length === 0) {
      toast.error('Description is required');
      return;
    }

    setSubmitting(true);
    try {
      if (isEdit) {
        await fetchApiUrl(`/admin/special-thanks/${entry.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            display_name: displayName,
            description,
          }),
        });
        toast.success('Entry updated successfully');
      } else {
        await fetchApiUrl('/admin/special-thanks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            display_name: displayName,
            description,
          }),
        });
        toast.success('Entry added successfully');
      }

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      toast.error('Failed to save entry');
      console.error(error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit' : 'Add'} Special Thanks Entry</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update this entry' : 'Credit someone for their contribution to the site'}
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
            <Label>Description *</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What they contributed, e.g. Malay translation"
              rows={3}
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
