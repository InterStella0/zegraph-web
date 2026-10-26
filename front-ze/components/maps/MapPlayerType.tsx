'use client'
import {secondsToHours} from "utils/generalUtils.ts";
import {LazyDoughnutChart as Doughnut} from 'components/graphs/LazyCharts';
import {useMapResource} from "lib/hooks/useMapScope";
import {MapPlayerTypeTime} from "types/players.ts";
import { Card } from "components/ui/card";
import { Skeleton } from "components/ui/skeleton";
import { AlertCircle } from "lucide-react";
import {useChartTheme} from "lib/chartTheme";
import { ScreenReaderOnly } from "components/ui/ScreenReaderOnly";
import { summarizePlayerTypes } from "utils/chartSeoUtils.tsx";
import {useTranslations, useLocale} from 'next-intl';
import MapCardTitle from "components/maps/MapCardTitle";
import {withMapSuspense} from "components/maps/withMapSuspense";

type MapPlayerTypeProps = { initialDataPromise?: Promise<MapPlayerTypeTime[] | null> }

function MapPlayerTypeDisplay({ initialDataPromise }: MapPlayerTypeProps) {
    const t = useTranslations('maps.playerType');
    const tCommon = useTranslations('common');
    const locale = useLocale();
    const theme = useChartTheme();
    const { data, loading, error } = useMapResource<MapPlayerTypeTime[]>('/player_types', initialDataPromise, {
        errorLog: 'Error fetching player types data:',
    });
    const playerTypes = data ?? [];
    const totalSeconds = playerTypes.reduce((sum, p) => sum + p.time_spent, 0);
    const categoryColors = { mixed: theme.primary, casual: theme.success, tryhard: theme.destructive };

    const chartData = {
        labels: playerTypes.map(p => p.category),
        datasets: [{
            label: t('playerHours'),
            data: playerTypes.map(p => p.time_spent),
            backgroundColor: playerTypes.map(p => categoryColors[p.category] || theme.muted),
            hoverOffset: 10,
            borderWidth: 2,
            borderColor: theme.background,
        }],
    };
    const options: any = {
        maintainAspectRatio: true,
        plugins: {
            tooltip: {
                ...theme.tooltip,
                callbacks: {
                    label: (context: any) => {
                        const percent = ((context.raw / totalSeconds) * 100).toFixed(1);
                        return `${context.label}: ${tCommon('hours', {value: secondsToHours(context.raw, locale)})} (${percent}%)`;
                    },
                },
            },
            legend: { position: 'bottom', labels: { color: theme.foreground } },
        },
    };

    const summary = playerTypes.length === 0 ? t('noData') : summarizePlayerTypes(playerTypes.map(p => ({
        type: p.category,
        hours: p.time_spent,
        percentage: (p.time_spent / totalSeconds) * 100,
    })));

    return (
    <Card className="p-6">
        <MapCardTitle title={t('title')} tooltip={t('tooltip')} />

        {!error && !loading && (
            <ScreenReaderOnly id="player-type-summary">
                {summary}
            </ScreenReaderOnly>
        )}

        <div
            className="flex justify-center items-center mb-4"
            role="img"
            aria-label={t('title')}
            aria-describedby="player-type-summary"
        >
            {!error && loading && <div className="w-[300px] h-[300px] flex items-center justify-center"><Skeleton className="w-[250px] h-[250px] rounded-full" /></div>}
            {error &&
                <div className="flex gap-4 min-h-[300px] items-center">
                    <AlertCircle className="w-5 h-5" />
                    <p>{error.message || t('somethingWrong')}</p>
                </div>}
            {!error && !loading && <div className="max-h-[300px] max-w-[300px]">
                <Doughnut data={chartData} options={options}/>
            </div>}
        </div>
    </Card>
    );
}
export default withMapSuspense(MapPlayerTypeDisplay, t => t('maps.playerType.loadError'))
