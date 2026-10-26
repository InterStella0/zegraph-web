'use client'
import { LazyBarChart, LazyMatrixChart } from "components/graphs/LazyCharts";
import { ReactNode, useEffect, useMemo } from "react";
import dayjs from "lib/dayjs";
import { Skeleton } from "../ui/skeleton";
import {formatNumber, range} from "utils/generalUtils";
import { Server } from "types/community";
import { PlayerInfo } from "../../app/servers/[server_slug]/players/[player_id]/util";
import {ScrollArea, ScrollBar} from "components/ui/scroll-area.tsx";
import { ScreenReaderOnly } from "components/ui/ScreenReaderOnly";
import { useTranslations } from "next-intl";
import useWeekdayLabels from "lib/hooks/useWeekdayLabels";
import {usePlayerStat} from "../../app/servers/[server_slug]/players/[player_id]/PlayerStatsPatch";
import {heatmapTooltip, useChartTheme} from "lib/chartTheme";
import {CalendarCell, calendarCells, calendarMatrixDataset, calendarMatrixOptions, heatCellColors} from "lib/calendarHeatmap";

type PlayerSessionTime = {
    bucket_time: string,
    hours: number
}

type GroupByType = "daily" | "monthly" | "yearly"
type Bar = { time: string, hours: number }

function hoursByDay(data: PlayerSessionTime[]) {
    return new Map(data.map(e => [dayjs.utc(e.bucket_time).format("YYYY-MM-DD"), e.hours]))
}

export default function PlayTimeHeatmap({
    groupBy,
    player,
    server,
    selectedYear,
    selectedMonth,
    onYearsLoaded,
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
    onYearsLoaded: (years: number[]) => void
    onChangeTotalPlayed: (value: number) => void
    rangeFrom?: string
    rangeTo?: string
}) {
    const t = useTranslations('players.heatmap')
    const colors = useChartTheme();
    const dayNames = useWeekdayLabels();
    const { data: sessionData, loading } = usePlayerStat<PlayerSessionTime[]>(server.id, player.id, 'graph/sessions')
    const rawData = useMemo(() => sessionData ?? [], [sessionData])

    useEffect(() => {
        if (rawData.length > 0)
            onYearsLoaded([...new Set(rawData.map(d => dayjs.utc(d.bucket_time).year()))].sort((a, b) => b - a))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rawData])

    const filteredData = useMemo(() => rawData.filter(d => {
        const date = dayjs.utc(d.bucket_time)
        if (groupBy === 'daily' && rangeFrom && rangeTo) {
            const day = date.startOf('day')
            return !day.isBefore(dayjs.utc(rangeFrom)) && !day.isAfter(dayjs.utc(rangeTo))
        }
        if (groupBy === 'daily') return date.year() === selectedYear
        if (groupBy === 'monthly') return date.year() === selectedYear && date.month() === selectedMonth
        return sumMethodYearly === "yearly" || date.year() === selectedYear
    }), [rawData, groupBy, selectedYear, selectedMonth, sumMethodYearly, rangeFrom, rangeTo])

    useEffect(() => {
        onChangeTotalPlayed(filteredData.reduce((c, d) => c + d.hours, 0))
    }, [filteredData, onChangeTotalPlayed]);

    // Daily views render calendar cells, monthly and yearly views render bars.
    const { cells, bars } = useMemo((): { cells: CalendarCell[], bars: Bar[] } => {
        if (filteredData.length === 0) return { cells: [], bars: [] }
        if (groupBy === 'daily') {
            const start = rangeFrom ? dayjs.utc(rangeFrom) : dayjs(`${selectedYear}-01-01`)
            const end = rangeTo ? dayjs.utc(rangeTo) : dayjs(`${selectedYear}-12-31`)
            return { cells: calendarCells(start, end, hoursByDay(filteredData)), bars: [] }
        }
        if (groupBy === 'monthly') {
            const byDay = hoursByDay(filteredData)
            const startOfMonth = dayjs(`${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`)
            return {
                cells: [],
                bars: range(startOfMonth.daysInMonth()).map(i => {
                    const day = startOfMonth.add(i, 'day')
                    return { time: day.format("DD"), hours: byDay.get(day.format("YYYY-MM-DD")) || 0 }
                }),
            }
        }
        const grouped = new Map<string, number>()
        for (const e of filteredData) {
            const key = dayjs.utc(e.bucket_time).format(sumMethodYearly === "monthly" ? "MMM" : "YYYY")
            grouped.set(key, (grouped.get(key) || 0) + e.hours)
        }
        const bars = Array.from(grouped.entries())
            .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
            .map(([time, hours]) => ({ time, hours }))
        return { cells: [], bars }
    }, [filteredData, groupBy, selectedYear, selectedMonth, sumMethodYearly, rangeFrom, rangeTo])

    const isRange = !!rangeFrom && !!rangeTo
    const cols = isRange ? Math.ceil((dayjs.utc(rangeTo).diff(dayjs.utc(rangeFrom), 'day') + 1) / 7) + 1 : 53
    const options = useMemo(() => calendarMatrixOptions(colors, dayNames,
        v => [v.d, t('hoursPlayedValue', {hours: v.v.toFixed(2)})]), [colors, t, dayNames])
    const data = useMemo(() => ({
        datasets: [calendarMatrixDataset(cells, cols, ...heatCellColors(colors.heat, Math.max(...cells.map(d => d.v), 1)))]
    }), [cells, colors, cols])

    const empty = (className: string, children: ReactNode = t('noDataShort')) => (
        <div className={`flex justify-center items-center p-4 text-muted-foreground ${className}`}>{children}</div>
    )

    if (loading) {
        return <Skeleton className="w-full h-[150px]" />
    }

    if (groupBy === 'yearly' && rawData.length === 0) {
        return empty("flex-col h-[280px]", <p>{t('noDataShort')}</p>)
    }

    if (groupBy === 'yearly' || groupBy === "monthly") {
        if (bars.length === 0) return empty("h-[232px]")

        const chartData = {
            labels: bars.map(d => d.time),
            datasets: [{
                label: t('hoursPlayed'),
                data: bars.map(d => d.hours),
                backgroundColor: colors.heat,
                borderColor: colors.heat,
                borderWidth: 1,
            }]
        }
        const axis = { ticks: { color: colors.foreground }, grid: { color: colors.faintGrid } }
        const chartOptions = {
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
                x: { type: 'category' as const, ...axis },
                y: {
                    type: 'linear' as const,
                    title: { display: true, text: t('hoursPlayed'), color: colors.foreground },
                    ...axis,
                }
            }
        }

        return (
            <div className="p-4 flex justify-center items-center">
                <ScreenReaderOnly id="yearly-heatmap-summary">
                    {t('yearlySummary', {
                        periods: bars.length,
                        total: formatNumber(bars.reduce((sum, d) => sum + d.hours, 0)),
                        peak: formatNumber(Math.max(...bars.map(d => d.hours))),
                    })}
                </ScreenReaderOnly>
                <div
                    style={{ width: '100%', height: '200px' }}
                    role="img"
                    aria-label={t('yearlyAriaLabel')}
                    aria-describedby="yearly-heatmap-summary"
                >
                    <LazyBarChart data={chartData} options={chartOptions} />
                </div>
            </div>
        )
    }

    if (cells.length === 0) return empty("h-[150px]")

    return (
        <ScrollArea>
            <ScreenReaderOnly id="matrix-heatmap-summary">
                {t('matrixSummary', {
                    total: formatNumber(cells.reduce((sum, d) => sum + d.v, 0)),
                    days: new Set(cells.filter(d => d.v > 0).map(d => d.x)).size,
                    peak: formatNumber(Math.max(...cells.map(d => d.v))),
                })}
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
                    width={isRange ? `${cols * 19 + 40}px` : '1025px'}
                />
            </div>
            <ScrollBar orientation="horizontal" />
        </ScrollArea>
    )
}
