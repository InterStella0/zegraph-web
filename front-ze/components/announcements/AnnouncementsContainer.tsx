'use client';

import { useEffect, useState } from 'react';
import { AnnouncementsDialog } from './AnnouncementDialog';
import { fetchUrl } from 'utils/generalUtils';
import type { Announcement } from 'types/announcements';

const seenKey = (id: string) => `announcement_seen_${id}`;

export function AnnouncementsContainer() {
  const [unseen, setUnseen] = useState<Announcement[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetchUrl('/announcements')
      .then((data: Announcement[]) => {
        const pending = data
          .filter((a) => a.type === 'Rich' && !localStorage.getItem(seenKey(a.id)))
          .sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime());
        setUnseen(pending);
        setOpen(pending.length > 0);
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
