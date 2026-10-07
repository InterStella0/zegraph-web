'use client';

import { createContext, useContext, useState, type ComponentProps } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from 'components/ui/dialog';
import { cn } from 'components/lib/utils';

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

const VIDEO_EXTENSIONS = /\.(mp4|webm|mov|m4v)$/i;

export function isVideoUrl(url: string): boolean {
  try {
    return VIDEO_EXTENSIONS.test(new URL(url, 'http://local').pathname);
  } catch {
    return false;
  }
}

export function youtubeVideoId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.replace(/^(www\.|m\.)/, '');
  let id: string | null = null;
  if (host === 'youtu.be') {
    id = parsed.pathname.slice(1);
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const [, kind, value] = parsed.pathname.split('/');
    id = kind === 'watch' ? parsed.searchParams.get('v') : ['shorts', 'embed', 'live'].includes(kind) ? value : null;
  }
  return id && /^[\w-]{6,}$/.test(id) ? id : null;
}

function youtubeStart(url: string): number | null {
  try {
    const t = new URL(url).searchParams.get('t') ?? '';
    const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(t);
    if (!t || !match) return null;
    return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
  } catch {
    return null;
  }
}

type ZoomTarget = { src: string; alt: string };
const ZoomContext = createContext<(target: ZoomTarget) => void>(() => {});

function MediaFrame({ caption, children }: { caption?: string; children: React.ReactNode }) {
  return (
    <span className="not-prose my-5 block first:mt-0 last:mb-0">
      {children}
      {caption && (
        <span className="mt-2 block text-center text-sm text-muted-foreground">{caption}</span>
      )}
    </span>
  );
}

function AnnouncementImage({ src, alt, title }: ComponentProps<'img'>) {
  const zoom = useContext(ZoomContext);
  const url = typeof src === 'string' ? src : '';
  const label = alt ?? '';

  if (!url || url.startsWith('#upload-')) {
    return (
      <MediaFrame>
        <span className="flex h-40 w-full items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/50 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {label || 'Uploading…'}
        </span>
      </MediaFrame>
    );
  }

  if (isVideoUrl(url)) {
    return (
      <MediaFrame caption={title}>
        <video
          src={url}
          aria-label={label || undefined}
          className="max-h-[70vh] w-full rounded-lg border bg-black"
          controls
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
        />
      </MediaFrame>
    );
  }

  return (
    <MediaFrame caption={title}>
      <button
        type="button"
        className="block w-full cursor-zoom-in overflow-hidden rounded-lg border bg-muted/30"
        onClick={() => zoom({ src: url, alt: label })}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={label} loading="lazy" className="block max-h-[70vh] w-full object-contain" />
      </button>
    </MediaFrame>
  );
}

function AnnouncementLink({ href, children, node: _node, ...props }: ComponentProps<'a'> & { node?: unknown }) {
  const url = href ?? '';
  const external = /^https?:\/\//i.test(url);
  const videoId = youtubeVideoId(url);
  const isBareLink = typeof children === 'string' && children.trim() === url;

  if (videoId && isBareLink) {
    const start = youtubeStart(url);
    return (
      <MediaFrame>
        <span className="block aspect-video w-full overflow-hidden rounded-lg border bg-black">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${videoId}${start ? `?start=${start}` : ''}`}
            title="YouTube video"
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            loading="lazy"
          />
        </span>
      </MediaFrame>
    );
  }

  return (
    <a
      href={url}
      {...props}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {children}
    </a>
  );
}

const blockComponents: Components = {
  img: ({ node: _node, ...props }) => <AnnouncementImage {...props} />,
  a: AnnouncementLink,
};

const inlineComponents: Components = {
  p: ({ children }) => <>{children}</>,
  a: ({ node: _node, href, children, ...props }) => (
    <a
      href={href}
      {...props}
      className="font-medium underline underline-offset-2"
      {...(/^https?:\/\//i.test(href ?? '') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {children}
    </a>
  ),
  code: ({ children }) => <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">{children}</code>,
};

const INLINE_ELEMENTS = ['p', 'a', 'strong', 'em', 'del', 'code', 'br'];

export const ANNOUNCEMENT_PROSE = cn(
  'prose dark:prose-invert max-w-none',
  'prose-headings:scroll-mt-4 prose-headings:font-semibold',
  'prose-a:text-primary prose-a:underline-offset-2',
  'prose-hr:my-6 prose-blockquote:font-normal prose-blockquote:not-italic',
  'prose-pre:bg-muted prose-pre:text-foreground',
);

interface AnnouncementMarkdownProps {
  content: string;
  inline?: boolean;
  className?: string;
}

export function AnnouncementMarkdown({ content, inline = false, className }: AnnouncementMarkdownProps) {
  const [zoomed, setZoomed] = useState<ZoomTarget | null>(null);

  if (inline) {
    return (
      <span className={className}>
        <Markdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
          allowedElements={INLINE_ELEMENTS}
          unwrapDisallowed
          components={inlineComponents}
        >
          {content}
        </Markdown>
      </span>
    );
  }

  return (
    <ZoomContext.Provider value={setZoomed}>
      <div className={cn(ANNOUNCEMENT_PROSE, className)}>
        <Markdown
          remarkPlugins={[remarkGfm, remarkBreaks]}
          rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
          components={blockComponents}
        >
          {content}
        </Markdown>
      </div>
      <Dialog open={zoomed !== null} onOpenChange={(open) => !open && setZoomed(null)}>
        <DialogContent className="w-auto max-w-[95vw] border-none bg-transparent p-0 shadow-none sm:max-w-[95vw]">
          <DialogTitle className="sr-only">{zoomed?.alt || 'Image'}</DialogTitle>
          {zoomed && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={zoomed.src} alt={zoomed.alt} className="max-h-[90vh] max-w-[95vw] rounded-lg object-contain" />
          )}
        </DialogContent>
      </Dialog>
    </ZoomContext.Provider>
  );
}
