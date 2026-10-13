'use client';

import { Input } from 'components/ui/input';
import { Textarea } from 'components/ui/textarea';
import { toast } from 'sonner';
import { sendJson } from 'lib/sendJson';
import { Field, FormDialog, useResetForm, useSave } from '../components/AdminUI';
import type { CrudDialogProps } from '../components/CrudPage';
import type { SpecialThanks } from './page';

export function CreateEditSpecialThanksDialog({
  open,
  onOpenChange,
  item: entry,
  onSuccess,
}: CrudDialogProps<SpecialThanks>) {
  const isEdit = entry !== null;
  const [form, set] = useResetForm(open, entry, () => ({
    displayName: entry?.display_name ?? '',
    description: entry?.description ?? '',
  }));
  const { submitting, save } = useSave(onSuccess, onOpenChange);
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

    return save(() => sendJson(isEdit ? `/admin/special-thanks/${entry.id}` : '/admin/special-thanks', isEdit ? 'PUT' : 'POST', {
      display_name: displayName,
      description,
    }), isEdit ? 'Entry updated successfully' : 'Entry added successfully', (error) => {
      toast.error('Failed to save entry');
      console.error(error);
    });
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={<>{isEdit ? 'Edit' : 'Add'} Special Thanks Entry</>}
      description={isEdit ? 'Update this entry' : 'Credit someone for their contribution to the site'}
      onSubmit={handleSubmit}
      submitting={submitting}
      submitLabel={isEdit ? 'Update' : 'Add'}
    >
      <Field label="Display Name *">
        <Input
          value={displayName}
          onChange={(e) => set('displayName')(e.target.value)}
          placeholder="e.g. Alice"
          maxLength={100}
        />
      </Field>

      <Field label="Description *">
        <Textarea
          value={description}
          onChange={(e) => set('description')(e.target.value)}
          placeholder="What they contributed, e.g. Malay translation"
          rows={3}
        />
      </Field>
    </FormDialog>
  );
}
