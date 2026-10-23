'use client'
import {use, useEffect, useState} from "react";
import dayjs from "dayjs"; // core only: this renders in the root layout, so it skips lib/dayjs's plugins
import {AnnouncementBanner} from "components/announcements/AnnouncementBanner";
import {ANNOUNCEMENT_DISMISSED} from "components/announcements/announcementDismissal";
import type {Announcement as AnnouncementData} from "types/announcements";
import {setCookie} from "components/lib/utils";

const ROTATION_INTERVAL_MS = 7000;

export default function Announcement({ announcementsPromise }: { announcementsPromise: Promise<AnnouncementData[]> }) {
    const [announcements, setAnnouncements] = useState<AnnouncementData[]>(use(announcementsPromise));
    const [currentIndex, setCurrentIndex] = useState(0);
    const [paused, setPaused] = useState(false);

    useEffect(() => {
        const storedAt = localStorage.getItem(ANNOUNCEMENT_DISMISSED);
        if (!storedAt) return;
        localStorage.removeItem(ANNOUNCEMENT_DISMISSED);
        setCookie(ANNOUNCEMENT_DISMISSED, storedAt);
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
        setCookie(ANNOUNCEMENT_DISMISSED, newest);
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
