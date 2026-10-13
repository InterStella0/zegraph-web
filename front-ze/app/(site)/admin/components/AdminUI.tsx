'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { TableCell, TableRow } from 'components/ui/table';
import { Button } from 'components/ui/button';
import { Label } from 'components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from 'components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from 'components/ui/dropdown-menu';
import { ChevronLeft, ChevronRight, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { cn } from 'components/lib/utils';
import { toast } from 'sonner';
import { fetchApiUrl } from 'utils/generalUtils';

export function AdminSpinner() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );
}

export function AdminHeader({ title, description, className, action }: {
  title: ReactNode;
  description: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  const heading = (
    <>
      <h1 className="text-3xl font-bold mb-2">{title}</h1>
      <p className="text-muted-foreground">{description}</p>
    </>
  );
  if (!action) return <div className={className}>{heading}</div>;
  return (
    <div className={cn(className, 'flex items-center justify-between')}>
      <div>{heading}</div>
      {action}
    </div>
  );
}

export function EmptyRow({ colSpan, children, className = 'text-center text-muted-foreground' }: {
  colSpan: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className={className}>{children}</TableCell>
    </TableRow>
  );
}

export function RowActions({ children }: { children: ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}

export function EditDeleteItems({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <>
      <DropdownMenuItem onClick={onEdit}>
        <Pencil className="mr-2 h-4 w-4" />
        Edit
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={onDelete}
        className="text-destructive focus:text-destructive"
      >
        <Trash2 className="mr-2 h-4 w-4" />
        Delete
      </DropdownMenuItem>
    </>
  );
}

export function Field({ label, children, className = 'space-y-2' }: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function FormDialog({
  open, onOpenChange, title, description, className = 'max-w-md', children,
  onSubmit, submitting, submitLabel, footerClassName = 'flex justify-end gap-2 pt-2',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  className?: string;
  children: ReactNode;
  onSubmit: () => void;
  submitting: boolean;
  submitLabel: ReactNode;
  footerClassName?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={className}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {children}
          <div className={footerClassName}>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={onSubmit} disabled={submitting}>
              {submitting ? 'Saving...' : submitLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function useResetForm<T extends object>(open: boolean, source: unknown, init: () => T) {
  const [form, setForm] = useState<T>(init);
  useEffect(() => {
    setForm(init());
  }, [source, open]);
  const set = <K extends keyof T>(key: K) => (value: T[K]) => setForm((f) => ({ ...f, [key]: value }));
  return [form, set] as const;
}

export function useSave(onSuccess: () => void, onOpenChange: (open: boolean) => void) {
  const [submitting, setSubmitting] = useState(false);
  const save = async (request: () => Promise<unknown>, success: string, failure: string | ((error: unknown) => void)) => {
    setSubmitting(true);
    try {
      await request();
      toast.success(success);
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      if (typeof failure === 'string') toast.error(failure);
      else failure(error);
    } finally {
      setSubmitting(false);
    }
  };
  return { submitting, save };
}

export function useDialogTarget<T>() {
  const [open, setOpen] = useState(false);
  const [item, setItem] = useState<T | null>(null);
  const show = (next: T | null) => {
    setItem(next);
    setOpen(true);
  };
  return { open, setOpen, item, show };
}

export function useAdminData<T>(
  endpoint: string,
  select: (data: unknown) => T,
  initial: T,
  label: string,
  params?: Record<string, string>,
) {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const paramsKey = JSON.stringify(params);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const result = params ? await fetchApiUrl(endpoint, { params }) : await fetchApiUrl(endpoint);
      setData(select(result));
    } catch (error) {
      console.error(`Failed to fetch ${label}:`, error);
    } finally {
      setLoading(false);
    }
  }, [endpoint, paramsKey]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, setData, loading, reload };
}

export function useSearchPaging() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 350);
  };

  return { page, setPage, search, debouncedSearch, handleSearchChange };
}

export function AdminPagination({ page, setPage, total, pageSize, noun }: {
  page: number;
  setPage: (update: (page: number) => number) => void;
  total: number;
  pageSize: number;
  noun: string;
}) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span>
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total} {noun}
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="px-2">{page} / {totalPages}</span>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
