'use client'
import {Suspense, use, useMemo, useState} from "react";
import dayjs from "dayjs";
import {LazyBarChart} from "components/graphs/LazyCharts";
import {BarController, BarElement, Chart as ChartJS, Legend, Tooltip} from "chart.js";
import { Alert, AlertDescription } from "../ui/alert";
import { Skeleton } from "../ui/skeleton";
import { Table, TableBody, TableCell, TableRow } from "../ui/table";
import {fetchServerUrl, fetchUrl, REGION_COLORS} from "utils/generalUtils.ts";
import ErrorCatch from "../ui/ErrorMessage.tsx";
import {EmptyMapContext, useMapContext} from "../../app/servers/[server_slug]/maps/[map_name]/MapContext";
import {usePeriod} from "components/period/Period";
import {useServerData} from "../../app/servers/[server_slug]/ServerDataProvider";
import {useResource} from "lib/hooks/useResource";
import {MapRegion} from "types/maps.ts";
import {Region} from "types/players.ts";
import { ScreenReaderOnly } from "components/ui/ScreenReaderOnly";
import { summarizeRegionData } from "utils/chartSeoUtils.tsx";
import {useTranslations} from 'next-intl';
import {heatmapTooltip, useChartTheme} from "lib/chartTheme";

ChartJS.register(
    BarElement,
    BarController,
    Tooltip,
    Legend
)


type MapRegionDistributionProps = {
    initialDataPromise?: Promise<MapRegion[] | null>,
    regionsPromise?: Promise<Region[] | null>,
}

function RegionDistribution({ initialDataPromise, regionsPromise }: MapRegionDistributionProps) {
    const t = useTranslations('maps.regionDistribution');
    const { name } = useMapContext();
    const { period } = usePeriod();
    const initialData = initialDataPromise ? use(initialDataPromise) : null
    const initialRegions = regionsPromise ? use(regionsPromise) : null
    const [ regions, setRegions ] = useState<Region[] | null>(initialRegions)
    const { server } = useServerData()
    const server_id = server.id
    const { data: detail, loading, error: fetchError } = useResource<MapRegion[]>(() => {
        if (!name) return null
        fetchUrl(`/graph/${server_id}/get_regions`)
            .then(setRegions)
            .catch(() => setRegions(r => r ?? []))
        return fetchServerUrl(server_id, `/maps/${name}/regions`, period ? { params: { period } } : {})
    }, [server_id, name, period], {
        initial: initialData ?? undefined,
        skipFirst: initialData !== null && initialRegions !== null,
        retryNotReady: true,
        errorLog: 'Error fetching region data:',
    })
    const error = fetchError && (fetchError.message || t('loadFailed'))

    const colors = useChartTheme();

    // Chart configuration
    const options = {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        scales: {
            x: {
                stacked: true,
                title: {
                    display: true,
                    text: t('hours'),
                    color: colors.foreground
                },
                ticks: {
                    beginAtZero: true,
                    color: colors.foreground
                },
                grid: {
                    color: colors.faintGrid
                },
                max: detail?.reduce((a, e) => a + e.total_play_duration / 60 / 60, 0)
            },
            y: {
                stacked: true,
                ticks: {
                    color: colors.foreground
                },
                grid: {
                    color: colors.faintGrid
                }
            }
        },
        plugins: {
            legend: {
                position: 'bottom',
                labels: {
                    color: colors.foreground
                }
            },
            tooltip: {
                ...heatmapTooltip(colors),
            }
        }
    }

    const prepareChartData = () => {
        if (!detail || detail.length === 0) return { labels: [], datasets: [{ data: [] }] };
        return {
            labels: [''],
            datasets: detail.map(e => ({
                label: e.region_name,
                data: [e.total_play_duration / 60 / 60],
                backgroundColor: REGION_COLORS[e.region_name],
                borderColor: REGION_COLORS[e.region_name],
                borderWidth: 1,
                hoverBackgroundColor: REGION_COLORS[e.region_name],
                hoverBorderWidth: 2
            }))

        };
    };

    const chartData = prepareChartData();

    // Generate SEO summary
    const summary = useMemo(() => {
        if (!detail || detail.length === 0) {
            return t('noData');
        }

        // Transform data to match helper function interface
        const totalDuration = detail.reduce((sum, r) => sum + r.total_play_duration, 0);
        const regionData = detail.map(r => ({
            region: r.region_name,
            hours: r.total_play_duration,
            percentage: (r.total_play_duration / totalDuration) * 100
        }));

        return summarizeRegionData(regionData);
    }, [detail]);

    // @ts-ignore
    const ChartDisplay = !loading && !error && detail && <LazyBarChart data={chartData} options={options} />
    return (
        <div className="p-6 px-8 rounded-lg">
            <h3 className="text-sm text-muted-foreground font-bold">
                {t('title')}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                <div className="md:col-span-9">
                    {!loading && !error && detail && detail.length > 0 && (
                        <ScreenReaderOnly id="region-distribution-summary">
                            {summary}
                        </ScreenReaderOnly>
                    )}

                    <div
                        className="h-[150px] w-full relative"
                        role="img"
                        aria-label={t('title')}
                        aria-describedby="region-distribution-summary"
                    >
                        {loading && (
                            <div className="flex justify-center items-center h-full w-full absolute top-0 left-0">
                                <Skeleton className="w-full h-[50px] rounded" />
                            </div>
                        )}

                        {error && (
                            <div className="mt-4">
                                <Alert variant="destructive">
                                    <AlertDescription>{error}</AlertDescription>
                                </Alert>
                            </div>
                        )}

                        {ChartDisplay}

                        {!loading && !error && (!detail || detail.length === 0) && (
                            <div className="flex justify-center items-center h-full">
                                <p className="text-muted-foreground">{t('noData')}</p>
                            </div>
                        )}
                    </div>
                </div>
                <div className="md:col-span-3">
                    <div className="m-4 border-l border-border pl-4 w-full">
                        <h3 className="text-sm text-muted-foreground font-bold mb-3">{t('regions')}</h3>
                        <div className="max-h-[140px] overflow-y-auto">
                            <Table>
                                <TableBody>
                                    {regions === null && Array.from({length: 4}).map((_, i) => (
                                        <TableRow key={i} className="last:border-0">
                                            <TableCell className="w-5 py-1.5 px-1.5">
                                                <Skeleton className="w-3 h-3 rounded-sm" />
                                            </TableCell>
                                            <TableCell className="py-1.5">
                                                <div className="text-sm font-medium">
                                                    <Skeleton className="inline-block align-middle h-3.5 w-20" />{'\u200b'}
                                                </div>
                                                <div className="text-xs">
                                                    <Skeleton className="inline-block align-middle h-3 w-28" />{'\u200b'}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {regions?.map(region => {
                                        return <TableRow key={region.region_id} className="last:border-0">
                                            <TableCell className="w-5 py-1.5 px-1.5">
                                                <div
                                                    className="w-3 h-3 rounded-sm"
                                                    style={{ backgroundColor: REGION_COLORS[region.region_name] }}
                                                />
                                            </TableCell>
                                            <TableCell className="py-1.5">
                                                <p className="text-sm font-medium">{region.region_name}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {dayjs(region.start_time.replace("-10000", "2000").replace("-9999", "2000")).format("LT")}<span> - </span>
                                                    {dayjs(region.end_time.replace("-10000", "2000").replace("-9999", "2000")).format("LT")}
                                                </p>
                                            </TableCell>
                                        </TableRow>
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function MapRegionDistribution({ initialDataPromise, regionsPromise }: MapRegionDistributionProps){
    const t = useTranslations('maps.regionDistribution');
    return <ErrorCatch message={t('loadError')}>
        <Suspense fallback={<EmptyMapContext><RegionDistribution /></EmptyMapContext>}>
            <RegionDistribution initialDataPromise={initialDataPromise} regionsPromise={regionsPromise} />
        </Suspense>
    </ErrorCatch>
}