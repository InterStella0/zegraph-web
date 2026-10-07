'use client'
import {useEffect, useState} from "react";
import {fetchUrl} from "utils/generalUtils";
import dayjs from "dayjs";
import {AnnouncementBanner} from "components/announcements/AnnouncementBanner";
import type {Announcement as AnnouncementData} from "types/announcements";

const ANNOUNCEMENT_STORAGE_KEY = "dismissed_announcement_created_at";
const ROTATION_INTERVAL_MS = 7000;

export default function Announcement() {
    const [announcements, setAnnouncements] = useState<AnnouncementData[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [paused, setPaused] = useState(false);

    useEffect(() => {
        fetchUrl("/announcements")
            .then((data: AnnouncementData[]) => data.filter(a => a.type === 'Basic'))
            .then((data) => {
                const storedAt = localStorage.getItem(ANNOUNCEMENT_STORAGE_KEY);
                const dismissedAt = storedAt ? dayjs(storedAt) : null;

                const visible = data
                    .sort((a, b) => dayjs(b.created_at).diff(dayjs(a.created_at)))
                    .filter(a => !dismissedAt || dayjs(a.created_at).isAfter(dismissedAt));

                setAnnouncements(visible);
            })
            .catch(error => console.error('Failed to fetch announcements:', error));
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
        localStorage.setItem(ANNOUNCEMENT_STORAGE_KEY, newest);
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
