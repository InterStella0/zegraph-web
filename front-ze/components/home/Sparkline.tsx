'use client';
import {Chart as ChartJS, Filler, LinearScale, LineElement, PointElement, TimeScale, Tooltip} from 'chart.js';
import 'chartjs-adapter-dayjs-4/dist/chartjs-adapter-dayjs-4.esm';
import {useMemo} from 'react';
import {LazyLineChart} from 'components/graphs/LazyCharts';

ChartJS.register(LinearScale, PointElement, LineElement, TimeScale, Tooltip, Filler);

type Point = {x: string, y: number};

export default function Sparkline({points, color}: {points: Point[], color: string}) {
    const data = useMemo(() => ({
        datasets: [{
            data: points,
            borderColor: color,
            backgroundColor: 'transparent',
            borderWidth: 1.5,
            pointRadius: 0,
            tension: 0.4,
            fill: false,
        }],
    }), [points, color]);

    const options = useMemo(() => ({
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: {type: 'time', display: false, grid: {display: false}},
            y: {display: false, grid: {display: false}},
        },
        plugins: {legend: {display: false}, tooltip: {enabled: false}},
        elements: {line: {borderCapStyle: 'round'}},
    }), []);

    return (
        <div className="h-8 w-24">
            <LazyLineChart
                data={data}
                // @ts-ignore dynamic() collapses the chart generics; option literals widen to string
                options={options}
            />
        </div>
    );
}
