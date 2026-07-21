'use client'
import {useEffect, useRef, useState} from "react";
import {fetchUrl} from "utils/generalUtils";
import dayjs from "dayjs";
import {Button} from "components/ui/button.tsx";
import {Alert, AlertDescription} from "components/ui/alert.tsx";
import {Info, X} from "lucide-react";

const ANNOUNCEMENT_STORAGE_KEY = "dismissed_announcement_created_at";
const ROTATION_INTERVAL_MS = 5000;

export default function Announcement() {
    const [announcements, setAnnouncements] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const timerRef = useRef(null);

    useEffect(() => {
        fetchUrl("/announcements")
            .then(data => data.filter(a => a.type === 'Basic'))
            .then((data) => {
            const storedAt = localStorage.getItem(ANNOUNCEMENT_STORAGE_KEY);
            const dismissedAt = storedAt ? dayjs(storedAt) : null;

            const visible = data
                .sort((a, b) => dayjs(b.created_at).diff(dayjs(a.created_at)))
                .filter(a => !dismissedAt || dayjs(a.created_at).isAfter(dismissedAt));

            setAnnouncements(visible);
        });
    }, []);

    useEffect(() => {
        if (announcements.length <= 1) return;

        timerRef.current = setInterval(() => {
            setCurrentIndex((prev) => (prev + 1) % announcements.length);
        }, ROTATION_INTERVAL_MS);

        return () => clearInterval(timerRef.current);
    }, [announcements]);

    const current = announcements[currentIndex];

    if (!current) return null;

    const handleClose = () => {
        localStorage.setItem(ANNOUNCEMENT_STORAGE_KEY, current.created_at);
        setAnnouncements([]);
    };

    return (
        <Alert variant="default" className="pr-12">
            <Info />
            <AlertDescription>
                {current.text}
            </AlertDescription>
            <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleClose}
                className="absolute right-2 top-2 h-6 w-6"
            >
                <X className="h-4 w-4" />
            </Button>
        </Alert>
    );
}