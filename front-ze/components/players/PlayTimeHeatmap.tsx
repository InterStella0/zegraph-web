'use client'
import { BarController, BarElement, CategoryScale, Chart as ChartJS, LinearScale, TimeScale, Title, Tooltip as TooltipChart } from 'chart.js';
import { MatrixController, MatrixElement } from 'chartjs-chart-matrix';
import { LazyBarChart, LazyMatrixChart } from "components/graphs/LazyCharts";
import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import weekOfYear from "dayjs/plugin/weekOfYear";
import isoWeek from "dayjs/plugin/isoWeek";
import utc from "dayjs/plugin/utc";
import { Skeleton } from "../ui/skeleton";
import {formatNumber} from "utils/generalUtils";
import 'chartjs-adapter-dayjs-4/dist/chartjs-adapter-dayjs-4.esm';
import { Server } from "types/community";
import { PlayerInfo } from "../../app/servers/[server_slug]/players/[player_id]/util";
import {ScrollArea, ScrollBar} from "components/ui/scroll-area.tsx";
import { ScreenReaderOnly } from "components/ui/ScreenReaderOnly";
import { useTranslations } from "next-intl";
import useWeekdayLabels from "lib/hooks/useWeekdayLabels";
import {usePlayerStat} from "../../app/servers/[server_slug]/players/[player_id]/PlayerStatsPatch";
import {heatmapTooltip, useChartTheme} from "lib/chartTheme";
import {CalendarCell, calendarCells, calendarMatrixDataset, calendarMatrixOptions, heatCellColors} from "lib/calendarHeatmap";

dayjs.extend(weekOfYear)
dayjs.extend(isoWeek)
dayjs.extend(utc)

ChartJS.register(MatrixController, MatrixElement, BarController, BarElement, TimeScale, TooltipChart, CategoryScale, LinearScale, Title);

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
    onChangeTotalPlayed,
    rangeFrom,
    rangeTo,
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
    rangeFrom?: string
    rangeTo?: string
}) {
    const t = useTranslations('players.heatmap')
    const playerId = player.id
    const server_id = server.id
    const [heatmapData, setHeatmapData] = useState<CalendarCell[]>([])
    const [chartBarData, setChartBarData] = useState<{time: string, hours: number}[]>([])

    const { data: sessionData, loading } = usePlayerStat<PlayerSessionTime[]>(
        server_id, playerId, 'graph/sessions'
    )
    const rawData = useMemo(() => sessionData ?? [], [sessionData])

    // After rawData is loaded, notify parent of available periods
    useEffect(() => {
        if (rawData && rawData.length > 0 && onDataLoaded) {
            const years = [...new Set(rawData.map(d => dayjs.utc(d.bucket_time).year()))]
                .sort((a, b) => b - a)  // Most recent first
            const months = [...new Set(rawData.map(d => dayjs.utc(d.bucket_time).month()))]
            onDataLoaded({ years, months, rawData })
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rawData])

    // Filter data based on groupBy and selected period
    const filteredData = useMemo(() => {
        if (!rawData || rawData.length === 0) return []

        switch (groupBy) {
            case 'daily':
                if (rangeFrom && rangeTo) {
                    return rawData.filter(d => {
                        const day = dayjs.utc(d.bucket_time).startOf('day')
                        return !day.isBefore(dayjs.utc(rangeFrom)) && !day.isAfter(dayjs.utc(rangeTo))
                    })
                }
                return rawData.filter(d => dayjs.utc(d.bucket_time).year() === selectedYear)
            case 'monthly':
                return rawData.filter(d => {
                    const date = dayjs.utc(d.bucket_time)
                    return date.year() === selectedYear && date.month() === selectedMonth
                })
            case 'yearly':
                return rawData.filter(d => {
                    const date = dayjs.utc(d.bucket_time)
                    return (date.year() === selectedYear && sumMethodYearly === "monthly") || sumMethodYearly === "yearly"
                })
            default:
                return rawData
        }
    }, [rawData, groupBy, selectedYear, selectedMonth, sumMethodYearly, rangeFrom, rangeTo])

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

        const transformed: CalendarCell[] = []

        if (groupBy === 'daily') {
            // GitHub-style calendar heatmap: x=date, y=day-of-week
            // Create a map of existing data for quick lookup
            const dataMap = new Map<string, number>()
            filteredData.forEach(e => {
                const iso = dayjs.utc(e.bucket_time).format("YYYY-MM-DD")
                dataMap.set(iso, e.hours)
            })

            const startOfYear = rangeFrom ? dayjs.utc(rangeFrom) : dayjs(`${selectedYear}-01-01`)
            const endOfYear = rangeTo ? dayjs.utc(rangeTo) : dayjs(`${selectedYear}-12-31`)
            transformed.push(...calendarCells(startOfYear, endOfYear, dataMap))
        } else if (groupBy === 'monthly') {
            // Show daily breakdown for selected month
            // Create a map of existing data for quick lookup
            const dataMap = new Map<string, number>()
            filteredData.forEach(e => {
                const iso = dayjs.utc(e.bucket_time).format("YYYY-MM-DD")
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
                const groupKey = dayjs.utc(e.bucket_time).format(method)
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
    }, [filteredData, groupBy, rawData, sumMethodYearly, rangeFrom, rangeTo])

    const colors = useChartTheme();
    const dayNames = useWeekdayLabels();

    // Max hours for color scaling
    const maxHours = useMemo(() => {
        return Math.max(...heatmapData.map(d => d.v), 1)
    }, [heatmapData])

    const isRange = !!rangeFrom && !!rangeTo
    const cols = isRange ? Math.ceil((dayjs.utc(rangeTo).diff(dayjs.utc(rangeFrom), 'day') + 1) / 7) + 1 : 53
    const chartWidth = isRange ? `${cols * 19 + 40}px` : '1025px'

    const options = useMemo(() => calendarMatrixOptions(colors, dayNames,
        v => [v.d, t('hoursPlayedValue', {hours: v.v.toFixed(2)})]), [colors, t, dayNames])

    const data = useMemo(() => ({
        datasets: [calendarMatrixDataset(heatmapData, cols, ...heatCellColors(colors.heat, maxHours))]
    }), [heatmapData, maxHours, colors, cols])

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
        return <Skeleton className="w-full h-[150px]" />
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
                backgroundColor: colors.heat,
                borderColor: colors.heat,
                borderWidth: 1,
            }]
        }

        const yearlyChartOptions = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    ...heatmapTooltip(colors),
                    callbacks: {
                        label: (context: any) => t('hoursPlayedValue', {hours: context.parsed.y.toFixed(2)})
                    }
                }
            },
            scales: {
                x: {
                    type: 'category' as const,
                    ticks: { color: colors.foreground },
                    grid: { color: colors.faintGrid }
                },
                y: {
                    type: 'linear' as const,
                    title: { display: true, text: t('hoursPlayed'), color: colors.foreground },
                    ticks: { color: colors.foreground },
                    grid: { color: colors.faintGrid }
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
            <div className="flex justify-center items-center p-4 h-[150px] text-muted-foreground">
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
                    width={chartWidth}
                />
            </div>
            <ScrollBar orientation="horizontal" />
        </ScrollArea>
    )
}
