'use client';
// @ts-nocheck
import {
    Chart as ChartJS,
    Filler,
    Legend,
    LinearScale,
    LineElement,
    PointElement,
    TimeScale,
    Tooltip,
} from 'chart.js';
import 'chartjs-adapter-dayjs-4/dist/chartjs-adapter-dayjs-4.esm';
import zoomPlugin from 'chartjs-plugin-zoom';
import dayjs from 'dayjs';
import {Maximize2, Minimize2} from 'lucide-react';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useTheme} from 'next-themes';
import {LazyLineChart} from 'components/graphs/LazyCharts';
import {Button} from 'components/ui/button';
import {Card, CardContent} from 'components/ui/card';
import {useServerMap} from 'components/ui/ServerProvider';
import {PopulationTimeType} from 'types/home';
import {COMMUNITY_COLORS, fetchCommunityPopulation} from './homeData';

ChartJS.register(LinearScale, PointElement, LineElement, TimeScale, Tooltip, Legend, Filler, zoomPlugin);

const TIME_OPTIONS: {label: string, value: PopulationTimeType}[] = [
    {label: '10 min', value: 'TenMinutes'},
    {label: '1 hour', value: 'OneHour'},
    {label: '1 day', value: 'OneDay'},
];

// The backend returns at most 32 buckets, sized by time_type. So the visible window is
// exactly 32 * interval, and we pin the x-axis to it (ending at the cursor).
const BUCKET_COUNT = 32;
const INTERVAL_MINUTES: Record<PopulationTimeType, number> = {
    TenMinutes: 10,
    OneHour: 60,
    OneDay: 60 * 24,
};

function windowMs(timeType: PopulationTimeType) {
    return BUCKET_COUNT * INTERVAL_MINUTES[timeType] * 60_000;
}

type Line = {id: string, name: string, color: string, points: {x: string, y: number}[]};

type Props = {
    isExpanded: boolean;
    onToggleExpand: () => void;
};

export default function PopulationChart({isExpanded, onToggleExpand}: Props) {
    const communityData = useServerMap();
    const {resolvedTheme} = useTheme();
    const isDark = resolvedTheme === 'dark';

    const topCommunities = useMemo(() => {
        const communities = communityData?.communities ?? [];
        // getCommunity() already sorts by player count desc.
        return communities.slice(0, 5).map((c, i) => ({
            id: c.id,
            name: c.name,
            color: COMMUNITY_COLORS[i % COMMUNITY_COLORS.length],
        }));
    }, [communityData]);

    const [timeType, setTimeType] = useState<PopulationTimeType>('OneHour');
    // `cursor` is the right edge of the visible window. Panning moves it, which refetches.
    const [cursor, setCursor] = useState(() => dayjs());
    const [lines, setLines] = useState<Line[]>([]);
    const [loading, setLoading] = useState(true);
    const panTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (topCommunities.length === 0) {
            setLines([]);
            setLoading(false);
            return;
        }
        const controller = new AbortController();
        setLoading(true);
        const time = cursor.toJSON();
        Promise.all(
            topCommunities.map(c =>
                fetchCommunityPopulation(c.id, timeType, time, controller.signal)
                    .then(data => ({
                        id: c.id,
                        name: c.name,
                        color: c.color,
                        points: data.map(d => ({x: d.bucket_time, y: d.player_count})),
                    })),
            ),
        ).then(result => {
            if (controller.signal.aborted) return;
            setLines(result);
            setLoading(false);
        });
        return () => controller.abort();
    }, [topCommunities, timeType, cursor]);

    // On pan-complete, take the new right edge of the axis as the cursor and refetch
    // (debounced). This is the time lookup: dragging left walks back through history.
    const handlePanComplete = useCallback(({chart}: {chart: {scales: {x: {max: number}}}}) => {
        const edge = chart.scales.x.max;
        if (panTimeout.current) clearTimeout(panTimeout.current);
        panTimeout.current = setTimeout(() => {
            const now = dayjs();
            let next = dayjs(edge);
            if (next.isAfter(now)) next = now; // don't scroll into the future
            setCursor(next);
        }, 400);
    }, []);

    // Allow zooming in on X, but never zoom out past the 32-interval window: if a zoom
    // leaves a range wider than windowMs, snap it back to exactly windowMs.
    const clampGuard = useRef(false);
    const handleZoomComplete = useCallback(({chart}: {chart: any}) => {
        if (clampGuard.current) {
            clampGuard.current = false;
            return;
        }
        const x = chart.scales.x;
        const max = windowMs(timeType);
        if (x.max - x.min > max) {
            clampGuard.current = true;
            chart.zoomScale('x', {min: x.max - max, max: x.max}, 'none');
        }
    }, [timeType]);

    useEffect(() => () => {
        if (panTimeout.current) clearTimeout(panTimeout.current);
    }, []);

    const selectTimeType = (value: PopulationTimeType) => {
        setTimeType(value);
        setCursor(dayjs()); // new granularity → fresh window ending now
    };

    const hasData = lines.some(l => l.points.length > 0);

    const axisColor = isDark ? 'hsl(215 20.2% 65.1%)' : 'hsl(215.4 16.3% 46.9%)';
    const gridColor = isDark ? 'hsl(217.2 32.6% 17.5%)' : 'hsl(214.3 31.8% 91.4%)';

    const options = useMemo(() => ({
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        interaction: {mode: 'index', intersect: false},
        scales: {
            x: {
                type: 'time',
                min: cursor.valueOf() - windowMs(timeType),
                max: cursor.valueOf(),
                time: {
                    displayFormats: {
                        minute: 'h:mm a',
                        hour: 'MMM DD, ha',
                        day: 'MMM DD',
                        week: 'MMM DD',
                        month: 'MMM YYYY',
                    },
                },
                ticks: {autoSkip: true, autoSkipPadding: 40, maxRotation: 0, color: axisColor},
                grid: {display: false},
            },
            y: {
                min: 0,
                ticks: {color: axisColor, precision: 0},
                grid: {color: gridColor},
            },
        },
        plugins: {
            legend: {display: false},
            tooltip: {
                backgroundColor: isDark ? 'rgba(50, 50, 50, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                titleColor: isDark ? 'hsl(210 40% 98%)' : 'hsl(222.2 47.4% 11.2%)',
                bodyColor: isDark ? 'hsl(210 40% 98%)' : 'hsl(222.2 47.4% 11.2%)',
                borderColor: gridColor,
                borderWidth: 1,
            },
            // Horizontal pan (onPanComplete drives the time lookup, see handlePanComplete)
            // + zoom in on X. Zoom-out is capped at the 32-interval window: minRange floors
            // the zoom-in, handleZoomComplete snaps any over-zoom-out back to windowMs.
            zoom: {
                pan: {enabled: true, mode: 'x', onPanComplete: handlePanComplete},
                zoom: {
                    wheel: {enabled: true},
                    pinch: {enabled: true},
                    drag: {enabled: false},
                    mode: 'x',
                    onZoomComplete: handleZoomComplete,
                },
                limits: {
                    x: {minRange: INTERVAL_MINUTES[timeType] * 60_000 * 2},
                },
            },
        },
    }), [axisColor, gridColor, isDark, handlePanComplete, handleZoomComplete, cursor, timeType]);

    const data = useMemo(() => ({
        datasets: lines.map(l => ({
            label: l.name,
            data: l.points,
            borderColor: l.color,
            backgroundColor: l.color,
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.35,
            fill: false,
        })),
    }), [lines]);

    return (
        <Card className="h-full">
            <CardContent className="p-4 sm:p-6 flex flex-col h-full">
                <div className="flex flex-row items-start justify-between gap-2 mb-3">
                    <div>
                        <h2 className="text-base sm:text-lg font-semibold">Unique players by community</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">Top 5 · combined</p>
                    </div>
                    <div className="flex flex-row items-center gap-2">
                        <div className="flex flex-row rounded-md border border-border p-0.5 text-xs">
                            {TIME_OPTIONS.map(opt => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => selectTimeType(opt.value)}
                                    className={`px-2.5 py-1 rounded transition-colors ${
                                        timeType === opt.value
                                            ? 'bg-primary text-primary-foreground'
                                            : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                        <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={onToggleExpand}
                            title={isExpanded ? 'Collapse' : 'Expand'}
                        >
                            {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                        </Button>
                    </div>
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3">
                    {lines.map(l => (
                        <div key={l.id} className="flex flex-row items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full" style={{backgroundColor: l.color}} />
                            <span className="text-xs text-muted-foreground">{l.name}</span>
                        </div>
                    ))}
                </div>

                <div className="relative flex-1 min-h-[240px]">
                    {!loading && !hasData && (
                        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground text-center px-4">
                            No population data available yet.
                        </div>
                    )}
                    {(hasData || loading) && <LazyLineChart data={data} options={options} />}
                </div>
            </CardContent>
        </Card>
    );
}
