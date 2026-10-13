'use client';

import { CategoryScale, Chart as ChartJS, LinearScale, TimeScale, Title, Tooltip as TooltipChart } from 'chart.js';
import { MatrixController, MatrixElement } from 'chartjs-chart-matrix';
import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import utc from "dayjs/plugin/utc";
import { useTranslations } from "next-intl";
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
import {useChartTheme} from "lib/chartTheme";
import {calendarCells, calendarMatrixDataset, calendarMatrixOptions, heatCellColors} from "lib/calendarHeatmap";
import 'chartjs-adapter-dayjs-4/dist/chartjs-adapter-dayjs-4.esm';

dayjs.extend(isoWeek)
dayjs.extend(utc)

ChartJS.register(MatrixController, MatrixElement, TimeScale, TooltipChart, CategoryScale, LinearScale, Title);

const COLS = 53
const CHART_WIDTH = '1025px'

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

        return calendarCells(dayjs(`${selectedYear}-01-01`), dayjs(`${selectedYear}-12-31`), byDay);
    }, [rawData, selectedYear]);

    const totalHours = useMemo(() => heatmapData.reduce((sum, d) => sum + d.v, 0), [heatmapData]);
    const maxHours = useMemo(() => Math.max(...heatmapData.map(d => d.v), 1), [heatmapData]);

    const colors = useChartTheme();
    const dayNames = useWeekdayLabels();

    const options = useMemo<any>(() => calendarMatrixOptions(colors, dayNames,
        v => [v.d, t('hoursPlayedValue', { hours: v.v.toFixed(2) })]), [colors, t, dayNames])

    const data = useMemo<any>(() => ({
        datasets: [calendarMatrixDataset(heatmapData, COLS, ...heatCellColors(colors.heat, maxHours))]
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
