'use client';

import { useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight, Megaphone } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from 'components/ui/dialog';
import { Button } from 'components/ui/button';
import { cn } from 'components/lib/utils';
import { AnnouncementMarkdown } from './AnnouncementMarkdown';

export interface AnnouncementPanelItem {
  id: string;
  title: string | null;
  text: string;
  published_at: string;
}

export const ANNOUNCEMENT_PANEL_WIDTH = 'sm:max-w-3xl';

interface AnnouncementPanelProps {
  announcement: AnnouncementPanelItem;
  heading: (title: string) => ReactNode;
  subheading: (text: string) => ReactNode;
  footer: ReactNode;
}

export function AnnouncementPanel({ announcement, heading, subheading, footer }: AnnouncementPanelProps) {
  const t = useTranslations('announcements');
  const locale = useLocale();
  const published = new Date(announcement.published_at);
  const date = Number.isNaN(published.getTime())
    ? ''
    : new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(published);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-start gap-3 border-b px-6 pt-6 pb-4 pr-12">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Megaphone className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          {heading(announcement.title?.trim() || t('fallbackTitle'))}
          {date && subheading(date)}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <AnnouncementMarkdown content={announcement.text} />
      </div>
      <div className="flex items-center justify-between gap-3 border-t px-6 py-3">{footer}</div>
    </div>
  );
}

export const announcementHeadingClass = 'text-xl font-semibold leading-tight break-words';
export const announcementSubheadingClass = 'mt-1 text-sm text-muted-foreground';

interface AnnouncementPagerProps {
  index: number;
  total: number;
  onIndexChange?: (index: number) => void;
  onDismiss?: () => void;
}

export function AnnouncementPager({ index, total, onIndexChange, onDismiss }: AnnouncementPagerProps) {
  const t = useTranslations('announcements');
  const isLast = index >= total - 1;

  return (
    <>
      <div className="flex items-center gap-1">
        {total > 1 && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={index === 0}
              onClick={() => onIndexChange?.(index - 1)}
              aria-label={t('previous')}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-12 text-center text-sm tabular-nums text-muted-foreground">
              {t('counter', { current: index + 1, total })}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={isLast}
              onClick={() => onIndexChange?.(index + 1)}
              aria-label={t('next')}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
      {isLast ? (
        <Button onClick={onDismiss}>{t('dismiss')}</Button>
      ) : (
        <Button onClick={() => onIndexChange?.(index + 1)}>{t('next')}</Button>
      )}
    </>
  );
}

interface AnnouncementsDialogProps {
  announcements: AnnouncementPanelItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AnnouncementsDialog({ announcements, open, onOpenChange }: AnnouncementsDialogProps) {
  const [index, setIndex] = useState(0);
  const current = announcements[Math.min(index, announcements.length - 1)];

  if (!current) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn('flex max-h-[85vh] flex-col gap-0 p-0', ANNOUNCEMENT_PANEL_WIDTH)}
        aria-describedby={undefined}
      >
        <AnnouncementPanel
          key={current.id}
          announcement={current}
          heading={(title) => <DialogTitle className={announcementHeadingClass}>{title}</DialogTitle>}
          subheading={(date) => <DialogDescription className={announcementSubheadingClass}>{date}</DialogDescription>}
          footer={
            <AnnouncementPager
              index={index}
              total={announcements.length}
              onIndexChange={setIndex}
              onDismiss={() => onOpenChange(false)}
            />
          }
        />
      </DialogContent>
    </Dialog>
  );
}
