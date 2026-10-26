"use client"
import {createContext, ReactNode, useCallback, useContext, useMemo, useState} from "react";
import {useSearchParams} from "next/navigation";
import {useLocale, useTranslations} from "next-intl";
import {Badge} from "components/ui/badge";
import {cn} from "components/lib/utils";
import {PeriodYear} from "types/players";
import {useResource} from "lib/hooks/useResource";

const PERIOD_PATTERN = /^\d{4}(-(0[1-9]|1[0-2]))?$/;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const FIRST_YEAR = 2024;
const SHORT_RANGE_DAYS = 31;

export type Period = string | null;

type PeriodValue = {
    period: Period,
    setPeriod: (period: Period) => void,
    periods: PeriodYear[] | null,
    changes: number,
};

const PeriodContext = createContext<PeriodValue>({
    period: null,
    setPeriod: () => {},
    periods: null,
    changes: 0,
});

function parsePeriod(value: string | null | undefined): Period {
    if (!value) return null;
    const range = splitRange(value);
    if (range) {
        const valid = range.from <= range.to
            && range.from.getUTCFullYear() >= FIRST_YEAR
            && range.to.getTime() <= Date.now();
        return valid ? value : null;
    }
    if (!PERIOD_PATTERN.test(value)) return null;
    if (splitPeriod(value).year < FIRST_YEAR || periodBounds(value).start.getTime() > Date.now()) return null;
    return value;
}

/** A valid `YYYY-MM-DD` day as a UTC midnight, or null. */
export function parseDay(value: string): Date | null {
    if (!DAY_PATTERN.test(value)) return null;
    const [year, month, day] = value.split('-').map(part => parseInt(part, 10));
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}

export function splitRange(period: string): { from: Date, to: Date } | null {
    const parts = period.split('..');
    if (parts.length !== 2) return null;
    const from = parseDay(parts[0]);
    const to = parseDay(parts[1]);
    return from && to ? { from, to } : null;
}

export const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

export function rangePeriod(from: Date, to: Date): string {
    return `${isoDay(from)}..${isoDay(to)}`;
}

export function rangeDays(range: { from: Date, to: Date }): number {
    return Math.round((range.to.getTime() - range.from.getTime()) / DAY_MS) + 1;
}

export function addDays(date: Date, days: number): Date {
    return new Date(date.getTime() + days * DAY_MS);
}

export function isShortPeriod(period: string): boolean {
    const range = splitRange(period);
    return range ? rangeDays(range) <= SHORT_RANGE_DAYS : splitPeriod(period).month !== null;
}

export function splitPeriod(period: string): { year: number, month: number | null } {
    const [year, month] = period.split('-');
    return { year: parseInt(year, 10), month: month ? parseInt(month, 10) : null };
}

export function monthPeriod(year: number, month: number): string {
    return `${year}-${String(month).padStart(2, '0')}`;
}

export function periodBounds(period: string): { start: Date, end: Date } {
    const range = splitRange(period);
    if (range) {
        return { start: range.from, end: addDays(range.to, 1) };
    }
    const { year, month } = splitPeriod(period);
    return month === null
        ? { start: new Date(Date.UTC(year, 0, 1)), end: new Date(Date.UTC(year + 1, 0, 1)) }
        : { start: new Date(Date.UTC(year, month - 1, 1)), end: new Date(Date.UTC(year, month, 1)) };
}

export function formatPeriodMonth(locale: string, year: number, month: number, withYear = true): string {
    return new Intl.DateTimeFormat(locale, {
        month: 'short',
        ...(withYear && { year: 'numeric' as const }),
        timeZone: 'UTC',
    }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export function formatPeriodRange(locale: string, from: Date, to: Date): string {
    return new Intl.DateTimeFormat(locale, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
    }).formatRange(from, to).replace(/[  ]/g, ' ');
}

export function PeriodProvider({ fetchPeriods, children }: {
    fetchPeriods: () => Promise<PeriodYear[]>,
    children: ReactNode,
}) {
    const searchParams = useSearchParams();
    const period = parsePeriod(searchParams.get('period'));
    const [shown, setShown] = useState({ period, changes: 0 });
    if (shown.period !== period) {
        setShown({ period, changes: shown.changes + 1 });
    }
    const changes = shown.changes;

    const { data: periods } = useResource(() => fetchPeriods().catch(() => []), [fetchPeriods], { keepData: true });

    const setPeriod = useCallback((next: Period) => {
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

    return <PeriodContext.Provider value={value}>{children}</PeriodContext.Provider>;
}

export const usePeriod = (): PeriodValue => useContext(PeriodContext);

export function usePeriodLabel(period: Period): string {
    const t = useTranslations('period');
    const locale = useLocale();
    if (!period) return t('allTime');
    const range = splitRange(period);
    if (range) return formatPeriodRange(locale, range.from, range.to);
    const { year, month } = splitPeriod(period);
    return month === null ? String(year) : formatPeriodMonth(locale, year, month);
}

export function PeriodChip({ className }: { className?: string }) {
    const { period, changes } = usePeriod();
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
