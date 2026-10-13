'use client';
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
import {use, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useChartTheme} from "lib/chartTheme";
import {LazyLineChart} from 'components/graphs/LazyCharts';
import {Button} from 'components/ui/button';
import {Card, CardContent} from 'components/ui/card';
import {useServerMap} from 'components/ui/ServerProvider';
import {PopulationTimeType} from 'types/home';
import CommunityMultiSelect from './CommunityMultiSelect';
import {
    fetchAllCommunityPopulation,
    fetchCommunityPopulation,
    INITIAL_POPULATION_TIME_TYPE,
    INITIAL_SELECTED_COMMUNITIES,
    PopulationSeed,
} from './homeData';
import {useCommunityColors} from 'lib/hooks/useCommunityColors';
import {useTranslations} from 'next-intl';

const MAX_SELECTED_COMMUNITIES = 8;
// Synthetic to encompasses all communities
const ALL_COMMUNITY_ID = 'all';

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

type Line = {id: string, name: string, points: {x: string, y: number}[]};

type Props = {
    isExpanded: boolean;
    onToggleExpand: () => void;
    populationPromise: Promise<PopulationSeed | null>;
};

export default function PopulationChart({isExpanded, onToggleExpand, populationPromise}: Props) {
    const t = useTranslations('home');
    const communityData = useServerMap();
    const theme = useChartTheme();
    const seed = use(populationPromise);

    const communities = communityData?.communities ?? [];

    const [selectedIds, setSelectedIds] = useState<string[]>(() => seed?.lines.map(l => l.id) ?? []);
    const didInitSelection = useRef(seed !== null);
    useEffect(() => {
        if (didInitSelection.current || communities.length === 0) return;
        didInitSelection.current = true;
        setSelectedIds(communities.slice(0, INITIAL_SELECTED_COMMUNITIES).map(c => c.id));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [communities]);

    // The synthetic "all" entry leads the picker, ahead of the real communities.
    const selectableCommunities = useMemo(
        () => [{id: ALL_COMMUNITY_ID, name: t('allCommunities')}, ...communities],
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [communities, t],
    );

    // Deliberately free of color: this memo is a dependency of the population fetch effect
    // below, so letting an async color resolution change it would refetch every series.
    const selectedCommunities = useMemo(() => {
        return selectedIds
            .map(id => {
                if (id === ALL_COMMUNITY_ID) return {id, name: t('allCommunities'), icon_url: null};
                const community = communities.find(c => c.id === id);
                if (!community) return null;
                return {id, name: community.name, icon_url: community.icon_url};
            })
            .filter((c): c is {id: string, name: string, icon_url: string | null} => c !== null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedIds, communities]);

    const colors = useCommunityColors(selectedCommunities.map(c => ({
        key: c.id,
        name: c.id === ALL_COMMUNITY_ID ? ALL_COMMUNITY_ID : c.name,
        icon_url: c.icon_url,
    })));

    const [timeType, setTimeType] = useState<PopulationTimeType>(INITIAL_POPULATION_TIME_TYPE);
    const [cursor, setCursor] = useState(() => seed ? dayjs(seed.time) : dayjs());
    const [lines, setLines] = useState<Line[]>(() => seed?.lines.map(l => ({
        ...l,
        name: communities.find(c => c.id === l.id)?.name ?? l.id,
    })) ?? []);
    const [loading, setLoading] = useState(seed === null);
    const panTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isFirstRun = useRef(seed !== null);

    useEffect(() => {
        if (isFirstRun.current) {
            isFirstRun.current = false;
            return;
        }
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
            const request = c.id === ALL_COMMUNITY_ID
                ? fetchAllCommunityPopulation(timeType, time, controller.signal)
                : fetchCommunityPopulation(c.id, timeType, time, controller.signal);
            request.then(data => {
                if (controller.signal.aborted) return;
                results[i] = {
                    id: c.id,
                    name: c.name,
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
                ticks: {autoSkip: true, autoSkipPadding: 40, maxRotation: 0, color: theme.muted},
                grid: {display: false},
            },
            y: {
                min: 0,
                ticks: {color: theme.muted, precision: 0},
                grid: {color: theme.border},
            },
        },
        plugins: {
            legend: {display: false},
            tooltip: theme.tooltip,
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
    }), [theme, handlePanComplete, handleZoomComplete, cursor, timeType]);

    const data = useMemo(() => ({
        datasets: lines.map(l => ({
            label: l.name,
            data: l.points,
            borderColor: colors[l.id],
            backgroundColor: colors[l.id],
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.35,
            fill: false,
        })),
    }), [lines, colors]);

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
                            communities={selectableCommunities}
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

                <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3 min-h-4">
                    {lines.map(l => (
                        <div key={l.id} className="flex flex-row items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full" style={{backgroundColor: colors[l.id]}} />
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
                    {(hasData || loading) && (
                        <LazyLineChart
                            data={data}
                            // @ts-ignore dynamic() collapses the chart generics; option literals widen to string
                            options={options}
                        />
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
