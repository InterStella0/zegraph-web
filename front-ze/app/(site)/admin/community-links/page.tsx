'use client';

import { TableCell } from 'components/ui/table';
import { ExternalLink } from 'lucide-react';
import { CrudPage } from '../components/CrudPage';
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
  return (
    <CrudPage<CommunityLink>
      endpoint="/admin/community-links"
      label="community links"
      title="Community Links"
      description="Manage the ZE community websites and tools shown on the Hub page."
      addLabel="Add Link"
      headers={['Name', 'URL', 'Description', 'Order']}
      emptyText="No community links found"
      deleteConfirm="Are you sure you want to delete this link?"
      deleteLabel="community link"
      renderCells={(link) => (
        <>
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
        </>
      )}
      renderDialog={(props) => <CreateEditCommunityLinkDialog {...props} />}
    />
  );
}
