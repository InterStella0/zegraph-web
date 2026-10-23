'use client';

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ComponentProps, type ComponentType, type ReactNode } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/ui/table';
import { Button } from 'components/ui/button';
import { Input } from 'components/ui/input';
import { Label } from 'components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from 'components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from 'components/ui/dropdown-menu';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from 'components/ui/select';
import { ChevronLeft, ChevronRight, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { cn } from 'components/lib/utils';
import { toast } from 'sonner';
import { fetchApiUrl } from 'utils/generalUtils';
import { sendJson } from 'lib/sendJson';
import { useDebounced } from 'lib/hooks/useDebounced';

export interface CrudDialogProps<T> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: T | null;
  onSuccess: () => void;
}

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

export function AdminTable<T>({ headers, rows, empty, emptyClassName = 'text-center text-muted-foreground', children }: {
  headers: string[];
  rows: T[];
  empty: ReactNode;
  emptyClassName?: string;
  children: (row: T) => ReactNode;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {headers.map((header) => <TableHead key={header}>{header}</TableHead>)}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={headers.length} className={emptyClassName}>{empty}</TableCell>
          </TableRow>
        ) : rows.map(children)}
      </TableBody>
    </Table>
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

export function ActionItem({ icon: Icon, iconClassName, destructive, children, ...props }: {
  icon: ComponentType<{ className?: string }>;
  iconClassName?: string;
  destructive?: boolean;
} & ComponentProps<typeof DropdownMenuItem>) {
  return (
    <DropdownMenuItem {...props} className={destructive ? 'text-destructive focus:text-destructive' : undefined}>
      <Icon className={cn('mr-2 h-4 w-4', iconClassName)} />
      {children}
    </DropdownMenuItem>
  );
}

export function EditDeleteItems({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <>
      <ActionItem icon={Pencil} onClick={onEdit}>Edit</ActionItem>
      <ActionItem icon={Trash2} onClick={onDelete} destructive>Delete</ActionItem>
    </>
  );
}

export function Field({ label, htmlFor, children, className = 'space-y-2' }: {
  label: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

export function InputField({ label, fieldClassName, ...props }: {
  label: ReactNode;
  fieldClassName?: string;
} & ComponentProps<typeof Input>) {
  return (
    <Field label={label} className={fieldClassName}>
      <Input {...props} />
    </Field>
  );
}

export function OptionSelect({ value, onChange, options, placeholder, className }: {
  value: string;
  onChange: (value: string) => void;
  options: [string, ReactNode][];
  placeholder?: string;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map(([option, label]) => <SelectItem key={option} value={option}>{label}</SelectItem>)}
      </SelectContent>
    </Select>
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

/** Form state that resets from `init` whenever the dialog opens or its source changes; `bind` wires a text input. */
export function useResetForm<T extends object>(open: boolean, source: unknown, init: () => T) {
  const [form, setForm] = useState<T>(init);
  useEffect(() => {
    if (open) setForm(init());
  }, [source, open]);
  const set = <K extends keyof T>(key: K) => (value: T[K]) => setForm((f) => ({ ...f, [key]: value }));
  const bind = <K extends keyof T>(key: K) => ({
    value: form[key] as string,
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(key)(e.target.value as T[K]),
  });
  return [form, set, bind] as const;
}

type Failure = string | ((error: unknown) => void);

export const logFailure = (label: string) => (error: unknown) => console.error(label, error);

/** Runs a request after an optional confirm, toasting `success` and calling `onDone` when it succeeds. */
export async function runAction(
  request: () => Promise<unknown>,
  onDone: () => void,
  { confirm: question, success, failure }: { confirm?: string; success?: string; failure: Failure },
) {
  if (question && !confirm(question)) return;
  try {
    await request();
    if (success) toast.success(success);
    onDone();
  } catch (error) {
    if (typeof failure === 'string') toast.error(failure);
    else failure(error);
  }
}

export function useSave(onSuccess: () => void, onOpenChange: (open: boolean) => void) {
  const [submitting, setSubmitting] = useState(false);
  const save = async (request: () => Promise<unknown>, success: string, failure: Failure) => {
    setSubmitting(true);
    await runAction(request, () => {
      onSuccess();
      onOpenChange(false);
    }, { success, failure });
    setSubmitting(false);
  };
  return { submitting, save };
}

/** `useResetForm` + `useSave` for a create/edit dialog; spread `dialog` into `FormDialog`. */
export function useFormDialog<I, T extends object>({ open, onOpenChange, item, onSuccess }: CrudDialogProps<I>, init: () => T) {
  const [form, set, bind] = useResetForm(open, item, init);
  const { submitting, save } = useSave(onSuccess, onOpenChange);
  return { form, set, bind, save, dialog: { open, onOpenChange, submitting } };
}

export function useDialogTarget<T>() {
  const [open, setOpen] = useState(false);
  const [item, setItem] = useState<T | null>(null);
  const show = (next: T | null) => {
    setItem(next);
    setOpen(true);
  };
  const dialogProps = (onSuccess: () => void): CrudDialogProps<T> => ({ open, onOpenChange: setOpen, item, onSuccess });
  return { open, setOpen, item, show, dialogProps };
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
  const [initialLoading, setInitialLoading] = useState(true);
  const requestId = useRef(0);
  const paramsKey = JSON.stringify(params);

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const result = params ? await fetchApiUrl(endpoint, { params }) : await fetchApiUrl(endpoint);
      if (id === requestId.current) setData(select(result));
    } catch (error) {
      if (id === requestId.current) console.error(`Failed to fetch ${label}:`, error);
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        setInitialLoading(false);
      }
    }
  }, [endpoint, paramsKey]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, setData, loading, initialLoading, reload };
}

/** Page number plus a debounced search term; a new term jumps back to page 1. Spread `searchProps` into the input. */
export function useSearchPaging() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search, 350);
  const [pagedSearch, setPagedSearch] = useState(debouncedSearch);
  if (pagedSearch !== debouncedSearch) {
    setPagedSearch(debouncedSearch);
    setPage(1);
  }
  const searchProps = { value: search, onChange: (e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value) };
  return { page, setPage, debouncedSearch, searchProps };
}

/** Creates (POST `endpoint`) or, given an id, updates (PUT `endpoint/id`) an item. */
export const upsertJson = (endpoint: string, id: string | undefined, body: unknown) =>
  sendJson(id ? `${endpoint}/${id}` : endpoint, id ? 'PUT' : 'POST', body);

/** Uploads a form to the API proxy and returns the parsed JSON response. */
export async function postForm<T>(endpoint: string, body: FormData): Promise<T> {
  const res = await fetch(`/api${endpoint}`, { method: 'POST', body });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
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
  const pageButton = (Icon: typeof ChevronLeft, step: number, disabled: boolean) => (
    <Button variant="outline" size="icon" className="h-8 w-8" disabled={disabled} onClick={() => setPage((p) => p + step)}>
      <Icon className="h-4 w-4" />
    </Button>
  );
  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span>
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total} {noun}
      </span>
      <div className="flex items-center gap-1">
        {pageButton(ChevronLeft, -1, page <= 1)}
        <span className="px-2">{page} / {totalPages}</span>
        {pageButton(ChevronRight, 1, page >= totalPages)}
      </div>
    </div>
  );
}
