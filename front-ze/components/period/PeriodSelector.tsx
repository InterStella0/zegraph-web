'use client'
import {useMemo, useState} from "react";
import {useLocale, useTranslations} from "next-intl";
import {Calendar as CalendarIcon, ChevronDown, ChevronLeft, ChevronRight} from "lucide-react";
import {Button} from "components/ui/button";
import {Card} from "components/ui/card";
import {Popover, PopoverAnchor, PopoverContent, PopoverTrigger} from "components/ui/popover";
import {Skeleton} from "components/ui/skeleton";
import {cn} from "components/lib/utils";
import {
    addDays,
    formatPeriodMonth,
    formatPeriodRange,
    monthPeriod,
    Period,
    rangeDays,
    rangePeriod,
    splitPeriod,
    splitRange,
    usePeriod,
    usePeriodLabel,
} from "./Period";
import RangeCalendar, {monthIndex} from "./RangeCalendar";
import DateField from "./DateField";

const MONTHS = Array.from({length: 12}, (_, i) => i + 1);
const QUICK_RANGES = [['last7Days', 7], ['last30Days', 30], ['last90Days', 90]] as const;

type Mode = 'custom' | 'month' | 'year' | 'all';

function isoDay(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function parseIsoDay(value: string): Date | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return null;
    const [year, month, day] = match.slice(1).map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}

function utcToday(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export default function PeriodSelector() {
    const t = useTranslations('period');
    const locale = useLocale();
    const {period, setPeriod, periods} = usePeriod();
    const label = usePeriodLabel(period);
    const [open, setOpen] = useState(false);
    const [today] = useState(utcToday);
    const [mode, setMode] = useState<Mode>('all');
    const [start, setStart] = useState<Date | null>(null);
    const [end, setEnd] = useState<Date | null>(null);
    const [hover, setHover] = useState<Date | null>(null);
    const [startText, setStartText] = useState<string | null>(null);
    const [endText, setEndText] = useState<string | null>(null);
    const [view, setView] = useState(() => monthIndex(today) - 1);
    const [browseYear, setBrowseYear] = useState(() => today.getUTCFullYear());

    const range = period ? splitRange(period) : null;
    const selected = period && !range ? splitPeriod(period) : null;
    const committedMode: Mode = range ? 'custom' : !selected ? 'all' : selected.month === null ? 'year' : 'month';
    const years = useMemo(() => [...(periods ?? [])].sort((a, b) => b.year - a.year), [periods]);
    const oldest = years.at(-1);
    const firstDay = oldest ? new Date(Date.UTC(oldest.year, Math.min(...oldest.months) - 1, 1)) : null;
    const firstMonth = firstDay ? monthIndex(firstDay) : null;
    const lastMonth = monthIndex(today);
    const clampView = (month: number) => Math.max(firstMonth ?? month, Math.min(month, lastMonth - 1));

    let previous: Period = null;
    let next: Period = null;
    if (range) {
        const days = rangeDays(range);
        const earlier = addDays(range.from, -days);
        const later = addDays(range.to, days);
        if (firstDay && earlier >= firstDay) previous = rangePeriod(earlier, addDays(range.to, -days));
        if (later <= today) next = rangePeriod(addDays(range.from, days), later);
    } else if (selected) {
        const chronological = [...years].reverse();
        const steps = selected.month === null
            ? chronological.map(y => String(y.year))
            : chronological.flatMap(y => [...y.months].sort((a, b) => a - b).map(m => monthPeriod(y.year, m)));
        const index = steps.indexOf(period!);
        previous = index > 0 ? steps[index - 1] : null;
        next = index >= 0 && index < steps.length - 1 ? steps[index + 1] : null;
    }

    const onOpenChange = (value: boolean) => {
        if (value) {
            setMode(committedMode);
            setStart(range?.from ?? null);
            setEnd(range?.to ?? null);
            setHover(null);
            setStartText(null);
            setEndText(null);
            setView(clampView((range ? monthIndex(range.to) : lastMonth) - 1));
            setBrowseYear(selected?.year ?? years[0]?.year ?? today.getUTCFullYear());
        }
        setOpen(value);
    };

    const pickDay = (day: Date) => {
        if (start && !end) {
            const [from, to] = start <= day ? [start, day] : [day, start];
            setStart(from);
            setEnd(to);
            setHover(null);
        } else if (!start && end) {
            const [from, to] = day <= end ? [day, end] : [end, day];
            setStart(from);
            setEnd(to);
            setHover(null);
        } else {
            setStart(day);
            setEnd(null);
        }
    };

    const inBounds = (day: Date) => day <= today && (!firstDay || day >= firstDay);
    const typedStart = startText === null ? start : parseIsoDay(startText);
    const typedEnd = endText === null ? end : parseIsoDay(endText);
    const startInvalid = startText !== null && startText !== ''
        && (!typedStart || !inBounds(typedStart) || (!!end && typedStart > end));
    const endInvalid = endText !== null && endText !== ''
        && (!typedEnd || !inBounds(typedEnd) || (!!start && typedEnd < start));

    const typeStart = (value: string) => {
        setStartText(value);
        const day = parseIsoDay(value);
        if (!day || !inBounds(day) || (end && day > end)) return;
        setStart(day);
        setHover(null);
        setView(clampView(monthIndex(day)));
    };

    const typeEnd = (value: string) => {
        setEndText(value);
        const day = parseIsoDay(value);
        if (!day || !inBounds(day) || (start && day < start)) return;
        setEnd(day);
        setHover(null);
        setView(clampView(monthIndex(day) - 1));
    };

    const pickQuick = (days: number) => {
        const from = addDays(today, -(days - 1));
        setStart(firstDay && from < firstDay ? firstDay : from);
        setEnd(today);
        setHover(null);
        setView(clampView(lastMonth - 1));
    };

    const applyRange = () => {
        if (!start || !end) return;
        setPeriod(rangePeriod(start, end));
        setOpen(false);
    };

    const pending = !!start && !end;
    const noData = periods !== null && periods.length === 0;
    const browseMonths = years.find(y => y.year === browseYear)?.months ?? [];

    const modes: [Mode, string][] = [
        ['custom', t('customRange')],
        ['month', t('monthly')],
        ['year', t('yearly')],
        ['all', t('allTime')],
    ];


    return (
        <Card className="flex-row flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2">
            <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">{t('label')}</span>
                <Popover open={open} onOpenChange={onOpenChange}>
                    <PopoverAnchor asChild>
                        <div className="flex items-center rounded-md border bg-card">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="rounded-none rounded-l-md border-r"
                                disabled={!previous}
                                onClick={() => previous && setPeriod(previous)}
                                aria-label={t('previous')}
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <PopoverTrigger asChild>
                                <Button variant="ghost" className="rounded-none min-w-[150px] justify-between gap-3 font-semibold">
                                    <span className="flex items-center gap-2">
                                        <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                                        {label}
                                    </span>
                                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                </Button>
                            </PopoverTrigger>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="rounded-none rounded-r-md border-l"
                                disabled={!next}
                                onClick={() => next && setPeriod(next)}
                                aria-label={t('next')}
                            >
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </PopoverAnchor>
                    <PopoverContent align="start" className="w-[min(46rem,calc(100vw-2rem))] overflow-hidden p-0">
                        <div className="flex flex-col md:flex-row">
                            <div
                                role="tablist"
                                aria-orientation="vertical"
                                className="flex gap-0.5 overflow-x-auto border-b p-2 md:w-40 md:shrink-0 md:flex-col md:border-r md:border-b-0"
                            >
                                {modes.map(([id, name]) => (
                                    <button
                                        key={id}
                                        type="button"
                                        role="tab"
                                        aria-selected={mode === id}
                                        onClick={() => setMode(id)}
                                        className={cn(
                                            "whitespace-nowrap rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                                            mode === id ? "bg-primary/15 font-semibold text-primary" : "text-foreground/80",
                                        )}
                                    >
                                        {name}
                                    </button>
                                ))}
                            </div>

                            <div className="min-h-[26rem] flex-1 px-5 py-4">
                                {periods === null ? (
                                    <div className="flex flex-col gap-3">
                                        <Skeleton className="h-8 w-2/3" />
                                        <Skeleton className="h-64 w-full" />
                                    </div>
                                ) : noData ? (
                                    <p className="text-sm text-muted-foreground">{t('noPeriods')}</p>
                                ) : mode === 'custom' ? (
                                    <div className="flex flex-col gap-3.5">
                                        <div className="flex flex-wrap gap-1.5">
                                            {QUICK_RANGES.map(([key, days]) => {
                                                const from = addDays(today, -(days - 1));
                                                const active = !!start && !!end && end.getTime() === today.getTime()
                                                    && start.getTime() === (firstDay && from < firstDay ? firstDay : from).getTime();
                                                return (
                                                    <button
                                                        key={key}
                                                        type="button"
                                                        aria-pressed={active}
                                                        onClick={() => pickQuick(days)}
                                                        className={cn(
                                                            "rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors",
                                                            active ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent",
                                                        )}
                                                    >
                                                        {t(key)}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <div className="flex items-end gap-2.5">
                                            <div className="flex flex-1 flex-col gap-1">
                                                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{t('start')}</span>
                                                <DateField
                                                    label={t('start')}
                                                    value={startText ?? (start ? isoDay(start) : '')}
                                                    min={firstDay}
                                                    max={end ?? today}
                                                    invalid={startInvalid}
                                                    highlighted={!start && !pending}
                                                    pickLabel={t('pickDate')}
                                                    onChange={typeStart}
                                                    onPick={day => { typeStart(isoDay(day)); setStartText(null); }}
                                                    onBlur={() => setStartText(null)}
                                                />
                                            </div>
                                            <span className="pb-2.5 text-muted-foreground">→</span>
                                            <div className="flex flex-1 flex-col gap-1">
                                                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{t('end')}</span>
                                                <DateField
                                                    label={t('end')}
                                                    value={endText ?? (end ? isoDay(end) : '')}
                                                    min={start ?? firstDay}
                                                    max={today}
                                                    invalid={endInvalid}
                                                    highlighted={pending}
                                                    pickLabel={t('pickDate')}
                                                    onChange={typeEnd}
                                                    onPick={day => { typeEnd(isoDay(day)); setEndText(null); }}
                                                    onBlur={() => setEndText(null)}
                                                />
                                            </div>
                                        </div>
                                        <div className="flex justify-center gap-6">
                                            {[view, view + 1].map((month, side) => (
                                                <div key={side} className={cn(side === 1 && "hidden md:block")}>
                                                    <RangeCalendar
                                                        month={month}
                                                        locale={locale}
                                                        start={start}
                                                        end={end}
                                                        hover={pending ? hover : null}
                                                        minDay={firstDay}
                                                        maxDay={today}
                                                        onPick={pickDay}
                                                        onHover={setHover}
                                                        onPrev={side === 0 && firstMonth !== null && view > firstMonth ? () => setView(view - 1) : undefined}
                                                        onNext={side === 1 ? (view + 1 < lastMonth ? () => setView(view + 1) : undefined)
                                                            : view < lastMonth ? () => setView(view + 1) : undefined}
                                                        nextClassName={side === 0 ? "md:invisible" : undefined}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                        <div className="flex items-center justify-between border-t pt-3">
                                            <span className="text-[13px] text-muted-foreground">
                                                {start && end ? t('dayCount', {count: rangeDays({from: start, to: end})}) : t(start ? 'selectEnd' : 'selectStart')}
                                            </span>
                                            <div className="flex gap-2">
                                                <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>{t('cancel')}</Button>
                                                <Button size="sm" disabled={!start || !end} onClick={applyRange}>{t('apply')}</Button>
                                            </div>
                                        </div>
                                    </div>
                                ) : mode === 'month' ? (
                                    <div className="flex flex-col gap-3.5">
                                        <div className="flex h-8 items-center justify-between">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className={cn(browseYear <= (oldest?.year ?? browseYear) && "invisible")}
                                                onClick={() => setBrowseYear(browseYear - 1)}
                                                aria-label={String(browseYear - 1)}
                                            >
                                                <ChevronLeft className="h-4 w-4" />
                                            </Button>
                                            <span className="text-[15px] font-semibold">{browseYear}</span>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className={cn(browseYear >= today.getUTCFullYear() && "invisible")}
                                                onClick={() => setBrowseYear(browseYear + 1)}
                                                aria-label={String(browseYear + 1)}
                                            >
                                                <ChevronRight className="h-4 w-4" />
                                            </Button>
                                        </div>
                                        <div className="grid grid-cols-4 gap-2">
                                            {MONTHS.map(month => {
                                                const active = selected?.year === browseYear && selected.month === month;
                                                const current = browseYear * 12 + month - 1 === lastMonth;
                                                return (
                                                    <button
                                                        key={month}
                                                        type="button"
                                                        disabled={!browseMonths.includes(month)}
                                                        aria-pressed={active}
                                                        onClick={() => setPeriod(monthPeriod(browseYear, month))}
                                                        className={cn(
                                                            "h-14 rounded-lg text-sm font-medium transition-colors",
                                                            active
                                                                ? "bg-primary font-semibold text-primary-foreground"
                                                                : "bg-muted hover:bg-accent",
                                                            current && !active && "ring-1 ring-inset ring-muted-foreground",
                                                            "disabled:pointer-events-none disabled:bg-transparent disabled:text-muted-foreground/40 disabled:ring-0",
                                                        )}
                                                    >
                                                        {formatPeriodMonth(locale, browseYear, month, false)}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <p className="text-[13px] text-muted-foreground">{t('monthHint')}</p>
                                    </div>
                                ) : mode === 'year' ? (
                                    <div className="flex flex-col gap-2">
                                        {years.map(({year}) => {
                                            const active = selected?.year === year && selected.month === null;
                                            const yearStart = new Date(Date.UTC(year, 0, 1));
                                            const yearEnd = new Date(Date.UTC(year, 11, 31));
                                            const inProgress = yearEnd > today;
                                            return (
                                                <button
                                                    key={year}
                                                    type="button"
                                                    aria-pressed={active}
                                                    onClick={() => setPeriod(String(year))}
                                                    className={cn(
                                                        "flex items-baseline justify-between rounded-lg border px-4 py-3.5 text-left transition-colors",
                                                        active ? "border-primary bg-primary/15" : "bg-muted/50 hover:bg-accent",
                                                    )}
                                                >
                                                    <span className={cn("text-lg font-semibold", active && "text-primary")}>{year}</span>
                                                    <span className="text-[13px] text-muted-foreground">
                                                        {formatPeriodRange(locale, yearStart, inProgress ? today : yearEnd)}
                                                        {inProgress && ` · ${t('inProgress')}`}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-start gap-3.5">
                                        <p className="text-[13px] text-muted-foreground">{t('allTimeDescription')}</p>
                                        {firstDay && (
                                            <p className="text-xl font-semibold">{formatPeriodRange(locale, firstDay, today)}</p>
                                        )}
                                        <Button
                                            variant={period ? "default" : "secondary"}
                                            disabled={!period}
                                            onClick={() => setPeriod(null)}
                                        >
                                            {period ? t('showAllTime') : t('applied')}
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>
            </div>
            <p className="text-xs text-muted-foreground">{t('hint')}</p>
        </Card>
    );
}
