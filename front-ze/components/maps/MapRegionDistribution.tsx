'use client'
import {useLocalDayjs} from "lib/hooks/useLocalDayjs";
import {LazyBarChart} from "components/graphs/LazyCharts";
import { Alert, AlertDescription } from "../ui/alert";
import { Skeleton, SkeletonText } from "../ui/skeleton";
import { Table, TableBody, TableCell, TableRow } from "../ui/table";
import {fetchUrl, range, REGION_COLORS} from "utils/generalUtils.ts";
import {useMapContext} from "../../app/servers/[server_slug]/maps/[map_name]/MapContext";
import {useServerData} from "../../app/servers/[server_slug]/ServerDataProvider";
import {useResource} from "lib/hooks/useResource";
import {useMapResource} from "lib/hooks/useMapScope";
import {MapRegion} from "types/maps.ts";
import {Region} from "types/players.ts";
import { ScreenReaderOnly } from "components/ui/ScreenReaderOnly";
import { summarizeRegionData } from "utils/chartSeoUtils.tsx";
import {useTranslations} from 'next-intl';
import {heatmapTooltip, useChartTheme} from "lib/chartTheme";
import {withMapSuspense} from "components/maps/withMapSuspense";

const regionTime = (time: string) => time.replace("-10000", "2000").replace("-9999", "2000")

type MapRegionDistributionProps = {
    initialDataPromise?: Promise<MapRegion[] | null>,
    regionsPromise?: Promise<Region[] | null>,
}

function RegionDistribution({ initialDataPromise, regionsPromise }: MapRegionDistributionProps) {
    const t = useTranslations('maps.regionDistribution');
    const toDayjs = useLocalDayjs();
    const colors = useChartTheme();
    const { name } = useMapContext();
    const server_id = useServerData().server.id
    const { data: regions } = useResource<Region[]>(() => name
        ? fetchUrl(`/graph/${server_id}/get_regions`).catch(() => [])
        : null, [server_id, name], { seed: regionsPromise, keepData: true })
    const { data: detail, loading, error: fetchError } = useMapResource<MapRegion[]>('/regions', initialDataPromise, {
        errorLog: 'Error fetching region data:',
    })
    const error = fetchError && (fetchError.message || t('loadFailed'))
    const hasData = !loading && !error && detail?.length > 0

    const options: any = {
        maintainAspectRatio: false,
        indexAxis: 'y',
        scales: {
            x: {
                stacked: true,
                title: { display: true, text: t('hours'), color: colors.foreground },
                ticks: { beginAtZero: true, color: colors.foreground },
                grid: { color: colors.faintGrid },
                max: detail?.reduce((a, e) => a + e.total_play_duration / 60 / 60, 0)
            },
            y: {
                stacked: true,
                ticks: { color: colors.foreground },
                grid: { color: colors.faintGrid }
            }
        },
        plugins: {
            legend: { position: 'bottom', labels: { color: colors.foreground } },
            tooltip: heatmapTooltip(colors),
        }
    }

    const chartData = detail?.length ? {
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
    } : { labels: [], datasets: [{ data: [] }] };

    const totalDuration = detail?.reduce((sum, r) => sum + r.total_play_duration, 0);
    const summary = hasData ? summarizeRegionData(detail.map(r => ({
        region: r.region_name,
        hours: r.total_play_duration,
        percentage: (r.total_play_duration / totalDuration) * 100
    }))) : t('noData');

    return (
        <div className="p-6 px-8 rounded-lg">
            <h3 className="text-sm text-muted-foreground font-bold">
                {t('title')}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                <div className="md:col-span-9">
                    {hasData && (
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

                        {!loading && !error && detail && <LazyBarChart data={chartData} options={options} />}

                        {!loading && !error && !detail?.length && (
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
                                    {regions === null && range(4).map(i => (
                                        <TableRow key={i} className="last:border-0">
                                            <TableCell className="w-5 py-1.5 px-1.5">
                                                <Skeleton className="w-3 h-3 rounded-sm" />
                                            </TableCell>
                                            <TableCell className="py-1.5">
                                                <div className="text-sm font-medium">
                                                    <SkeletonText className="h-3.5 w-20" />
                                                </div>
                                                <div className="text-xs">
                                                    <SkeletonText className="h-3 w-28" />
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {regions?.map(region => (
                                        <TableRow key={region.region_id} className="last:border-0">
                                            <TableCell className="w-5 py-1.5 px-1.5">
                                                <div
                                                    className="w-3 h-3 rounded-sm"
                                                    style={{ backgroundColor: REGION_COLORS[region.region_name] }}
                                                />
                                            </TableCell>
                                            <TableCell className="py-1.5">
                                                <p className="text-sm font-medium">{region.region_name}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {toDayjs(regionTime(region.start_time)).format("LT")}<span> - </span>
                                                    {toDayjs(regionTime(region.end_time)).format("LT")}
                                                </p>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default withMapSuspense(RegionDistribution, t => t('maps.regionDistribution.loadError'))
