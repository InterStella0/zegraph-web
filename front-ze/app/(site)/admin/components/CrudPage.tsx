'use client';

import type { ReactNode } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/ui/table';
import { Button } from 'components/ui/button';
import { Plus } from 'lucide-react';
import { fetchApiUrl } from 'utils/generalUtils';
import { AdminHeader, AdminSpinner, EditDeleteItems, EmptyRow, RowActions, useAdminData, useDialogTarget } from './AdminUI';

export interface CrudDialogProps<T> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: T | null;
  onSuccess: () => void;
}

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
  const { data: items, loading, reload: fetchData } = useAdminData<T[]>(endpoint, (data) => (data as T[]) || [], [], label);
  const dialog = useDialogTarget<T>();

  const deleteItem = async (id: string) => {
    if (!confirm(deleteConfirm)) return;
    try {
      await fetchApiUrl(`${endpoint}/${id}`, { method: 'DELETE' });
      fetchData();
    } catch (error) {
      console.error(`Failed to delete ${deleteLabel}:`, error);
    }
  };

  if (loading) return <AdminSpinner />;

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

      <Table>
        <TableHeader>
          <TableRow>
            {headers.map((header) => <TableHead key={header}>{header}</TableHead>)}
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <EmptyRow colSpan={headers.length + 1}>{emptyText}</EmptyRow>
          ) : (
            items.map((item) => (
              <TableRow key={item.id}>
                {renderCells(item)}
                <TableCell>
                  <RowActions>
                    <EditDeleteItems
                      onEdit={() => dialog.show(item)}
                      onDelete={() => deleteItem(item.id)}
                    />
                  </RowActions>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {renderDialog({ open: dialog.open, onOpenChange: dialog.setOpen, item: dialog.item, onSuccess: fetchData })}
    </div>
  );
}
