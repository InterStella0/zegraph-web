'use client';

import { useDeferredValue, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { Eye, Loader2, Megaphone, PanelTop, Pencil, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from 'components/ui/dialog';
import { Button } from 'components/ui/button';
import { Input } from 'components/ui/input';
import { Label } from 'components/ui/label';
import { Switch } from 'components/ui/switch';
import { cn } from 'components/lib/utils';
import { fetchApiUrl } from 'utils/generalUtils';
import type { Announcement, AnnouncementType, CreateAnnouncementDto } from 'types/announcements';
import { AnnouncementPreview } from './AnnouncementPreview';
import { MarkdownToolbar } from './MarkdownToolbar';
import { insertLink, MOD_KEY, wrapSelection } from './markdownEditing';
import { UPLOAD_PLACEHOLDER_PREFIX, useMediaUpload } from './useMediaUpload';

const MAX_CONTENT = 10_000;
const DATETIME_FORMAT = 'YYYY-MM-DDTHH:mm';

interface CreateEditAnnouncementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  announcement: Announcement | null;
  onSuccess: () => void;
}

interface FormState {
  type: AnnouncementType;
  title: string;
  content: string;
  publishedAt: string;
  expiresAt: string;
  show: boolean;
}

function initialState(announcement: Announcement | null): FormState {
  if (!announcement) {
    return {
      type: 'Rich',
      title: '',
      content: '',
      publishedAt: dayjs().format(DATETIME_FORMAT),
      expiresAt: '',
      show: true,
    };
  }
  return {
    type: announcement.type,
    title: announcement.title ?? '',
    content: announcement.text,
    publishedAt: dayjs(announcement.published_at).format(DATETIME_FORMAT),
    expiresAt: announcement.expires_at ? dayjs(announcement.expires_at).format(DATETIME_FORMAT) : '',
    show: !announcement.hidden,
  };
}

const charCount = (value: string) => Array.from(value).length;

function validate(form: FormState) {
  const errors: Partial<Record<'title' | 'content' | 'expiresAt', string>> = {};
  const title = form.title.trim();
  if (form.type === 'Rich' && !title) {
    errors.title = 'A popup announcement needs a title.';
  } else if (form.type === 'Rich' && (charCount(title) < 5 || charCount(title) > 200)) {
    errors.title = 'Title must be 5–200 characters.';
  }
  const length = charCount(form.content);
  if (form.content.trim().length < 10) {
    errors.content = 'Content must be at least 10 characters.';
  } else if (length > MAX_CONTENT) {
    errors.content = `Content is ${(length - MAX_CONTENT).toLocaleString()} characters over the limit.`;
  } else if (form.content.includes(`](${UPLOAD_PLACEHOLDER_PREFIX}`)) {
    errors.content = 'Wait for uploads to finish.';
  }
  if (form.expiresAt && form.publishedAt && !dayjs(form.expiresAt).isAfter(dayjs(form.publishedAt))) {
    errors.expiresAt = 'Expiry must be after the publish time.';
  }
  return errors;
}

function TypeOption({ active, onClick, icon, label, hint }: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      className={cn(
        'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
        active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

export function CreateEditAnnouncementDialog({
  open,
  onOpenChange,
  announcement,
  onSuccess,
}: CreateEditAnnouncementDialogProps) {
  const isEdit = announcement !== null;
  const [initial] = useState(() => initialState(announcement));
  const [form, setForm] = useState<FormState>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [mobileView, setMobileView] = useState<'edit' | 'preview'>('edit');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const setContent: React.Dispatch<React.SetStateAction<string>> = (value) =>
    setForm((f) => ({ ...f, content: typeof value === 'function' ? value(f.content) : value }));
  const { upload, uploading } = useMediaUpload(textareaRef, setContent);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const deferredContent = useDeferredValue(form.content);
  const errors = validate(form);
  const hasErrors = Object.keys(errors).length > 0;
  const length = charCount(form.content);
  const isRich = form.type === 'Rich';
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  const requestClose = () => {
    if (dirty && !submitting && !confirm('Discard your unsaved changes?')) return;
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    if (hasErrors || uploading) {
      setShowErrors(true);
      return;
    }

    setSubmitting(true);
    try {
      const payload: CreateAnnouncementDto = {
        type: form.type,
        title: isRich ? form.title.trim() : null,
        text: form.content,
        published_at: form.publishedAt ? dayjs(form.publishedAt).toISOString() : dayjs().toISOString(),
        expires_at: form.expiresAt ? dayjs(form.expiresAt).toISOString() : null,
        show: form.show,
      };

      await fetchApiUrl(isEdit ? `/admin/announcements/${announcement.id}` : '/admin/announcements', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      toast.success(isEdit ? 'Announcement updated' : 'Announcement created');
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      toast.error('Failed to save announcement', {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleTextareaKeys = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const el = e.currentTarget;
    const key = e.key.toLowerCase();
    if (key === 'b') wrapSelection(el, '**', '**', 'bold text');
    else if (key === 'i') wrapSelection(el, '*', '*', 'italic text');
    else if (key === 'k') insertLink(el);
    else return;
    e.preventDefault();
  };

  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes('Files');

  const handleDrop = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    setDragging(false);
    if (isRich) upload(Array.from(e.dataTransfer.files));
    else toast.error('Banners are text only. Switch to Popup to add media.');
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData.files);
    if (files.length === 0) return;
    e.preventDefault();
    if (isRich) upload(files);
    else toast.error('Banners are text only. Switch to Popup to add media.');
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && requestClose()}>
      <DialogContent
        showCloseButton={false}
        onInteractOutside={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
            e.preventDefault();
            handleSubmit();
          }
        }}
        className="flex h-[94vh] w-[96vw] max-w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,1600px)]"
      >
        <header className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
          <div className="mr-auto min-w-0">
            <DialogTitle className="text-lg">{isEdit ? 'Edit announcement' : 'New announcement'}</DialogTitle>
            <DialogDescription className="text-xs">
              Markdown supported. Paste or drop images, GIFs and videos straight into the editor.
            </DialogDescription>
          </div>
          <div className="flex rounded-lg bg-muted p-1">
            <TypeOption
              active={isRich}
              onClick={() => update('type', 'Rich')}
              icon={<Megaphone className="h-4 w-4" />}
              label="Popup"
              hint="Rich markdown dialog shown once to each visitor"
            />
            <TypeOption
              active={!isRich}
              onClick={() => update('type', 'Basic')}
              icon={<PanelTop className="h-4 w-4" />}
              label="Banner"
              hint="One-line banner above server pages"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={form.show} onCheckedChange={(v) => update('show', v)} />
            Visible
          </label>
          <div className="flex gap-2">
            <Button variant="outline" onClick={requestClose}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting || uploading}>
              {(submitting || uploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {uploading ? 'Uploading…' : submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Publish'}
            </Button>
          </div>
        </header>

        <div className="flex border-b lg:hidden">
          {(['edit', 'preview'] as const).map((view) => (
            <button
              key={view}
              type="button"
              onClick={() => setMobileView(view)}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 py-2 text-sm font-medium',
                mobileView === view ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground',
              )}
            >
              {view === 'edit' ? <Pencil className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {view === 'edit' ? 'Write' : 'Preview'}
            </button>
          ))}
        </div>

        <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] lg:grid-cols-2">
          <section
            className={cn('min-h-0 flex-col border-r lg:flex', mobileView === 'edit' ? 'flex' : 'hidden')}
          >
            <div className="grid gap-3 border-b p-4 sm:grid-cols-2">
              {isRich && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="announcement-title">Title</Label>
                  <Input
                    id="announcement-title"
                    value={form.title}
                    onChange={(e) => update('title', e.target.value)}
                    placeholder="What's new?"
                    maxLength={200}
                    aria-invalid={showErrors && !!errors.title}
                  />
                  {showErrors && errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="announcement-publish">Publish at</Label>
                <Input
                  id="announcement-publish"
                  type="datetime-local"
                  value={form.publishedAt}
                  onChange={(e) => update('publishedAt', e.target.value)}
                />
                {form.publishedAt && dayjs(form.publishedAt).isAfter(dayjs()) && (
                  <p className="text-xs text-muted-foreground">Scheduled. It stays hidden until then.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="announcement-expire">Expires at</Label>
                <div className="flex gap-1">
                  <Input
                    id="announcement-expire"
                    type="datetime-local"
                    value={form.expiresAt}
                    onChange={(e) => update('expiresAt', e.target.value)}
                    aria-invalid={showErrors && !!errors.expiresAt}
                  />
                  {form.expiresAt && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => update('expiresAt', '')}
                      aria-label="Never expire"
                      title="Never expire"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                {showErrors && errors.expiresAt ? (
                  <p className="text-xs text-destructive">{errors.expiresAt}</p>
                ) : !form.expiresAt && (
                  <p className="text-xs text-muted-foreground">Never expires.</p>
                )}
              </div>
            </div>

            <div className="border-b px-2 py-1">
              <MarkdownToolbar textareaRef={textareaRef} inlineOnly={!isRich} onUpload={upload} />
            </div>

            <div
              className="relative min-h-0 flex-1"
              onDragEnter={(e) => hasFiles(e) && setDragging(true)}
              onDragOver={(e) => hasFiles(e) && e.preventDefault()}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
              }}
              onDrop={handleDrop}
            >
              <textarea
                ref={textareaRef}
                value={form.content}
                onChange={(e) => update('content', e.target.value)}
                onKeyDown={handleTextareaKeys}
                onPaste={handlePaste}
                spellCheck
                placeholder={
                  isRich
                    ? '## Big news\n\nWrite in **markdown**. Paste or drop a screenshot, GIF or video here.\nA YouTube link on its own line becomes an embedded player.'
                    : 'One short line. **Bold**, *italic* and [links](https://…) work.'
                }
                className="absolute inset-0 h-full w-full resize-none bg-transparent p-4 font-mono text-sm leading-relaxed outline-none placeholder:text-muted-foreground/70"
              />
              {dragging && (
                <div className="pointer-events-none absolute inset-2 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary bg-primary/10 text-sm font-medium text-primary">
                  <Upload className="h-6 w-6" />
                  {isRich ? 'Drop to upload' : 'Banners cannot contain media'}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t px-4 py-2 text-xs">
              <span className={cn(showErrors && errors.content ? 'text-destructive' : 'text-muted-foreground')}>
                {showErrors && errors.content
                  ? errors.content
                  : uploading
                    ? 'Uploading media…'
                    : `${MOD_KEY}+B / I / K to format · ${MOD_KEY}+S to save`}
              </span>
              <span className={cn('tabular-nums', length > MAX_CONTENT ? 'text-destructive' : 'text-muted-foreground')}>
                {length.toLocaleString()} / {MAX_CONTENT.toLocaleString()}
              </span>
            </div>
          </section>

          <section className={cn('min-h-0 lg:block', mobileView === 'preview' ? 'block' : 'hidden')}>
            <AnnouncementPreview
              type={form.type}
              title={form.title}
              content={deferredContent}
              publishedAt={form.publishedAt ? dayjs(form.publishedAt).toISOString() : ''}
            />
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
