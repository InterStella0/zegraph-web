'use client'
import {useTranslations} from 'next-intl';
import {REGION_COLORS} from "utils/generalUtils";
import { Card } from "components/ui/card";
import { Skeleton } from "components/ui/skeleton";
import {LazyPolarAreaChart as PolarArea} from "components/graphs/LazyCharts";
import ErrorCatch from "../ui/ErrorMessage.tsx";
import { AlertCircle } from "lucide-react";
import {PlayerRegionTime} from "types/players.ts";
import {useChartTheme} from "lib/chartTheme";
import { ScreenReaderOnly } from "components/ui/ScreenReaderOnly";
import { summarizeRegionData } from "utils/chartSeoUtils.tsx";
import {PeriodTitle, ServerPlayerProps, useServerPlayerStat} from "./common";

function PlayerRegionPlayTimeDisplay({ serverPlayerPromise }: ServerPlayerProps){
    const t = useTranslations('players.region');
    const theme = useChartTheme();
    const { data: regionData, loading, error } = useServerPlayerStat<PlayerRegionTime[]>(serverPlayerPromise, 'regions')
    const regions = (regionData ?? []).map(e => ({x: e.name, y: e.duration / 3600}))
    const options = {
        maintainAspectRatio: false,
        scales: {
            r: {
                ticks: { color: theme.muted, backdropColor: theme.background },
                grid: { color: theme.border },
                pointLabels: { color: theme.foreground },
            }
        },
        plugins: {
            legend: { labels: { color: theme.foreground } },
            tooltip: { ...theme.tooltip },
        }
    }
    const data = {
        labels: regions.map(e => e.x),
        datasets: [{
            label: t('hours'),
            data: regions.map(e => e.y),
            borderWidth: 2,
            borderColor: theme.isDark ? 'hsl(217.2 32.6% 17.5%)' : 'hsl(0 0% 100%)',
            backgroundColor: regions.map(e => REGION_COLORS[e.x])
        }]
    }

    const totalHours = regions.reduce((sum, r) => sum + r.y, 0);
    const summary = regions.length === 0 ? t('noData') : summarizeRegionData(regions.map(r => ({
        region: r.x,
        hours: r.y * 3600,
        percentage: (r.y / totalHours) * 100
    })));

    return (
        <div>
            <PeriodTitle title={t('title')} className="m-4" />
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
export default function PlayerRegionPlayTime({ serverPlayerPromise }: ServerPlayerProps){
    const t = useTranslations('players.region');
    return <Card className="h-[500px] p-1">
        <ErrorCatch message={t('loadError')}>
            <PlayerRegionPlayTimeDisplay serverPlayerPromise={serverPlayerPromise}  />
        </ErrorCatch>
    </Card>
}
