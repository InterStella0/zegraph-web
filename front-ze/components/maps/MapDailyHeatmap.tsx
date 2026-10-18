'use client'
import {BarController, BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, TimeScale, Title, Tooltip as TooltipChart} from 'chart.js';
import { MatrixController, MatrixElement } from 'chartjs-chart-matrix';
import {LazyBarChart, LazyMatrixChart} from "components/graphs/LazyCharts";
import {color} from "chart.js/helpers";
import {useMemo} from "react";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { Skeleton } from "../ui/skeleton";
import {isShortPeriod, rangeDays, splitRange, usePeriod} from "components/period/Period";
import 'chartjs-adapter-dayjs-4/dist/chartjs-adapter-dayjs-4.esm';
import {useLocale} from 'next-intl';
import useWeekdayLabels from "lib/hooks/useWeekdayLabels";
import {heatmapTooltip, useChartTheme} from "lib/chartTheme";
import {calendarMatrixDataset, calendarMatrixOptions, weekdayKey} from "lib/calendarHeatmap";

dayjs.extend(utc);

ChartJS.register(MatrixController, MatrixElement,
    TimeScale, TooltipChart, CategoryScale, LinearScale, Title, MatrixController, BarController, BarElement, Legend);

export type HeatSeries = { key: string, label: string, seconds: number }
export type HeatDay = { date: string, series: HeatSeries[] }

type HeatCell = {
    x: string,
    y: string,
    d: string,
    v: HeatSeries[],
    total: number,
}

type MapDailyHeatmapProps = {
    days: HeatDay[],
    loading: boolean,
    colorOf: (key: string | undefined) => string,
    order: string[],
    cellAlpha: (hours: number, hasData: boolean) => [number, number],
    yTitle: string,
    formatValue: (seconds: number) => string,
}

export default function MapDailyHeatmap({ days, loading, colorOf, order, cellAlpha, yTitle, formatValue }: MapDailyHeatmapProps) {
    const locale = useLocale();
    const { period } = usePeriod()
    const colors = useChartTheme();
    const dayNames = useWeekdayLabels();

    const isShort = !!period && isShortPeriod(period)
    const range = period ? splitRange(period) : null
    const isRange = !!range
    const weeks = range ? Math.ceil(rangeDays(range) / 7) + 1 : 53

    const cells = useMemo<HeatCell[]>(() => days.map(day => {
        const dt = dayjs.utc(day.date)
        const iso = dt.format("YYYY-MM-DD")
        const series = [...day.series].sort((a, b) => b.seconds - a.seconds)
        return {
            x: iso,
            y: weekdayKey(dt),
            d: iso,
            v: series,
            total: series.reduce((a, s) => a + s.seconds, 0),
        }
    }), [days])

    const options = useMemo(() => calendarMatrixOptions(colors, dayNames,
        (cell: HeatCell) => [cell.d, ...cell.v.map(s => `${s.label}: ${formatValue(s.seconds)}`)]
    ), [colors, dayNames, formatValue])

    const data = useMemo(() => {
        const cellColor = (border: boolean) => (c: any) => {
            const cell: HeatCell = c.dataset.data[c.dataIndex]
            const [background, borderAlpha] = cellAlpha(cell.total / 3600, cell.v.length > 0)
            return color(colorOf(cell.v[0]?.key)).alpha(border ? borderAlpha : background).rgbString();
        }
        return {datasets: [calendarMatrixDataset(cells, weeks, cellColor(false), cellColor(true))]}
    }, [cells, weeks, colorOf, cellAlpha])

    const barData = useMemo(() => {
        const sorted = [...cells].sort((a, b) => a.d.localeCompare(b.d))
        const labels = new Map(sorted.flatMap(c => c.v.map(s => [s.key, s.label] as const)))
        const keys = [
            ...order.filter(key => labels.has(key)),
            ...[...labels.keys()].filter(key => !order.includes(key)),
        ]
        return {
            labels: sorted.map(c => c.d),
            datasets: keys.map(key => {
                const base = color(colorOf(key))
                return {
                    label: labels.get(key),
                    data: sorted.map(c => (c.v.find(s => s.key === key)?.seconds ?? 0) / 3600),
                    backgroundColor: base.alpha(0.7).rgbString(),
                    borderColor: base.alpha(1).rgbString(),
                    borderWidth: 1,
                }
            }),
        }
    }, [cells, order, colorOf])

    const barOptions = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: {
                stacked: true,
                ticks: {
                    color: colors.foreground,
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
                    text: yTitle,
                    color: colors.foreground
                },
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
                callbacks: {
                    title(items: any[]) {
                        return items[0] ? dayjs.utc(items[0].label).locale(locale).format('ddd, D MMM YYYY') : '';
                    },
                    label(context: any) {
                        return `${context.dataset.label}: ${formatValue(context.parsed.y * 3600)}`;
                    }
                }
            }
        }
    }), [colors, locale, yTitle, isRange, formatValue])

    if (loading) return <Skeleton className={isShort ? "w-full h-[260px]" : "w-full h-[150px]"} />
    if (cells.length === 0) return null
    return isShort
        // @ts-ignore
        ? <div className="w-full h-[260px]"><LazyBarChart data={barData} options={barOptions} /></div>
        // @ts-ignore
        : <LazyMatrixChart data={data} options={options} width="1000px" />
}
