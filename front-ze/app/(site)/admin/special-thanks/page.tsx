'use client';

import type { SpecialThanks } from 'types/community';
import { TableCell } from 'components/ui/table';
import { CrudPage } from '../components/CrudPage';
import { CreateEditSpecialThanksDialog } from './CreateEditSpecialThanksDialog';

export default function SpecialThanksAdminPage() {
  return (
    <CrudPage<SpecialThanks>
      endpoint="/admin/special-thanks"
      label="special thanks"
      title="Special Thanks"
      description="Manage the people credited on the donors page for non-monetary contributions."
      addLabel="Add Entry"
      headers={['Display Name', 'Description']}
      emptyText="No entries found"
      deleteConfirm="Are you sure you want to delete this entry?"
      deleteLabel="special thanks entry"
      renderCells={(entry) => (
        <>
          <TableCell className="font-medium">{entry.display_name}</TableCell>
          <TableCell className="text-muted-foreground max-w-md truncate">
            {entry.description}
          </TableCell>
        </>
      )}
      renderDialog={(props) => <CreateEditSpecialThanksDialog {...props} />}
    />
  );
}
