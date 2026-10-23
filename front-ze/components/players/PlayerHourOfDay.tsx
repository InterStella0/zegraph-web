'use client'
import {useTranslations} from 'next-intl';
import ErrorCatch from "../ui/ErrorMessage.tsx";
import {useMemo, useState} from "react";
import {formatNumber} from "utils/generalUtils.ts";
import GraphSkeleton from "../graphs/GraphSkeleton.tsx";
import {LazyBarChart as Bar, LazyLineChart as Line} from "components/graphs/LazyCharts";
import { Card } from "components/ui/card";
import { Button } from "components/ui/button";
import dayjs from "lib/dayjs";
import {useHydrated} from "lib/hooks/useHydrated";
import { AlertCircle } from "lucide-react";
import {PlayerHourDay, PlayerOnlineHeatmap} from "types/players.ts";
import {ChartTheme, useChartTheme} from "lib/chartTheme";
import { ScreenReaderOnly } from "components/ui/ScreenReaderOnly";
import {PeriodTitle, ServerPlayerProps, useServerPlayerStat} from "./common";

type Metric = 'hour' | 'joins'
type Mode = 'user' | 'UTC'

const heatColor = (alpha: number) => `hsla(300 85% 62% / ${alpha})`

const EVENT_SERIES = [
    { type: 'Join', label: 'joinCount', color: 'success', fill: { dark: 'hsla(142.1 76.2% 36.3% / 0.3)', light: 'hsla(142.1 70.6% 45.3% / 0.2)' } },
    { type: 'Leave', label: 'leaveCount', color: 'destructive', fill: { dark: 'hsla(0 84.2% 60.2% / 0.3)', light: 'hsla(0 72.2% 50.6% / 0.2)' } },
] as const

const axisTitle = (theme: ChartTheme, text: string) => ({ display: true, text, color: theme.muted })
const tooltipStyle = (theme: ChartTheme) => ({ position: 'nearest' as const, ...theme.tooltip })

const sumCounts = (rows: PlayerHourDay[]) => rows.reduce((sum, h) => sum + h.count, 0)
const peakHour = (rows: PlayerHourDay[]) => rows.reduce((max, h) => h.count > max.count ? h : max, rows[0])

function ToggleButtons<T extends string>({ value, onChange, options }: {
    value: T, onChange: (value: NoInfer<T>) => void, options: [NoInfer<T>, string][],
}) {
    return (
        <div className="flex gap-1 rounded-md border">
            {options.map(([option, label]) => (
                <Button key={option} variant={value === option ? "default" : "ghost"} onClick={() => onChange(option)} size="sm">
                    {label}
                </Button>
            ))}
        </div>
    )
}

function PlayerHourOfDayDisplay({ serverPlayerPromise }: ServerPlayerProps){
    const t = useTranslations('players.hourOfDay');
    const theme = useChartTheme();
    const { data: hoursData, loading, error } = useServerPlayerStat<PlayerHourDay[]>(serverPlayerPromise, 'hours_of_day')
    const { data: heatData, loading: heatLoading, error: heatError } =
        useServerPlayerStat<PlayerOnlineHeatmap[]>(serverPlayerPromise, 'online_heatmap')
    const [ mode, setMode ] = useState<Mode>("user")
    const hydrated = useHydrated()
    const [ metric, setMetric ] = useState<Metric>("hour")
    // The chart components update the canvas whenever data/options change identity, so they stay memoised.
    const events = useMemo(() => ({
        Join: (hoursData ?? []).filter(e => e.event_type === "Join"),
        Leave: (hoursData ?? []).filter(e => e.event_type === "Leave"),
    }), [hoursData])

    // Local offsets are only applied after hydration so the server and first client render agree.
    const online = useMemo(() => {
        const byUtcHour = new Map((heatData ?? []).map(e => [e.hour_of_day, e]))
        const offsetHours = mode === "UTC" || !hydrated ? 0 : Math.round(dayjs().utcOffset() / 60)
        return Array.from({length: 24}, (_, displayHour) => {
            const found = byUtcHour.get(((displayHour - offsetHours) % 24 + 24) % 24)
            return {
                hour: displayHour,
                hours_online: found?.hours_online ?? 0,
                online_count: found?.online_count ?? 0,
            }
        })
    }, [heatData, mode, hydrated])
    const heatMax = online.reduce((a, b) => Math.max(a, b.hours_online), 0)

    const options = useMemo(() => ({
        maintainAspectRatio: false,
        interaction: { mode: 'x' as const, intersect: false },
        scales: {
            x: { title: axisTitle(theme, t('hourOfDayAxis')), ticks: { color: theme.muted }, grid: { color: theme.border } },
            y: {
                min: 0,
                max: (hoursData ?? []).reduce((a, b) => Math.max(a, b.count), 0),
                ticks: { color: theme.muted },
                grid: { color: theme.border },
            }
        },
        plugins: {
            tooltip: tooltipStyle(theme),
            legend: { labels: { color: theme.foreground } },
        }
    }), [hoursData, theme, t])

    const onlineOptions = useMemo(() => ({
        maintainAspectRatio: false,
        interaction: { mode: 'index' as const, intersect: false },
        scales: {
            x: { title: axisTitle(theme, t('hourOfDayAxis')), ticks: { color: theme.muted }, grid: { display: false } },
            y: {
                beginAtZero: true,
                title: axisTitle(theme, t('hoursOnlineAxis')),
                ticks: { color: theme.muted, maxTicksLimit: 6 },
                grid: { color: theme.border },
            }
        },
        plugins: {
            legend: { display: false },
            tooltip: {
                ...tooltipStyle(theme),
                callbacks: {
                    title: (items: { label?: string }[]) => `${items[0]?.label ?? ''}:00`,
                    label: (item: { dataIndex: number, parsed: { y: number } }) =>
                        t('hoursOnlineTooltip', {
                            hours: item.parsed.y.toFixed(1),
                            sessions: formatNumber(online[item.dataIndex]?.online_count ?? 0),
                        }),
                }
            }
        }
    }), [online, theme, t])

    const onlineData = useMemo(() => ({
        labels: online.map(e => String(e.hour).padStart(2, '0')),
        datasets: [{
            label: t('hoursOnlineAxis'),
            data: online.map(e => e.hours_online),
            borderColor: heatColor(1),
            backgroundColor: (ctx: { chart: { ctx: CanvasRenderingContext2D, chartArea?: { top: number, bottom: number } } }) => {
                const { chartArea, ctx: canvas } = ctx.chart
                if (!chartArea) return heatColor(0.2)

                const gradient = canvas.createLinearGradient(0, chartArea.top, 0, chartArea.bottom)
                gradient.addColorStop(0, heatColor(theme.isDark ? 0.55 : 0.4))
                gradient.addColorStop(1, heatColor(0))
                return gradient
            },
            fill: 'origin' as const,
            tension: 0.4,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            pointHoverBackgroundColor: heatColor(1),
        }]
    }), [online, theme.isDark, t])

    const data = useMemo(() => {
        const timeZone = dayjs.tz.guess();
        const toDisplayHour = (utcHour: number) =>
            mode === "UTC" ? utcHour : dayjs.utc().startOf('day').add(utcHour, 'hour').tz(timeZone).hour()
        return {
            labels: Array.from({ length: 24 }, (_, i) => i),
            datasets: EVENT_SERIES.map(series => ({
                label: t(series.label),
                data: events[series.type].map(e => ({ y: e.count, x: toDisplayHour(e.hour) })),
                borderColor: theme[series.color],
                backgroundColor: theme.isDark ? series.fill.dark : series.fill.light,
                borderWidth: 2,
                pointRadius: 0
            }))
        };
    }, [events, mode, theme, t]);

    const timezoneSuffix = mode === "UTC" ? t('utcSuffix') : t('localTimeSuffix');
    const summary = () => {
        if (metric === 'hour'){
            if (heatMax === 0) return t('noData');
            const peak = online.reduce((max, h) => h.hours_online > max.hours_online ? h : max, online[0]);
            return t('onlineSummary', {
                total: formatNumber(Math.round(online.reduce((sum, h) => sum + h.hours_online, 0))),
                peakHour: peak.hour,
                peakHours: peak.hours_online.toFixed(1),
                timezone: timezoneSuffix,
            });
        }
        const { Join: joins, Leave: leaves } = events;
        if (joins.length === 0 || leaves.length === 0) return t('noData');
        const peakJoin = peakHour(joins);
        const peakLeave = peakHour(leaves);
        return t('summary', {
            joins: formatNumber(sumCounts(joins)),
            leaves: formatNumber(sumCounts(leaves)),
            peakJoinHour: peakJoin.hour,
            peakJoinCount: formatNumber(peakJoin.count),
            peakLeaveHour: peakLeave.hour,
            peakLeaveCount: formatNumber(peakLeave.count),
            timezone: timezoneSuffix,
        });
    };

    const title = metric === 'hour' ? t('onlineTitle') : t('title')
    const activeError = metric === 'hour' ? heatError : error
    const timezoneLabel = mode === 'UTC' ? 'UTC' : 'local timezone'

    if (activeError){
        return (
            <div>
                <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-6">
                    <h2 className="text-xl font-semibold">{title}</h2>
                    <AlertCircle className="w-5 h-5" />
                </div>
                <div className="h-[375px] flex items-center justify-center">
                    <p>{activeError.message || t('genericError')}</p>
                </div>
            </div>
        )
    }
    return (
        <div>
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-6">
                <PeriodTitle title={title} className="flex-wrap" />
                <div className="flex gap-2 flex-wrap">
                    <ToggleButtons value={metric} onChange={setMetric} options={[['hour', t('metricHour')], ['joins', t('metricJoinCount')]]} />
                    <ToggleButtons value={mode} onChange={setMode} options={[['user', t('myTimezone')], ['UTC', t('utc')]]} />
                </div>
            </div>
            {(metric === 'hour' ? heatLoading : loading) ? <GraphSkeleton height={375} className="mx-4 mb-4 sm:mx-6 sm:mb-6" /> :
                <>
                    <ScreenReaderOnly id="hour-of-day-summary">
                        {summary()}
                    </ScreenReaderOnly>
                    <div
                        className="h-[375px] px-4 pb-4 sm:px-6 sm:pb-6"
                        role="img"
                        aria-label={metric === 'hour'
                            ? `Player online hours by hour of day (${timezoneLabel})`
                            : `Player session hour of day distribution (${timezoneLabel})`}
                        aria-describedby="hour-of-day-summary"
                    >
                        {metric === 'hour'
                            ? <Line data={onlineData} options={onlineOptions} />
                            : <Bar data={data} options={options} />}
                    </div>
                </>
            }
        </div>
    )
}
export default function PlayerHourOfDay({ serverPlayerPromise }: ServerPlayerProps){
    const t = useTranslations('players.hourOfDay');
    return <ErrorCatch message={t('loadError')}>
        <Card>
            <PlayerHourOfDayDisplay serverPlayerPromise={serverPlayerPromise} />
        </Card>
    </ErrorCatch>
}
