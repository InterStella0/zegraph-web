'use client';

import { useEffect, useState } from "react";
import { fetchApiUrl, NO_CACHE } from "utils/generalUtils";
import { GlobalPlaytimeSummary } from "types/community";

const POLL_INTERVAL_MS = 4000;
const MAX_POLLS = 45;

export function useGlobalPlaytime(userId: string, initial: GlobalPlaytimeSummary): GlobalPlaytimeSummary {
    const [global, setGlobal] = useState(initial);
    const isCalculating = global.is_calculating;

    useEffect(() => {
        if (!isCalculating) return;

        let cancelled = false;
        let polls = 0;

        const timer = setInterval(() => {
            if (++polls > MAX_POLLS) return clearInterval(timer);
            fetchApiUrl(`/players/${userId}/global-playtime`, NO_CACHE)
                .then((next: GlobalPlaytimeSummary) => { if (!cancelled) setGlobal(next); })
                .catch(() => {});
        }, POLL_INTERVAL_MS);

        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [userId, isCalculating]);

    return global;
}
