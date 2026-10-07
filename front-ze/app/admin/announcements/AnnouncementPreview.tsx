'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AnnouncementPager,
  AnnouncementPanel,
  announcementHeadingClass,
  announcementSubheadingClass,
} from 'components/announcements/AnnouncementDialog';
import { AnnouncementBanner } from 'components/announcements/AnnouncementBanner';
import type { AnnouncementType } from 'types/announcements';

const POPUP_WIDTH = 768;
const PANE_PADDING = 32;
const PANE_PADDING_NARROW = 16;
const MIN_SCALE = 0.6;

function usePaneSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, size] as const;
}

interface AnnouncementPreviewProps {
  type: AnnouncementType;
  title: string;
  content: string;
  publishedAt: string;
}

export function AnnouncementPreview({ type, title, content, publishedAt }: AnnouncementPreviewProps) {
  const [paneRef, pane] = usePaneSize();
  const padding = pane.width > 0 && pane.width < 640 ? PANE_PADDING_NARROW : PANE_PADDING;
  const available = Math.max(pane.width - padding * 2, 0);
  const fitted = available > 0 ? Math.min(1, available / POPUP_WIDTH) : 1;
  const narrow = fitted < MIN_SCALE;
  const scale = narrow ? 1 : fitted;
  const popupWidth = narrow ? available : POPUP_WIDTH;
  const maxHeight = pane.height > 0 ? (pane.height - padding * 2) / scale : undefined;
  const isEmpty = !content.trim();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b px-4 py-2 text-xs text-muted-foreground">
        <span className="font-medium uppercase tracking-wide">
          {type === 'Rich' ? 'Popup preview' : 'Banner preview'}
        </span>
        {type === 'Rich' && narrow && <span>Narrow screen width</span>}
        {type === 'Rich' && !narrow && scale < 1 && (
          <span>Scaled to {Math.round(scale * 100)}% · real width {POPUP_WIDTH}px</span>
        )}
      </div>
      <div
        ref={paneRef}
        className="relative min-h-0 flex-1 overflow-hidden bg-muted/40 bg-[radial-gradient(var(--border)_1px,transparent_1px)] [background-size:16px_16px]"
        style={{ padding }}
      >
        {type === 'Rich' ? (
          <div
            className="mx-auto flex flex-col overflow-hidden rounded-lg border bg-background shadow-lg"
            style={{ width: popupWidth, zoom: scale, maxHeight }}
          >
            <AnnouncementPanel
              announcement={{
                id: 'preview',
                title: title || null,
                text: isEmpty ? '*Start writing to see your announcement here…*' : content,
                published_at: publishedAt || new Date().toISOString(),
              }}
              heading={(text) => <h2 className={announcementHeadingClass}>{text}</h2>}
              subheading={(text) => <p className={announcementSubheadingClass}>{text}</p>}
              footer={<AnnouncementPager index={0} total={1} />}
            />
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border bg-background shadow-sm">
            <div className="h-10 border-b bg-muted/60" />
            <AnnouncementBanner text={isEmpty ? '*Start writing to see your banner here…*' : content} />
            <div className="space-y-2 p-4">
              <div className="h-3 w-2/3 rounded bg-muted" />
              <div className="h-3 w-1/2 rounded bg-muted" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
