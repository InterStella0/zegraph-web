'use client';

import { useEffect, useState } from 'react';
import { AnnouncementsDialog } from './AnnouncementDialog';
import { isVideoUrl } from './AnnouncementMarkdown';
import { fetchUrl } from 'utils/generalUtils';
import type { Announcement } from 'types/announcements';

const seenKey = (id: string) => `announcement_seen_${id}`;
const IMAGE_PATTERN = /!\[[^\]]*\]\(\s*<?([^)\s>]+)/g;
const IMAGE_PRELOAD_TIMEOUT_MS = 3000;

function preloadImages(markdown: string): Promise<void> {
  const loads = [...markdown.matchAll(IMAGE_PATTERN)]
    .map((match) => match[1])
    .filter((url) => !isVideoUrl(url))
    .map((url) => new Promise<void>((resolve) => {
      const image = new Image();
      image.onload = image.onerror = () => resolve();
      image.src = url;
    }));
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, IMAGE_PRELOAD_TIMEOUT_MS));
  return Promise.race([Promise.all(loads).then(() => {}), timeout]);
}

export function AnnouncementsContainer() {
  const [unseen, setUnseen] = useState<Announcement[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetchUrl('/announcements')
      .then((data: Announcement[]) => {
        const pending = data
          .filter((a) => a.type === 'Rich' && !localStorage.getItem(seenKey(a.id)))
          .sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime());
        if (pending.length === 0) return;
        return preloadImages(pending[0].text).then(() => {
          setUnseen(pending);
          setOpen(true);
        });
      })
      .catch((error) => console.error('Failed to fetch announcements:', error));
  }, []);

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      unseen.forEach((a) => localStorage.setItem(seenKey(a.id), 'true'));
    }
    setOpen(isOpen);
  };

  if (unseen.length === 0) return null;

  return <AnnouncementsDialog announcements={unseen} open={open} onOpenChange={handleOpenChange} />;
}
