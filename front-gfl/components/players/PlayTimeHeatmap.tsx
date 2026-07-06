'use client'
import { BarController, BarElement, CategoryScale, Chart as ChartJS, LinearScale, TimeScale, Title, Tooltip as TooltipChart } from 'chart.js';
import { MatrixController, MatrixElement } from 'chartjs-chart-matrix';
import { LazyBarChart, LazyMatrixChart } from "components/graphs/LazyCharts";
import { color } from "chart.js/helpers";
import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import weekOfYear from "dayjs/plugin/weekOfYear";
import isoWeek from "dayjs/plugin/isoWeek";
import { Skeleton } from "../ui/skeleton";
import {fetchApiServerUrl, formatNumber} from "utils/generalUtils";
import 'chartjs-adapter-dayjs-4/dist/chartjs-adapter-dayjs-4.esm';
import { Server } from "types/community";
import { PlayerInfo } from "../../app/servers/[server_slug]/players/[player_id]/util";
import {ScrollArea, ScrollBar} from "components/ui/scroll-area.tsx";
import { ScreenReaderOnly } from "components/ui/ScreenReaderOnly";
import { useTranslations } from "next-intl";
import useWeekdayLabels from "lib/hooks/useWeekdayLabels";

dayjs.extend(weekOfYear)
dayjs.extend(isoWeek)

ChartJS.register(MatrixController, MatrixElement, BarController, BarElement, TimeScale, TooltipChart, CategoryScale, LinearScale, Title);

type HeatmapData = {
    x: string,
    y: string,
    d: string,
    v: number,
}

export type PlayerSessionTime = {
    bucket_time: string,
    hours: number
}

type GroupByType = "daily" | "monthly" | "yearly"

export default function PlayTimeHeatmap({
    groupBy,
    player,
    server,
    selectedYear,
    selectedMonth,
    onDataLoaded,
    sumMethodYearly,
    onChangeTotalPlayed
}: {
    groupBy: GroupByType
    player: PlayerInfo
    server: Server
    selectedYear: number
    selectedMonth: number
    sumMethodYearly: "monthly" | "yearly"
    onDataLoaded?: (data: {
        years: number[],
        months: number[],
        rawData: PlayerSessionTime[]
    }) => void
    onChangeTotalPlayed: (value: number) => void
}) {
    const t = useTranslations('players.heatmap')
    const playerId = player.id
    const server_id = server.id
    const [loading, setLoading] = useState(true)
    const [heatmapData, setHeatmapData] = useState<HeatmapData[]>([])
    const [rawData, setRawData] = useState<PlayerSessionTime[]>([])
    const [chartBarData, setChartBarData] = useState<{time: string, hours: number}[]>([])

    // Fetch raw daily data
    useEffect(() => {
        setLoading(true)
        fetchApiServerUrl(server_id, `/players/${playerId}/graph/sessions`)
            .then(setRawData)
            .catch(console.error)
            .finally(() => setLoading(false))
    }, [server_id, playerId])

    // After rawData is loaded, notify parent of available periods
    useEffect(() => {
        if (rawData && rawData.length > 0 && onDataLoaded) {
            const years = [...new Set(rawData.map(d => dayjs(d.bucket_time).year()))]
                .sort((a, b) => b - a)  // Most recent first
            const months = [...new Set(rawData.map(d => dayjs(d.bucket_time).month()))]
            onDataLoaded({ years, months, rawData })
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rawData])

    // Filter data based on groupBy and selected period
    const filteredData = useMemo(() => {
        if (!rawData || rawData.length === 0) return []

        switch (groupBy) {
            case 'daily':
                return rawData.filter(d => dayjs(d.bucket_time).year() === selectedYear)
            case 'monthly':
                return rawData.filter(d => {
                    const date = dayjs(d.bucket_time)
                    return date.year() === selectedYear && date.month() === selectedMonth
                })
            case 'yearly':
                return rawData.filter(d => {
                    const date = dayjs(d.bucket_time)
                    return (date.year() === selectedYear && sumMethodYearly === "monthly") || sumMethodYearly === "yearly"
                })
            default:
                return rawData
        }
    }, [rawData, groupBy, selectedYear, selectedMonth, sumMethodYearly])

    useEffect(() => {
        const total = filteredData.reduce((c, d) => c + d.hours, 0)
        onChangeTotalPlayed(total)
    }, [filteredData, onChangeTotalPlayed]);

    // Transform data based on groupBy
    useEffect(() => {
        if (!filteredData || filteredData.length === 0) {
            setHeatmapData([])
            setChartBarData([])
            return
        }

        const transformed: HeatmapData[] = []

        if (groupBy === 'daily') {
            // GitHub-style calendar heatmap: x=date, y=day-of-week
            // Create a map of existing data for quick lookup
            const dataMap = new Map<string, number>()
            filteredData.forEach(e => {
                const iso = dayjs(e.bucket_time).format("YYYY-MM-DD")
                dataMap.set(iso, e.hours)
            })

            // Generate all days for the selected year
            const startOfYear = dayjs(`${selectedYear}-01-01`)
            const endOfYear = dayjs(`${selectedYear}-12-31`)
            let currentDate = startOfYear

            while (currentDate.isBefore(endOfYear) || currentDate.isSame(endOfYear, 'day')) {
                const iso = currentDate.format("YYYY-MM-DD")
                transformed.push({
                    x: iso,
                    y: currentDate.locale('en').format('ddd'), // stable English key: Mon, Tue, etc
                    d: currentDate.format('MMM DD, YYYY'),
                    v: dataMap.get(iso) || 0  // Use 0 for days without data
                })
                currentDate = currentDate.add(1, 'day')
            }
        } else if (groupBy === 'monthly') {
            // Show daily breakdown for selected month
            // Create a map of existing data for quick lookup
            const dataMap = new Map<string, number>()
            filteredData.forEach(e => {
                const iso = dayjs(e.bucket_time).format("YYYY-MM-DD")
                dataMap.set(iso, e.hours)
            })

            // Generate all days for the selected month
            const startOfMonth = dayjs(`${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`)
            const endOfMonth = startOfMonth.endOf('month')
            let currentDate = startOfMonth
            const data = []
            while (currentDate.isBefore(endOfMonth) || currentDate.isSame(endOfMonth, 'day')) {
                const iso = currentDate.format("YYYY-MM-DD")
                const time = currentDate.format("DD")
                data.push({
                    time,
                    hours: dataMap.get(iso) || 0  // Use 0 for days without data
                })
                currentDate = currentDate.add(1, 'day')
            }
            setChartBarData(data)
            return
        } else if (groupBy === 'yearly') {
            // Prepare bar chart data for yearly view
            const grouped = new Map<string, number>()
            let method;
            switch(sumMethodYearly){
                case "monthly":
                    method = "MMM"
                    break
                case "yearly":
                    method = "YYYY"
                    break
                default:
                    method = "YYYY"
                    break
            }
            filteredData.forEach(e => {
                const groupKey = dayjs(e.bucket_time).format(method)
                grouped.set(groupKey, (grouped.get(groupKey) || 0) + e.hours)
            })

            // Store as array for bar chart
            const yearlyData = Array.from(grouped.entries())
                .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
                .map(([time, hours]) => ({ time, hours }))

            setChartBarData(yearlyData)
            return  // Don't set heatmapData for yearly view
        }

        setHeatmapData(transformed)
    }, [filteredData, groupBy, rawData, sumMethodYearly])

    const getChartColors = () => {
        if (typeof window === 'undefined') return {
            textColor: 'hsl(222.2 47.4% 11.2%)',
            tooltipBg: 'hsl(0, 0%, 100%)',
            gridColor: 'hsla(214.3, 31.8%, 91.4%, 0.3)',
            primaryColor: 'rgb(235, 195, 218)' // Light pink
        };

        const isDark = document.documentElement.classList.contains('dark');
        return {
            textColor: isDark ? 'hsl(210, 40%, 98%)' : 'hsl(222.2, 47.4%, 11.2%)',
            tooltipBg: isDark ? 'hsl(222.2, 84%, 4.9%)' : 'hsl(0, 0%, 100%)',
            gridColor: isDark ? 'hsla(217.2, 32.6%, 17.5%, 0.3)' : 'hsla(214.3, 31.8%, 91.4%, 0.3)',
            primaryColor: isDark ? 'rgb(229, 82, 157)' : 'rgb(235, 195, 218)' // Dark: vibrant pink, Light: light pink
        };
    };

    const colors = getChartColors();
    const dayNames = useWeekdayLabels();

    // Max hours for color scaling
    const maxHours = useMemo(() => {
        return Math.max(...heatmapData.map(d => d.v), 1)
    }, [heatmapData])

    // Get Y-axis labels based on groupBy
    const getYAxisLabels = () => {
        switch (groupBy) {
            case 'daily':
                return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
            case 'monthly':
                return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
            case 'yearly':
                return ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
            default:
                return []
        }
    }

    // Get dimensions based on groupBy
    const getDimensions = () => {
        switch (groupBy) {
            case 'daily':
                return { width: '1025px', cols: 53, rows: 7 }
            case 'monthly':
                return { width: '800px', cols: 31, rows: 7 }  // Days in month
            case 'yearly':
                return { width: '100%', cols: 5, rows: 10 }
            default:
                return { width: '1025px', cols: 53, rows: 7 }
        }
    }

    const dimensions = getDimensions()

    // Chart options
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
                        return [v.d, t('hoursPlayedValue', {hours: v.v.toFixed(2)})];
                    }
                }
            },
        },
        scales: {
            y: {
                type: 'category',
                labels: getYAxisLabels(),
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
                type: groupBy === 'yearly' ? 'category' : 'time',
                position: 'bottom',
                offset: true,
                time: groupBy !== 'yearly' ? {
                    unit: groupBy === 'monthly' ? 'day' : 'week',
                    round: groupBy === 'monthly' ? 'day' : 'week',
                    isoWeekday: 1,
                    displayFormats: {
                        day: 'D',        // Show day number (1-31)
                        week: 'MMM YY',
                        year: 'YYYY'
                    }
                } : undefined,
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
    }), [groupBy, colors, heatmapData, t, dayNames])

    // Chart data
    const data = useMemo(() => ({
        datasets: [{
            type: 'matrix',
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
                const a = c.chart.chartArea
                return (a.right - a.left) / dimensions.cols - 1
            },
            height(c: any) {
                const a = c.chart.chartArea
                return (a.bottom - a.top) / dimensions.rows - 1
            }
        }]
    }), [heatmapData, maxHours, colors, dimensions])

    // Generate SEO summaries at top level (not inside conditionals)
    const yearlySummary = useMemo(() => {
        if (chartBarData.length === 0) {
            return t('noYearlyData');
        }
        const years = chartBarData.length;
        const totalHours = chartBarData.reduce((sum, d) => sum + d.hours, 0);
        const maxHours = Math.max(...chartBarData.map(d => d.hours));
        return t('yearlySummary', {
            periods: years,
            total: formatNumber(totalHours),
            peak: formatNumber(maxHours),
        });
    }, [chartBarData, t]);

    const matrixSummary = useMemo(() => {
        if (heatmapData.length === 0) {
            return t('noData');
        }
        const totalHours = heatmapData.reduce((sum, d) => sum + d.v, 0);
        const maxHours = Math.max(...heatmapData.map(d => d.v));
        const activeDays = new Set(heatmapData.filter(d => d.v > 0).map(d => d.x)).size;

        return t('matrixSummary', {
            total: formatNumber(totalHours),
            days: activeDays,
            peak: formatNumber(maxHours),
        });
    }, [heatmapData, t]);

    if (loading) {
        return (
            <div className="flex justify-center items-center p-4">
                <Skeleton className="w-full h-[200px]" />
            </div>
        )
    }

    // Remove empty state check for daily/monthly - we now show all days with 0 hours
    // Only show empty state for yearly if no data at all
    if (groupBy === 'yearly' && rawData.length === 0) {
        return (
            <div className="flex flex-col justify-center items-center p-4 h-[280px] text-muted-foreground">
                <p>{t('noDataShort')}</p>
            </div>
        )
    }

    // Yearly view: render bar chart instead of matrix
    if (groupBy === 'yearly' || groupBy === "monthly") {
        if (chartBarData.length === 0) {
            return (
                <div className="flex justify-center items-center p-4 h-[232px] text-muted-foreground">
                    {t('noDataShort')}
                </div>
            )
        }

        const chartData = {
            labels: chartBarData.map(d => d.time),
            datasets: [{
                label: t('hoursPlayed'),
                data: chartBarData.map(d => d.hours),
                backgroundColor: colors.primaryColor,
                borderColor: colors.primaryColor,
                borderWidth: 1,
            }]
        }

        const yearlyChartOptions = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: colors.tooltipBg,
                    titleColor: colors.textColor,
                    bodyColor: colors.textColor,
                    borderColor: colors.gridColor,
                    borderWidth: 1,
                    callbacks: {
                        label: (context: any) => t('hoursPlayedValue', {hours: context.parsed.y.toFixed(2)})
                    }
                }
            },
            scales: {
                x: {
                    type: 'category' as const,
                    ticks: { color: colors.textColor },
                    grid: { color: colors.gridColor }
                },
                y: {
                    type: 'linear' as const,
                    title: { display: true, text: t('hoursPlayed'), color: colors.textColor },
                    ticks: { color: colors.textColor },
                    grid: { color: colors.gridColor }
                }
            }
        }

        return (
            <div className="p-4 flex justify-center items-center">
                <ScreenReaderOnly id="yearly-heatmap-summary">
                    {yearlySummary}
                </ScreenReaderOnly>
                <div
                    style={{ width: '100%', height: '200px' }}
                    role="img"
                    aria-label={t('yearlyAriaLabel')}
                    aria-describedby="yearly-heatmap-summary"
                >
                    <LazyBarChart data={chartData} options={yearlyChartOptions} />
                </div>
            </div>
        )
    }

    // Matrix chart rendering for daily/monthly views
    if (heatmapData.length === 0) {
        return (
            <div className="flex justify-center items-center p-4 h-[200px] text-muted-foreground">
                {t('noDataShort')}
            </div>
        )
    }

    return (
        <ScrollArea>
            <ScreenReaderOnly id="matrix-heatmap-summary">
                {matrixSummary}
            </ScreenReaderOnly>
            <div
                className="flex justify-center md:justify-center sm:justify-end xs:justify-end items-center"
                role="img"
                aria-label={t('matrixAriaLabel', {groupBy})}
                aria-describedby="matrix-heatmap-summary"
            >
                <LazyMatrixChart
                    data={data}
                    options={options}
                    width={dimensions.width}
                />
            </div>
            <ScrollBar orientation="horizontal" />
        </ScrollArea>
    )
}
