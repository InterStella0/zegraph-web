'use client';

import { useState, useEffect, useCallback } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/ui/table';
import { Button } from 'components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from 'components/ui/dropdown-menu';
import { MoreVertical, Plus, Pencil, Trash2 } from 'lucide-react';
import { fetchApiUrl } from 'utils/generalUtils';
import { CreateEditDonorDialog } from './CreateEditDonorDialog';
import dayjs from 'dayjs';

export interface Donor {
  id: string;
  display_name: string;
  amount: number;
  message: string | null;
  donated_at: string;
}

export default function DonorsAdminPage() {
  const [donors, setDonors] = useState<Donor[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDonor, setEditingDonor] = useState<Donor | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchApiUrl('/admin/donors');
      setDonors((data as Donor[]) || []);
    } catch (error) {
      console.error('Failed to fetch donors:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const deleteDonor = async (id: string) => {
    if (!confirm('Are you sure you want to delete this donor?')) return;
    try {
      await fetchApiUrl(`/admin/donors/${id}`, { method: 'DELETE' });
      fetchData();
    } catch (error) {
      console.error('Failed to delete donor:', error);
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
          <h1 className="text-3xl font-bold mb-2">Donors</h1>
          <p className="text-muted-foreground">
            Manage donors displayed in the supporter banner.
          </p>
        </div>
        <Button onClick={() => { setEditingDonor(null); setDialogOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" />
          Add Donor
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Display Name</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Message</TableHead>
            <TableHead>Donated At</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {donors.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                No donors found
              </TableCell>
            </TableRow>
          ) : (
            donors.map((donor) => (
              <TableRow key={donor.id}>
                <TableCell className="font-medium">{donor.display_name}</TableCell>
                <TableCell className="font-mono">
                  ${donor.amount.toFixed(2)}
                </TableCell>
                <TableCell className="text-muted-foreground max-w-xs truncate">
                  {donor.message ?? '—'}
                </TableCell>
                <TableCell>{dayjs(donor.donated_at).format('MMM D, YYYY')}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => { setEditingDonor(donor); setDialogOpen(true); }}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => deleteDonor(donor.id)}
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

      <CreateEditDonorDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        donor={editingDonor}
        onSuccess={fetchData}
      />
    </div>
  );
}
