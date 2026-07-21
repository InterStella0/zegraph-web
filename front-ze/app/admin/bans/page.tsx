'use client';

import { useState, useEffect, useCallback } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/ui/table';
import { Button } from 'components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from 'components/ui/avatar';
import { Ban } from 'lucide-react';
import { BanUserDialog } from '../components/BanUserDialog';
import { formatDate } from '../components/utils';
import { fetchApiUrl } from 'utils/generalUtils';
import type { GuideBanAdmin, GuideBansPaginated } from 'types/admin';

export default function BannedUsersPage() {
  const [bans, setBans] = useState<GuideBanAdmin[]>([]);
  const [loading, setLoading] = useState(true);

  // Ban dialog state
  const [banDialogOpen, setBanDialogOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchApiUrl('/admin/bans', { params: { active_only: 'true' } });
      setBans((data as GuideBansPaginated).bans || []);
    } catch (error) {
      console.error('Failed to fetch bans:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const unbanUser = async (userId: string) => {
    try {
      await fetchApiUrl(`/admin/users/${userId}/guide-ban`, {
        method: 'DELETE',
      });
      fetchData();
    } catch (error) {
      console.error('Failed to unban user:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Banned Users</h1>
          <p className="text-muted-foreground">Manage user bans from the guides system.</p>
        </div>
        <Button onClick={() => setBanDialogOpen(true)}>
          <Ban className="mr-2 h-4 w-4" />
          Ban User
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead>Banned By</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Expires</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bans.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                No active bans
              </TableCell>
            </TableRow>
          ) : (
            bans.map((ban) => (
              <TableRow key={ban.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={ban.user_avatar || undefined} />
                      <AvatarFallback>
                        {ban.user_name?.[0]?.toUpperCase() || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <span>{ban.user_name || ban.user_id}</span>
                  </div>
                </TableCell>
                <TableCell className="max-w-xs truncate">{ban.reason}</TableCell>
                <TableCell>{ban.banned_by_name || ban.banned_by}</TableCell>
                <TableCell>{formatDate(ban.created_at)}</TableCell>
                <TableCell>
                  {ban.expires_at ? formatDate(ban.expires_at) : 'Permanent'}
                </TableCell>
                <TableCell>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => unbanUser(ban.user_id)}
                  >
                    Unban
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <BanUserDialog
        isOpen={banDialogOpen}
        onClose={() => setBanDialogOpen(false)}
        onSuccess={fetchData}
      />
    </div>
  );
}
