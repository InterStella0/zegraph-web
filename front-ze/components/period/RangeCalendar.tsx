'use client'
import {ChevronLeft, ChevronRight} from "lucide-react";
import {useTranslations} from "next-intl";
import {cn} from "components/lib/utils";

const TINT = 'color-mix(in oklab, var(--primary) 22%, transparent)';
const WEEK_SUNDAY = Date.UTC(2026, 0, 4);
const DAY_MS = 24 * 60 * 60 * 1000;

/** A UTC month as a count of months since year 0. */
export function monthIndex(date: Date): number {
    return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

export default function RangeCalendar({
    month, locale, start, end, hover, minDay, maxDay, onPick, onHover, onPrev, onNext, nextClassName,
}: {
    month: number,
    locale: string,
    start: Date | null,
    end: Date | null,
    hover: Date | null,
    minDay: Date | null,
    maxDay: Date,
    onPick: (day: Date) => void,
    onHover: (day: Date | null) => void,
    onPrev?: () => void,
    onNext?: () => void,
    nextClassName?: string,
}) {
    const t = useTranslations('period');
    const year = Math.floor(month / 12);
    const monthOfYear = month % 12;
    const first = new Date(Date.UTC(year, monthOfYear, 1)).getUTCDay();
    const length = new Date(Date.UTC(year, monthOfYear + 1, 0)).getUTCDate();
    const title = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' })
        .format(new Date(Date.UTC(year, monthOfYear, 1)));
    const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
    const dayLabel = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' });

    const other = end ?? hover;
    const lo = start && other ? Math.min(start.getTime(), other.getTime()) : start?.getTime() ?? null;
    const hi = start && other ? Math.max(start.getTime(), other.getTime()) : start?.getTime() ?? null;
    const todayTime = maxDay.getTime();

    const arrow = "flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent";

    return (
        <div className="flex flex-col gap-2">
            <div className="flex h-8 items-center justify-between">
                {onPrev
                    ? <button type="button" className={arrow} onClick={onPrev} aria-label={t('previousMonth')}><ChevronLeft className="size-4" /></button>
                    : <span className="size-8" />}
                <span className="text-sm font-semibold">{title}</span>
                {onNext
                    ? <button type="button" className={cn(arrow, nextClassName)} onClick={onNext} aria-label={t('nextMonth')}><ChevronRight className="size-4" /></button>
                    : <span className="size-8" />}
            </div>
            <div className="grid grid-cols-[repeat(7,36px)] gap-y-1" onMouseLeave={() => onHover(null)}>
                {Array.from({ length: 7 }, (_, i) => (
                    <div key={`w${i}`} className="flex h-7 items-center justify-center text-xs text-muted-foreground">
                        {weekday.format(new Date(WEEK_SUNDAY + i * DAY_MS)).slice(0, 2)}
                    </div>
                ))}
                {Array.from({ length: first }, (_, i) => <div key={`e${i}`} />)}
                {Array.from({ length }, (_, i) => {
                    const day = i + 1;
                    const date = new Date(Date.UTC(year, monthOfYear, day));
                    const time = date.getTime();
                    const column = (first + i) % 7;
                    const disabled = time > todayTime || (!!minDay && time < minDay.getTime());
                    const inRange = lo !== null && hi !== null && time >= lo && time <= hi;
                    const isLo = time === lo;
                    const isHi = time === hi;
                    const endpoint = inRange && (isLo || isHi);
                    const leftEdge = column === 0 || day === 1;
                    const rightEdge = column === 6 || day === length;

                    let background: string | undefined;
                    if (inRange && lo !== hi) {
                        if (isLo) background = `linear-gradient(90deg, transparent 50%, ${TINT} 50%)`;
                        else if (isHi) background = `linear-gradient(90deg, ${TINT} 50%, transparent 50%)`;
                        else background = TINT;
                    }
                    const rounded = inRange && lo !== hi && !isLo && !isHi;

                    return (
                        <div
                            key={day}
                            className={cn(
                                "flex h-[34px] items-center justify-center",
                                rounded && leftEdge && "rounded-l-full",
                                rounded && rightEdge && "rounded-r-full",
                            )}
                            style={{ background }}
                        >
                            <button
                                type="button"
                                disabled={disabled}
                                aria-label={dayLabel.format(date)}
                                aria-pressed={endpoint}
                                onClick={() => onPick(date)}
                                onMouseEnter={() => onHover(date)}
                                className={cn(
                                    "flex size-8 items-center justify-center rounded-full text-[13px] transition-colors",
                                    endpoint
                                        ? "bg-primary font-semibold text-primary-foreground"
                                        : inRange ? "text-foreground" : "hover:bg-accent",
                                    time === todayTime && !endpoint && "ring-1 ring-inset ring-muted-foreground",
                                    "disabled:pointer-events-none disabled:text-muted-foreground/40",
                                )}
                            >
                                {day}
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
