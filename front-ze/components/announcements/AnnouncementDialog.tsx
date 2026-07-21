'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from 'components/ui/dialog';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';

const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames || []), 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
  attributes: {
    ...defaultSchema.attributes,
    h1: ['id', 'className'],
    h2: ['id', 'className'],
    h3: ['id', 'className'],
  }
};

interface AnnouncementDialogProps {
  id: string;
  title: string;
  content: string;
}

export function AnnouncementDialog({ id, title, content }: AnnouncementDialogProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Check if user has seen this announcement
    const seenKey = `announcement_seen_${id}`;
    const hasSeen = localStorage.getItem(seenKey);

    if (!hasSeen) {
      setOpen(true);
    }
  }, [id]);

  const handleClose = () => {
    // Mark as seen
    const seenKey = `announcement_seen_${id}`;
    localStorage.setItem(seenKey, 'true');
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">{title}</DialogTitle>
        </DialogHeader>
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <Markdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
          >
            {content}
          </Markdown>
        </div>
      </DialogContent>
    </Dialog>
  );
}
