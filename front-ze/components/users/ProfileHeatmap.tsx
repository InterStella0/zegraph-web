'use client';

import { CategoryScale, Chart as ChartJS, LinearScale, TimeScale, Title, Tooltip as TooltipChart } from 'chart.js';
import { MatrixController, MatrixElement } from 'chartjs-chart-matrix';
import { color } from "chart.js/helpers";
import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import utc from "dayjs/plugin/utc";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { formatNumber } from "utils/generalUtils";
import { PlayerSessionTime } from "types/community";
import { ScrollArea, ScrollBar } from "components/ui/scroll-area";
import { ScreenReaderOnly } from "components/ui/ScreenReaderOnly";
import { LazyMatrixChart } from "components/graphs/LazyCharts";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "components/ui/select";
import useWeekdayLabels from "lib/hooks/useWeekdayLabels";
import 'chartjs-adapter-dayjs-4/dist/chartjs-adapter-dayjs-4.esm';

dayjs.extend(isoWeek)
dayjs.extend(utc)

ChartJS.register(MatrixController, MatrixElement, TimeScale, TooltipChart, CategoryScale, LinearScale, Title);

const COLS = 53
const ROWS = 7
const CHART_WIDTH = '1025px'
const Y_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

type HeatmapData = {
    x: string,
    y: string,
    d: string,
    v: number,
}

function getChartColors(isDark: boolean) {
    return {
        textColor: isDark ? 'hsl(210, 40%, 98%)' : 'hsl(222.2, 47.4%, 11.2%)',
        tooltipBg: isDark ? 'hsl(222.2, 84%, 4.9%)' : 'hsl(0, 0%, 100%)',
        gridColor: isDark ? 'hsla(217.2, 32.6%, 17.5%, 0.3)' : 'hsla(214.3, 31.8%, 91.4%, 0.3)',
        primaryColor: isDark ? 'rgb(229, 82, 157)' : 'rgb(235, 195, 218)'
    };
}

export default function ProfileHeatmap({ rawData }: { rawData: PlayerSessionTime[] }) {
    const t = useTranslations('players.heatmap')
    const [selectedYear, setSelectedYear] = useState<number>(dayjs().year());

    const availableYears = useMemo(() => {
        const years = [...new Set(rawData.map(d => dayjs.utc(d.bucket_time).year()))]
        return years.sort((a, b) => b - a)
    }, [rawData]);

    useEffect(() => {
        if (availableYears.length > 0) {
            setSelectedYear(availableYears[0])
        }
    }, [availableYears]);

    const heatmapData = useMemo(() => {
        const byDay = new Map<string, number>();
        rawData.forEach(d => {
            const date = dayjs.utc(d.bucket_time)
            if (date.year() === selectedYear) {
                byDay.set(date.format("YYYY-MM-DD"), d.hours)
            }
        });

        const transformed: HeatmapData[] = [];
        const endOfYear = dayjs(`${selectedYear}-12-31`);
        let cursor = dayjs(`${selectedYear}-01-01`);

        while (cursor.isBefore(endOfYear) || cursor.isSame(endOfYear, 'day')) {
            const iso = cursor.format("YYYY-MM-DD");
            transformed.push({
                x: iso,
                y: cursor.locale('en').format('ddd'), // stable English key, not the display label
                d: cursor.format('MMM DD, YYYY'),
                v: byDay.get(iso) ?? 0,
            });
            cursor = cursor.add(1, 'day');
        }
        return transformed;
    }, [rawData, selectedYear]);

    const totalHours = useMemo(() => heatmapData.reduce((sum, d) => sum + d.v, 0), [heatmapData]);
    const maxHours = useMemo(() => Math.max(...heatmapData.map(d => d.v), 1), [heatmapData]);

    const { resolvedTheme } = useTheme();
    const colors = useMemo(() => getChartColors(resolvedTheme === 'dark'), [resolvedTheme]);
    const dayNames = useWeekdayLabels();

    const options = useMemo<any>(() => ({
        responsive: false,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
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
                        return [v.d, t('hoursPlayedValue', { hours: v.v.toFixed(2) })];
                    }
                }
            },
        },
        scales: {
            y: {
                type: 'category',
                labels: Y_LABELS,
                offset: true,
                reverse: false,
                position: 'right',
                ticks: {
                    maxRotation: 0,
                    autoSkip: true,
                    padding: 1,
                    color: colors.textColor,
                    font: { size: 9 },
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
            padding: { top: 10 }
        }
    }), [colors, t, dayNames])

    const data = useMemo<any>(() => ({
        datasets: [{
            type: 'matrix' as const,
            data: heatmapData,
            backgroundColor(c: any) {
                const value = c.dataset.data[c.dataIndex].v
                const alpha = Math.min((0.1 + value) / Math.max(3, maxHours), 1)
                return color(colors.primaryColor).alpha(alpha).rgbString()
            },
            borderColor(c: any) {
                const value = c.dataset.data[c.dataIndex].v
                const alpha = Math.min((0.2 + value) / Math.max(4, maxHours), 1)
                return color(colors.primaryColor).alpha(alpha).rgbString()
            },
            borderWidth: 1,
            hoverBorderColor: 'grey',
            width(c: any) {
                // Runs once before the first layout pass, when chartArea is still undefined.
                const a = c.chart.chartArea
                if (!a) return 0
                return (a.right - a.left) / COLS - 1
            },
            height(c: any) {
                const a = c.chart.chartArea
                if (!a) return 0
                return (a.bottom - a.top) / ROWS - 1
            }
        }]
    }), [heatmapData, maxHours, colors])

    const summary = useMemo(() => {
        const activeDays = heatmapData.filter(d => d.v > 0).length;
        if (activeDays === 0) return t('noData');
        return t('matrixSummary', {
            total: formatNumber(totalHours),
            days: activeDays,
            peak: formatNumber(maxHours),
        });
    }, [heatmapData, totalHours, maxHours, t]);

    return (
        <div>
            <div className="flex items-baseline justify-between gap-2 mb-4 flex-wrap">
                <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium text-muted-foreground">{t('totalPlayTime')}</span>
                    <span className="text-lg font-bold text-pink-500">
                        {totalHours.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {t('hoursUnit')}
                    </span>
                    <span className="text-sm text-muted-foreground">{t('inYear', { year: selectedYear })}</span>
                </div>
                {availableYears.length > 1 && (
                    <Select value={selectedYear.toString()} onValueChange={v => setSelectedYear(parseInt(v))}>
                        <SelectTrigger className="w-25 h-8 text-sm font-medium">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {availableYears.map(year => (
                                <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
            </div>
            {rawData.length === 0 ? (
                <div className="flex justify-center items-center h-50 text-muted-foreground">
                    {t('noDataShort')}
                </div>
            ) : (
                <ScrollArea>
                    <ScreenReaderOnly id="profile-heatmap-summary">
                        {summary}
                    </ScreenReaderOnly>
                    <div
                        className="flex justify-center items-center"
                        role="img"
                        aria-label={t('matrixAriaLabel', { groupBy: 'daily' })}
                        aria-describedby="profile-heatmap-summary"
                    >
                        <LazyMatrixChart
                            type="matrix"
                            data={data}
                            options={options}
                            width={CHART_WIDTH}
                        />
                    </div>
                    <ScrollBar orientation="horizontal" />
                </ScrollArea>
            )}
        </div>
    );
}
