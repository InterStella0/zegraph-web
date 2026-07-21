'use client'
import {CategoryScale, Chart as ChartJS, LinearScale, TimeScale, Title, Tooltip as TooltipChart} from 'chart.js';
import { MatrixController, MatrixElement } from 'chartjs-chart-matrix';
import {LazyMatrixChart} from "components/graphs/LazyCharts";
import {color} from "chart.js/helpers";
import { useEffect, useMemo, useState} from "react";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { Info, AlertTriangle } from "lucide-react";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { Skeleton } from "../ui/skeleton";
import {fetchServerUrl, formatHours, formatNumber, REGION_COLORS, StillCalculate} from "utils/generalUtils.ts";
import ErrorCatch from "../ui/ErrorMessage.tsx";
import {useMapContext} from "../../app/servers/[server_slug]/maps/[map_name]/MapContext";
import {useServerData} from "../../app/servers/[server_slug]/ServerDataProvider";
import {useNotReadyRetry} from "lib/hooks/useNotReadyRetry";
import 'chartjs-adapter-dayjs-4/dist/chartjs-adapter-dayjs-4.esm';
import {DailyMapRegion, MapRegion} from "types/maps.ts";
import { ScreenReaderOnly } from "components/ui/ScreenReaderOnly";
import {useTranslations, useLocale} from 'next-intl';
import useWeekdayLabels from "lib/hooks/useWeekdayLabels";

dayjs.extend(utc);

ChartJS.register(MatrixController, MatrixElement,
    TimeScale, TooltipChart, CategoryScale, LinearScale, Title, MatrixController);

type HeatRegionData = {
    x: string,
    y: string,
    d: string,
    v: DailyMapRegion,
}

function MapHeatRegionDisplay(){
    const t = useTranslations('maps.heatRegion');
    const locale = useLocale();
    const { name } = useMapContext()
    const [ loading, setLoading ] = useState<boolean>(true)
    const [ regions, setRegions ] = useState<HeatRegionData[]>([])
    const [ error, setError ] = useState<Error | null>(null)
    const notReady = error && error instanceof StillCalculate
    const {server} = useServerData()
    const server_id = server.id
    const [retryTick, setRetryTick] = useState(0)
    useNotReadyRetry(!!notReady, () => setRetryTick(t => t + 1))

    useEffect(() => {
        setLoading(true)
        setError(null)
        setRegions([])
        fetchServerUrl(server_id, `/maps/${name}/heat-regions`)
            .then((resp: DailyMapRegion[]) => resp.map(e => {
                const dt = dayjs.utc(e.date)
                const iso = dt.format("YYYY-MM-DD")
                return {
                    x: iso,
                    y: dt.locale('en').format('ddd'),
                    d: iso,
                    v: e
                }
            }))
            .then(setRegions)
            .catch(setError)
            .finally(() => setLoading(false))
    }, [server_id, name, retryTick]);

    const getChartColors = () => {
        if (typeof window === 'undefined') return {
            textColor: 'hsl(222.2 47.4% 11.2%)',
            tooltipBg: 'hsl(222.2 47.4% 11.2%)',
            gridColor: 'hsla(214.3, 31.8%, 91.4%, 0.3)'
        };

        const isDark = document.documentElement.classList.contains('dark');
        return {
            textColor: isDark ? 'hsl(210, 40%, 98%)' : 'hsl(222.2, 47.4%, 11.2%)',
            tooltipBg: isDark ? 'hsl(222.2, 84%, 4.9%)' : 'hsl(0, 0%, 100%)',
            gridColor: isDark ? 'hsla(217.2, 32.6%, 17.5%, 0.3)' : 'hsla(214.3, 31.8%, 91.4%, 0.3)'
        };
    };

    const colors = getChartColors();
    const dayNames = useWeekdayLabels();

    const options = useMemo(() => ({
        responsive: false,
        maintainAspectRatio: false,
        plugins: {
            legend: false,
            tooltip: {
                displayColors: false,
                backgroundColor: colors.tooltipBg,
                titleColor: colors.textColor,
                bodyColor: colors.textColor,
                borderColor: colors.gridColor,
                borderWidth: 1,
                callbacks: {
                    title() {
                        return '';
                    },
                    label(context: any) {
                        const v = context.dataset.data[context.dataIndex];
                        return [v.d, ...v.v.regions.map((e: MapRegion) => `${e.region_name}: ${(e.total_play_duration / 60).toFixed(2)}mins`)];
                    }
                }
            },
        },
        scales: {
            y: {
                type: 'category',
                labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                offset: true,
                reverse: false,
                position: 'right',
                ticks: {
                    maxRotation: 0,
                    autoSkip: true,
                    padding: 1,
                    color: colors.textColor,
                    font: {
                        size: 9
                    },
                    callback(this: any, value: any) {
                        const label = this.getLabelForValue(value);
                        return dayNames[label] ?? label;
                    }
                },
                grid: {
                    display: false,
                    drawBorder: false,
                    tickLength: 0
                }
            },
            x: {
                type: 'time',
                position: 'bottom',
                offset: true,
                time: {
                    unit: 'week',
                    round: 'week',
                    isoWeekday: 1,
                    displayFormats: {
                        week: 'MMM YY'
                    }
                },
                ticks: {
                    maxRotation: 0,
                    color: colors.textColor,
                    font: {
                        weight: 'bold',
                        size: 9
                    }
                },
                grid: {
                    display: false,
                    drawBorder: false,
                    tickLength: 5,
                }
            }
        },
        layout: {
            padding: {
                top: 10
            }
        }
    }), [regions, colors, dayNames])

    const data = useMemo(() => ({
        datasets: [{
            type: 'matrix',
            data: regions.map(region => ({
                ...region,
                y: region.y
            })),
            backgroundColor(c: any) {
                const value = c.dataset.data[c.dataIndex].v;
                const valueObj = value.regions
                let hours = valueObj.reduce((a: number, b: MapRegion) => a + b.total_play_duration, 0) / 3600
                const alpha = valueObj.length > 0 ? Math.min(1, Math.max(0.15, (.01 + hours) / 3)) : .01 / 3;
                valueObj.sort((a: MapRegion, b: MapRegion) =>  b.total_play_duration - a.total_play_duration)
                // @ts-ignore
                return color(REGION_COLORS[valueObj[0]?.region_name] ?? 'grey').alpha(alpha).rgbString();
            },
            borderColor(c: any) {
                const value = c.dataset.data[c.dataIndex].v;
                let hours = value.regions.reduce((a: number, b: MapRegion) => a + b.total_play_duration, 0) / 3600
                const alpha = (1 + hours) / 4;
                // @ts-ignore
                return color(REGION_COLORS[value.regions[0]?.region_name] ?? 'grey').alpha(alpha).rgbString();
            },
            borderWidth: 1,
            hoverBorderColor: 'grey',
            width(c: any) {
                const a = c.chart.chartArea;
                return (a.right - a.left) / 53 - 1;
            },
            height(c: any) {
                const a = c.chart.chartArea;
                return (a.bottom - a.top) / 7 - 1;
            }
        }]
    }), [regions])

    // Generate SEO summary
    const summary = useMemo(() => {
        if (!regions || regions.length === 0) {
            return t('noData');
        }

        const dayTotals = new Map<string, number>();
        regions.forEach(r => {
            const current = dayTotals.get(r.y) || 0;
            dayTotals.set(r.y, current + r.v.regions.reduce((p, c) => p + c.total_play_duration, 0));
        });

        const mostActiveDay = Array.from(dayTotals.entries())
            .sort((a, b) => b[1] - a[1])[0];

        // Aggregate by region to find most active region
        const regionTotals = new Map<string, number>();
        regions.forEach(r => {
            for (const region of r.v.regions){
                const current = regionTotals.get(region.region_name) || 0;
                regionTotals.set(region.region_name, current + region.total_play_duration);
            }
        });

        const mostActiveRegion = Array.from(regionTotals.entries())
            .sort((a, b) => b[1] - a[1])[0];

        const uniqueDays = new Set(regions.map(r => r.x)).size;

        return t('summary', {
            days: formatNumber(uniqueDays, 0, locale),
            day: dayNames[mostActiveDay[0]] ?? mostActiveDay[0],
            dayHours: formatHours(mostActiveDay[1], locale),
            region: mostActiveRegion[0],
            regionHours: formatHours(mostActiveRegion[1], locale)
        });
    }, [regions, dayNames]);

    // @ts-ignore
    const ChartDisplay = !loading && regions.length > 0 && <LazyMatrixChart data={data} options={options} width="1000px" />
    return (
        <div className="p-4">
            <div className="flex justify-between">
                <h2 className="text-xl font-bold text-primary">
                    {t('title')}
                </h2>
                <div>
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                    {error ? <AlertTriangle className="h-4 w-4" /> : <Info className="h-4 w-4" />}
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>{error ? (notReady ? t('dataNotReady') : t('somethingWrong')) :
                                    t('tooltip')}</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
            </div>

            {!loading && regions.length > 0 && (
                <ScreenReaderOnly id="heat-region-summary">
                    {summary}
                </ScreenReaderOnly>
            )}

            <div
                className="p-4 flex justify-center md:justify-center sm:justify-end xs:justify-end items-center overflow-auto"
                role="img"
                aria-label={t('ariaLabel')}
                aria-describedby="heat-region-summary"
            >
                {ChartDisplay}
                {loading && <Skeleton className="w-full h-[200px]" />}
            </div>
        </div>
    )
}
export default function MapHeatRegion(){
    const t = useTranslations('maps.heatRegion');
    return <ErrorCatch message={t('loadError')}>
        <MapHeatRegionDisplay />
    </ErrorCatch>
}