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
import type { CommunityLink } from './page';

interface CreateEditCommunityLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  link: CommunityLink | null;
  onSuccess: () => void;
}

export function CreateEditCommunityLinkDialog({
  open,
  onOpenChange,
  link,
  onSuccess,
}: CreateEditCommunityLinkDialogProps) {
  const isEdit = link !== null;

  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [sortOrder, setSortOrder] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (link) {
      setName(link.name);
      setUrl(link.url);
      setDescription(link.description ?? '');
      setSortOrder(String(link.sort_order));
    } else {
      setName('');
      setUrl('');
      setDescription('');
      setSortOrder('0');
    }
  }, [link, open]);

  const handleSubmit = async () => {
    if (name.trim().length === 0) {
      toast.error('Name is required');
      return;
    }
    if (name.length > 100) {
      toast.error('Name must be 100 characters or fewer');
      return;
    }
    const trimmedUrl = url.trim();
    if (!/^https?:\/\//i.test(trimmedUrl)) {
      toast.error('URL must start with http:// or https://');
      return;
    }

    const parsedSort = parseInt(sortOrder, 10);

    setSubmitting(true);
    try {
      if (isEdit) {
        await fetchApiUrl(`/admin/community-links/${link.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            url: trimmedUrl,
            description: description || null,
            sort_order: isNaN(parsedSort) ? undefined : parsedSort,
          }),
        });
        toast.success('Link updated successfully');
      } else {
        await fetchApiUrl('/admin/community-links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            url: trimmedUrl,
            description: description || null,
            sort_order: isNaN(parsedSort) ? 0 : parsedSort,
          }),
        });
        toast.success('Link added successfully');
      }

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      toast.error('Failed to save link');
      console.error(error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit' : 'Add'} Community Link</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update this community link' : 'Add a new ZE community website or tool'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. s2ze.com"
              maxLength={100}
            />
          </div>

          <div className="space-y-2">
            <Label>URL *</Label>
            <Input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
            />
          </div>

          <div className="space-y-2">
            <Label>Description (optional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this site / tool about?"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Sort Order (lower shows first)</Label>
            <Input
              type="number"
              step="1"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              placeholder="0"
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
