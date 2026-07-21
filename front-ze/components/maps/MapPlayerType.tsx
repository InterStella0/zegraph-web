'use client'
import { useEffect, useMemo, useState} from "react";
import {fetchServerUrl, secondsToHours, StillCalculate} from "utils/generalUtils.ts";
import {LazyDoughnutChart as Doughnut} from 'components/graphs/LazyCharts';
import { Chart as ChartJS, ArcElement, Legend } from 'chart.js';
import ErrorCatch from "../ui/ErrorMessage.tsx";
import {useMapContext} from "../../app/servers/[server_slug]/maps/[map_name]/MapContext";
import {useServerData} from "../../app/servers/[server_slug]/ServerDataProvider";
import {useNotReadyRetry} from "lib/hooks/useNotReadyRetry";
import {MapPlayerTypeTime} from "types/players.ts";
import { Card } from "components/ui/card";
import { Button } from "components/ui/button";
import { Skeleton } from "components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "components/ui/tooltip";
import { Info, AlertCircle } from "lucide-react";
import { useTheme } from "next-themes";
import { ScreenReaderOnly } from "components/ui/ScreenReaderOnly";
import { summarizePlayerTypes } from "utils/chartSeoUtils.tsx";
import {useTranslations, useLocale} from 'next-intl';

ChartJS.register(ArcElement, Legend);

function MapPlayerTypeDisplay() {
    const t = useTranslations('maps.playerType');
    const tCommon = useTranslations('common');
    const locale = useLocale();
    const { name } = useMapContext();
    const { server } = useServerData();
    const server_id = server.id
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<Error | null>(null);
    const [playerTypes, setPlayerTypes] = useState<MapPlayerTypeTime[]>([]);
    const [retryTick, setRetryTick] = useState(0)
    const notReady = error instanceof StillCalculate
    useNotReadyRetry(notReady, () => setRetryTick(t => t + 1))

    useEffect(() => {
        setLoading(true);
        setError(null);
        setPlayerTypes([]);

        fetchServerUrl(server_id, `/maps/${name}/player_types`)
            .then(data => {
                setPlayerTypes(data)
            })
            .catch(err => {
                if (!(err instanceof StillCalculate)) {
                    console.error('Error fetching player types data:', err);
                }
                setError(err);
            })
            .finally(() => setLoading(false));
    }, [server_id, name, retryTick]);

    const totalSeconds = playerTypes.reduce((sum, p) => sum + p.time_spent, 0);
    const categoryColors = {
        'mixed': isDark ? 'hsl(217.2 91.2% 59.8%)' : 'hsl(221.2 83.2% 53.3%)',
        'casual': isDark ? 'hsl(142.1 76.2% 36.3%)' : 'hsl(142.1 70.6% 45.3%)',
        'tryhard': isDark ? 'hsl(0 84.2% 60.2%)' : 'hsl(0 72.2% 50.6%)'
    };

    const data = {
        labels: playerTypes.map(p => p.category),
        datasets: [
            {
                label: t('playerHours'),
                data: playerTypes.map(p => p.time_spent),
                backgroundColor: playerTypes.map(p => categoryColors[p.category] || (isDark ? 'hsl(215 20.2% 65.1%)' : 'hsl(215.4 16.3% 46.9%)')),
                hoverOffset: 10,
                borderWidth: 2,
                borderColor: isDark ? 'hsl(222.2 84% 4.9%)' : 'hsl(0 0% 100%)',
            },
        ],
    };
    const options = {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
            tooltip: {
                backgroundColor: isDark ? 'rgba(50, 50, 50, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                titleColor: isDark ? 'hsl(210 40% 98%)' : 'hsl(222.2 47.4% 11.2%)',
                bodyColor: isDark ? 'hsl(210 40% 98%)' : 'hsl(222.2 47.4% 11.2%)',
                borderColor: isDark ? 'hsl(217.2 32.6% 17.5%)' : 'hsl(214.3 31.8% 91.4%)',
                borderWidth: 1,
                callbacks: {
                    label: (context: any) => {
                        const count = context.raw;
                        const hours = secondsToHours(count, locale)
                        const percent = ((count / totalSeconds) * 100).toFixed(1);
                        return `${context.label}: ${tCommon('hours', {value: hours})} (${percent}%)`;
                    },
                },
            },
            legend: {
                position: 'bottom',
                labels: {
                    color: isDark ? 'hsl(210 40% 98%)' : 'hsl(222.2 47.4% 11.2%)',
                },
            },
        },
    };

    const summary = useMemo(() => {
        if (!playerTypes || playerTypes.length === 0) {
            return t('noData');
        }

        const playerTypeData = playerTypes.map(p => ({
            type: p.category,
            hours: p.time_spent,
            percentage: (p.time_spent / totalSeconds) * 100
        }));

        return summarizePlayerTypes(playerTypeData);
    }, [playerTypes, totalSeconds]);

    // @ts-ignore
    const DoughnutDisplay = <Doughnut data={data} options={options}/>
    return (
    <Card className="p-6">
        <TooltipProvider>
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-primary">{t('title')}</h2>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                            <Info className="h-4 w-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>{t('tooltip')}</p>
                    </TooltipContent>
                </Tooltip>
            </div>

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
                {!error && loading && <div className="p-12"><Skeleton className="w-[250px] h-[250px] rounded-full" /></div>}
                {error &&
                    <div className="flex gap-4 min-h-[300px] items-center">
                        <AlertCircle className="w-5 h-5" />
                        <p>{error.message || t('somethingWrong')}</p>
                    </div>}
                {!error && !loading && <div className="max-h-[300px] max-w-[300px]">
                    {DoughnutDisplay}
                </div>}
            </div>
        </TooltipProvider>
    </Card>
    );
}
export default function MapPlayerType(){
    const t = useTranslations('maps.playerType');
    return <ErrorCatch message={t('loadError')}>
        <MapPlayerTypeDisplay />
    </ErrorCatch>
}