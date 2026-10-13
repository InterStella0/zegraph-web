'use client';

import { Input } from 'components/ui/input';
import { Textarea } from 'components/ui/textarea';
import { toast } from 'sonner';
import { fetchApiUrl } from 'utils/generalUtils';
import { Field, FormDialog, useResetForm, useSave } from '../components/AdminUI';
import type { CrudDialogProps } from '../components/CrudPage';
import type { CommunityLink } from './page';

export function CreateEditCommunityLinkDialog({
  open,
  onOpenChange,
  item: link,
  onSuccess,
}: CrudDialogProps<CommunityLink>) {
  const isEdit = link !== null;
  const [form, set] = useResetForm(open, link, () => ({
    name: link?.name ?? '',
    url: link?.url ?? '',
    description: link?.description ?? '',
    sortOrder: link ? String(link.sort_order) : '0',
  }));
  const { submitting, save } = useSave(onSuccess, onOpenChange);
  const { name, url, description, sortOrder } = form;

  const handleSubmit = () => {
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

    return save(() => fetchApiUrl(isEdit ? `/admin/community-links/${link.id}` : '/admin/community-links', {
      method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        url: trimmedUrl,
        description: description || null,
        sort_order: isNaN(parsedSort) ? (isEdit ? undefined : 0) : parsedSort,
      }),
    }), isEdit ? 'Link updated successfully' : 'Link added successfully', (error) => {
      toast.error('Failed to save link');
      console.error(error);
    });
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={<>{isEdit ? 'Edit' : 'Add'} Community Link</>}
      description={isEdit ? 'Update this community link' : 'Add a new ZE community website or tool'}
      onSubmit={handleSubmit}
      submitting={submitting}
      submitLabel={isEdit ? 'Update' : 'Add'}
    >
      <Field label="Name *">
        <Input
          value={name}
          onChange={(e) => set('name')(e.target.value)}
          placeholder="e.g. s2ze.com"
          maxLength={100}
        />
      </Field>

      <Field label="URL *">
        <Input
          type="url"
          value={url}
          onChange={(e) => set('url')(e.target.value)}
          placeholder="https://example.com"
        />
      </Field>

      <Field label="Description (optional)">
        <Textarea
          value={description}
          onChange={(e) => set('description')(e.target.value)}
          placeholder="What is this site / tool about?"
          rows={3}
        />
      </Field>

      <Field label="Sort Order (lower shows first)">
        <Input
          type="number"
          step="1"
          value={sortOrder}
          onChange={(e) => set('sortOrder')(e.target.value)}
          placeholder="0"
        />
      </Field>
    </FormDialog>
  );
}
