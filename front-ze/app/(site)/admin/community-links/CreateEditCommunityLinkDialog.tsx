'use client';

import { Textarea } from 'components/ui/textarea';
import { toast } from 'sonner';
import { Field, FormDialog, InputField, upsertJson, useFormDialog, type CrudDialogProps } from '../components/AdminUI';
import type { CommunityLink } from 'types/community';

export function CreateEditCommunityLinkDialog(props: CrudDialogProps<CommunityLink>) {
  const link = props.item;
  const isEdit = link !== null;
  const { form, bind, save, dialog } = useFormDialog(props, () => ({
    name: link?.name ?? '',
    url: link?.url ?? '',
    description: link?.description ?? '',
    sortOrder: link ? String(link.sort_order) : '0',
  }));
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

    return save(() => upsertJson('/admin/community-links', link?.id, {
      name,
      url: trimmedUrl,
      description: description || null,
      sort_order: isNaN(parsedSort) ? (isEdit ? undefined : 0) : parsedSort,
    }), isEdit ? 'Link updated successfully' : 'Link added successfully', (error) => {
      toast.error('Failed to save link');
      console.error(error);
    });
  };

  return (
    <FormDialog
      {...dialog}
      title={<>{isEdit ? 'Edit' : 'Add'} Community Link</>}
      description={isEdit ? 'Update this community link' : 'Add a new ZE community website or tool'}
      onSubmit={handleSubmit}
      submitLabel={isEdit ? 'Update' : 'Add'}
    >
      <InputField label="Name *" {...bind('name')} placeholder="e.g. s2ze.com" maxLength={100} />
      <InputField label="URL *" type="url" {...bind('url')} placeholder="https://example.com" />
      <Field label="Description (optional)">
        <Textarea {...bind('description')} placeholder="What is this site / tool about?" rows={3} />
      </Field>
      <InputField label="Sort Order (lower shows first)" type="number" step="1" {...bind('sortOrder')} placeholder="0" />
    </FormDialog>
  );
}
