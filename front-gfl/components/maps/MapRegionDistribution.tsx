'use client'
import { useEffect, useMemo, useState} from "react";
import dayjs from "dayjs";
import {LazyBarChart} from "components/graphs/LazyCharts";
import {BarController, BarElement, Chart as ChartJS, Legend, Tooltip} from "chart.js";
import { Alert, AlertDescription } from "../ui/alert";
import { Skeleton } from "../ui/skeleton";
import { Table, TableBody, TableCell, TableRow } from "../ui/table";
import {fetchServerUrl, fetchUrl, REGION_COLORS, StillCalculate} from "utils/generalUtils.ts";
import ErrorCatch from "../ui/ErrorMessage.tsx";
import {useMapContext} from "../../app/servers/[server_slug]/maps/[map_name]/MapContext";
import {useServerData} from "../../app/servers/[server_slug]/ServerDataProvider";
import {MapRegion} from "types/maps.ts";
import {Region} from "types/players.ts";
import { ScreenReaderOnly } from "components/ui/ScreenReaderOnly";
import { summarizeRegionData } from "utils/chartSeoUtils.tsx";

ChartJS.register(
    BarElement,
    BarController,
    Tooltip,
    Legend
)


function RegionDistribution() {
    const { name } = useMapContext();
    const [detail, setDetail] = useState<MapRegion[] | null>(null);
    const [ regions, setRegions ] = useState<Region[]>([])
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const { server } = useServerData()
    const server_id = server.id

    useEffect(() => {
        setLoading(true);
        setError(null);
        setDetail(null)

        fetchServerUrl(server_id, `/maps/${name}/regions`)
            .then(data => {
                setDetail(data)
            })
            .catch(err => {
                if (!(err instanceof StillCalculate)){
                    console.error('Error fetching region data:', err);
                }

                setError(err.message || 'Failed to load region data');
            })
            .finally(() => setLoading(false))
        fetchUrl(`/graph/${server_id}/get_regions`)
            .then(setRegions)
    }, [server_id, name]);

    // Get theme-aware colors
    const getChartColors = () => {
        if (typeof window === 'undefined') return {
            textColor: 'hsl(222.2 47.4% 11.2%)',
            gridColor: 'hsla(214.3, 31.8%, 91.4%, 0.3)',
            tooltipBg: 'hsl(222.2 47.4% 11.2%)'
        };

        const isDark = document.documentElement.classList.contains('dark');
        return {
            textColor: isDark ? 'hsl(210, 40%, 98%)' : 'hsl(222.2, 47.4%, 11.2%)',
            gridColor: isDark ? 'hsla(217.2, 32.6%, 17.5%, 0.3)' : 'hsla(214.3, 31.8%, 91.4%, 0.3)',
            tooltipBg: isDark ? 'hsl(222.2, 84%, 4.9%)' : 'hsl(0, 0%, 100%)'
        };
    };

    const colors = getChartColors();

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
                    text: 'Hours',
                    color: colors.textColor
                },
                ticks: {
                    beginAtZero: true,
                    color: colors.textColor
                },
                grid: {
                    color: colors.gridColor
                },
                max: detail?.reduce((a, e) => a + e.total_play_duration / 60 / 60, 0)
            },
            y: {
                stacked: true,
                ticks: {
                    color: colors.textColor
                },
                grid: {
                    color: colors.gridColor
                }
            }
        },
        plugins: {
            legend: {
                position: 'bottom',
                labels: {
                    color: colors.textColor
                }
            },
            tooltip: {
                backgroundColor: colors.tooltipBg,
                titleColor: colors.textColor,
                bodyColor: colors.textColor,
                borderColor: colors.gridColor,
                borderWidth: 1
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
            return "No regional distribution data available.";
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
                Overall Distribution
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
                        aria-label="Regional playtime distribution"
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
                                <p className="text-muted-foreground">No region data available</p>
                            </div>
                        )}
                    </div>
                </div>
                <div className="md:col-span-3">
                    <div className="m-4 border-l border-border pl-4 w-full">
                        <h3 className="text-sm text-muted-foreground font-bold mb-3">REGIONS</h3>
                        <div className="max-h-[140px] overflow-y-auto">
                            <Table>
                                <TableBody>
                                    {regions.map(region => {
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

export default function MapRegionDistribution(){
    return <ErrorCatch message="Region distribution cannot be load.">
        <RegionDistribution />
    </ErrorCatch>
}