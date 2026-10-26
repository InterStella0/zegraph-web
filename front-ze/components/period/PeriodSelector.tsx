'use client'
import {ComponentProps, ReactNode, useMemo, useState} from "react";
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
    isoDay,
    monthPeriod,
    parseDay,
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

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const QUICK_RANGES = [['last7Days', 7], ['last30Days', 30], ['last90Days', 90]] as const;
const MODES = [['custom', 'customRange'], ['month', 'monthly'], ['year', 'yearly'], ['all', 'allTime']] as const;

type Mode = typeof MODES[number][0];

function utcToday(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function ChevronButton({ direction, ...props }: ComponentProps<typeof Button> & { direction: 'left' | 'right' }) {
    const Icon = direction === 'left' ? ChevronLeft : ChevronRight;
    return <Button variant="ghost" size="icon" {...props}><Icon className="h-4 w-4" /></Button>;
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
        const anchor = start && end ? null : start ?? end;
        if (anchor) {
            const [from, to] = anchor <= day ? [anchor, day] : [day, anchor];
            setStart(from);
            setEnd(to);
            setHover(null);
        } else {
            setStart(day);
            setEnd(null);
        }
    };

    const pending = !!start && !end;
    const inBounds = (day: Date) => day <= today && (!firstDay || day >= firstDay);
    const startSide = {
        key: 'start' as const, day: start, setDay: setStart, text: startText, setText: setStartText,
        fits: (day: Date) => !end || day <= end, viewOffset: 0, min: firstDay, max: end ?? today, highlighted: !start && !pending,
    };
    const endSide = {
        key: 'end' as const, day: end, setDay: setEnd, text: endText, setText: setEndText,
        fits: (day: Date) => !start || day >= start, viewOffset: -1, min: start ?? firstDay, max: today, highlighted: pending,
    };
    type Side = typeof startSide | typeof endSide;

    const typeDay = (side: Side, value: string) => {
        side.setText(value);
        const day = parseDay(value);
        if (!day || !inBounds(day) || !side.fits(day)) return;
        side.setDay(day);
        setHover(null);
        setView(clampView(monthIndex(day) + side.viewOffset));
    };

    const dateField = (side: Side) => {
        const typed = side.text ? parseDay(side.text) : null;
        return (
            <DateField
                label={t(side.key)}
                value={side.text ?? (side.day ? isoDay(side.day) : '')}
                min={side.min}
                max={side.max}
                invalid={!!side.text && !(typed && inBounds(typed) && side.fits(typed))}
                highlighted={side.highlighted}
                pickLabel={t('pickDate')}
                onChange={value => typeDay(side, value)}
                onPick={day => { typeDay(side, isoDay(day)); side.setText(null); }}
                onBlur={() => side.setText(null)}
            />
        );
    };

    const quickStart = (days: number) => {
        const from = addDays(today, -(days - 1));
        return firstDay && from < firstDay ? firstDay : from;
    };

    const pickQuick = (days: number) => {
        setStart(quickStart(days));
        setEnd(today);
        setHover(null);
        setView(clampView(lastMonth - 1));
    };

    const applyRange = () => {
        if (!start || !end) return;
        setPeriod(rangePeriod(start, end));
        setOpen(false);
    };

    const noData = periods !== null && periods.length === 0;
    const browseMonths = years.find(y => y.year === browseYear)?.months ?? [];

    const customPanel = () => (
        <div className="flex flex-col gap-3.5">
            <div className="flex flex-wrap gap-1.5">
                {QUICK_RANGES.map(([key, days]) => {
                    const active = !!start && !!end && end.getTime() === today.getTime()
                        && start.getTime() === quickStart(days).getTime();
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
                {dateField(startSide)}
                <span className="pb-2.5 text-muted-foreground">→</span>
                {dateField(endSide)}
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
                            onNext={view + side < lastMonth ? () => setView(view + 1) : undefined}
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
    );

    const monthPanel = () => (
        <div className="flex flex-col gap-3.5">
            <div className="flex h-8 items-center justify-between">
                <ChevronButton
                    direction="left"
                    className={cn(browseYear <= (oldest?.year ?? browseYear) && "invisible")}
                    onClick={() => setBrowseYear(browseYear - 1)}
                    aria-label={String(browseYear - 1)}
                />
                <span className="text-[15px] font-semibold">{browseYear}</span>
                <ChevronButton
                    direction="right"
                    className={cn(browseYear >= today.getUTCFullYear() && "invisible")}
                    onClick={() => setBrowseYear(browseYear + 1)}
                    aria-label={String(browseYear + 1)}
                />
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
    );

    const yearPanel = () => (
        <div className="flex flex-col gap-2">
            {years.map(({year}) => {
                const active = selected?.year === year && selected.month === null;
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
                            {formatPeriodRange(locale, new Date(Date.UTC(year, 0, 1)), inProgress ? today : yearEnd)}
                            {inProgress && ` · ${t('inProgress')}`}
                        </span>
                    </button>
                );
            })}
        </div>
    );

    const allTimePanel = () => (
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
    );

    const panels: Record<Mode, () => ReactNode> = {custom: customPanel, month: monthPanel, year: yearPanel, all: allTimePanel};

    return (
        <Card className="flex-row flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2">
            <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">{t('label')}</span>
                <Popover open={open} onOpenChange={onOpenChange}>
                    <PopoverAnchor asChild>
                        <div className="flex items-center rounded-md border bg-card">
                            <ChevronButton
                                direction="left"
                                className="rounded-none rounded-l-md border-r"
                                disabled={!previous}
                                onClick={() => previous && setPeriod(previous)}
                                aria-label={t('previous')}
                            />
                            <PopoverTrigger asChild>
                                <Button variant="ghost" className="rounded-none min-w-[150px] justify-between gap-3 font-semibold">
                                    <span className="flex items-center gap-2">
                                        <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                                        {label}
                                    </span>
                                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                </Button>
                            </PopoverTrigger>
                            <ChevronButton
                                direction="right"
                                className="rounded-none rounded-r-md border-l"
                                disabled={!next}
                                onClick={() => next && setPeriod(next)}
                                aria-label={t('next')}
                            />
                        </div>
                    </PopoverAnchor>
                    <PopoverContent align="start" className="w-[min(46rem,calc(100vw-2rem))] overflow-hidden p-0">
                        <div className="flex flex-col md:flex-row">
                            <div
                                role="tablist"
                                aria-orientation="vertical"
                                className="flex gap-0.5 overflow-x-auto border-b p-2 md:w-40 md:shrink-0 md:flex-col md:border-r md:border-b-0"
                            >
                                {MODES.map(([id, name]) => (
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
                                        {t(name)}
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
                                ) : panels[mode]()}
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>
            </div>
            <p className="text-xs text-muted-foreground">{t('hint')}</p>
        </Card>
    );
}
