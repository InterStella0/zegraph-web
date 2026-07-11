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
import CommunityMultiSelect from './CommunityMultiSelect';
import {COMMUNITY_COLORS, fetchCommunityPopulation} from './homeData';
import {useTranslations} from 'next-intl';

const MAX_SELECTED_COMMUNITIES = 8;

ChartJS.register(LinearScale, PointElement, LineElement, TimeScale, Tooltip, Legend, Filler, zoomPlugin);

const TIME_OPTIONS: {labelKey: string, value: PopulationTimeType}[] = [
    {labelKey: 'interval10Min', value: 'TenMinutes'},
    {labelKey: 'interval1Hour', value: 'OneHour'},
    {labelKey: 'interval1Day', value: 'OneDay'},
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
    const t = useTranslations('home');
    const communityData = useServerMap();
    const {resolvedTheme} = useTheme();
    const isDark = resolvedTheme === 'dark';

    const communities = communityData?.communities ?? [];

    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const didInitSelection = useRef(false);
    useEffect(() => {
        if (didInitSelection.current || communities.length === 0) return;
        didInitSelection.current = true;
        setSelectedIds(communities.slice(0, 5).map(c => c.id));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [communities]);

    const selectedCommunities = useMemo(() => {
        return selectedIds
            .map((id, i) => {
                const community = communities.find(c => c.id === id);
                if (!community) return null;
                return {id, name: community.name, color: COMMUNITY_COLORS[i % COMMUNITY_COLORS.length]};
            })
            .filter((c): c is {id: string, name: string, color: string} => c !== null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedIds, communities]);

    const [timeType, setTimeType] = useState<PopulationTimeType>('OneHour');
    const [cursor, setCursor] = useState(() => dayjs());
    const [lines, setLines] = useState<Line[]>([]);
    const [loading, setLoading] = useState(true);
    const panTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (selectedCommunities.length === 0) {
            setLines([]);
            setLoading(false);
            return;
        }
        const controller = new AbortController();
        setLoading(true);
        const time = cursor.toJSON();
        const results: (Line | null)[] = new Array(selectedCommunities.length).fill(null);
        let remaining = selectedCommunities.length;
        let flushTimer: ReturnType<typeof setTimeout> | null = null;
        const flush = () => {
            flushTimer = null;
            setLines(results.filter((l): l is Line => l !== null));
        };
        selectedCommunities.forEach((c, i) => {
            fetchCommunityPopulation(c.id, timeType, time, controller.signal).then(data => {
                if (controller.signal.aborted) return;
                results[i] = {
                    id: c.id,
                    name: c.name,
                    color: c.color,
                    points: data.map(d => ({x: d.bucket_time, y: d.player_count})),
                };
                if (flushTimer) clearTimeout(flushTimer);
                if (--remaining === 0) {
                    flush(); // last one in: no point waiting
                    setLoading(false);
                } else {
                    flushTimer = setTimeout(flush, 500);
                }
            });
        });
        return () => {
            controller.abort();
            if (flushTimer) clearTimeout(flushTimer);
        };
    }, [selectedCommunities, timeType, cursor]);

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
        setCursor(dayjs());
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
                        <h2 className="text-base sm:text-lg font-semibold">{t('uniquePlayersByCommunity')}</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            {t('selectedCombined', {count: selectedCommunities.length})}
                        </p>
                    </div>
                    <div className="flex flex-row flex-wrap items-center justify-end gap-2">
                        <CommunityMultiSelect
                            communities={communities}
                            selectedIds={selectedIds}
                            onChange={setSelectedIds}
                            maxSelected={MAX_SELECTED_COMMUNITIES}
                        />
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
                                    {t(opt.labelKey)}
                                </button>
                            ))}
                        </div>
                        <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={onToggleExpand}
                            title={isExpanded ? t('collapse') : t('expand')}
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

                <div className={`relative flex-1 ${isExpanded? "min-h-[400px]": "min-h-[240px]"}`}>
                    {!loading && !hasData && (
                        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground text-center px-4">
                            {t('noPopulationData')}
                        </div>
                    )}
                    {(hasData || loading) && <LazyLineChart data={data} options={options} />}
                </div>
            </CardContent>
        </Card>
    );
}
