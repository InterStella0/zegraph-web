'use client';

import { useState, useEffect, useCallback } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/ui/table';
import { Button } from 'components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from 'components/ui/dropdown-menu';
import { MoreVertical, Plus, Pencil, Trash2, ExternalLink } from 'lucide-react';
import { fetchApiUrl } from 'utils/generalUtils';
import { CreateEditCommunityLinkDialog } from './CreateEditCommunityLinkDialog';

export interface CommunityLink {
  id: string;
  name: string;
  url: string;
  description: string | null;
  sort_order: number;
  created_at: string;
}

export default function CommunityLinksAdminPage() {
  const [links, setLinks] = useState<CommunityLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<CommunityLink | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchApiUrl('/admin/community-links');
      setLinks((data as CommunityLink[]) || []);
    } catch (error) {
      console.error('Failed to fetch community links:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const deleteLink = async (id: string) => {
    if (!confirm('Are you sure you want to delete this link?')) return;
    try {
      await fetchApiUrl(`/admin/community-links/${id}`, { method: 'DELETE' });
      fetchData();
    } catch (error) {
      console.error('Failed to delete community link:', error);
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
          <h1 className="text-3xl font-bold mb-2">Community Links</h1>
          <p className="text-muted-foreground">
            Manage the ZE community websites and tools shown on the Hub page.
          </p>
        </div>
        <Button onClick={() => { setEditingLink(null); setDialogOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" />
          Add Link
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>URL</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Order</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {links.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                No community links found
              </TableCell>
            </TableRow>
          ) : (
            links.map((link) => (
              <TableRow key={link.id}>
                <TableCell className="font-medium">{link.name}</TableCell>
                <TableCell className="max-w-xs truncate">
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline font-mono text-sm"
                  >
                    {link.url}
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                </TableCell>
                <TableCell className="text-muted-foreground max-w-xs truncate">
                  {link.description ?? '—'}
                </TableCell>
                <TableCell className="font-mono">{link.sort_order}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => { setEditingLink(link); setDialogOpen(true); }}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => deleteLink(link.id)}
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

      <CreateEditCommunityLinkDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        link={editingLink}
        onSuccess={fetchData}
      />
    </div>
  );
}
