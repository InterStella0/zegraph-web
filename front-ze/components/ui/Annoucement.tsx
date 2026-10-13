'use client'
import {use, useEffect, useState} from "react";
import dayjs from "dayjs";
import {AnnouncementBanner} from "components/announcements/AnnouncementBanner";
import {ANNOUNCEMENT_DISMISSED} from "components/announcements/announcementDismissal";
import type {Announcement as AnnouncementData} from "types/announcements";

const ROTATION_INTERVAL_MS = 7000;

function saveDismissal(createdAt: string) {
    document.cookie = `${ANNOUNCEMENT_DISMISSED}=${encodeURIComponent(createdAt)}; path=/; max-age=31536000; SameSite=Lax`;
}

export default function Announcement({ announcementsPromise }: { announcementsPromise: Promise<AnnouncementData[]> }) {
    const [announcements, setAnnouncements] = useState<AnnouncementData[]>(use(announcementsPromise));
    const [currentIndex, setCurrentIndex] = useState(0);
    const [paused, setPaused] = useState(false);

    useEffect(() => {
        const storedAt = localStorage.getItem(ANNOUNCEMENT_DISMISSED);
        if (!storedAt) return;
        localStorage.removeItem(ANNOUNCEMENT_DISMISSED);
        saveDismissal(storedAt);
        const dismissedAt = dayjs(storedAt);
        setAnnouncements(prev => prev.filter(a => dayjs(a.created_at).isAfter(dismissedAt)));
    }, []);

    useEffect(() => {
        if (announcements.length <= 1 || paused) return;

        const timer = setInterval(() => {
            setCurrentIndex((prev) => (prev + 1) % announcements.length);
        }, ROTATION_INTERVAL_MS);

        return () => clearInterval(timer);
    }, [announcements, paused]);

    const current = announcements[currentIndex];

    if (!current) return null;

    const handleClose = () => {
        const newest = announcements.reduce((latest, a) =>
            dayjs(a.created_at).isAfter(dayjs(latest)) ? a.created_at : latest, current.created_at);
        saveDismissal(newest);
        setAnnouncements([]);
    };

    return (
        <div
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
        >
            <AnnouncementBanner
                text={current.text}
                onDismiss={handleClose}
                counter={announcements.length > 1 ? `${currentIndex + 1}/${announcements.length}` : undefined}
            />
        </div>
    );
}
