import {useRef} from "react";
import {fetchUrl} from "utils/generalUtils.ts";
import {LazyLineChart as Line} from "components/graphs/LazyCharts";
import {GraphPlayerCount, ServerCountData} from "../../app/servers/[server_slug]/util.ts";
import {useResource} from "lib/hooks/useResource";
import {useInView} from "lib/hooks/useInView";
import { useTheme } from "next-themes";

const hidden = { display: false };
const OPTIONS = {
    animation: false,
    maintainAspectRatio: false,
    elements: {
        line: {
            tension: 0.4,
            borderWidth: 0
        }
    },
    scales: {
        x: {
            border: hidden,
            type: 'time',
            time: {
                displayFormats: {
                    minute: 'MMM DD, h:mm a',
                    hour: 'MMM DD, ha',
                },
            },
            ticks: hidden,
            grid: hidden,
        },
        y: {
            max: 64,
            min: 0,
            border: hidden,
            ticks: hidden,
            grid: hidden,
        }
    },
    plugins: {
        legend: hidden,
        title: hidden,
        tooltip: { enabled: false }
    },
    interaction: {
        mode: 'none',
        intersect: false
    },
    hover: { mode: null },
};

/** A tiny player-count sparkline, fetched once it first scrolls into view. */
export default function SessionPlayedGraph({ serverId, sessionId, map }: { serverId: string, sessionId: number, map: string}){
    const graphRef = useRef<HTMLDivElement | null>(null);
    const seen = useInView(graphRef, { threshold: .5, once: true });
    const isDark = useTheme().resolvedTheme === 'dark';

    const { data: playerCount } = useResource<GraphPlayerCount[]>(signal => seen
        ? fetchUrl(`/graph/${serverId}/unique_players/maps/${map}/sessions/${sessionId}`, { signal })
            .then((data: ServerCountData[]) => data.map(e => ({x: e.bucket_time, y: e.player_count})))
        : null, [serverId, map, sessionId, seen]);

    // --chart-2, which Chart.js cannot read from CSS.
    const chart2 = (alpha: number) => isDark ? `oklch(0.696 0.15 320 / ${alpha})` : `oklch(0.6 0.07 310 / ${alpha})`;

    const data = {
        datasets: [{
            data: playerCount ?? [],
            borderColor: chart2(1),
            borderWidth: 1.5,
            pointRadius: 0,
            tension: 0.2,
            fill: true,
            backgroundColor: ({ chart: { ctx, chartArea } }) => {
                if (!chartArea) return;
                const gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
                gradient.addColorStop(1, chart2(.6));
                gradient.addColorStop(0.7, chart2(.3));
                gradient.addColorStop(0, chart2(0));
                return gradient;
            },
        }]
    }
    return <div ref={graphRef} style={{ width: '100%', height: '100%', maxHeight: '50px' }}>
        {/* @ts-ignore */}
        <Line data={data} options={OPTIONS} />
    </div>
}
