'use client';

import { useMemo, useState } from "react";
import dayjs from "lib/dayjs";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "components/ui/button";
import { Skeleton } from "components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "components/ui/tabs";
import GraphSkeleton from "components/graphs/GraphSkeleton";
import { LazyBarChart, LazyLineChart } from "components/graphs/LazyCharts";
import { WEEKDAY_KEYS } from "lib/calendarHeatmap";
import { heatmapTooltip, useChartTheme } from "lib/chartTheme";
import { useHydrated } from "lib/hooks/useHydrated";
import { useResource } from "lib/hooks/useResource";
import useWeekdayLabels from "lib/hooks/useWeekdayLabels";
import { fetchApiUrl, formatNumber, range } from "utils/generalUtils";
import { PlayerOnlineActivity } from "types/players";
import { FocusChip, useFocusFilter, useProfileCommunities } from "./ProfileContext";
import { ENTER, SWAP } from "./profileMotion";
import { ChartFigure, Empty, ProfileCard, ProfileCardHeader, ProfileCardLoading, SURFACE, TAG } from "./ProfileCard";
import { categoryAxis, communitySeries, valueAxis } from "./profileChart";

type Metric = "hour" | "weekday";
type Mode = "user" | "UTC";

const HOURS = range(24);

export function ProfileOnlineActivityLoading() {
    return (
        <ProfileCardLoading className="h-full" titleWidth="w-40" controlSize="h-9 w-56">
            <Skeleton className="h-[400px] w-full" />
        </ProfileCardLoading>
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
    const { communities, communityOf, nameOf, colorOf } = useProfileCommunities();
    const isShown = useFocusFilter();
    const [metric, setMetric] = useState<Metric>("hour");
    const [mode, setMode] = useState<Mode>("user");

    const tz = mode === "user" && hydrated ? dayjs.tz.guess() : "UTC";
    const { data, loading } = useResource<PlayerOnlineActivity>(
        signal => fetchApiUrl(`/players/${userId}/online-activity`, { params: { tz }, signal }),
        [userId, tz],
        // The server seeds UTC; only skip the first fetch if that is what we're showing.
        { seed: initialDataPromise, skipFirst: tz === "UTC", keepData: true, errorLog: 'Failed to fetch online activity:' },
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

    const formatHours = (hours: number) => `${formatNumber(hours, 1, locale)}h`;
    const busiest = weekdayTotals.indexOf(Math.max(...weekdayTotals));
    const peakHour = hourTotals.indexOf(Math.max(...hourTotals));

    const tooltip = { ...heatmapTooltip(theme), mode: 'index' as const, intersect: false };
    const legend = { position: 'bottom' as const, labels: { color: theme.foreground, boxWidth: 12 } };

    const hourData = {
        labels: HOURS.map(hour => String(hour).padStart(2, '0')),
        datasets: keys.map((key, i) => ({
            ...communitySeries(nameOf(key), byHour.get(key).map(seconds => seconds / 3600), colorOf(key), 0.55),
            fill: i === 0 ? 'origin' : '-1',
            tension: 0.4,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
        })),
    };
    const hourOptions = {
        maintainAspectRatio: false,
        interaction: { mode: 'index' as const, intersect: false },
        scales: {
            x: {
                title: { display: true, text: t('hourAxis'), color: theme.muted },
                ticks: { color: theme.muted },
                grid: { display: false },
            },
            y: { ...valueAxis(t('hoursAxis'), theme.muted, theme), ticks: { color: theme.muted, maxTicksLimit: 6 } },
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
            ...communitySeries(nameOf(key), weekdayAverages.get(key), colorOf(key), 0.85),
            borderRadius: 3,
            barPercentage: 0.75,
        })),
    };
    const weekdayOptions = {
        maintainAspectRatio: false,
        indexAxis: 'y' as const,
        scales: {
            x: valueAxis(t('averageAxis'), theme.muted, theme),
            y: categoryAxis(theme),
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
    const subtitle = metric === "hour" ? t('hourSubtitle') : t('weekdaySubtitle');

    return (
        <ProfileCard className={`h-full ${ENTER} delay-200`}>
            <ProfileCardHeader
                title={t('title')}
                className="mb-1"
                actions={<div className="flex flex-wrap gap-2">
                    <div className="flex gap-1 rounded-md border">
                        {([["user", t('myTimezone')], ["UTC", t('utc')]] as const).map(([value, label]) => (
                            <Button key={value} variant={mode === value ? "default" : "ghost"} size="sm" onClick={() => setMode(value)}>
                                {label}
                            </Button>
                        ))}
                    </div>
                    <Tabs value={metric} onValueChange={value => setMetric(value as Metric)}>
                        <TabsList className="h-9">
                            <TabsTrigger value="hour" className="text-xs px-3">{t('byHour')}</TabsTrigger>
                            <TabsTrigger value="weekday" className="text-xs px-3">{t('byWeekday')}</TabsTrigger>
                        </TabsList>
                    </Tabs>
                </div>}
            >
                <FocusChip />
            </ProfileCardHeader>
            <p className={`mb-4 text-sm text-muted-foreground ${TAG}`}>{subtitle}</p>

            {loading && !data ? (
                <GraphSkeleton height={380} />
            ) : !hasData ? (
                <Empty className="h-[380px]">{t('noData')}</Empty>
            ) : (
                <>
                    <ChartFigure
                        key={metric}
                        id="profile-activity-summary"
                        summary={summary}
                        label={subtitle}
                        className={`h-[380px] ${SURFACE}`}
                    >
                        {/* Fades and dims the chart alone: the figure's surface loses its blur while it is translucent. */}
                        <div className={`size-full transition-opacity ${SWAP} ${loading ? "opacity-60" : ""}`}>
                            {metric === "hour"
                                // @ts-ignore
                                ? <LazyLineChart data={hourData} options={hourOptions} />
                                // @ts-ignore
                                : <LazyBarChart data={weekdayData} options={weekdayOptions} />}
                        </div>
                    </ChartFigure>
                    {metric === "weekday" && (
                        <p className={`mt-3 text-sm text-muted-foreground ${TAG}`}>
                            <span className={`block ${SWAP}`}>
                                {t.rich('busiest', {
                                    day: dayNames[WEEKDAY_KEYS[busiest]],
                                    b: chunks => <span className="font-semibold text-foreground">{chunks}</span>,
                                })}
                            </span>
                        </p>
                    )}
                </>
            )}
        </ProfileCard>
    );
}
