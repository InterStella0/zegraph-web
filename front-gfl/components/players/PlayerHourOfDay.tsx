'use client'
import {useTranslations} from 'next-intl';
import ErrorCatch from "../ui/ErrorMessage.tsx";
import {use, useEffect, useMemo, useState} from "react";
import {fetchApiServerUrl, formatNumber, StillCalculate} from "utils/generalUtils.ts";
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
import {MatrixController, MatrixElement} from "chartjs-chart-matrix";
import GraphSkeleton from "../graphs/GraphSkeleton.tsx";
import {LazyBarChart as Bar, LazyLineChart as Line, LazyMatrixChart as Matrix} from "components/graphs/LazyCharts";
import { Card } from "components/ui/card";
import { Button } from "components/ui/button";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { AlertCircle } from "lucide-react";
import {ServerPlayerDetailed} from "../../app/servers/[server_slug]/players/[player_id]/page.tsx";
import {PlayerHourDay, PlayerOnlineHeatmap} from "types/players.ts";
import { useTheme } from "next-themes";
import { ScreenReaderOnly } from "components/ui/ScreenReaderOnly";

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
    MatrixController,
    MatrixElement,
    Title,
    Tooltip,
    Legend,
    TimeScale
)

type Metric = 'hour' | 'joins'

/** Width reserved for the y axis, so the line chart and the heat strip share an x origin. */
const AXIS_GUTTER = 48

const HEAT_ACCENT = { h: 300, s: 85, l: 62 }

/** Hour labels under the heat strip: 00, 01, ... 23 — one per cell. */
const ALL_HOURS = Array.from({length: 24}, (_, i) => i)

function heatColor(alpha: number){
    const { h, s, l } = HEAT_ACCENT
    return `hsla(${h} ${s}% ${l}% / ${alpha})`
}

function PlayerHourOfDayDisplay({ serverPlayerPromise }: { serverPlayerPromise: Promise<ServerPlayerDetailed>}){
    const t = useTranslations('players.hourOfDay');
    const { server, player } = use(serverPlayerPromise);
    const playerId = !(player instanceof StillCalculate)? player.id: null
    const server_id = server.id
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';
    const [ hours, setHours ] = useState<PlayerHourDay[]>([])
    const [ loading, setLoading ] = useState<boolean>(false)
    const [ error, setError ] = useState<Error | null>(null)
    const [ heat, setHeat ] = useState<PlayerOnlineHeatmap[]>([])
    const [ heatLoading, setHeatLoading ] = useState<boolean>(false)
    const [ heatError, setHeatError ] = useState<Error | null>(null)
    const [ mode, setMode ] = useState<string>("user")
    const [ metric, setMetric ] = useState<Metric>("hour")
    const yAxis = useMemo(() => {
        let yMax = hours.reduce((a, b) => Math.max(a,  b.count), 0)
        return {min: 0, max: yMax}
    }, [hours])

    useEffect(() => {
        if (playerId === null) return

        setLoading(true)
        setError(null)
        setHours([])
        fetchApiServerUrl(server_id, `/players/${playerId}/hours_of_day`)
            .then(setHours)
            .catch(setError)
            .finally(() => setLoading(false))
    }, [server_id, playerId])

    useEffect(() => {
        if (playerId === null) return

        setHeatLoading(true)
        setHeatError(null)
        setHeat([])
        fetchApiServerUrl(server_id, `/players/${playerId}/online_heatmap`)
            .then(setHeat)
            .catch(setHeatError)
            .finally(() => setHeatLoading(false))
    }, [server_id, playerId])

    // Rotate the 24 buckets rather than remapping each point: a line chart needs its x
    // values to stay in order, and a per-point remap leaves them shuffled.
    const online = useMemo(() => {
        const byUtcHour = new Map(heat.map(e => [e.hour_of_day, e]))
        const offsetHours = mode === "UTC" ? 0 : Math.round(dayjs().utcOffset() / 60)

        return Array.from({length: 24}, (_, displayHour) => {
            const utcHour = ((displayHour - offsetHours) % 24 + 24) % 24
            const found = byUtcHour.get(utcHour)
            return {
                hour: displayHour,
                hours_online: found?.hours_online ?? 0,
                online_count: found?.online_count ?? 0,
            }
        })
    }, [heat, mode])

    const heatMax = useMemo(
        () => online.reduce((a, b) => Math.max(a, b.hours_online), 0),
        [online]
    )

    const axisColor = isDark ? 'hsl(215 20.2% 65.1%)' : 'hsl(215.4 16.3% 46.9%)'
    const gridColor = isDark ? 'hsl(217.2 32.6% 17.5%)' : 'hsl(214.3 31.8% 91.4%)'
    const labelColor = isDark ? 'hsl(210 40% 98%)' : 'hsl(222.2 47.4% 11.2%)'

    const tooltipStyle = useMemo(() => ({
        position: 'nearest' as const,
        backgroundColor: isDark ? 'rgba(50, 50, 50, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        titleColor: labelColor,
        bodyColor: labelColor,
        borderColor: gridColor,
        borderWidth: 1,
    }), [isDark, labelColor, gridColor])

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
        layout: {
            padding: { right: 8 }
        },
        scales: {
            x: {
                type: 'linear' as const,
                min: -0.5,
                max: 23.5,
                // The hour labels live under the heat strip instead.
                ticks: { display: false },
                border: { display: false },
                grid: { display: false },
            },
            y: {
                min: 0,
                afterFit: (scale: { width: number }) => { scale.width = AXIS_GUTTER },
                ticks: {
                    color: axisColor,
                    maxTicksLimit: 5,
                },
                border: { display: false },
                grid: { color: gridColor },
            }
        },
        plugins: {
            legend: { display: false },
            tooltip: {
                ...tooltipStyle,
                callbacks: {
                    title: (items: { parsed: { x: number } }[]) =>
                        `${String(items[0]?.parsed.x ?? 0).padStart(2, '0')}:00`,
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
        datasets: [{
            label: t('hoursOnlineAxis'),
            data: online.map(e => ({ x: e.hour, y: e.hours_online })),
            borderColor: heatColor(1),
            backgroundColor: (ctx: { chart: { ctx: CanvasRenderingContext2D, chartArea?: { top: number, bottom: number } } }) => {
                const { chartArea, ctx: canvas } = ctx.chart
                // chartArea is undefined on the very first render pass.
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

    const heatStripData = useMemo(() => ({
        datasets: [{
            type: 'matrix',
            label: t('heatLabel'),
            data: online.map(e => ({ x: e.hour, y: 0, v: e.hours_online })),
            backgroundColor: (ctx: { raw?: { v: number } }) => {
                const v = ctx.raw?.v ?? 0
                const ratio = heatMax > 0 ? v / heatMax : 0
                return heatColor(0.15 + ratio * 0.75)
            },
            borderWidth: 0,
            borderRadius: 4,
            width: (ctx: { chart: { chartArea?: { width: number } } }) =>
                Math.max((ctx.chart.chartArea?.width ?? 0) / 24 - 4, 1),
            height: 22,
        }]
    }), [online, heatMax, t])

    const heatStripOptions = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        layout: {
            padding: { left: AXIS_GUTTER, right: 8 }
        },
        scales: {
            x: {
                type: 'linear' as const,
                min: -0.5,
                max: 23.5,
                offset: false,
                // min/max sit on half-hours so the end cells get padding, but that also
                // seeds the generated ticks at -0.5, 1.5, ... — so name them outright.
                afterBuildTicks: (axis: { ticks: { value: number }[] }) => {
                    axis.ticks = ALL_HOURS.map(value => ({ value }))
                },
                ticks: {
                    color: axisColor,
                    // One label per cell, never thinned out.
                    autoSkip: false,
                    maxRotation: 0,
                    minRotation: 0,
                    font: { size: 10 },
                    callback: (value: number | string) => String(value).padStart(2, '0'),
                },
                border: { display: false },
                grid: { display: false },
            },
            y: {
                display: false,
                min: -0.5,
                max: 0.5,
            }
        },
        plugins: {
            legend: { display: false },
            tooltip: { enabled: false },
        }
    }), [axisColor])

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
                borderColor: isDark ? 'hsl(142.1 76.2% 36.3%)' : 'hsl(142.1 70.6% 45.3%)',
                backgroundColor: isDark ? 'hsla(142.1 76.2% 36.3% / 0.3)' : 'hsla(142.1 70.6% 45.3% / 0.2)',
                borderWidth: 2,
                pointRadius: 0
            },
            {
                label: t('leaveCount'),
                data: leave,
                borderColor: isDark ? 'hsl(0 84.2% 60.2%)' : 'hsl(0 72.2% 50.6%)',
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

    // Generate SEO summary
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
        <div className="flex items-center justify-between flex-col sm:flex-row">
            <h2 className="text-xl font-semibold p-4">
                {metric === 'hour' ? t('onlineTitle') : t('title')}
            </h2>
            <div className="m-4 flex gap-2 flex-wrap">
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
                <div className="flex items-center justify-between flex-col sm:flex-row">
                    <h2 className="text-xl font-semibold p-4">
                        {metric === 'hour' ? t('onlineTitle') : t('title')}
                    </h2>
                    <div className="m-4">
                        <AlertCircle className="w-5 h-5" />
                    </div>
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
            {activeLoading ? <GraphSkeleton height={375} className="m-4" /> :
                <>
                    <ScreenReaderOnly id="hour-of-day-summary">
                        {summary}
                    </ScreenReaderOnly>
                    {metric === 'hour' ? (
                        <div
                            className="m-4 p-2"
                            role="img"
                            aria-label={`Player online hours by hour of day (${mode === 'UTC' ? 'UTC' : 'local timezone'})`}
                            aria-describedby="hour-of-day-summary"
                        >
                            <div className="h-[300px]">
                                <Line data={onlineData} options={onlineOptions} />
                            </div>
                            <div className="relative h-[56px]">
                                <span
                                    className="absolute left-0 top-[10px] text-[10px] font-medium tracking-wider text-muted-foreground"
                                    style={{width: AXIS_GUTTER}}
                                >
                                    {t('heatLabel')}
                                </span>
                                <Matrix type="matrix"
                                        // @ts-expect-error matrix datasets are not part of chart.js core types
                                        data={heatStripData}
                                        options={heatStripOptions} />
                            </div>
                        </div>
                    ) : (
                        <div
                            className="h-[375px] m-4 p-2"
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
