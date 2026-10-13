'use client';
import dynamic from 'next/dynamic';
import {Suspense} from 'react';
import {useTranslations} from 'next-intl';
import {Card, CardContent} from 'components/ui/card';
import {Skeleton} from 'components/ui/skeleton';
import {PopulationSeed} from './homeData';

function PopulationChartLoading() {
    const t = useTranslations('home');
    return (
        <Card className="h-full">
            <CardContent className="p-4 sm:p-6 flex flex-col h-full">
                <div className="flex flex-row items-start justify-between gap-2 mb-3">
                    <div>
                        <h2 className="text-base sm:text-lg font-semibold">{t('uniquePlayersByCommunity')}</h2>
                        <div className="text-xs mt-0.5">
                            <Skeleton className="inline-block align-middle h-3 w-28" />{'\u200b'}
                        </div>
                    </div>
                    <div className="flex flex-row flex-wrap items-center justify-end gap-2">
                        <Skeleton className="h-8 w-[9.4rem]" />
                        <Skeleton className="h-[1.875rem] w-[10.3rem]" />
                        <Skeleton className="h-8 w-8" />
                    </div>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3 min-h-4">
                    {Array.from({length: 5}).map((_, i) => <Skeleton key={i} className="h-4 w-[5.5rem]" />)}
                </div>
                <Skeleton className="flex-1 min-h-[240px] w-full rounded-md" />
            </CardContent>
        </Card>
    );
}

const PopulationChart = dynamic(() => import('./PopulationChart'), {
    ssr: false,
    loading: PopulationChartLoading,
});

type Props = {
    isExpanded: boolean;
    onToggleExpand: () => void;
    populationPromise: Promise<PopulationSeed | null>;
};

export default function PopulationChartLoader({isExpanded, onToggleExpand, populationPromise}: Props) {
    return (
        <Suspense fallback={<PopulationChartLoading />}>
            <PopulationChart isExpanded={isExpanded} onToggleExpand={onToggleExpand} populationPromise={populationPromise} />
        </Suspense>
    );
}
