'use client'
import {useTranslations} from 'next-intl';
import ErrorCatch from "../ui/ErrorMessage.tsx";
import {use, useMemo, useState} from "react";
import {formatNumber, StillCalculate} from "utils/generalUtils.ts";
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
    TimeScale,
    Title,
    Tooltip
} from "chart.js";
import GraphSkeleton from "../graphs/GraphSkeleton.tsx";
import {LazyBarChart as Bar, LazyLineChart as Line} from "components/graphs/LazyCharts";
import { Card } from "components/ui/card";
import { Button } from "components/ui/button";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import {useHydrated} from "lib/hooks/useHydrated";
import { AlertCircle } from "lucide-react";
import {ServerPlayerDetailed} from "../../app/servers/[server_slug]/players/[player_id]/page.tsx";
import {PlayerHourDay, PlayerOnlineHeatmap} from "types/players.ts";
import {useChartTheme} from "lib/chartTheme";
import { ScreenReaderOnly } from "components/ui/ScreenReaderOnly";
import {usePlayerStat} from "../../app/servers/[server_slug]/players/[player_id]/PlayerStatsPatch.tsx";
import {PeriodChip} from "../../app/servers/[server_slug]/players/[player_id]/PlayerPeriod.tsx";

dayjs.extend(utc)
dayjs.extend(timezone)

ChartJS.register(
    BarElement,
    BarController,
    LineController,
    LineElement,
    PointElement,
    LinearScale,
    CategoryScale,
    Filler,
    Title,
    Tooltip,
    Legend,
    TimeScale
)

type Metric = 'hour' | 'joins'

const HEAT_ACCENT = { h: 300, s: 85, l: 62 }

function heatColor(alpha: number){
    const { h, s, l } = HEAT_ACCENT
    return `hsla(${h} ${s}% ${l}% / ${alpha})`
}

function PlayerHourOfDayDisplay({ serverPlayerPromise }: { serverPlayerPromise: Promise<ServerPlayerDetailed>}){
    const t = useTranslations('players.hourOfDay');
    const { server, player } = use(serverPlayerPromise);
    const playerId = !(player instanceof StillCalculate)? player.id: null
    const server_id = server.id
    const theme = useChartTheme();
    const isDark = theme.isDark;
    const { data: hoursData, loading, error } =
        usePlayerStat<PlayerHourDay[]>(server_id, playerId, 'hours_of_day')
    const { data: heatData, loading: heatLoading, error: heatError } =
        usePlayerStat<PlayerOnlineHeatmap[]>(server_id, playerId, 'online_heatmap')
    const hours = useMemo(() => hoursData ?? [], [hoursData])
    const heat = useMemo(() => heatData ?? [], [heatData])
    const [ mode, setMode ] = useState<string>("user")
    const hydrated = useHydrated()
    const [ metric, setMetric ] = useState<Metric>("hour")
    const yAxis = useMemo(() => {
        let yMax = hours.reduce((a, b) => Math.max(a,  b.count), 0)
        return {min: 0, max: yMax}
    }, [hours])

    const online = useMemo(() => {
        const byUtcHour = new Map(heat.map(e => [e.hour_of_day, e]))
        const offsetHours = mode === "UTC" || !hydrated ? 0 : Math.round(dayjs().utcOffset() / 60)

        return Array.from({length: 24}, (_, displayHour) => {
            const utcHour = ((displayHour - offsetHours) % 24 + 24) % 24
            const found = byUtcHour.get(utcHour)
            return {
                hour: displayHour,
                hours_online: found?.hours_online ?? 0,
                online_count: found?.online_count ?? 0,
            }
        })
    }, [heat, mode, hydrated])

    const heatMax = useMemo(
        () => online.reduce((a, b) => Math.max(a, b.hours_online), 0),
        [online]
    )

    const axisColor = theme.muted
    const gridColor = theme.border
    const labelColor = theme.foreground

    const tooltipStyle = useMemo(() => ({
        position: 'nearest' as const,
        ...theme.tooltip,
    }), [theme])

    const options = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            mode: 'x' as const,
            intersect: false,
        },
        scales: {
            x: {
                title: {
                    text: t('hourOfDayAxis'),
                    display: true,
                    color: axisColor,
                },
                ticks: {
                    color: axisColor,
                },
                grid: {
                    color: gridColor,
                }
            },
            y: {
                ...yAxis,
                ticks: {
                    color: axisColor,
                },
                grid: {
                    color: gridColor,
                }
            }
        },
        plugins: {
            tooltip: tooltipStyle,
            legend: {
                labels: {
                    color: labelColor,
                }
            }
        }
    }), [yAxis, axisColor, gridColor, labelColor, tooltipStyle, t])

    const onlineOptions = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            mode: 'index' as const,
            intersect: false,
        },
        scales: {
            x: {
                title: { display: true, text: t('hourOfDayAxis'), color: axisColor },
                ticks: { color: axisColor },
                grid: { display: false },
            },
            y: {
                beginAtZero: true,
                title: { display: true, text: t('hoursOnlineAxis'), color: axisColor },
                ticks: { color: axisColor, maxTicksLimit: 6 },
                grid: { color: gridColor },
            }
        },
        plugins: {
            legend: { display: false },
            tooltip: {
                ...tooltipStyle,
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
    }), [axisColor, gridColor, tooltipStyle, online, t])

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
                gradient.addColorStop(0, heatColor(isDark ? 0.55 : 0.4))
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
    }), [online, isDark, t])

    const data = useMemo(() => {
        const timeZone = dayjs.tz.guess();

        const convertHour = (utcHour: number) => {
            const utcTime = dayjs.utc().startOf('day').add(utcHour, 'hour');
            const localTime = utcTime.tz(timeZone);
            return localTime.hour()
        };

        const join = hours
            .filter(e => e.event_type === "Join")
            .map(e => ({
                y: e.count,
                x: (mode === "UTC" ? e.hour : convertHour(e.hour))
            }));

        const leave = hours
            .filter(e => e.event_type === "Leave")
            .map(e => ({
                y: e.count,
                x: (mode === "UTC" ? e.hour : convertHour(e.hour))
            }));

        const dataset = [
            {
                label: t('joinCount'),
                data: join,
                borderColor: theme.success,
                backgroundColor: isDark ? 'hsla(142.1 76.2% 36.3% / 0.3)' : 'hsla(142.1 70.6% 45.3% / 0.2)',
                borderWidth: 2,
                pointRadius: 0
            },
            {
                label: t('leaveCount'),
                data: leave,
                borderColor: theme.destructive,
                backgroundColor: isDark ? 'hsla(0 84.2% 60.2% / 0.3)' : 'hsla(0 72.2% 50.6% / 0.2)',
                borderWidth: 2,
                pointRadius: 0
            }
        ];

        return {
            labels: Array.from({ length: 24 }).map((_, i) => i),
            datasets: dataset
        };
    }, [hours, mode, isDark, t]);

    const summary = useMemo(() => {
        const timezoneSuffix = mode === "UTC" ? t('utcSuffix') : t('localTimeSuffix');

        if (metric === 'hour'){
            if (heatMax === 0) return t('noData');

            const peak = online.reduce((max, h) => h.hours_online > max.hours_online ? h : max, online[0]);
            const total = online.reduce((sum, h) => sum + h.hours_online, 0);
            return t('onlineSummary', {
                total: formatNumber(Math.round(total)),
                peakHour: peak.hour,
                peakHours: peak.hours_online.toFixed(1),
                timezone: timezoneSuffix,
            });
        }

        const joins = hours.filter(e => e.event_type === "Join");
        const leaves = hours.filter(e => e.event_type === "Leave");
        if (joins.length === 0 || leaves.length === 0) {
            return t('noData');
        }

        const totalJoins = joins.reduce((sum, h) => sum + h.count, 0);
        const totalLeaves = leaves.reduce((sum, h) => sum + h.count, 0);

        const peakJoinHour = joins.reduce((max, h) => h.count > max.count ? h : max, joins[0]);
        const peakLeaveHour = leaves.reduce((max, h) => h.count > max.count ? h : max, leaves[0]);

        return t('summary', {
            joins: formatNumber(totalJoins),
            leaves: formatNumber(totalLeaves),
            peakJoinHour: peakJoinHour.hour,
            peakJoinCount: formatNumber(peakJoinHour.count),
            peakLeaveHour: peakLeaveHour.hour,
            peakLeaveCount: formatNumber(peakLeaveHour.count),
            timezone: timezoneSuffix,
        });
    }, [hours, online, heatMax, metric, mode, t]);

    const activeError = metric === 'hour' ? heatError : error
    const activeLoading = metric === 'hour' ? heatLoading : loading

    const header = (
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-6">
            <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold">
                    {metric === 'hour' ? t('onlineTitle') : t('title')}
                </h2>
                <PeriodChip />
            </div>
            <div className="flex gap-2 flex-wrap">
                <div className="flex gap-1 rounded-md border">
                    <Button
                        variant={metric === 'hour' ? "default" : "ghost"}
                        onClick={() => setMetric("hour")}
                        size="sm"
                    >
                        {t('metricHour')}
                    </Button>
                    <Button
                        variant={metric === 'joins' ? "default" : "ghost"}
                        onClick={() => setMetric("joins")}
                        size="sm"
                    >
                        {t('metricJoinCount')}
                    </Button>
                </div>
                <div className="flex gap-1 rounded-md border">
                    <Button
                        variant={mode === 'user' ? "default" : "ghost"}
                        onClick={() => setMode("user")}
                        size="sm"
                    >
                        {t('myTimezone')}
                    </Button>
                    <Button
                        variant={mode !== 'user' ? "default" : "ghost"}
                        onClick={() => setMode("UTC")}
                        size="sm"
                    >
                        {t('utc')}
                    </Button>
                </div>
            </div>
        </div>
    )

    if (activeError){
        return (
            <div>
                <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-6">
                    <h2 className="text-xl font-semibold">
                        {metric === 'hour' ? t('onlineTitle') : t('title')}
                    </h2>
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
            {header}
            {activeLoading ? <GraphSkeleton height={375} className="mx-4 mb-4 sm:mx-6 sm:mb-6" /> :
                <>
                    <ScreenReaderOnly id="hour-of-day-summary">
                        {summary}
                    </ScreenReaderOnly>
                    {metric === 'hour' ? (
                        <div
                            className="h-[375px] px-4 pb-4 sm:px-6 sm:pb-6"
                            role="img"
                            aria-label={`Player online hours by hour of day (${mode === 'UTC' ? 'UTC' : 'local timezone'})`}
                            aria-describedby="hour-of-day-summary"
                        >
                            <Line data={onlineData} options={onlineOptions} />
                        </div>
                    ) : (
                        <div
                            className="h-[375px] px-4 pb-4 sm:px-6 sm:pb-6"
                            role="img"
                            aria-label={`Player session hour of day distribution (${mode === 'UTC' ? 'UTC' : 'local timezone'})`}
                            aria-describedby="hour-of-day-summary"
                        >
                            <Bar data={data} options={options} />
                        </div>
                    )}
                </>
            }
        </div>
    )
}
export default function PlayerHourOfDay({ serverPlayerPromise }: { serverPlayerPromise: Promise<ServerPlayerDetailed>}){
    const t = useTranslations('players.hourOfDay');
    return <ErrorCatch message={t('loadError')}>
        <Card>
            <PlayerHourOfDayDisplay serverPlayerPromise={serverPlayerPromise} />
        </Card>
    </ErrorCatch>
}
