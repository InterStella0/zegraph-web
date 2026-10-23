'use client';

import { useRef, useState, type ComponentType, type RefObject } from 'react';
import {
  Bold,
  Code,
  Film,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link,
  List,
  ListOrdered,
  Minus,
  Quote,
  Strikethrough,
} from 'lucide-react';
import { Button } from 'components/ui/button';
import { Input } from 'components/ui/input';
import { Label } from 'components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from 'components/ui/popover';
import { Separator } from 'components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from 'components/ui/tooltip';
import { youtubeVideoId } from 'components/announcements/AnnouncementMarkdown';
import { insertBlock, insertLink, MOD_KEY as MOD, toggleLinePrefix, wrapSelection } from './markdownEditing';
import { MEDIA_ACCEPT } from './useMediaUpload';

type Tool = {
  label: string;
  icon: ComponentType<{ className?: string }>;
  shortcut?: string;
  action: (el: HTMLTextAreaElement) => void;
};

const HEADING_TOOLS: Tool[] = [
  { label: 'Heading', icon: Heading2, action: (el) => toggleLinePrefix(el, () => '## ', /^##\s/) },
  { label: 'Subheading', icon: Heading3, action: (el) => toggleLinePrefix(el, () => '### ', /^###\s/) },
];

const INLINE_TOOLS: Tool[] = [
  { label: 'Bold', icon: Bold, shortcut: `${MOD}+B`, action: (el) => wrapSelection(el, '**', '**', 'bold text') },
  { label: 'Italic', icon: Italic, shortcut: `${MOD}+I`, action: (el) => wrapSelection(el, '*', '*', 'italic text') },
  { label: 'Strikethrough', icon: Strikethrough, action: (el) => wrapSelection(el, '~~', '~~', 'text') },
  { label: 'Inline code', icon: Code, action: (el) => wrapSelection(el, '`', '`', 'code') },
  { label: 'Link', icon: Link, shortcut: `${MOD}+K`, action: insertLink },
];

const BLOCK_TOOLS: Tool[] = [
  { label: 'Bulleted list', icon: List, action: (el) => toggleLinePrefix(el, () => '- ', /^[-*+]\s/) },
  { label: 'Numbered list', icon: ListOrdered, action: (el) => toggleLinePrefix(el, (i) => `${i + 1}. `, /^\d+\.\s/) },
  { label: 'Quote', icon: Quote, action: (el) => toggleLinePrefix(el, () => '> ', /^>\s?/) },
  { label: 'Divider', icon: Minus, action: (el) => insertBlock(el, '---') },
];

function ToolButton({ label, shortcut, icon: Icon, onClick }: Omit<Tool, 'action'> & { onClick: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={label}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClick}
        >
          <Icon className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {shortcut && <span className="ml-2 opacity-60">{shortcut}</span>}
      </TooltipContent>
    </Tooltip>
  );
}

function EmbedUrlButton({ onInsert }: { onInsert: (url: string, caption: string) => void }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [caption, setCaption] = useState('');
  const isYoutube = youtubeVideoId(url.trim()) !== null;

  const submit = () => {
    if (!url.trim()) return;
    onInsert(url.trim(), caption.trim());
    setUrl('');
    setCaption('');
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Embed from URL">
              <Film className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Embed image, GIF, video or YouTube from URL</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-96" align="start">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="embed-url">URL</Label>
            <Input
              id="embed-url"
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://… (.png, .gif, .mp4, YouTube)"
            />
          </div>
          {!isYoutube && (
            <div className="space-y-1.5">
              <Label htmlFor="embed-caption">Caption (optional)</Label>
              <Input id="embed-caption" value={caption} onChange={(e) => setCaption(e.target.value)} />
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {isYoutube ? 'Will embed the YouTube player' : 'Shown full width in the popup'}
            </span>
            <Button type="submit" size="sm" disabled={!url.trim()}>Insert</Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

const ToolSeparator = () => <Separator orientation="vertical" className="mx-1 h-5" />;

export function MarkdownToolbar({ textareaRef, inlineOnly, onUpload }: {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  inlineOnly: boolean;
  onUpload: (files: File[]) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const tools = (list: Tool[]) => list.map(({ action, ...tool }) => (
    <ToolButton
      key={tool.label}
      {...tool}
      onClick={() => {
        const el = textareaRef.current;
        if (el) action(el);
      }}
    />
  ));

  const embed = (url: string, caption: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const safeUrl = url.replace(/\s/g, '%20').replace(/\)/g, '%29');
    if (youtubeVideoId(url)) {
      insertBlock(el, safeUrl);
      return;
    }
    const title = caption ? ` "${caption.replace(/"/g, "'")}"` : '';
    insertBlock(el, `![${caption.replace(/[[\]]/g, '')}](${safeUrl}${title})`);
  };

  return (
    <div className="flex flex-wrap items-center gap-0.5">
      {!inlineOnly && (
        <>
          {tools(HEADING_TOOLS)}
          <ToolSeparator />
        </>
      )}
      {tools(INLINE_TOOLS)}
      {!inlineOnly && (
        <>
          <ToolSeparator />
          {tools(BLOCK_TOOLS)}
          <ToolSeparator />
          <ToolButton label="Upload image, GIF or video" icon={ImagePlus} onClick={() => fileInput.current?.click()} />
          <EmbedUrlButton onInsert={embed} />
          <input
            ref={fileInput}
            type="file"
            accept={MEDIA_ACCEPT}
            multiple
            hidden
            onChange={(e) => {
              onUpload(Array.from(e.target.files ?? []));
              e.target.value = '';
            }}
          />
        </>
      )}
    </div>
  );
}
