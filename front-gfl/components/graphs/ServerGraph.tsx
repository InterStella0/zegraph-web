// @ts-nocheck
import {
    BarElement,
    CategoryScale,
    Chart as ChartJS,
    Legend,
    LinearScale,
    LineController,
    LineElement,
    PointElement,
    TimeScale,
    Title,
    Tooltip,
    Filler
} from 'chart.js';
import 'chartjs-adapter-dayjs-4/dist/chartjs-adapter-dayjs-4.esm';
import zoomPlugin from 'chartjs-plugin-zoom';
import annotationPlugin from 'chartjs-plugin-annotation';
import humanizeDuration from 'humanize-duration'
import type { AnnotationOptions } from 'chartjs-plugin-annotation';
import dayjs from 'dayjs';
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import {Dispatch, useCallback, useEffect, useMemo, useReducer, useRef} from 'react';
import {LazyMatrixChart as Chart} from 'components/graphs/LazyCharts';
import {fetchUrl, REGION_COLORS, formatNumber} from 'utils/generalUtils'
import GraphToolbar from './GraphToolbar';
import ErrorCatch from "../ui/ErrorMessage.tsx";
import {DateSources, useDateState} from './DateStateManager';
import {GraphServerState} from "types/graphServers";
import {useServerData} from "../../app/servers/[server_slug]/ServerDataProvider";
import {ServerCountData} from "../../app/servers/[server_slug]/util.ts";
import {ServerMapPlayed} from "types/maps.ts";
import { useTheme } from "next-themes";
import { ScreenReaderOnly } from "components/ui/ScreenReaderOnly";
import { calculateTimeSeriesStats, formatDateRange, generateSeoTable } from "utils/chartSeoUtils.tsx";

dayjs.extend(utc);
dayjs.extend(timezone);
ChartJS.register(
    CategoryScale, LinearScale, PointElement, LineElement, LineController,
    Title, Tooltip, Legend, TimeScale, zoomPlugin, annotationPlugin, BarElement, Filler
);

const TIMEZONE_CHOSEN_FROM = "Asia/Kuala_Lumpur"
const MAX_ZOOM_OUT_MS = 365 * 24 * 60 * 60 * 1000 // 1 year
const REGION_MAPPING = [
    { start: 18, end: 24, label: "Asia + EU" },
    { start: 0, end: 6, label: "EU + NA" },
    { start: 6, end: 12, label: "NA + EU" },
    { start: 12, end: 18, label: "NA + Asia" },
];

function generateAnnotations(startDate: dayjs.Dayjs, endDate:dayjs.Dayjs): AnnotationOptions<"box">[] {
    const start = startDate.tz(TIMEZONE_CHOSEN_FROM)
    const end = endDate.tz(TIMEZONE_CHOSEN_FROM)
    let annotations: AnnotationOptions<"box">[] = []

    let current = start;
    while (current.isBefore(end)) {
        const hour = current.hour();
        const region = REGION_MAPPING.find((r) => hour >= r.start && hour < r.end);
        if (!region) {
            console.warn("REGION NOT FOUND FOR HOUR", hour)
            return []
        }
        const delta = region.end - hour
        let endX = current.add(delta, "hours").startOf('hour');
        endX = endX.isBefore(end) ? endX : end

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

const initialState: GraphServerState = {
    data: {
        playerCounts: [],
        joinCounts: [],
        leaveCounts: [],
        mapAnnotations: []
    },
    loading: false,
    maxPlayers: 64,
};

enum ActionGraph {
    START_LOADING,
    LOAD_SUCCESS,
    LOAD_ERROR,
    SET_MAX_PLAYERS,
}
type ActionGraphChange = {
    type: ActionGraph,
    payload?: any
}
function graphReducer(state: GraphServerState, action: ActionGraphChange): GraphServerState {
    switch (action.type) {
        case ActionGraph.START_LOADING:
            return {
                ...state,
                loading: true,
            };

        case ActionGraph.LOAD_SUCCESS:
            return {
                ...state,
                loading: false,
                data: action.payload,
            };

        case ActionGraph.LOAD_ERROR:
            return {
                ...state,
                loading: false,
            };

        case ActionGraph.SET_MAX_PLAYERS:
            return {
                ...state,
                maxPlayers: action.payload
            };

        default:
            return state;
    }
}

type ShowFlag = {
    join: boolean, leave: boolean, toolbar: boolean
}
type ServerGraphProps = {
    setShowPlayers?: Dispatch<boolean>,
    setLoading: Dispatch<boolean>,
    customDataSet?: any[],
    showFlags?: ShowFlag
}
function ServerGraphDisplay(
    { setLoading, customDataSet = [], showFlags = { join: true, leave: true, toolbar: true },
        setShowPlayers=() => {} }: ServerGraphProps
) {
    const { start, end, setDates, source: lastSource, timestamp } = useDateState();
    const { server } = useServerData()
    const server_id = server.id
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';
    const [state, dispatch] = useReducer(graphReducer, initialState);
    const chartRef = useRef<ChartJS | null>(null);
    const abortControllerRef = useRef<AbortController | null>();
    const annotationRef = useRef<{annotations: AnnotationOptions<"box" | "line">[]}>({ annotations: [] });
    const zoomTimeoutRef = useRef<NodeJS.Timeout | null>();

    useEffect(() => {
        if (server?.max_players !== undefined) {
            const newMax = server.max_players === 0 ? 64 : server.max_players;
            dispatch({ type: ActionGraph.SET_MAX_PLAYERS, payload: newMax });
        }
    }, [server?.max_players]);

    useEffect(() => {
        if (!state.loading) {
            setLoading(false);
            return;
        }
        // Only show loading state if it takes longer than a second
        const timeout = setTimeout(() => setLoading(true), 1000);
        return () => clearTimeout(timeout);
    }, [state.loading, setLoading]);

    useEffect(() => {
        if (lastSource !== DateSources.ZOOM && chartRef.current) {
            clearTimeout(zoomTimeoutRef.current);
            // Pin the scale to the requested range, like a manual pan does.
            // Deriving it from data/annotations (resetZoom) leaves it misaligned,
            // and zoomScale fires no onZoomComplete echo.
            chartRef.current.zoomScale('x', { min: start.valueOf(), max: end.valueOf() }, 'none');
        }
    }, [timestamp, lastSource, start, end]);

    useEffect(() => {
        if (!start.isBefore(end) || !server_id) return;

        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        dispatch({ type: ActionGraph.START_LOADING });

        const params = { start: start.toJSON(), end: end.toJSON() };

        const fetchData = async () => {
            try {
                const promises = [
                    fetchUrl(`/graph/${server_id}/unique_players`, { params, signal })
                        .then((data: ServerCountData[]) => data.map(e => ({ x: e.bucket_time, y: e.player_count }))),

                    fetchUrl(`/graph/${server_id}/event_count`, {
                        params: { event_type: 'Join', ...params },
                        signal
                    }).then((data: ServerCountData[]) => data.map(e => ({ x: e.bucket_time, y: e.player_count }))),

                    fetchUrl(`/graph/${server_id}/event_count`, {
                        params: { event_type: 'Leave', ...params },
                        signal
                    }).then((data: ServerCountData[]) => data.map(e => ({ x: e.bucket_time, y: e.player_count })))
                ];

                // Only fetch maps if date range is small enough
                if (end.diff(start, "day") <= 2) {
                    promises.push(
                        fetchUrl(`/graph/${server_id}/maps`, { params, signal })
                            .then((data: ServerMapPlayed[]): any => data.map(e => {
                                let text = e.map;
                                if (e.ended_at !== e.started_at) {
                                    let delta = dayjs(e.ended_at).diff(dayjs(e.started_at));
                                    text += ` (${humanizeDuration(delta, { units: ['h', 'm'], maxDecimalPoints: 2 })})`;
                                }
                                const mapBorderColor = isDark ? 'hsl(0 84.2% 60.2%)' : 'hsl(0 72.2% 50.6%)';
                                const mapLabelColor = isDark ? 'hsl(217.2 91.2% 59.8%)' : 'hsl(221.2 83.2% 53.3%)';
                                return {
                                    type: 'line',
                                    xMin: e.started_at,
                                    xMax: e.started_at,
                                    borderColor: mapBorderColor,
                                    label: {
                                        backgroundColor: '#00000000',
                                        content: text,
                                        display: true,
                                        rotation: 270,
                                        color: mapLabelColor,
                                        position: 'start',
                                        xAdjust: 10,
                                    }
                                };
                            }))
                            .catch(() => [])
                    );
                } else {
                    promises.push(Promise.resolve([]));
                }

                const [playerCounts, joinCounts, leaveCounts, mapAnnotations] = await Promise.all(promises);
                if (!signal.aborted) {
                    dispatch({
                        type: ActionGraph.LOAD_SUCCESS,
                        payload: { playerCounts, joinCounts, leaveCounts, mapAnnotations }
                    });
                }
            } catch (error) {
                if (!signal.aborted) {
                    console.error('Failed to fetch graph data:', error);
                    dispatch({ type: ActionGraph.LOAD_ERROR });
                }
            }
        };

        // @ts-ignore
        fetchData().then(() => {}).catch(console.error);

        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, [start, end, server_id]);

    const handleZoomChange = useCallback((xScale: any) => {
        const newStart = dayjs(xScale.min);
        const newEnd = dayjs(xScale.max);

        // Debounce zoom updates
        clearTimeout(zoomTimeoutRef.current);
        zoomTimeoutRef.current = setTimeout(() => {
            setDates(newStart, newEnd, DateSources.ZOOM);
        }, 500);
    }, [setDates]);

    const zoomComplete = useCallback(({ chart }) => {
        handleZoomChange(chart.scales.x);
    }, [handleZoomChange]);

    // chartjs-plugin-zoom has no maxRange limit (only minRange), so cap
    // zoom-out manually. Pan is unaffected: this only runs on zoom steps.
    const clampZoomOut = useCallback(({ chart }) => {
        const { min, max } = chart.scales.x;
        if (max - min > MAX_ZOOM_OUT_MS) {
            const center = (min + max) / 2;
            chart.zoomScale('x', {
                min: center - MAX_ZOOM_OUT_MS / 2,
                max: center + MAX_ZOOM_OUT_MS / 2
            }, 'none');
        }
    }, []);

    // Update annotations
    useEffect(() => {
        if (!start.isBefore(end) || end.diff(start, "day") > 6) {
            annotationRef.current.annotations = state.data.mapAnnotations;
        } else {
            annotationRef.current.annotations = [...generateAnnotations(start, end), ...state.data.mapAnnotations];
        }
        chartRef.current?.update()
    }, [start, end, state.data.mapAnnotations]);

    const options = useMemo(() => ({
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        tooltip: {
            position: 'nearest',
            backgroundColor: isDark ? 'rgba(50, 50, 50, 0.95)' : 'rgba(255, 255, 255, 0.95)',
            titleColor: isDark ? 'hsl(210 40% 98%)' : 'hsl(222.2 47.4% 11.2%)',
            bodyColor: isDark ? 'hsl(210 40% 98%)' : 'hsl(222.2 47.4% 11.2%)',
            borderColor: isDark ? 'hsl(217.2 32.6% 17.5%)' : 'hsl(214.3 31.8% 91.4%)',
            borderWidth: 1,
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
                    color: isDark ? 'hsl(215 20.2% 65.1%)' : 'hsl(215.4 16.3% 46.9%)',
                },
                title: {
                    text: "Time",
                    display: true,
                    color: isDark ? 'hsl(215 20.2% 65.1%)' : 'hsl(215.4 16.3% 46.9%)',
                },
                grid: {
                    color: isDark ? 'hsl(217.2 32.6% 17.5%)' : 'hsl(214.3 31.8% 91.4%)',
                }
            },
            y: {
                min: 0,
                max: state.maxPlayers,
                ticks: {
                    color: isDark ? 'hsl(215 20.2% 65.1%)' : 'hsl(215.4 16.3% 46.9%)',
                },
                grid: {
                    display: true,
                    color: isDark ? 'hsl(217.2 32.6% 17.5%)' : 'hsl(214.3 31.8% 91.4%)',
                }
            }
        },
        plugins: {
            annotation: annotationRef.current,
            legend: {
                position: 'top',
                labels: {
                    color: isDark ? 'hsl(210 40% 98%)' : 'hsl(222.2 47.4% 11.2%)',
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
    }), [zoomComplete, clampZoomOut, annotationRef, state.maxPlayers, isDark])

    const datasets = [...customDataSet]

    if (showFlags.join) {
        datasets.push({
            type: 'bar',
            label: 'Join Count',
            data: state.data.joinCounts,
            borderColor: isDark ? 'hsl(142.1 76.2% 36.3%)' : 'hsl(142.1 70.6% 45.3%)',
            backgroundColor: isDark ? 'hsla(142.1 76.2% 36.3% / 0.6)' : 'hsla(142.1 70.6% 45.3% / 0.6)',
            fill: true,
            order: 3
        });
    }

    if (showFlags.leave) {
        datasets.push({
            type: 'bar',
            label: 'Leave Count',
            data: state.data.leaveCounts,
            borderColor: isDark ? 'hsl(0 84.2% 60.2%)' : 'hsl(0 72.2% 50.6%)',
            backgroundColor: isDark ? 'hsla(0 84.2% 60.2% / 0.6)' : 'hsla(0 72.2% 50.6% / 0.6)',
            fill: true,
            order: 2
        });
    }

    const primaryColor = isDark? 'oklch(0.488 0.2 330)': 'oklch(0.646 0.1 330)' // --chart-1
    const primaryColorAlpha = isDark? 'oklch(0.488 0.2 330 / .35)': 'oklch(0.646 0.1 330 / .35)'
    datasets.push(
        {
            type: 'line',
            label: 'Player Count',
            data: state.data.playerCounts,
            borderColor: primaryColor,
            backgroundColor: primaryColorAlpha,
            pointRadius: 0,
            tension: .2,
            fill: true,
            order: 1,
        }
    )

    // Generate SEO summary and table
    const summary = useMemo(() => {
        if (!state.data.playerCounts || state.data.playerCounts.length === 0) {
            return "No server data available.";
        }

        const data = state.data.playerCounts.map(d => ({
            label: d.x,
            value: d.y
        }));
        const stats = calculateTimeSeriesStats(data);
        const dateRange = formatDateRange(state.data.playerCounts[0].x, state.data.playerCounts[state.data.playerCounts.length - 1].x);

        return `Server player count from ${dateRange}. Peak: ${formatNumber(stats.max)} players, ` +
            `Average: ${formatNumber(stats.avg, 1)} players, Lowest: ${formatNumber(stats.min)} players. ` +
            `Data over ${formatNumber(stats.count)} intervals.`;
    }, [state.data.playerCounts]);

    const seoTable = useMemo(() => {
        if (!state.data.playerCounts || state.data.playerCounts.length === 0) {
            return null;
        }

        const limitedData = state.data.playerCounts.slice(0, 20);
        const rows = limitedData.map(d => {
            const joins = state.data.joinCounts.find(j => j.x === d.x);
            const leaves = state.data.leaveCounts.find(l => l.x === d.x);

            return {
                Time: dayjs(d.x).format('MMM D, YYYY HH:mm'),
                'Player Count': formatNumber(d.y),
                Joins: joins ? formatNumber(joins.y) : '0',
                Leaves: leaves ? formatNumber(leaves.y) : '0'
            };
        });

        return generateSeoTable(
            ['Time', 'Player Count', 'Joins', 'Leaves'],
            rows,
            'Server player counts over time (first 20 data points)'
        );
    }, [state.data.playerCounts, state.data.joinCounts, state.data.leaveCounts]);

    // @ts-ignore
    const ChartValue = <Chart ref={chartRef} data={{ datasets }} options={options} />
    return (
        <>
            {showFlags.toolbar && <GraphToolbar setShowPlayersAction={setShowPlayers} />}
            <div className="chart-wrapper">
                <ScreenReaderOnly id="server-graph-summary">
                    {summary}
                </ScreenReaderOnly>

                <div
                    className='chart-container'
                    role="img"
                    aria-label="Server player count over time"
                    aria-describedby="server-graph-summary"
                >
                    {ChartValue}
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

export default function ServerGraph(props: ServerGraphProps) {
    return (
        <ErrorCatch message="Couldn't load server graph.">
            <ServerGraphDisplay {...props} />
        </ErrorCatch>
    );
}