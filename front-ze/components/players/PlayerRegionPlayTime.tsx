'use client'
import {useTranslations} from 'next-intl';
import {use, useMemo} from "react";
import {REGION_COLORS, StillCalculate} from "utils/generalUtils";
import { Card } from "components/ui/card";
import { Skeleton } from "components/ui/skeleton";
import {LazyPolarAreaChart as PolarArea} from "components/graphs/LazyCharts";
import {
    ArcElement,
    Chart as ChartJS,
    Legend,
    PolarAreaController, RadialLinearScale,
    Title,
    Tooltip
} from "chart.js";
import ErrorCatch from "../ui/ErrorMessage.tsx";
import { AlertCircle } from "lucide-react";
import {ServerPlayerDetailed} from "../../app/servers/[server_slug]/players/[player_id]/page.tsx";
import {PlayerRegionTime} from "types/players.ts";
import { useTheme } from "next-themes";
import { ScreenReaderOnly } from "components/ui/ScreenReaderOnly";
import { summarizeRegionData } from "utils/chartSeoUtils.tsx";
import {usePlayerStat} from "../../app/servers/[server_slug]/players/[player_id]/PlayerStatsPatch.tsx";

ChartJS.register(
    Title,
    Tooltip,
    Legend,
    PolarAreaController,
    ArcElement,
    RadialLinearScale
)
type RegionChartData = { x: string; y: number };
function PlayerRegionPlayTimeDisplay({ serverPlayerPromise }: { serverPlayerPromise: Promise<ServerPlayerDetailed>}){
    const t = useTranslations('players.region');
    const { server, player } = use(serverPlayerPromise);
    const playerId = !(player instanceof StillCalculate)? player.id: null
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';
    const server_id = server.id
    // The transform lives in a memo rather than in the fetch, so a patched value goes through exactly
    // the same shaping as a fetched one.
    const { data: regionData, loading, error } =
        usePlayerStat<PlayerRegionTime[]>(server_id, playerId, 'regions')
    const regions: RegionChartData[] = useMemo(
        () => (regionData ?? []).map(e => ({x: e.name, y: e.duration / 3600})),
        [regionData]
    )
    const options = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            r: {
                ticks: {
                    color: isDark ? 'hsl(215 20.2% 65.1%)' : 'hsl(215.4 16.3% 46.9%)',
                    backdropColor: isDark ? 'hsl(222.2 84% 4.9%)' : 'hsl(0 0% 100%)',
                },
                grid: {
                    color: isDark ? 'hsl(217.2 32.6% 17.5%)' : 'hsl(214.3 31.8% 91.4%)',
                },
                pointLabels: {
                    color: isDark ? 'hsl(210 40% 98%)' : 'hsl(222.2 47.4% 11.2%)',
                }
            }
        },
        plugins: {
            legend: {
                labels: {
                    color: isDark ? 'hsl(210 40% 98%)' : 'hsl(222.2 47.4% 11.2%)',
                }
            },
            tooltip: {
                backgroundColor: isDark ? 'rgba(50, 50, 50, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                titleColor: isDark ? 'hsl(210 40% 98%)' : 'hsl(222.2 47.4% 11.2%)',
                bodyColor: isDark ? 'hsl(210 40% 98%)' : 'hsl(222.2 47.4% 11.2%)',
                borderColor: isDark ? 'hsl(217.2 32.6% 17.5%)' : 'hsl(214.3 31.8% 91.4%)',
                borderWidth: 1,
            }
        }
    }
    const data = {
        labels: regions.map(e => e.x),
        datasets: [{
            label: t('hours'),
            data: regions.map(e => e.y),
            borderWidth: 2,
            borderColor: isDark ? 'hsl(217.2 32.6% 17.5%)' : 'hsl(0 0% 100%)',
            backgroundColor: regions.map(e => REGION_COLORS[e.x])
        }]
    }

    const summary = useMemo(() => {
        if (regions.length === 0) {
            return t('noData');
        }

        const totalHours = regions.reduce((sum, r) => sum + r.y, 0);
        const regionData = regions.map(r => ({
            region: r.x,
            hours: r.y * 3600,
            percentage: (r.y / totalHours) * 100
        }));

        return summarizeRegionData(regionData);
    }, [regions, t]);

    return (
        <div>
            <h2 className="text-xl font-semibold m-4">{t('title')}</h2>
            <div className="h-[350px] xl:h-[350px] lg:h-[385px] flex items-center justify-center m-4">
                {error &&
                    <div className="flex gap-4">
                        <AlertCircle className="w-5 h-5" />
                        <p>{error.message || t('genericError')}</p>
                    </div>}
                {!error && !loading && (
                    <>
                        <ScreenReaderOnly id="region-playtime-summary">
                            {summary}
                        </ScreenReaderOnly>
                        <div
                            role="img"
                            aria-label={t('ariaLabel')}
                            aria-describedby="region-playtime-summary"
                            style={{ width: '100%', height: '100%' }}
                        >
                            <PolarArea options={options}
                                // @ts-ignore
                                data={data}/>
                        </div>
                    </>
                )}
                {!error && loading && <div className="p-12"><Skeleton className="w-[250px] h-[250px] rounded-full" /> </div>}
            </div>
        </div>
    )
}
export default function PlayerRegionPlayTime({ serverPlayerPromise }: { serverPlayerPromise: Promise<ServerPlayerDetailed>}){
    const t = useTranslations('players.region');
    return <Card className="h-[500px] p-1">
        <ErrorCatch message={t('loadError')}>
            <PlayerRegionPlayTimeDisplay serverPlayerPromise={serverPlayerPromise}  />
        </ErrorCatch>
    </Card>
}
