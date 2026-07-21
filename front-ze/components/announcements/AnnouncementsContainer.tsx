'use client';

import { useEffect, useState } from 'react';
import { AnnouncementDialog } from './AnnouncementDialog';
import { fetchUrl } from 'utils/generalUtils';
import type { Announcement } from 'types/announcements';

export function AnnouncementsContainer() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnnouncements = async () => {
      try {
        const data = await fetchUrl('/announcements');
        setAnnouncements(data as Announcement[]);
      } catch (error) {
        console.error('Failed to fetch announcements:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAnnouncements();
  }, []);

  if (loading || announcements.length === 0) return null;

  const richAnnouncements = announcements.filter(a => a.type === 'Rich')

  return (
    <>
      {richAnnouncements.map((announcement) => (
        <AnnouncementDialog
          key={announcement.id}
          id={announcement.id}
          title={announcement.title || 'Announcement'}
          content={announcement.text}
        />
      ))}
    </>
  );
}
