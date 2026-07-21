import {Chart as ChartJS, Filler, LinearScale, LineController, LineElement, PointElement, TimeScale} from "chart.js";
import {useEffect, useMemo, useRef, useState} from "react";
import {fetchUrl} from "utils/generalUtils.ts";
import {LazyLineChart as Line} from "components/graphs/LazyCharts";
import {useServerData} from "../../app/servers/[server_slug]/ServerDataProvider";
import {GraphPlayerCount, ServerCountData} from "../../app/servers/[server_slug]/util.ts";
import { useTheme } from "next-themes";

ChartJS.register(
    LinearScale,
    LineElement,
    LineController,
    TimeScale, Filler,
    PointElement,
);

export default function SessionPlayedGraph({ sessionId, map }: { sessionId: number, map: string}){
    const [ playerCount, setPlayerCount ] = useState<GraphPlayerCount[]>(null)
    const graphRef = useRef<HTMLDivElement | null>(null);
    const observerRef = useRef<IntersectionObserver | null>(null);
    const [isVisible, setIsVisible] = useState<boolean>(false);
    const { server } = useServerData()
    const server_id = server.id;
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';
    useEffect(() => {
        observerRef.current = new IntersectionObserver(
            ([entry]) => {
                setIsVisible(entry.isIntersecting);
            },
            { threshold: .5 }
        );

        if (graphRef.current) {
            observerRef.current.observe(graphRef.current);
        }

        setPlayerCount(null)
        return () => {
            if (observerRef.current && graphRef.current) {
                observerRef.current.unobserve(graphRef.current);
            }
        }
    }, [sessionId, map])

    useEffect(() => {
        if (!isVisible || playerCount !== null) return

        fetchUrl(`/graph/${server_id}/unique_players/maps/${map}/sessions/${sessionId}`)
            .then((data: ServerCountData[]) => data.map(e => ({x: e.bucket_time, y: e.player_count})))
            .then(data => {
                setPlayerCount(data)
            })
    }, [ server_id, map, sessionId, isVisible, playerCount ])

    const options = useMemo(() => ({
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        elements: {
            line: {
                tension: 0.4,
                borderWidth: 0
            }
        },
        scales: {
            x: {
                border: {
                    display: false
                },
                type: 'time',
                time: {
                    displayFormats: {
                        minute: 'MMM DD, h:mm a',
                        hour: 'MMM DD, ha',
                    },
                },
                ticks: { display: false },
                grid: {  display: false  }
            },
            y: {
                max: 64,
                min: 0,
                border: { display: false },
                ticks: { display: false },
                grid: { display: false  }
            }
        },
        plugins: {
            legend: { display: false },
            title: { display: false },
            tooltip: { enabled: false }
        },
        interaction: {
            mode: 'none',
            intersect: false
        },
        hover: { mode: null },
    }), [])

    const borderColor = isDark? 'oklch(0.696 0.15 320)': 'oklch(0.6 0.07 310)' // --chart-2
    const gradientColor1 = isDark? 'oklch(0.696 0.15 320 / .6)': 'oklch(0.6 0.07 310 / .6)'
    const gradientColor2 = isDark? 'oklch(0.696 0.15 320 / .3)': 'oklch(0.6 0.07 310 / .3)'
    const gradientColor3 = isDark? 'oklch(0.696 0.15 320 / 0)': 'oklch(0.6 0.07 310 / 0)'

    const data = {
        datasets: [{
            data: playerCount ?? [],
            borderColor: borderColor,
            borderWidth: 1.5,
            pointRadius: 0,
            tension: 0.2,
            fill: true,
            backgroundColor: function (context: any) {
                const chart = context.chart;
                const { ctx, chartArea } = chart;

                if (!chartArea) return; // initial
                let gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
                gradient.addColorStop(1, gradientColor1);
                gradient.addColorStop(0.7, gradientColor2);
                gradient.addColorStop(0, gradientColor3);
                return gradient;
            },
        }]
    }
    return <div ref={graphRef} style={{
        width: '100%',
        height: '100%',
        maxHeight: '50px'
        // @ts-ignore
    }}><Line data={data} options={options} /></div>
}