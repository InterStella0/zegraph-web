'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from 'components/ui/dialog';
import { Button } from 'components/ui/button';
import { Input } from 'components/ui/input';
import { Textarea } from 'components/ui/textarea';
import { Label } from 'components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from 'components/ui/tabs';
import { Switch } from 'components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/ui/select';
import { toast } from 'sonner';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { fetchApiUrl } from 'utils/generalUtils';
import type { Announcement, AnnouncementType, CreateAnnouncementDto, UpdateAnnouncementDto } from 'types/announcements';
import dayjs from 'dayjs';

interface CreateEditAnnouncementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  announcement: Announcement | null;
  onSuccess: () => void;
}

export function CreateEditAnnouncementDialog({
  open,
  onOpenChange,
  announcement,
  onSuccess,
}: CreateEditAnnouncementDialogProps) {
  const isEdit = announcement !== null;

  const [type, setType] = useState<AnnouncementType>('Basic');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [publishedAt, setPublishedAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [show, setShow] = useState(true);
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (announcement) {
      setType(announcement.type as AnnouncementType);
      setTitle(announcement.title || '');
      setContent(announcement.text);
      setPublishedAt(dayjs(announcement.published_at).format('YYYY-MM-DDTHH:mm'));
      setExpiresAt(announcement.expires_at ? dayjs(announcement.expires_at).format('YYYY-MM-DDTHH:mm') : '');
      setShow(true);
    } else {
      // Reset for create
      setType('Basic');
      setTitle('');
      setContent('');
      setPublishedAt(dayjs().format('YYYY-MM-DDTHH:mm'));
      setExpiresAt('');
      setShow(true);
    }
  }, [announcement, open]);

  const handleSubmit = async () => {
    // Validation
    if (type === 'Rich' && title.trim().length === 0) {
      toast.error('Rich announcements require a title');
      return;
    }
    if (title.trim().length > 0 && (title.length < 5 || title.length > 200)) {
      toast.error('Title must be 5-200 characters');
      return;
    }
    if (content.trim().length < 10) {
      toast.error('Content must be at least 10 characters');
      return;
    }
    if (content.length > 10000) {
      toast.error('Content must be less than 10000 characters');
      return;
    }

    setSubmitting(true);
    try {
      const payload: CreateAnnouncementDto | UpdateAnnouncementDto = {
        type,
        title: type === 'Rich' && title ? title : null,
        text: content,
        published_at: publishedAt ? dayjs(publishedAt).toISOString() : dayjs().toISOString(),
        expires_at: expiresAt ? dayjs(expiresAt).toISOString() : null,
        show,
      };

      if (isEdit) {
        await fetchApiUrl(`/admin/announcements/${announcement.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        toast.success('Announcement updated successfully');
      } else {
        await fetchApiUrl('/admin/announcements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        toast.success('Announcement created successfully');
      }

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      toast.error('Failed to save announcement');
      console.error(error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit' : 'Create'} Announcement</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update the announcement details' : 'Create a new site-wide announcement'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Type selector */}
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as AnnouncementType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Basic">Basic (Banner)</SelectItem>
                <SelectItem value="Rich">Rich (Markdown Dialog)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Title (for rich only) */}
          {type === 'Rich' && (
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter announcement title"
                maxLength={200}
              />
            </div>
          )}

          {/* Content */}
          <div className="space-y-2">
            <Label>Content *</Label>
            {type === 'Basic' ? (
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Enter announcement text"
                rows={3}
                maxLength={10000}
              />
            ) : (
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'edit' | 'preview')}>
                <TabsList>
                  <TabsTrigger value="edit">Edit</TabsTrigger>
                  <TabsTrigger value="preview">Preview</TabsTrigger>
                </TabsList>
                <TabsContent value="edit">
                  <Textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Enter markdown content..."
                    rows={12}
                    className="font-mono"
                  />
                </TabsContent>
                <TabsContent value="preview">
                  <div className="prose prose-sm dark:prose-invert max-w-none border rounded-md p-4 min-h-[300px]">
                    <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                      {content || '*No content yet...*'}
                    </Markdown>
                  </div>
                </TabsContent>
              </Tabs>
            )}
          </div>

          {/* Scheduling */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Published At</Label>
              <Input
                type="datetime-local"
                value={publishedAt}
                onChange={(e) => setPublishedAt(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Expires At (Optional)</Label>
              <Input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
          </div>

          {/* Show toggle */}
          <div className="flex items-center space-x-2">
            <Switch checked={show} onCheckedChange={setShow} />
            <Label>Show announcement</Label>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Saving...' : isEdit ? 'Update' : 'Create'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
