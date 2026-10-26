'use client';

import { ReactNode, use, useCallback, useEffect, useMemo, useState } from "react";
import dayjs from "lib/dayjs";
import { useLocale, useTranslations } from "next-intl";
import { Skeleton } from "components/ui/skeleton";
import { ScrollArea, ScrollBar } from "components/ui/scroll-area";
import { LazyBarChart } from "components/graphs/LazyCharts";
import MapDailyHeatmap, { HeatDay } from "components/maps/MapDailyHeatmap";
import { LabeledSelect } from "components/players/PlayerDetailHourBar";
import { heatmapTooltip, useChartTheme } from "lib/chartTheme";
import { formatHours, formatNumber, range } from "utils/generalUtils";
import { formatSeconds } from "utils/sessionUtils";
import { GlobalPlayerSessionTime } from "types/community";
import { PlayerSessionStats } from "types/players";
import { FocusChip, useFocusFilter, useProfileCommunities } from "./ProfileContext";
import { ENTER, SWAP } from "./profileMotion";
import { ChartFigure, Empty, ProfileCard, ProfileCardHeader, ProfileCardLoading } from "./ProfileCard";
import { categoryAxis, communitySeries, valueAxis } from "./profileChart";

type GroupBy = "daily" | "monthly" | "yearly";

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

export function ProfilePlaytimeHistoryLoading() {
    return (
        <ProfileCardLoading className="h-full" contentClassName="p-6" titleWidth="w-72" controlSize="h-9 w-64">
            <Skeleton className="h-[150px] w-full" />
            <Skeleton className="mt-6 h-[84px] w-full" />
        </ProfileCardLoading>
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
    const { communities, nameOf, colorOf } = useProfileCommunities();
    const isShown = useFocusFilter();
    const [groupBy, setGroupBy] = useState<GroupBy>("daily");

    const availableYears = useMemo(() =>
        [...new Set(rawData.map(d => dayjs.utc(d.bucket_time).year()))].sort((a, b) => b - a), [rawData]);
    const [selectedYear, setSelectedYear] = useState<number>(() => availableYears[0] ?? dayjs.utc().year());
    useEffect(() => {
        if (availableYears.length > 0 && !availableYears.includes(selectedYear)) {
            setSelectedYear(availableYears[0]);
        }
    }, [availableYears, selectedYear]);

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
            const series = byDay.get(iso) ?? new Map<string, number>();
            days.push({ date: iso, series: [...series].map(([key, seconds]) => ({ key, label: nameOf(key), seconds })) });
        }
        return days;
    }, [byDay, selectedYear, nameOf]);

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
        const buckets = groupBy === "monthly" ? range(12) : [...availableYears].sort((a, b) => a - b);
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
            datasets: keys.map(key => communitySeries(nameOf(key), totals.get(key), colorOf(key))),
        };
    }, [groupBy, availableYears, byDay, selectedYear, order, nameOf, colorOf]);

    const barOptions = useMemo(() => ({
        maintainAspectRatio: false,
        scales: { x: categoryAxis(theme), y: valueAxis(tHeat('hoursPlayed'), theme.foreground, theme) },
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
    const day = (iso: string) => dayjs.utc(iso).format('MMM D');
    const streakRange = streak && (streak.days === 1 ? day(streak.from) : `${day(streak.from)} – ${day(streak.to)}`);
    const tiles: [string, ReactNode, ReactNode][] = [
        [t('sessions'), stats ? formatNumber(stats.total_sessions, 0, locale) : '—', t('allTime')],
        [
            t('avgSession'),
            stats?.average_duration != null ? formatSeconds(stats.average_duration) : '—',
            stats?.longest_duration != null && t('longest', { duration: formatSeconds(stats.longest_duration) }),
        ],
        [t('bestStreak'), streak ? t('days', { count: streak.days }) : '—', streakRange || t('inYear', { year: selectedYear })],
        [t('activeDays'), formatNumber(activeDays.length, 0, locale), t('inYear', { year: selectedYear })],
    ];

    return (
        <ProfileCard className={`h-full ${ENTER} delay-75`}>
            <ProfileCardHeader
                title={tBar('title', { hours: formatNumber(shownSeconds / 3600, 2, locale) })}
                badge={groupBy !== "yearly" && selectedYear}
                actions={<div className="flex flex-wrap gap-2">
                    <LabeledSelect label={tBar('groupBy')} value={groupBy}
                        onValueChange={value => setGroupBy(value as GroupBy)} options={groupOptions} />
                    {groupBy !== "yearly" && availableYears.length > 0 && (
                        <LabeledSelect label={tBar('year')} value={selectedYear.toString()}
                            onValueChange={value => setSelectedYear(parseInt(value))}
                            options={availableYears.map(year => [year.toString(), year])} />
                    )}
                </div>}
            >
                <FocusChip />
            </ProfileCardHeader>

            {rawData.length === 0 ? (
                <Empty className="h-[150px]">{tHeat('noDataShort')}</Empty>
            ) : groupBy === "daily" ? (
                <ScrollArea key={`daily-${selectedYear}`} className={SWAP}>
                    <ChartFigure
                        id="profile-history-summary"
                        summary={summary}
                        label={t('ariaLabel', { year: selectedYear })}
                        className="flex justify-center items-center"
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
                    </ChartFigure>
                    <ScrollBar orientation="horizontal" />
                </ScrollArea>
            ) : (
                <div key={`${groupBy}-${selectedYear}`} className={`h-[220px] ${SWAP}`} role="img" aria-label={tHeat('yearlyAriaLabel')}>
                    {/* @ts-ignore */}
                    <LazyBarChart data={barData} options={barOptions} />
                </div>
            )}

            <dl key={selectedYear} className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border/60 bg-border/60 md:grid-cols-4">
                {tiles.map(([label, value, detail]) => (
                    <div key={label} className="min-w-0 bg-card px-4 py-3">
                        <dt className="truncate text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</dt>
                        <dd className="mt-1 truncate text-2xl font-bold tabular-nums">{value}</dd>
                        {detail && <dd className="mt-0.5 truncate text-xs text-muted-foreground">{detail}</dd>}
                    </div>
                ))}
            </dl>
        </ProfileCard>
    );
}
