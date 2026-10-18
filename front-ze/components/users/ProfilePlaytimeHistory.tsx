'use client';

import { ReactNode, use, useCallback, useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { useLocale, useTranslations } from "next-intl";
import { BarController, BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Tooltip } from "chart.js";
import { color } from "chart.js/helpers";
import { Card, CardContent } from "components/ui/card";
import { Badge } from "components/ui/badge";
import { Skeleton } from "components/ui/skeleton";
import { ScrollArea, ScrollBar } from "components/ui/scroll-area";
import { ScreenReaderOnly } from "components/ui/ScreenReaderOnly";
import { LazyBarChart } from "components/graphs/LazyCharts";
import MapDailyHeatmap, { HeatDay } from "components/maps/MapDailyHeatmap";
import { LabeledSelect } from "components/players/PlayerDetailHourBar";
import { heatmapTooltip, useChartTheme } from "lib/chartTheme";
import { formatHours, formatNumber } from "utils/generalUtils";
import { formatSeconds } from "utils/sessionUtils";
import { GlobalPlayerSessionTime } from "types/community";
import { PlayerSessionStats } from "types/players";
import { FocusChip, useFocusFilter, useProfileCommunities } from "./ProfileContext";
import { ENTER, SWAP } from "./profileMotion";

dayjs.extend(utc);
ChartJS.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

type GroupBy = "daily" | "monthly" | "yearly";

const CARD = "h-full border-border/40 bg-card/50 backdrop-blur-xl";

function quantile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    return values[Math.min(values.length - 1, Math.floor(p * values.length))];
}

type Streak = { days: number, from: string, to: string };

function bestStreak(activeDays: string[]): Streak | null {
    let best: Streak | null = null;
    let current: Streak | null = null;
    for (const day of [...activeDays].sort()) {
        if (current && dayjs.utc(day).diff(dayjs.utc(current.to), 'day') === 1) {
            current = { ...current, days: current.days + 1, to: day };
        } else {
            current = { days: 1, from: day, to: day };
        }
        if (!best || current.days > best.days) best = current;
    }
    return best;
}

function StatTile({ label, value, detail }: { label: string, value: ReactNode, detail?: ReactNode }) {
    return (
        <div className="min-w-0 bg-card px-4 py-3">
            <dt className="truncate text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</dt>
            <dd className="mt-1 truncate text-2xl font-bold tabular-nums">{value}</dd>
            {detail && <dd className="mt-0.5 truncate text-xs text-muted-foreground">{detail}</dd>}
        </div>
    );
}

export function ProfilePlaytimeHistoryLoading() {
    return (
        <Card className={CARD}>
            <CardContent className="p-6">
                <div className="flex items-center justify-between gap-2 mb-4">
                    <Skeleton className="h-7 w-72" />
                    <Skeleton className="h-9 w-64" />
                </div>
                <Skeleton className="h-[150px] w-full" />
                <Skeleton className="mt-6 h-[84px] w-full" />
            </CardContent>
        </Card>
    );
}

export default function ProfilePlaytimeHistory({ heatmapPromise, statsPromise }: {
    heatmapPromise: Promise<GlobalPlayerSessionTime[]>,
    statsPromise: Promise<PlayerSessionStats | null>,
}) {
    const t = useTranslations('players.profile.history');
    const tBar = useTranslations('players.hourBar');
    const tHeat = useTranslations('players.heatmap');
    const locale = useLocale();
    const theme = useChartTheme();
    const rawData = use(heatmapPromise);
    const stats = use(statsPromise);
    const { communities, communityOf, colorOf } = useProfileCommunities();
    const isShown = useFocusFilter();
    const [groupBy, setGroupBy] = useState<GroupBy>("daily");

    const availableYears = useMemo(() => {
        const years = [...new Set(rawData.map(d => dayjs.utc(d.bucket_time).year()))];
        return years.sort((a, b) => b - a);
    }, [rawData]);
    const [selectedYear, setSelectedYear] = useState<number>(() => availableYears[0] ?? dayjs.utc().year());
    useEffect(() => {
        if (availableYears.length > 0 && !availableYears.includes(selectedYear)) {
            setSelectedYear(availableYears[0]);
        }
    }, [availableYears, selectedYear]);

    const labelOf = useCallback((id: string) => communityOf(id)?.name ?? id, [communityOf]);
    const order = useMemo(() => communities.map(community => community.id), [communities]);

    const byDay = useMemo(() => {
        const days = new Map<string, Map<string, number>>();
        for (const bucket of rawData) {
            const series = new Map<string, number>();
            for (const community of bucket.communities) {
                if (isShown(community.community_id) && community.hours > 0) {
                    series.set(community.community_id, community.hours * 3600);
                }
            }
            if (series.size > 0) days.set(dayjs.utc(bucket.bucket_time).format('YYYY-MM-DD'), series);
        }
        return days;
    }, [rawData, isShown]);

    const yearDays = useMemo<HeatDay[]>(() => {
        const days: HeatDay[] = [];
        const end = dayjs.utc(`${selectedYear}-12-31`);
        for (let day = dayjs.utc(`${selectedYear}-01-01`); !day.isAfter(end); day = day.add(1, 'day')) {
            const iso = day.format('YYYY-MM-DD');
            const series = byDay.get(iso);
            days.push({
                date: iso,
                series: series
                    ? [...series.entries()].map(([key, seconds]) => ({ key, label: labelOf(key), seconds }))
                    : [],
            });
        }
        return days;
    }, [byDay, selectedYear, labelOf]);

    const activeDays = useMemo(() => yearDays.filter(day => day.series.length > 0), [yearDays]);
    const dayTotals = useMemo(() => activeDays.map(day => day.series.reduce((a, s) => a + s.seconds, 0)), [activeDays]);
    const yearSeconds = dayTotals.reduce((a, b) => a + b, 0);
    const allSeconds = useMemo(() => [...byDay.values()]
        .reduce((sum, series) => sum + [...series.values()].reduce((a, b) => a + b, 0), 0), [byDay]);
    const streak = useMemo(() => bestStreak(activeDays.map(day => day.date)), [activeDays]);

    const scaleHours = useMemo(() => Math.max(quantile([...dayTotals].sort((a, b) => a - b).map(s => s / 3600), 0.95), 0.5), [dayTotals]);
    const cellAlpha = useCallback((hours: number, hasData: boolean): [number, number] => {
        const ratio = hours / scaleHours;
        return [hasData ? Math.min(1, Math.max(0.15, ratio)) : .04, Math.min(1, 0.25 + 0.75 * ratio)];
    }, [scaleHours]);
    const formatValue = useCallback((seconds: number) => formatHours(seconds, locale), [locale]);

    const barData = useMemo(() => {
        const buckets = groupBy === "monthly"
            ? Array.from({ length: 12 }, (_, month) => month)
            : [...availableYears].sort((a, b) => a - b);
        const totals = new Map<string, number[]>();
        for (const [iso, series] of byDay) {
            const date = dayjs.utc(iso);
            if (groupBy === "monthly" && date.year() !== selectedYear) continue;
            const index = buckets.indexOf(groupBy === "monthly" ? date.month() : date.year());
            if (index < 0) continue;
            for (const [key, seconds] of series) {
                if (!totals.has(key)) totals.set(key, Array(buckets.length).fill(0));
                totals.get(key)[index] += seconds / 3600;
            }
        }
        const keys = [...order.filter(key => totals.has(key)), ...[...totals.keys()].filter(key => !order.includes(key))];
        return {
            labels: buckets.map(bucket => groupBy === "monthly" ? dayjs().month(bucket).format('MMM') : String(bucket)),
            datasets: keys.map(key => ({
                label: labelOf(key),
                data: totals.get(key),
                backgroundColor: color(colorOf(key)).alpha(0.8).rgbString(),
                borderColor: colorOf(key),
                borderWidth: 1,
            })),
        };
    }, [groupBy, availableYears, byDay, selectedYear, order, labelOf, colorOf]);

    const barOptions = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: { stacked: true, ticks: { color: theme.foreground }, grid: { display: false } },
            y: {
                stacked: true,
                beginAtZero: true,
                title: { display: true, text: tHeat('hoursPlayed'), color: theme.foreground },
                ticks: { color: theme.foreground },
                grid: { color: theme.faintGrid },
            },
        },
        plugins: {
            legend: { position: 'bottom' as const, labels: { color: theme.foreground } },
            tooltip: {
                ...heatmapTooltip(theme),
                callbacks: {
                    label: (context: any) => `${context.dataset.label}: ${formatValue(context.parsed.y * 3600)}`,
                },
            },
        },
    }), [theme, tHeat, formatValue]);

    const shownSeconds = groupBy === "yearly" ? allSeconds : yearSeconds;
    const summary = activeDays.length === 0
        ? tHeat('noData')
        : tHeat('matrixSummary', {
            total: formatNumber(yearSeconds / 3600, 2, locale),
            days: activeDays.length,
            peak: formatNumber(Math.max(...dayTotals) / 3600, 2, locale),
        });

    const groupOptions: [string, ReactNode][] = (["daily", "monthly", "yearly"] as const).map(key => [key, tBar(key)]);

    return (
        <Card className={`${CARD} ${ENTER} delay-75`}>
            <CardContent className="p-4 sm:p-6">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xl font-semibold">
                            {tBar('title', { hours: formatNumber(shownSeconds / 3600, 2, locale) })}
                        </h2>
                        {groupBy !== "yearly" && <Badge variant="secondary" className="text-xs">{selectedYear}</Badge>}
                        <FocusChip />
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <LabeledSelect label={tBar('groupBy')} value={groupBy}
                            onValueChange={value => setGroupBy(value as GroupBy)} options={groupOptions} />
                        {groupBy !== "yearly" && availableYears.length > 0 && (
                            <LabeledSelect label={tBar('year')} value={selectedYear.toString()}
                                onValueChange={value => setSelectedYear(parseInt(value))}
                                options={availableYears.map(year => [year.toString(), year])} />
                        )}
                    </div>
                </div>

                {rawData.length === 0 ? (
                    <div className="flex h-[150px] items-center justify-center text-muted-foreground">
                        {tHeat('noDataShort')}
                    </div>
                ) : groupBy === "daily" ? (
                    <ScrollArea key={`daily-${selectedYear}`} className={SWAP}>
                        <ScreenReaderOnly id="profile-history-summary">{summary}</ScreenReaderOnly>
                        <div
                            className="flex justify-center items-center"
                            role="img"
                            aria-label={t('ariaLabel', { year: selectedYear })}
                            aria-describedby="profile-history-summary"
                        >
                            <MapDailyHeatmap
                                days={yearDays}
                                loading={false}
                                colorOf={colorOf}
                                order={order}
                                cellAlpha={cellAlpha}
                                yTitle={tHeat('hoursPlayed')}
                                formatValue={formatValue}
                            />
                        </div>
                        <ScrollBar orientation="horizontal" />
                    </ScrollArea>
                ) : (
                    <div key={`${groupBy}-${selectedYear}`} className={`h-[220px] ${SWAP}`} role="img" aria-label={tHeat('yearlyAriaLabel')}>
                        {/* @ts-ignore */}
                        <LazyBarChart data={barData} options={barOptions} />
                    </div>
                )}

                <dl key={selectedYear} className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border/60 bg-border/60 md:grid-cols-4">
                    <StatTile
                        label={t('sessions')}
                        value={stats ? formatNumber(stats.total_sessions, 0, locale) : '—'}
                        detail={t('allTime')}
                    />
                    <StatTile
                        label={t('avgSession')}
                        value={stats?.average_duration != null ? formatSeconds(stats.average_duration) : '—'}
                        detail={stats?.longest_duration != null
                            ? t('longest', { duration: formatSeconds(stats.longest_duration) })
                            : undefined}
                    />
                    <StatTile
                        label={t('bestStreak')}
                        value={streak ? t('days', { count: streak.days }) : '—'}
                        detail={streak
                            ? streak.days === 1
                                ? dayjs.utc(streak.from).format('MMM D')
                                : `${dayjs.utc(streak.from).format('MMM D')} – ${dayjs.utc(streak.to).format('MMM D')}`
                            : t('inYear', { year: selectedYear })}
                    />
                    <StatTile
                        label={t('activeDays')}
                        value={formatNumber(activeDays.length, 0, locale)}
                        detail={t('inYear', { year: selectedYear })}
                    />
                </dl>
            </CardContent>
        </Card>
    );
}
