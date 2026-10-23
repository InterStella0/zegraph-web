'use client';

import { use, useMemo, useState } from "react";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { useLocale, useTranslations } from "next-intl";
import {
    BarController,
    BarElement,
    CategoryScale,
    Chart as ChartJS,
    Filler,
    Legend,
    LinearScale,
    LineController,
    LineElement,
    PointElement,
    Tooltip,
} from "chart.js";
import { color } from "chart.js/helpers";
import { Card, CardContent } from "components/ui/card";
import { Button } from "components/ui/button";
import { Skeleton } from "components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "components/ui/tabs";
import { ScreenReaderOnly } from "components/ui/ScreenReaderOnly";
import GraphSkeleton from "components/graphs/GraphSkeleton";
import { LazyBarChart, LazyLineChart } from "components/graphs/LazyCharts";
import { WEEKDAY_KEYS } from "lib/calendarHeatmap";
import { heatmapTooltip, useChartTheme } from "lib/chartTheme";
import { useHydrated } from "lib/hooks/useHydrated";
import { useResource } from "lib/hooks/useResource";
import useWeekdayLabels from "lib/hooks/useWeekdayLabels";
import { fetchApiUrl, formatNumber } from "utils/generalUtils";
import { PlayerOnlineActivity } from "types/players";
import { FocusChip, useFocusFilter, useProfileCommunities } from "./ProfileContext";
import { ENTER, SWAP } from "./profileMotion";

dayjs.extend(utc);
dayjs.extend(timezone);
ChartJS.register(
    BarController, BarElement, LineController, LineElement, PointElement, Filler,
    CategoryScale, LinearScale, Tooltip, Legend,
);

type Metric = "hour" | "weekday";
type Mode = "user" | "UTC";

const CARD = "h-full border-border/40 bg-card/50 backdrop-blur-xl";
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

export function ProfileOnlineActivityLoading() {
    return (
        <Card className={CARD}>
            <CardContent className="p-4 sm:p-6">
                <div className="mb-4 flex items-center justify-between gap-2">
                    <Skeleton className="h-7 w-40" />
                    <Skeleton className="h-9 w-56" />
                </div>
                <Skeleton className="h-[400px] w-full" />
            </CardContent>
        </Card>
    );
}

export default function ProfileOnlineActivity({ userId, initialDataPromise }: {
    userId: string,
    initialDataPromise: Promise<PlayerOnlineActivity | null>,
}) {
    const t = useTranslations('players.profile.activity');
    const locale = useLocale();
    const theme = useChartTheme();
    const dayNames = useWeekdayLabels();
    const hydrated = useHydrated();
    const initialData = use(initialDataPromise);
    const { communities, communityOf, colorOf } = useProfileCommunities();
    const isShown = useFocusFilter();
    const [metric, setMetric] = useState<Metric>("hour");
    const [mode, setMode] = useState<Mode>("user");

    const tz = mode === "user" && hydrated ? dayjs.tz.guess() : "UTC";
    const { data, loading } = useResource<PlayerOnlineActivity>(
        signal => fetchApiUrl(`/players/${userId}/online-activity`, { params: { tz }, signal }),
        [userId, tz],
        // The server seeds UTC; only skip the first fetch if that is what we're showing.
        { initial: initialData ?? undefined, skipFirst: tz === "UTC", keepData: true, errorLog: 'Failed to fetch online activity:' },
    );

    const keys = useMemo(() => {
        const present = new Set((data?.buckets ?? []).map(bucket => bucket.community_id));
        return [
            ...communities.map(community => community.id).filter(id => present.has(id)),
            ...[...present].filter(id => !communityOf(id)),
        ].filter(isShown);
    }, [data, communities, communityOf, isShown]);

    const { byHour, byWeekday } = useMemo(() => {
        const byHour = new Map<string, number[]>();
        const byWeekday = new Map<string, number[]>();
        for (const bucket of data?.buckets ?? []) {
            if (!byHour.has(bucket.community_id)) {
                byHour.set(bucket.community_id, Array(24).fill(0));
                byWeekday.set(bucket.community_id, Array(7).fill(0));
            }
            byHour.get(bucket.community_id)[bucket.hour] += bucket.seconds;
            byWeekday.get(bucket.community_id)[bucket.weekday - 1] += bucket.seconds;
        }
        return { byHour, byWeekday };
    }, [data]);

    const activeDays = useMemo(() => {
        const days = Array(7).fill(0);
        for (const entry of data?.active_days ?? []) days[entry.weekday - 1] = entry.days;
        return days;
    }, [data]);

    const weekdayAverages = useMemo(() => new Map(keys.map(key => [
        key,
        byWeekday.get(key).map((seconds, i) => activeDays[i] > 0 ? seconds / 3600 / activeDays[i] : 0),
    ])), [keys, byWeekday, activeDays]);
    const weekdayTotals = WEEKDAY_KEYS.map((_, i) => keys.reduce((sum, key) => sum + weekdayAverages.get(key)[i], 0));
    const hourTotals = HOURS.map(hour => keys.reduce((sum, key) => sum + byHour.get(key)[hour] / 3600, 0));
    const hasData = keys.length > 0 && hourTotals.some(hours => hours > 0);

    const labelOf = (key: string) => communityOf(key)?.name ?? key;
    const formatHours = (hours: number) => `${formatNumber(hours, 1, locale)}h`;
    const busiest = weekdayTotals.indexOf(Math.max(...weekdayTotals));
    const peakHour = hourTotals.indexOf(Math.max(...hourTotals));

    const tooltip = {
        ...heatmapTooltip(theme),
        mode: 'index' as const,
        intersect: false,
    };
    const legend = { position: 'bottom' as const, labels: { color: theme.foreground, boxWidth: 12 } };

    const hourData = {
        labels: HOURS.map(hour => String(hour).padStart(2, '0')),
        datasets: keys.map((key, i) => ({
            label: labelOf(key),
            data: byHour.get(key).map(seconds => seconds / 3600),
            borderColor: colorOf(key),
            backgroundColor: color(colorOf(key)).alpha(0.55).rgbString(),
            fill: i === 0 ? 'origin' : '-1',
            tension: 0.4,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
        })),
    };
    const hourOptions = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index' as const, intersect: false },
        scales: {
            x: {
                title: { display: true, text: t('hourAxis'), color: theme.muted },
                ticks: { color: theme.muted },
                grid: { display: false },
            },
            y: {
                stacked: true,
                beginAtZero: true,
                title: { display: true, text: t('hoursAxis'), color: theme.muted },
                ticks: { color: theme.muted, maxTicksLimit: 6 },
                grid: { color: theme.faintGrid },
            },
        },
        plugins: {
            legend,
            tooltip: {
                ...tooltip,
                callbacks: {
                    title: (items: any[]) => `${items[0]?.label ?? ''}:00`,
                    label: (context: any) => `${context.dataset.label}: ${formatHours(context.parsed.y)}`,
                },
            },
        },
    };

    const weekdayData = {
        labels: WEEKDAY_KEYS.map(key => dayNames[key] ?? key),
        datasets: keys.map(key => ({
            label: labelOf(key),
            data: weekdayAverages.get(key),
            backgroundColor: color(colorOf(key)).alpha(0.85).rgbString(),
            borderColor: colorOf(key),
            borderWidth: 1,
            borderRadius: 3,
            barPercentage: 0.75,
        })),
    };
    const weekdayOptions = {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y' as const,
        scales: {
            x: {
                stacked: true,
                beginAtZero: true,
                title: { display: true, text: t('averageAxis'), color: theme.muted },
                ticks: { color: theme.muted },
                grid: { color: theme.faintGrid },
            },
            y: {
                stacked: true,
                ticks: { color: theme.foreground },
                grid: { display: false },
            },
            totals: {
                type: 'category' as const,
                position: 'right' as const,
                labels: weekdayTotals.map(formatHours),
                offset: true,
                ticks: { color: theme.foreground, font: { weight: 'bold' as const } },
                grid: { display: false },
                border: { display: false },
            },
        },
        plugins: {
            legend,
            tooltip: {
                ...tooltip,
                callbacks: {
                    label: (context: any) => `${context.dataset.label}: ${formatHours(context.parsed.x)}`,
                },
            },
        },
    };

    const summary = !hasData
        ? t('noData')
        : metric === "hour"
            ? t('hourSummary', { hour: String(peakHour).padStart(2, '0'), hours: formatHours(hourTotals[peakHour]) })
            : t('weekdaySummary', { day: dayNames[WEEKDAY_KEYS[busiest]], hours: formatHours(weekdayTotals[busiest]) });

    return (
        <Card className={`${CARD} ${ENTER} delay-200`}>
            <CardContent className="p-4 sm:p-6">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xl font-semibold">{t('title')}</h2>
                        <FocusChip />
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <div className="flex gap-1 rounded-md border">
                            <Button variant={mode === "user" ? "default" : "ghost"} size="sm" onClick={() => setMode("user")}>
                                {t('myTimezone')}
                            </Button>
                            <Button variant={mode === "UTC" ? "default" : "ghost"} size="sm" onClick={() => setMode("UTC")}>
                                {t('utc')}
                            </Button>
                        </div>
                        <Tabs value={metric} onValueChange={value => setMetric(value as Metric)}>
                            <TabsList className="h-9">
                                <TabsTrigger value="hour" className="text-xs px-3">{t('byHour')}</TabsTrigger>
                                <TabsTrigger value="weekday" className="text-xs px-3">{t('byWeekday')}</TabsTrigger>
                            </TabsList>
                        </Tabs>
                    </div>
                </div>
                <p className="mb-4 text-sm text-muted-foreground">
                    {metric === "hour" ? t('hourSubtitle') : t('weekdaySubtitle')}
                </p>

                {loading && !data ? (
                    <GraphSkeleton height={380} />
                ) : !hasData ? (
                    <div className="flex h-[380px] items-center justify-center text-muted-foreground">{t('noData')}</div>
                ) : (
                    <>
                        <ScreenReaderOnly id="profile-activity-summary">{summary}</ScreenReaderOnly>
                        <div
                            key={metric}
                            className={`h-[380px] transition-opacity ${SWAP} ${loading ? "opacity-60" : ""}`}
                            role="img"
                            aria-label={metric === "hour" ? t('hourSubtitle') : t('weekdaySubtitle')}
                            aria-describedby="profile-activity-summary"
                        >
                            {metric === "hour"
                                // @ts-ignore
                                ? <LazyLineChart data={hourData} options={hourOptions} />
                                // @ts-ignore
                                : <LazyBarChart data={weekdayData} options={weekdayOptions} />}
                        </div>
                        {metric === "weekday" && (
                            <p className={`mt-3 text-sm text-muted-foreground ${SWAP}`}>
                                {t.rich('busiest', {
                                    day: dayNames[WEEKDAY_KEYS[busiest]],
                                    b: chunks => <span className="font-semibold text-foreground">{chunks}</span>,
                                })}
                            </p>
                        )}
                    </>
                )}
            </CardContent>
        </Card>
    );
}
