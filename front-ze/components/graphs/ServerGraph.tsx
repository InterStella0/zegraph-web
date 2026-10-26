// @ts-nocheck
import type {Chart as ChartJS} from "chart.js";
import type { AnnotationOptions } from 'chartjs-plugin-annotation';
import dayjs from "lib/dayjs";
import {Dispatch, SetStateAction, useCallback, useEffect, useMemo, useRef} from 'react';
import {LazyMatrixChart as Chart} from 'components/graphs/LazyCharts';
import {fetchUrl, REGION_COLORS, formatNumber} from 'utils/generalUtils'
import {chartPrimary, markerLine} from 'utils/sessionUtils.js';
import GraphToolbar from './GraphToolbar';
import {DateSources, useDateState} from './DateStateManager';
import {useServerData} from "../../app/servers/[server_slug]/ServerDataProvider";
import {ServerCountData} from "../../app/servers/[server_slug]/util.ts";
import {ServerMapPlayed} from "types/maps.ts";
import {useChartTheme} from "lib/chartTheme";
import {useResource} from "lib/hooks/useResource";
import { ScreenReaderOnly } from "components/ui/ScreenReaderOnly";
import { calculateTimeSeriesStats, formatDateRange, generateSeoTable } from "utils/chartSeoUtils.tsx";
import { useLocale, useTranslations } from "next-intl";
import { humanizeDurationLocalized } from "utils/durationFormat.ts";
import {withErrorCatch} from "components/common/withErrorCatch";

const TIMEZONE_CHOSEN_FROM = "Asia/Kuala_Lumpur"
const MAX_ZOOM_OUT_MS = 365 * 24 * 60 * 60 * 1000
const MAX_EVENT_COUNT_HOURS = 24
const REGION_MAPPING = [
    { start: 18, end: 24, label: "Asia + EU" },
    { start: 0, end: 6, label: "EU + NA" },
    { start: 6, end: 12, label: "NA + EU" },
    { start: 12, end: 18, label: "NA + Asia" },
];
const EMPTY_GRAPH = { playerCounts: [], joinCounts: [], leaveCounts: [], mapAnnotations: [] }

function generateAnnotations(startDate: dayjs.Dayjs, endDate:dayjs.Dayjs): AnnotationOptions<"box">[] {
    const end = endDate.tz(TIMEZONE_CHOSEN_FROM)
    const annotations: AnnotationOptions<"box">[] = []

    let current = startDate.tz(TIMEZONE_CHOSEN_FROM);
    while (current.isBefore(end)) {
        const hour = current.hour();
        const region = REGION_MAPPING.find((r) => hour >= r.start && hour < r.end);
        if (!region) {
            console.warn("REGION NOT FOUND FOR HOUR", hour)
            return []
        }
        const regionEnd = current.add(region.end - hour, "hours").startOf('hour');
        const endX = regionEnd.isBefore(end) ? regionEnd : end

        annotations.push({
            drawTime: "beforeDatasetsDraw",
            type: "box",
            xMin: current.toISOString(),
            xMax: endX.toISOString(),
            yMax: 81,
            yMin: -1,
            backgroundColor: REGION_COLORS[region.label],
            label: {
                content: region.label,
                display: true,
                position: "center",
            },
        });
        current = endX;
    }
    return annotations;
}

const toPoints = (data: ServerCountData[]) => data.map(e => ({ x: e.bucket_time, y: e.player_count }))

function clampZoomOut({ chart }) {
    const { min, max } = chart.scales.x;
    if (max - min > MAX_ZOOM_OUT_MS) {
        const center = (min + max) / 2;
        chart.zoomScale('x', {
            min: center - MAX_ZOOM_OUT_MS / 2,
            max: center + MAX_ZOOM_OUT_MS / 2
        }, 'none');
    }
}

function ServerGraphDisplay({ setLoading, setShowPlayers }: { setShowPlayers: Dispatch<SetStateAction<boolean>>, setLoading: Dispatch<boolean> }) {
    const t = useTranslations('servers.graph');
    const locale = useLocale();
    const { start, end, setDates, source: lastSource, timestamp } = useDateState();
    const { server } = useServerData()
    const server_id = server.id
    const maxPlayers = server?.max_players || 64
    const theme = useChartTheme();
    const isDark = theme.isDark;
    const chartRef = useRef<ChartJS | null>(null);
    const annotationRef = useRef<{annotations: AnnotationOptions<"box" | "line">[]}>({ annotations: [] });
    const zoomTimeoutRef = useRef<NodeJS.Timeout | null>();

    const { data, loading } = useResource(signal => {
        if (!start.isBefore(end) || !server_id) return null;
        const params = { start: start.toJSON(), end: end.toJSON() };
        const graph = (path: string, extra = {}) =>
            fetchUrl(`/graph/${server_id}/${path}`, { params: { ...extra, ...params }, signal })
        const eventCounts = (event_type: string) => end.diff(start, "hour", true) <= MAX_EVENT_COUNT_HOURS
            ? graph('event_count', { event_type }).then(toPoints).catch(() => [])
            : Promise.resolve([])
        const mapAnnotations = end.diff(start, "day") <= 2
            ? graph('maps').then((maps: ServerMapPlayed[]) => maps.map(e => {
                const duration = e.ended_at !== e.started_at
                    ? ` (${humanizeDurationLocalized(dayjs(e.ended_at).diff(dayjs(e.started_at)), locale, { units: ['h', 'm'], maxDecimalPoints: 2 })})`
                    : ''
                return markerLine(e.started_at, theme.destructive, e.map + duration, theme.primary)
            })).catch(() => [])
            : Promise.resolve([])
        return Promise.all([graph('unique_players').then(toPoints), eventCounts('Join'), eventCounts('Leave'), mapAnnotations])
            .then(([playerCounts, joinCounts, leaveCounts, mapAnnotations]) => ({ playerCounts, joinCounts, leaveCounts, mapAnnotations }))
    }, [start, end, server_id, locale], { keepData: true, errorLog: 'Failed to fetch graph data:' });
    const graph = data ?? EMPTY_GRAPH;

    useEffect(() => {
        if (!loading) {
            setLoading(false);
            return;
        }
        const timeout = setTimeout(() => setLoading(true), 1000);
        return () => clearTimeout(timeout);
    }, [loading, setLoading]);

    useEffect(() => {
        if (lastSource !== DateSources.ZOOM && chartRef.current) {
            clearTimeout(zoomTimeoutRef.current);
            chartRef.current.zoomScale('x', { min: start.valueOf(), max: end.valueOf() }, 'none');
        }
    }, [timestamp, lastSource, start, end]);

    const zoomComplete = useCallback(({ chart }) => {
        const { min, max } = chart.scales.x;
        clearTimeout(zoomTimeoutRef.current);
        zoomTimeoutRef.current = setTimeout(() => setDates(dayjs(min), dayjs(max), DateSources.ZOOM), 500);
    }, [setDates]);

    useEffect(() => {
        const showRegions = start.isBefore(end) && end.diff(start, "day") <= 6;
        annotationRef.current.annotations = showRegions
            ? [...generateAnnotations(start, end), ...graph.mapAnnotations]
            : graph.mapAnnotations;
        chartRef.current?.update()
    }, [start, end, graph.mapAnnotations]);

    // Kept stable across data loads so the chart keeps its zoom state; annotations update through the ref.
    const options = useMemo(() => ({
        animation: false,
        maintainAspectRatio: false,
        tooltip: {
            position: 'nearest',
            ...theme.tooltip,
        },
        interaction: { mode: 'x', intersect: false },
        onHover: function (e: any) {
            if (e.native.target.className !== 'chart-interaction')
                e.native.target.className = 'chart-interaction';
        },
        scales: {
            x: {
                type: 'time',
                stacked: true,
                time: {
                    displayFormats: {
                        minute: 'MMM DD, h:mm a',
                        hour: 'MMM DD, ha',
                        day: 'MMM DD',
                        week: 'MMM DD',
                        month: 'MMM YYYY',
                    }
                },
                ticks: {
                    autoSkip: true,
                    autoSkipPadding: 50,
                    maxRotation: 0,
                    color: theme.muted,
                },
                title: {
                    text: t('timeAxis'),
                    display: true,
                    color: theme.muted,
                },
                grid: {
                    color: theme.border,
                }
            },
            y: {
                min: 0,
                max: maxPlayers,
                ticks: {
                    color: theme.muted,
                },
                grid: {
                    display: true,
                    color: theme.border,
                }
            }
        },
        plugins: {
            annotation: annotationRef.current,
            legend: {
                position: 'top',
                labels: {
                    color: theme.foreground,
                }
            },
            zoom: {
                pan: { enabled: true, mode: 'x', onPanComplete: zoomComplete },
                zoom: {
                    wheel: { enabled: true },
                    pinch: { enabled: true },
                    mode: 'x',
                    onZoom: clampZoomOut,
                    onZoomComplete: zoomComplete
                }
            }
        },
    }), [zoomComplete, maxPlayers, isDark, t])

    const datasets = [
        {
            type: 'bar',
            label: t('joinCount'),
            data: graph.joinCounts,
            borderColor: theme.success,
            backgroundColor: isDark ? 'hsla(142.1 76.2% 36.3% / 0.6)' : 'hsla(142.1 70.6% 45.3% / 0.6)',
            fill: true,
            order: 3
        },
        {
            type: 'bar',
            label: t('leaveCount'),
            data: graph.leaveCounts,
            borderColor: theme.destructive,
            backgroundColor: isDark ? 'hsla(0 84.2% 60.2% / 0.6)' : 'hsla(0 72.2% 50.6% / 0.6)',
            fill: true,
            order: 2
        },
        {
            type: 'line',
            label: t('playerCount'),
            data: graph.playerCounts,
            borderColor: chartPrimary(isDark),
            backgroundColor: chartPrimary(isDark, .35),
            pointRadius: 0,
            tension: .2,
            fill: true,
            order: 1,
        },
    ]

    const points = graph.playerCounts
    let summary = t('noServerData')
    let seoTable = null
    if (points.length) {
        const stats = calculateTimeSeriesStats(points.map(d => ({ label: d.x, value: d.y })));
        summary = t('summary', {
            dateRange: formatDateRange(points[0].x, points.at(-1).x),
            peak: formatNumber(stats.max),
            average: formatNumber(stats.avg, 1),
            lowest: formatNumber(stats.min),
            intervals: formatNumber(stats.count),
        });
        const countAt = (counts, x) => {
            const found = counts.find(c => c.x === x);
            return found ? formatNumber(found.y) : '0';
        };
        seoTable = generateSeoTable(
            [t('timeAxis'), t('playerCount'), t('joins'), t('leaves')],
            points.slice(0, 20).map(d => ({
                [t('timeAxis')]: dayjs(d.x).format('MMM D, YYYY HH:mm'),
                [t('playerCount')]: formatNumber(d.y),
                [t('joins')]: countAt(graph.joinCounts, d.x),
                [t('leaves')]: countAt(graph.leaveCounts, d.x),
            })),
            t('seoTableCaption')
        );
    }

    return (
        <>
            <GraphToolbar setShowPlayersAction={setShowPlayers} />
            <div className="chart-wrapper">
                <ScreenReaderOnly id="server-graph-summary">
                    {summary}
                </ScreenReaderOnly>

                <div
                    className='chart-container'
                    role="img"
                    aria-label={t('ariaLabel')}
                    aria-describedby="server-graph-summary"
                >
                    <Chart ref={chartRef} data={{ datasets }} options={options} />
                </div>

                {seoTable && (
                    <ScreenReaderOnly as="section">
                        {seoTable}
                    </ScreenReaderOnly>
                )}
            </div>
        </>
    );
}

export default withErrorCatch(ServerGraphDisplay, t => t('servers.graph.loadError'))
