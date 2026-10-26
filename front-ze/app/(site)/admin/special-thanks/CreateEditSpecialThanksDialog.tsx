'use client';

import { Textarea } from 'components/ui/textarea';
import { toast } from 'sonner';
import { Field, FormDialog, InputField, upsertJson, useFormDialog, type CrudDialogProps } from '../components/AdminUI';
import type { SpecialThanks } from 'types/community';

export function CreateEditSpecialThanksDialog(props: CrudDialogProps<SpecialThanks>) {
  const entry = props.item;
  const isEdit = entry !== null;
  const { form, bind, save, dialog } = useFormDialog(props, () => ({
    displayName: entry?.display_name ?? '',
    description: entry?.description ?? '',
  }));
  const { displayName, description } = form;

  const handleSubmit = () => {
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

    return save(() => upsertJson('/admin/special-thanks', entry?.id, {
      display_name: displayName,
      description,
    }), isEdit ? 'Entry updated successfully' : 'Entry added successfully', (error) => {
      toast.error('Failed to save entry');
      console.error(error);
    });
  };

  return (
    <FormDialog
      {...dialog}
      title={<>{isEdit ? 'Edit' : 'Add'} Special Thanks Entry</>}
      description={isEdit ? 'Update this entry' : 'Credit someone for their contribution to the site'}
      onSubmit={handleSubmit}
      submitLabel={isEdit ? 'Update' : 'Add'}
    >
      <InputField label="Display Name *" {...bind('displayName')} placeholder="e.g. Alice" maxLength={100} />
      <Field label="Description *">
        <Textarea {...bind('description')} placeholder="What they contributed, e.g. Malay translation" rows={3} />
      </Field>
    </FormDialog>
  );
}
