'use client'
import {Suspense, use, useMemo} from "react";
import {fetchServerUrl, secondsToHours} from "utils/generalUtils.ts";
import {LazyDoughnutChart as Doughnut} from 'components/graphs/LazyCharts';
import { Chart as ChartJS, ArcElement, Legend } from 'chart.js';
import ErrorCatch from "../ui/ErrorMessage.tsx";
import {EmptyMapContext, useMapContext} from "../../app/servers/[server_slug]/maps/[map_name]/MapContext";
import {PeriodChip, usePeriod} from "components/period/Period";
import {useServerData} from "../../app/servers/[server_slug]/ServerDataProvider";
import {useResource} from "lib/hooks/useResource";
import {MapPlayerTypeTime} from "types/players.ts";
import { Card } from "components/ui/card";
import { Button } from "components/ui/button";
import { Skeleton } from "components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "components/ui/tooltip";
import { Info, AlertCircle } from "lucide-react";
import {useChartTheme} from "lib/chartTheme";
import { ScreenReaderOnly } from "components/ui/ScreenReaderOnly";
import { summarizePlayerTypes } from "utils/chartSeoUtils.tsx";
import {useTranslations, useLocale} from 'next-intl';

ChartJS.register(ArcElement, Legend);

type MapPlayerTypeProps = { initialDataPromise?: Promise<MapPlayerTypeTime[] | null> }

function MapPlayerTypeDisplay({ initialDataPromise }: MapPlayerTypeProps) {
    const t = useTranslations('maps.playerType');
    const tCommon = useTranslations('common');
    const locale = useLocale();
    const { name } = useMapContext();
    const { period } = usePeriod();
    const { server } = useServerData();
    const server_id = server.id
    const theme = useChartTheme();
    const initialData = initialDataPromise ? use(initialDataPromise) : null
    const { data: fetched, loading, error } = useResource<MapPlayerTypeTime[]>(() => name
        ? fetchServerUrl(server_id, `/maps/${name}/player_types`, period ? { params: { period } } : {})
        : null, [server_id, name, period], { initial: initialData ?? undefined, retryNotReady: true, errorLog: 'Error fetching player types data:' });
    const playerTypes = fetched ?? [];

    const totalSeconds = playerTypes.reduce((sum, p) => sum + p.time_spent, 0);
    const categoryColors = {
        'mixed': theme.primary,
        'casual': theme.success,
        'tryhard': theme.destructive
    };

    const data = {
        labels: playerTypes.map(p => p.category),
        datasets: [
            {
                label: t('playerHours'),
                data: playerTypes.map(p => p.time_spent),
                backgroundColor: playerTypes.map(p => categoryColors[p.category] || (theme.muted)),
                hoverOffset: 10,
                borderWidth: 2,
                borderColor: theme.background,
            },
        ],
    };
    const options = {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
            tooltip: {
                ...theme.tooltip,
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
                    color: theme.foreground,
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
                <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-primary">{t('title')}</h2>
                    <PeriodChip />
                </div>
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
                {!error && loading && <div className="w-[300px] h-[300px] flex items-center justify-center"><Skeleton className="w-[250px] h-[250px] rounded-full" /></div>}
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
export default function MapPlayerType({ initialDataPromise }: MapPlayerTypeProps){
    const t = useTranslations('maps.playerType');
    return <ErrorCatch message={t('loadError')}>
        <Suspense fallback={<EmptyMapContext><MapPlayerTypeDisplay /></EmptyMapContext>}>
            <MapPlayerTypeDisplay initialDataPromise={initialDataPromise} />
        </Suspense>
    </ErrorCatch>
}