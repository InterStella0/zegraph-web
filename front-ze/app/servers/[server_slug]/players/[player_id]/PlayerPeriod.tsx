"use client"
import {createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState} from "react";
import {useSearchParams} from "next/navigation";
import {useLocale, useTranslations} from "next-intl";
import {Badge} from "components/ui/badge";
import {cn} from "components/lib/utils";
import {fetchApiServerUrl} from "utils/generalUtils";
import {PlayerPeriodYear} from "types/players";

const PERIOD_PATTERN = /^\d{4}(-(0[1-9]|1[0-2]))?$/;
const FIRST_YEAR = 2024;

/** `YYYY` or `YYYY-MM` in UTC; null is All time. */
export type PlayerPeriod = string | null;

type PlayerPeriodValue = {
    period: PlayerPeriod,
    setPeriod: (period: PlayerPeriod) => void,
    periods: PlayerPeriodYear[] | null,
    changes: number,
};

const PlayerPeriodContext = createContext<PlayerPeriodValue>({
    period: null,
    setPeriod: () => {},
    periods: null,
    changes: 0,
});

export function parsePeriod(value: string | null | undefined): PlayerPeriod {
    if (!value || !PERIOD_PATTERN.test(value)) return null;
    if (splitPeriod(value).year < FIRST_YEAR || periodBounds(value).start.getTime() > Date.now()) return null;
    return value;
}

export function splitPeriod(period: string): { year: number, month: number | null } {
    const [year, month] = period.split('-');
    return { year: parseInt(year, 10), month: month ? parseInt(month, 10) : null };
}

export function monthPeriod(year: number, month: number): string {
    return `${year}-${String(month).padStart(2, '0')}`;
}

/** Half-open UTC bounds of a period, `[start, end)`. */
export function periodBounds(period: string): { start: Date, end: Date } {
    const { year, month } = splitPeriod(period);
    if (month === null) {
        return { start: new Date(Date.UTC(year, 0, 1)), end: new Date(Date.UTC(year + 1, 0, 1)) };
    }
    return { start: new Date(Date.UTC(year, month - 1, 1)), end: new Date(Date.UTC(year, month, 1)) };
}

export function formatPeriodMonth(locale: string, year: number, month: number, withYear = true): string {
    return new Intl.DateTimeFormat(locale, {
        month: 'short',
        ...(withYear ? { year: 'numeric' } : {}),
        timeZone: 'UTC',
    }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export function PlayerPeriodProvider({ serverId, playerId, children }: {
    serverId: string,
    playerId: string,
    children: ReactNode,
}) {
    const searchParams = useSearchParams();
    const period = parsePeriod(searchParams.get('period'));
    const [periods, setPeriods] = useState<PlayerPeriodYear[] | null>(null);
    const [shown, setShown] = useState({ period, changes: 0 });
    if (shown.period !== period) {
        setShown({ period, changes: shown.changes + 1 });
    }
    const changes = shown.changes;

    useEffect(() => {
        let cancelled = false;
        fetchApiServerUrl(serverId, `/players/${playerId}/periods`)
            .then((data: PlayerPeriodYear[]) => { if (!cancelled) setPeriods(data); })
            .catch(() => { if (!cancelled) setPeriods([]); });
        return () => { cancelled = true; };
    }, [serverId, playerId]);

    const setPeriod = useCallback((next: PlayerPeriod) => {
        const url = new URL(window.location.href);
        if (url.searchParams.get('period') === next || (!next && !url.searchParams.has('period'))) return;
        if (next) url.searchParams.set('period', next);
        else url.searchParams.delete('period');
        window.history.pushState(null, '', url);
    }, []);

    const value = useMemo(
        () => ({ period, setPeriod, periods, changes }),
        [period, setPeriod, periods, changes],
    );

    return <PlayerPeriodContext.Provider value={value}>{children}</PlayerPeriodContext.Provider>;
}

export function usePlayerPeriod(): PlayerPeriodValue {
    return useContext(PlayerPeriodContext);
}

export function usePeriodLabel(period: PlayerPeriod): string {
    const t = useTranslations('players.period');
    const locale = useLocale();
    if (!period) return t('allTime');
    const { year, month } = splitPeriod(period);
    return month === null ? String(year) : formatPeriodMonth(locale, year, month);
}

/** Names the period a card is showing, and flashes whenever the period changes. */
export function PeriodChip({ className }: { className?: string }) {
    const { period, changes } = usePlayerPeriod();
    const label = usePeriodLabel(period);
    return (
        <Badge
            key={changes}
            variant="outline"
            className={cn(
                "rounded-md border-primary/30 bg-primary/15 text-foreground font-medium",
                changes > 0 && "period-chip-flash",
                className,
            )}
        >
            {label}
        </Badge>
    );
}
