'use client';
import dayjs from "lib/dayjs";
import {Maximize2, Minimize2} from 'lucide-react';
import {use, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useChartTheme} from "lib/chartTheme";
import {LazyLineChart} from 'components/graphs/LazyCharts';
import {Button} from 'components/ui/button';
import {Card, CardContent} from 'components/ui/card';
import {Tabs, TabsList, TabsTrigger} from 'components/ui/tabs';
import {useServerMap} from 'components/ui/ServerProvider';
import {PopulationTimeType} from 'types/home';
import CommunityMultiSelect from './CommunityMultiSelect';
import {
    fetchCommunityPopulation,
    ALL_COMMUNITY_ID,
    initialSelection,
    INITIAL_POPULATION_TIME_TYPE,
    PopulationMetric,
    PopulationPoint,
    PopulationSeed,
} from './homeData';
import {useCommunityColors} from 'lib/hooks/useCommunityColors';
import {useTranslations} from 'next-intl';

const MAX_SELECTED_COMMUNITIES = 8;

const INTERVALS: Record<PopulationTimeType, {labelKey: string, minutes: number}> = {
    TenMinutes: {labelKey: 'interval10Min', minutes: 10},
    OneHour: {labelKey: 'interval1Hour', minutes: 60},
    OneDay: {labelKey: 'interval1Day', minutes: 60 * 24},
};
const METRICS: Record<PopulationMetric, string> = {
    unique: 'uniquePlayers',
    concurrent: 'concurrentPlayers',
};
const BUCKET_COUNT = 32;
const intervalMs = (timeType: PopulationTimeType) => INTERVALS[timeType].minutes * 60_000;
const windowMs = (timeType: PopulationTimeType) => BUCKET_COUNT * intervalMs(timeType);

type Line = {id: string, name: string, points: PopulationPoint[]};

export type PopulationChartProps = {
    isExpanded: boolean;
    onToggleExpand: () => void;
    populationPromise: Promise<PopulationSeed | null>;
};

export default function PopulationChart({isExpanded, onToggleExpand, populationPromise}: PopulationChartProps) {
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
        setSelectedIds(initialSelection(communities));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [communities]);

    const selectableCommunities = [{id: ALL_COMMUNITY_ID, name: t('allCommunities')}, ...communities];

    // Memoised: the population fetch effect below depends on this list.
    const selectedCommunities = useMemo(() => selectedIds
        .map(id => id === ALL_COMMUNITY_ID
            ? {id, name: t('allCommunities'), icon_url: null}
            : communities.find(c => c.id === id))
        .filter(Boolean),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [selectedIds, communities]);

    const colors = useCommunityColors(selectedCommunities.map(c => ({
        key: c.id,
        name: c.id === ALL_COMMUNITY_ID ? ALL_COMMUNITY_ID : c.name,
        icon_url: c.icon_url,
    })));

    // The server-rendered seed is the unique series, so the chart opens on that tab.
    const [metric, setMetric] = useState<PopulationMetric>('unique');
    const [timeType, setTimeType] = useState<PopulationTimeType>(INITIAL_POPULATION_TIME_TYPE);
    const [cursor, setCursor] = useState(() => seed ? dayjs(seed.time) : dayjs());
    const [lines, setLines] = useState<Line[]>(() => seed?.lines.map(l => ({
        ...l,
        name: l.id === ALL_COMMUNITY_ID ? t('allCommunities') : communities.find(c => c.id === l.id)?.name ?? l.id,
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
        const results: Line[] = [];
        let remaining = selectedCommunities.length;
        let flushTimer: ReturnType<typeof setTimeout> | null = null;
        const flush = () => {
            flushTimer = null;
            setLines(results.filter(Boolean));
        };
        selectedCommunities.forEach((c, i) => {
            fetchCommunityPopulation(c.id, timeType, time, controller.signal, metric).then(points => {
                if (controller.signal.aborted) return;
                results[i] = {id: c.id, name: c.name, points};
                if (flushTimer) clearTimeout(flushTimer);
                if (--remaining === 0) {
                    flush();
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
    }, [selectedCommunities, timeType, cursor, metric]);

    const handlePanComplete = useCallback(({chart}: {chart: {scales: {x: {max: number}}}}) => {
        const edge = chart.scales.x.max;
        if (panTimeout.current) clearTimeout(panTimeout.current);
        panTimeout.current = setTimeout(() => {
            const now = dayjs();
            setCursor(dayjs(edge).isAfter(now) ? now : dayjs(edge));
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
                limits: {x: {minRange: intervalMs(timeType) * 2}},
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
                        <Tabs value={metric} onValueChange={value => setMetric(value as PopulationMetric)}>
                            <TabsList>
                                {Object.entries(METRICS).map(([value, labelKey]) => (
                                    <TabsTrigger key={value} value={value} className="px-2.5">
                                        {t(labelKey)}
                                    </TabsTrigger>
                                ))}
                            </TabsList>
                        </Tabs>
                        <p className="text-xs text-muted-foreground mt-1.5">
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
                            {Object.entries(INTERVALS).map(([value, {labelKey}]) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => selectTimeType(value as PopulationTimeType)}
                                    className={`px-2.5 py-1 rounded transition-colors ${
                                        timeType === value
                                            ? 'bg-primary text-primary-foreground'
                                            : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    {t(labelKey)}
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
                    {hasData || loading ? (
                        <LazyLineChart
                            data={data}
                            // @ts-ignore dynamic() collapses the chart generics; option literals widen to string
                            options={options}
                        />
                    ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground text-center px-4">
                            {t('noPopulationData')}
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
