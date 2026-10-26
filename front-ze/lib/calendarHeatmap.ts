import {Dayjs} from "dayjs";
import {color} from "chart.js/helpers";
import {ChartTheme, heatmapTooltip} from "lib/chartTheme";

export const WEEKDAY_KEYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export type CalendarCell = {
    x: string,
    y: string,
    d: string,
    v: number,
}

export function weekdayKey(day: Dayjs): string {
    return day.locale('en').format('ddd');
}

export function calendarCells(start: Dayjs, end: Dayjs, hoursByDay: Map<string, number>): CalendarCell[] {
    const cells: CalendarCell[] = [];
    for (let day = start; day.isBefore(end) || day.isSame(end, 'day'); day = day.add(1, 'day')) {
        const iso = day.format("YYYY-MM-DD");
        cells.push({x: iso, y: weekdayKey(day), d: day.format('MMM DD, YYYY'), v: hoursByDay.get(iso) || 0});
    }
    return cells;
}

export function calendarMatrixOptions(colors: ChartTheme, dayNames: Record<string, string>, label: (cell: any) => string[]) {
    return {
        responsive: false,
        maintainAspectRatio: false,
        plugins: {
            legend: false,
            tooltip: {
                displayColors: false,
                ...heatmapTooltip(colors),
                callbacks: {
                    title: () => '',
                    label: (context: any) => label(context.dataset.data[context.dataIndex]),
                }
            },
        },
        scales: {
            y: {
                type: 'category',
                labels: WEEKDAY_KEYS,
                offset: true,
                reverse: false,
                position: 'right',
                ticks: {
                    maxRotation: 0,
                    autoSkip: true,
                    padding: 1,
                    color: colors.foreground,
                    font: {size: 9},
                    callback(this: any, value: any) {
                        const label = this.getLabelForValue(value);
                        return dayNames[label] ?? label;
                    }
                },
                grid: {display: false, drawBorder: false, tickLength: 0}
            },
            x: {
                type: 'time',
                position: 'bottom',
                offset: true,
                time: {unit: 'week', round: 'week', isoWeekday: 1, displayFormats: {week: 'MMM YY'}},
                ticks: {maxRotation: 0, color: colors.foreground, font: {weight: 'bold', size: 9}},
                grid: {display: false, drawBorder: false, tickLength: 5}
            }
        },
        layout: {padding: {top: 10}}
    };
}

type CellColor = (c: any) => string;

// Cell size along one axis: the chart area split into `count` cells with a 1px gap.
const cellSize = (count: number, span: (area: any) => number) => (c: any) =>
    c.chart.chartArea ? span(c.chart.chartArea) / count - 1 : 0;

export function calendarMatrixDataset<T>(data: T[], cols: number, backgroundColor: CellColor, borderColor: CellColor) {
    return {
        type: 'matrix' as const,
        data,
        backgroundColor,
        borderColor,
        borderWidth: 1,
        hoverBorderColor: 'grey',
        width: cellSize(cols, a => a.right - a.left),
        height: cellSize(7, a => a.bottom - a.top),
    };
}

export function heatCellColors(heat: string, maxHours: number): [CellColor, CellColor] {
    const shade = (base: number, floor: number) => (c: any) =>
        color(heat).alpha(Math.min((base + c.dataset.data[c.dataIndex].v) / Math.max(floor, maxHours), 1)).rgbString();
    return [shade(0.1, 3), shade(0.2, 4)];
}
