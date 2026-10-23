"use client";

import { ReactNode, useEffect, useState } from "react";
import dayjs from "lib/dayjs";
import { fetchUrl } from "utils/generalUtils.ts";

export const TILE = "gap-0 p-0 overflow-hidden";

export function SectionHeading({ children }: { children: ReactNode }) {
    return <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider px-1">{children}</h2>;
}

/** Starts from the server-streamed data and re-fetches it every `interval` ms; a failed poll keeps the last data. */
export function usePolling<T>(initial: T, endpoint: string, revalidate: number, interval: number) {
    const [state, setState] = useState(() => ({ data: initial, updatedAt: initial ? dayjs() : null }));

    useEffect(() => {
        const id = setInterval(() => fetchUrl(endpoint, { next: { revalidate } })
            .then((data: T) => setState({ data, updatedAt: dayjs() }))
            .catch(() => {}), interval);
        return () => clearInterval(id);
    }, [endpoint, revalidate, interval]);

    return state;
}
