'use client';

import { useState, useEffect, useCallback } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/ui/table';
import { Button } from 'components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from 'components/ui/dropdown-menu';
import { MoreVertical, Plus, Pencil, Trash2 } from 'lucide-react';
import { fetchApiUrl } from 'utils/generalUtils';
import { CreateEditSpecialThanksDialog } from './CreateEditSpecialThanksDialog';

export interface SpecialThanks {
  id: string;
  display_name: string;
  description: string;
}

export default function SpecialThanksAdminPage() {
  const [entries, setEntries] = useState<SpecialThanks[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<SpecialThanks | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchApiUrl('/admin/special-thanks');
      setEntries((data as SpecialThanks[]) || []);
    } catch (error) {
      console.error('Failed to fetch special thanks:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const deleteEntry = async (id: string) => {
    if (!confirm('Are you sure you want to delete this entry?')) return;
    try {
      await fetchApiUrl(`/admin/special-thanks/${id}`, { method: 'DELETE' });
      fetchData();
    } catch (error) {
      console.error('Failed to delete special thanks entry:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Special Thanks</h1>
          <p className="text-muted-foreground">
            Manage the people credited on the donors page for non-monetary contributions.
          </p>
        </div>
        <Button onClick={() => { setEditingEntry(null); setDialogOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" />
          Add Entry
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Display Name</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3} className="text-center text-muted-foreground">
                No entries found
              </TableCell>
            </TableRow>
          ) : (
            entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="font-medium">{entry.display_name}</TableCell>
                <TableCell className="text-muted-foreground max-w-md truncate">
                  {entry.description}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => { setEditingEntry(entry); setDialogOpen(true); }}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => deleteEntry(entry.id)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <CreateEditSpecialThanksDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        entry={editingEntry}
        onSuccess={fetchData}
      />
    </div>
  );
}
