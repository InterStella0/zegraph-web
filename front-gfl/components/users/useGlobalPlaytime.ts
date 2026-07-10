'use client';

import { useEffect, useState } from "react";
import { fetchApiUrl } from "utils/generalUtils";
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

        const timer = setInterval(async () => {
            if (++polls > MAX_POLLS) {
                clearInterval(timer);
                return;
            }
            try {
                const next: GlobalPlaytimeSummary = await fetchApiUrl(`/accounts/${userId}/global-playtime`);
                if (!cancelled) setGlobal(next);
            } catch {
                // Keep the last known values on the screen and try again on the next tick.
            }
        }, POLL_INTERVAL_MS);

        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [userId, isCalculating]);

    return global;
}
