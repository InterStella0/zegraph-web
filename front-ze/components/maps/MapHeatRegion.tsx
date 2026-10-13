'use client'
import {BarController, BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, TimeScale, Title, Tooltip as TooltipChart} from 'chart.js';
import { MatrixController, MatrixElement } from 'chartjs-chart-matrix';
import {LazyBarChart, LazyMatrixChart} from "components/graphs/LazyCharts";
import {color} from "chart.js/helpers";
import {Suspense, use, useEffect, useMemo, useRef, useState} from "react";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { Info, AlertTriangle } from "lucide-react";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { Skeleton } from "../ui/skeleton";
import {fetchServerUrl, formatHours, formatNumber, REGION_COLORS, StillCalculate} from "utils/generalUtils.ts";
import ErrorCatch from "../ui/ErrorMessage.tsx";
import {EmptyMapContext, useMapContext} from "../../app/servers/[server_slug]/maps/[map_name]/MapContext";
import {isShortPeriod, PeriodChip, rangeDays, splitRange, usePeriod} from "components/period/Period";
import {useServerData} from "../../app/servers/[server_slug]/ServerDataProvider";
import {useNotReadyRetry} from "lib/hooks/useNotReadyRetry";
import 'chartjs-adapter-dayjs-4/dist/chartjs-adapter-dayjs-4.esm';
import {DailyMapRegion, MapRegion} from "types/maps.ts";
import { ScreenReaderOnly } from "components/ui/ScreenReaderOnly";
import {useTranslations, useLocale} from 'next-intl';
import useWeekdayLabels from "lib/hooks/useWeekdayLabels";

dayjs.extend(utc);

ChartJS.register(MatrixController, MatrixElement,
    TimeScale, TooltipChart, CategoryScale, LinearScale, Title, MatrixController, BarController, BarElement, Legend);

type HeatRegionData = {
    x: string,
    y: string,
    d: string,
    v: DailyMapRegion,
}

function toHeatRegionData(resp: DailyMapRegion[]): HeatRegionData[] {
    return resp.map(e => {
        const dt = dayjs.utc(e.date)
        const iso = dt.format("YYYY-MM-DD")
        return {
            x: iso,
            y: dt.locale('en').format('ddd'),
            d: iso,
            v: e
        }
    })
}

type MapHeatRegionProps = { initialDataPromise?: Promise<DailyMapRegion[] | null> }

function MapHeatRegionDisplay({ initialDataPromise }: MapHeatRegionProps){
    const t = useTranslations('maps.heatRegion');
    const tRegion = useTranslations('maps.regionDistribution');
    const locale = useLocale();
    const { name } = useMapContext()
    const { period } = usePeriod()
    const initialData = initialDataPromise ? use(initialDataPromise) : null
    const [ loading, setLoading ] = useState<boolean>(initialData === null)
    const [ regions, setRegions ] = useState<HeatRegionData[]>(() => initialData ? toHeatRegionData(initialData) : [])
    const isFirstRun = useRef(initialData !== null)
    const [ error, setError ] = useState<Error | null>(null)
    const notReady = error && error instanceof StillCalculate
    const {server} = useServerData()
    const server_id = server.id
    const [retryTick, setRetryTick] = useState(0)
    useNotReadyRetry(!!notReady, () => setRetryTick(t => t + 1))

    useEffect(() => {
        if (isFirstRun.current) {
            isFirstRun.current = false
            return
        }
        if (!name) return
        setLoading(true)
        setError(null)
        setRegions([])
        fetchServerUrl(server_id, `/maps/${name}/heat-regions`, period ? { params: { period } } : {})
            .then(toHeatRegionData)
            .then(setRegions)
            .catch(setError)
            .finally(() => setLoading(false))
    }, [server_id, name, period, retryTick]);

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

    const isShort = !!period && isShortPeriod(period)
    const range = period ? splitRange(period) : null
    const isRange = !!range
    const weeks = range ? Math.ceil(rangeDays(range) / 7) + 1 : 53

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
                return (a.right - a.left) / weeks - 1;
            },
            height(c: any) {
                const a = c.chart.chartArea;
                return (a.bottom - a.top) / 7 - 1;
            }
        }]
    }), [regions, weeks])

    const barData = useMemo(() => {
        const days = [...regions].sort((a, b) => a.d.localeCompare(b.d))
        const names = new Set(days.flatMap(r => r.v.regions.map(e => e.region_name)))
        const ordered = [
            ...Object.keys(REGION_COLORS).filter(n => names.has(n)),
            ...[...names].filter(n => !(n in REGION_COLORS)),
        ]
        return {
            labels: days.map(r => r.d),
            datasets: ordered.map(region => {
                const base = color((REGION_COLORS as Record<string, string>)[region] ?? 'grey')
                return {
                    label: region,
                    data: days.map(r =>
                        (r.v.regions.find(e => e.region_name === region)?.total_play_duration ?? 0) / 3600
                    ),
                    backgroundColor: base.alpha(0.7).rgbString(),
                    borderColor: base.alpha(1).rgbString(),
                    borderWidth: 1,
                }
            }),
        }
    }, [regions])

    const barOptions = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: {
                stacked: true,
                ticks: {
                    color: colors.textColor,
                    maxRotation: 0,
                    callback(this: any, value: any) {
                        return dayjs.utc(this.getLabelForValue(value)).format(isRange ? 'D MMM' : 'D');
                    }
                },
                grid: {
                    display: false
                }
            },
            y: {
                stacked: true,
                beginAtZero: true,
                title: {
                    display: true,
                    text: tRegion('hours'),
                    color: colors.textColor
                },
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
                borderWidth: 1,
                callbacks: {
                    title(items: any[]) {
                        return items[0] ? dayjs.utc(items[0].label).locale(locale).format('ddd, D MMM YYYY') : '';
                    },
                    label(context: any) {
                        return `${context.dataset.label}: ${(context.parsed.y * 60).toFixed(2)}mins`;
                    }
                }
            }
        }
    }), [colors, locale, tRegion, isRange])

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

    const ChartDisplay = !loading && regions.length > 0 && (isShort
        // @ts-ignore
        ? <div className="w-full h-[260px]"><LazyBarChart data={barData} options={barOptions} /></div>
        // @ts-ignore
        : <LazyMatrixChart data={data} options={options} width="1000px" />)
    return (
        <div className="p-4">
            <div className="flex justify-between">
                <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-primary">
                        {t('title')}
                    </h2>
                    <PeriodChip />
                </div>
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
                {loading && <Skeleton className={isShort ? "w-full h-[260px]" : "w-full h-[150px]"} />}
            </div>
        </div>
    )
}
export default function MapHeatRegion({ initialDataPromise }: MapHeatRegionProps){
    const t = useTranslations('maps.heatRegion');
    return <ErrorCatch message={t('loadError')}>
        <Suspense fallback={<EmptyMapContext><MapHeatRegionDisplay /></EmptyMapContext>}>
            <MapHeatRegionDisplay initialDataPromise={initialDataPromise} />
        </Suspense>
    </ErrorCatch>
}