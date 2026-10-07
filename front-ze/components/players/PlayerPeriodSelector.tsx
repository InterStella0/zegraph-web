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
    formatPeriodMonth,
    monthPeriod,
    splitPeriod,
    usePeriodLabel,
    usePlayerPeriod,
} from "../../app/servers/[server_slug]/players/[player_id]/PlayerPeriod.tsx";

const MONTHS = Array.from({length: 12}, (_, i) => i + 1);

export default function PlayerPeriodSelector() {
    const t = useTranslations('players.period');
    const locale = useLocale();
    const {period, setPeriod, periods} = usePlayerPeriod();
    const label = usePeriodLabel(period);
    const [open, setOpen] = useState(false);
    const [viewYear, setViewYear] = useState<number | null>(null);

    const selected = period ? splitPeriod(period) : null;
    const years = useMemo(() => [...(periods ?? [])].sort((a, b) => b.year - a.year), [periods]);
    const viewMonths = years.find(y => y.year === viewYear)?.months ?? [];

    const steps = !selected ? [] : selected.month === null
        ? years.map(y => String(y.year))
        : years.flatMap(y => [...y.months].sort((a, b) => b - a).map(m => monthPeriod(y.year, m)));
    const index = period ? steps.indexOf(period) : -1;
    const previous = index > 0 ? steps[index - 1] : null;
    const next = index >= 0 && index < steps.length - 1 ? steps[index + 1] : null;

    const onOpenChange = (value: boolean) => {
        if (value) setViewYear(selected?.year ?? null);
        setOpen(value);
    };

    const chooseAllTime = () => {
        setViewYear(null);
        setPeriod(null);
    };

    const tabClass = (active: boolean) => cn(
        "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active
            ? "bg-background/80 text-foreground border border-primary/50 shadow-sm"
            : "text-muted-foreground hover:text-foreground",
    );

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
                    <PopoverContent align="start" className="w-[min(26rem,calc(100vw-2rem))] p-3">
                        <div className="flex gap-1 rounded-lg bg-primary/20 p-1" role="tablist">
                            <button
                                type="button"
                                role="tab"
                                aria-selected={viewYear === null}
                                className={tabClass(viewYear === null)}
                                onClick={chooseAllTime}
                            >
                                {t('allTime')}
                            </button>
                            {years.map(y => (
                                <button
                                    key={y.year}
                                    type="button"
                                    role="tab"
                                    aria-selected={viewYear === y.year}
                                    className={tabClass(viewYear === y.year)}
                                    onClick={() => setViewYear(y.year)}
                                >
                                    {y.year}
                                </button>
                            ))}
                            {periods === null && <Skeleton className="flex-1 h-8" />}
                        </div>

                        {viewYear === null ? (
                            <p className="px-1 pt-3 pb-1 text-sm text-muted-foreground">
                                {periods !== null && periods.length === 0 ? t('noPeriods') : t('allTimeDescription')}
                            </p>
                        ) : (
                            <>
                                <div className="grid grid-cols-4 gap-2 pt-3">
                                    {MONTHS.map(month => {
                                        const available = viewMonths.includes(month);
                                        const active = selected?.year === viewYear && selected.month === month;
                                        return (
                                            <button
                                                key={month}
                                                type="button"
                                                disabled={!available}
                                                aria-pressed={active}
                                                onClick={() => setPeriod(monthPeriod(viewYear, month))}
                                                className={cn(
                                                    "rounded-md border px-2 py-2 text-sm font-medium transition-colors",
                                                    active
                                                        ? "border-primary/60 bg-primary/30 text-foreground"
                                                        : "bg-background hover:bg-accent",
                                                    "disabled:pointer-events-none disabled:border-transparent disabled:bg-transparent disabled:text-muted-foreground/40",
                                                )}
                                            >
                                                {formatPeriodMonth(locale, viewYear, month, false)}
                                            </button>
                                        );
                                    })}
                                </div>
                                <div className="mt-3 flex items-center justify-between border-t pt-3">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        aria-pressed={period === String(viewYear)}
                                        className={cn(period === String(viewYear) && "border-primary/60 bg-primary/30 hover:bg-primary/40")}
                                        onClick={() => setPeriod(String(viewYear))}
                                    >
                                        {t('wholeYear', {year: viewYear})}
                                    </Button>
                                    <Button size="sm" onClick={() => setOpen(false)}>
                                        {t('done')}
                                    </Button>
                                </div>
                            </>
                        )}
                    </PopoverContent>
                </Popover>
            </div>
            <p className="text-xs text-muted-foreground">{t('hint')}</p>
        </Card>
    );
}
