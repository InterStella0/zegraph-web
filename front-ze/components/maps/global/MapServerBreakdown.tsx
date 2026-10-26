'use client'
import {useCallback, useMemo, useState} from "react";
import dayjs from "lib/dayjs";
import {AlertTriangle} from "lucide-react";
import {useLocale, useTranslations} from 'next-intl';
import {LazyBarChart} from "components/graphs/LazyCharts";
import {Badge} from "components/ui/badge";
import {Skeleton} from "components/ui/skeleton";
import {Tabs, TabsList, TabsTrigger} from "components/ui/tabs";
import {ScreenReaderOnly} from "components/ui/ScreenReaderOnly";
import {GAME_META} from "components/ui/ServerIndicator";
import {useServerMap} from "components/ui/ServerProvider";
import InfoTooltip from "components/common/InfoTooltip";
import MapDailyHeatmap, {HeatDay} from "components/maps/MapDailyHeatmap";
import MapServerLabel from "components/maps/global/MapServerLabel";
import {STATUS_TONE, useServerMapState} from "components/maps/global/GlobalMapStatusChip";
import {withMapSuspense} from "components/maps/withMapSuspense";
import {useMapContext} from "../../../app/servers/[server_slug]/maps/[map_name]/MapContext";
import {useMapScope} from "lib/hooks/useMapScope";
import {useResource} from "lib/hooks/useResource";
import {useServerColors} from "lib/hooks/useServerColors";
import useWeekdayLabels from "lib/hooks/useWeekdayLabels";
import {heatmapTooltip, useChartTheme} from "lib/chartTheme";
import {weekdayKey} from "lib/calendarHeatmap";
import {formatHours, formatNumber, range} from "utils/generalUtils.ts";
import {DailyMapServer, GlobalMapInfo, MapServerTime} from "types/maps.ts";

type Metric = 'map' | 'player'

const metricSeconds = (time: MapServerTime, metric: Metric) =>
    metric === 'map' ? time.map_duration : time.player_duration

function quantile(values: number[], p: number): number {
    if (values.length === 0) return 0
    return values[Math.min(values.length - 1, Math.floor(p * values.length))]
}

type MapServerBreakdownProps = { initialDataPromise?: Promise<DailyMapServer[] | null> }

function MapServerBreakdownDisplay({ initialDataPromise }: MapServerBreakdownProps) {
    const t = useTranslations('maps.serverBreakdown');
    const locale = useLocale();
    const { name, info } = useMapContext<GlobalMapInfo>()
    const { fetchMap } = useMapScope()
    const { serversMapped } = useServerMap()
    const stateOf = useServerMapState()
    const theme = useChartTheme()
    const dayNames = useWeekdayLabels()
    const [metric, setMetric] = useState<Metric>('map')
    const { data: fetched, loading, error, notReady } = useResource<DailyMapServer[]>(() => name
        ? fetchMap('/heat-servers')
        : null, [name], { seed: initialDataPromise, retryNotReady: true })
    const heat = fetched ?? []
    const mapServers = info?.map.servers ?? []

    const labelOf = useCallback((serverId: string) => {
        const server = serversMapped.get(serverId)
        return server ? `${server.community_shorten_name || server.community_name} · ${server.name}` : serverId
    }, [serversMapped])

    const serverIds = useMemo(() => {
        const ids = mapServers.map(server => server.server_id)
        for (const day of heat)
            for (const time of day.servers)
                if (!ids.includes(time.server_id)) ids.push(time.server_id)
        return ids
    }, [mapServers, heat])
    const colors = useServerColors(serverIds)
    const colorOf = useCallback((serverId: string | undefined) => (serverId && colors[serverId]) || 'grey', [colors])

    const days = useMemo<HeatDay[]>(() => {
        if (heat.length === 0) return []
        const byDay = new Map(heat.map(day => [dayjs.utc(day.date).format('YYYY-MM-DD'), day.servers]))
        const filled: HeatDay[] = []
        const today = dayjs.utc().startOf('day')
        for (let day = today.subtract(1, 'year'); !day.isAfter(today); day = day.add(1, 'day')) {
            const iso = day.format('YYYY-MM-DD')
            filled.push({
                date: iso,
                series: (byDay.get(iso) ?? [])
                    .map(time => ({key: time.server_id, label: labelOf(time.server_id), seconds: metricSeconds(time, metric)}))
                    .filter(series => series.seconds > 0),
            })
        }
        return filled
    }, [heat, metric, labelOf])
    const playedDays = useMemo(() => days.filter(day => day.series.length > 0), [days])

    const scaleHours = useMemo(() => {
        const totals = playedDays
            .map(day => day.series.reduce((a, s) => a + s.seconds, 0) / 3600)
            .sort((a, b) => a - b)
        return Math.max(quantile(totals, 0.95), 0.5)
    }, [playedDays])
    const cellAlpha = useCallback((hours: number, hasData: boolean): [number, number] => {
        const ratio = hours / scaleHours
        return [hasData ? Math.min(1, Math.max(0.15, ratio)) : .01, Math.min(1, 0.25 + 0.75 * ratio)]
    }, [scaleHours])
    const formatValue = useCallback((seconds: number) => formatHours(seconds, locale), [locale])

    const totals = useMemo(() => {
        const byServer = new Map<string, number>()
        for (const day of playedDays)
            for (const series of day.series)
                byServer.set(series.key, (byServer.get(series.key) ?? 0) + series.seconds)
        return [...byServer.entries()].sort((a, b) => b[1] - a[1])
    }, [playedDays])
    const totalSeconds = totals.reduce((a, [, seconds]) => a + seconds, 0)

    const barData = useMemo(() => ({
        labels: [''],
        datasets: totals.map(([serverId, seconds]) => ({
            label: labelOf(serverId),
            data: [seconds / 3600],
            backgroundColor: colorOf(serverId),
            borderColor: colorOf(serverId),
            borderWidth: 1,
            hoverBackgroundColor: colorOf(serverId),
            hoverBorderWidth: 2,
        })),
    }), [totals, labelOf, colorOf])

    const barOptions = useMemo(() => ({
        maintainAspectRatio: false,
        indexAxis: 'y' as const,
        scales: {
            x: {
                stacked: true,
                title: {display: true, text: t('hours'), color: theme.foreground},
                ticks: {beginAtZero: true, color: theme.foreground},
                grid: {color: theme.faintGrid},
                max: totalSeconds / 3600,
            },
            y: {
                stacked: true,
                ticks: {color: theme.foreground},
                grid: {color: theme.faintGrid},
            },
        },
        plugins: {
            legend: {display: false},
            tooltip: {
                ...heatmapTooltip(theme),
                callbacks: {
                    label(context: any) {
                        return `${context.dataset.label}: ${formatHours(context.parsed.x * 3600, locale)}`;
                    }
                }
            },
        },
    }), [theme, totalSeconds, t, locale])

    const summary = useMemo(() => {
        if (playedDays.length === 0) return t('noData')
        const dayTotals = new Map<string, number>()
        for (const day of playedDays) {
            const key = weekdayKey(dayjs.utc(day.date))
            dayTotals.set(key, (dayTotals.get(key) ?? 0) + day.series.reduce((a, s) => a + s.seconds, 0))
        }
        const [busiestDay, busiestDaySeconds] = [...dayTotals.entries()].sort((a, b) => b[1] - a[1])[0]
        const [topServer, topServerSeconds] = totals[0]
        return t('summary', {
            days: formatNumber(playedDays.length, 0, locale),
            day: dayNames[busiestDay] ?? busiestDay,
            dayHours: formatHours(busiestDaySeconds, locale),
            server: labelOf(topServer),
            serverHours: formatHours(topServerSeconds, locale),
        })
    }, [playedDays, totals, dayNames, labelOf, locale, t])

    return (
        <div>
            <div className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-xl font-bold text-primary">{t('title')}</h2>
                    <div className="flex items-center gap-2">
                        <Tabs value={metric} onValueChange={value => setMetric(value as Metric)}>
                            <TabsList className="h-8" aria-label={t('metric')}>
                                <TabsTrigger value="map" className="text-xs px-2.5">{t('mapHours')}</TabsTrigger>
                                <TabsTrigger value="player" className="text-xs px-2.5">{t('playerHours')}</TabsTrigger>
                            </TabsList>
                        </Tabs>
                        <InfoTooltip
                            text={error ? (notReady ? t('dataNotReady') : t('somethingWrong')) : t(metric === 'map' ? 'tooltipMap' : 'tooltipPlayer')}
                            icon={error ? <AlertTriangle className="h-4 w-4" /> : undefined}
                        />
                    </div>
                </div>

                {!loading && playedDays.length > 0 && (
                    <ScreenReaderOnly id="heat-server-summary">{summary}</ScreenReaderOnly>
                )}

                <div
                    className="p-4 flex justify-center md:justify-center sm:justify-end xs:justify-end items-center overflow-auto"
                    role="img"
                    aria-label={t('ariaLabel')}
                    aria-describedby="heat-server-summary"
                >
                    <MapDailyHeatmap
                        days={days}
                        loading={loading}
                        colorOf={colorOf}
                        order={serverIds}
                        cellAlpha={cellAlpha}
                        yTitle={t('hours')}
                        formatValue={formatValue}
                    />
                </div>
            </div>
            <div className="p-6 px-8">
                <h3 className="text-sm text-muted-foreground font-bold">{t('distributionTitle')}</h3>
                <div className="flex flex-col gap-4">
                    <div className="h-[100px] w-full relative" role="img" aria-label={t('distributionTitle')}>
                        {loading && (
                            <div className="flex justify-center items-center h-full w-full absolute top-0 left-0">
                                <Skeleton className="w-full h-[50px] rounded" />
                            </div>
                        )}
                        {!loading && totals.length > 0 && <LazyBarChart data={barData} options={barOptions} />}
                        {!loading && totals.length === 0 && (
                            <div className="flex justify-center items-center h-full">
                                <p className="text-muted-foreground">{t('noData')}</p>
                            </div>
                        )}
                    </div>
                    <div className="border-t border-border pt-4 w-full">
                        <h3 className="text-sm text-muted-foreground font-bold mb-3">{t('servers')}</h3>
                        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
                            {mapServers.length === 0 && range(3).map(i => (
                                <li key={i} className="flex items-center gap-2">
                                    <Skeleton className="w-3 h-3 rounded-sm" />
                                    <Skeleton className="h-3.5 w-40" />
                                </li>
                            ))}
                            {mapServers.map(server => {
                                const known = serversMapped.get(server.server_id)
                                const state = stateOf(server)
                                const gameMeta = GAME_META[server.game]
                                const seconds = metric === 'map' ? server.total_time : server.total_cum_time
                                return (
                                    <li key={server.server_id} className="flex items-start gap-2">
                                        <div
                                            className="w-3 h-3 rounded-sm shrink-0 mt-1"
                                            style={{backgroundColor: colorOf(server.server_id)}}
                                        />
                                        <div className="min-w-0 flex-1">
                                            <MapServerLabel
                                                serverId={server.server_id}
                                                href={`/servers/${known?.gotoLink ?? server.server_id}/maps/${name}`}
                                                className="text-sm"
                                            />
                                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                                                {gameMeta && (
                                                    <Badge variant="outline" className={`h-4 px-1 text-[9px] ${gameMeta.className}`}>
                                                        {gameMeta.label}
                                                    </Badge>
                                                )}
                                                <span className={`font-semibold ${STATUS_TONE[state.tone]}`}>{state.label}</span>
                                                {seconds != null && <span>· {t('allTime', {hours: formatHours(seconds, locale)})}</span>}
                                            </div>
                                        </div>
                                    </li>
                                )
                            })}
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default withMapSuspense(MapServerBreakdownDisplay, t => t('maps.serverBreakdown.loadError'))
