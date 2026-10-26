'use client';

import type { ReactNode } from 'react';
import { TableCell, TableRow } from 'components/ui/table';
import { Button } from 'components/ui/button';
import { Plus } from 'lucide-react';
import { fetchApiUrl } from 'utils/generalUtils';
import {
  AdminHeader, AdminSpinner, AdminTable, EditDeleteItems, logFailure, RowActions, runAction, useAdminData, useDialogTarget,
  type CrudDialogProps,
} from './AdminUI';

export function CrudPage<T extends { id: string }>({
  endpoint, label, title, description, addLabel, headers, emptyText, deleteConfirm, deleteLabel, renderCells, renderDialog,
}: {
  endpoint: string;
  label: string;
  title: string;
  description: string;
  addLabel: string;
  headers: string[];
  emptyText: string;
  deleteConfirm: string;
  deleteLabel: string;
  renderCells: (item: T) => ReactNode;
  renderDialog: (props: CrudDialogProps<T>) => ReactNode;
}) {
  const { data: items, initialLoading, reload: fetchData } = useAdminData<T[]>(endpoint, (data) => (data as T[]) || [], [], label);
  const dialog = useDialogTarget<T>();

  const deleteItem = (id: string) => runAction(() => fetchApiUrl(`${endpoint}/${id}`, { method: 'DELETE' }), fetchData, {
    confirm: deleteConfirm,
    failure: logFailure(`Failed to delete ${deleteLabel}:`),
  });

  if (initialLoading) return <AdminSpinner />;

  return (
    <div>
      <AdminHeader
        className="mb-6"
        title={title}
        description={description}
        action={
          <Button onClick={() => dialog.show(null)}>
            <Plus className="mr-2 h-4 w-4" />
            {addLabel}
          </Button>
        }
      />

      <AdminTable headers={[...headers, 'Actions']} rows={items} empty={emptyText}>
        {(item) => (
          <TableRow key={item.id}>
            {renderCells(item)}
            <TableCell>
              <RowActions>
                <EditDeleteItems onEdit={() => dialog.show(item)} onDelete={() => deleteItem(item.id)} />
              </RowActions>
            </TableCell>
          </TableRow>
        )}
      </AdminTable>

      {renderDialog(dialog.dialogProps(fetchData))}
    </div>
  );
}
