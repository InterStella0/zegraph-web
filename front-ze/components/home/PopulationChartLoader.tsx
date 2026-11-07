'use client';
import dynamic from 'next/dynamic';
import {Suspense} from 'react';
import {useTranslations} from 'next-intl';
import {Card, CardContent} from 'components/ui/card';
import {Skeleton, SkeletonText} from 'components/ui/skeleton';
import {range} from 'utils/generalUtils';
import type {PopulationChartProps} from './PopulationChart';

function PopulationChartLoading() {
    const t = useTranslations('home');
    return (
        <Card className="h-full">
            <CardContent className="p-4 sm:p-6 flex flex-col h-full">
                <div className="flex flex-col gap-2 mb-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                        <div className="bg-muted text-muted-foreground flex h-9 w-full items-center rounded-lg p-[3px] text-sm font-medium sm:inline-flex sm:w-fit">
                            <span className="flex-1 truncate text-center rounded-md bg-background px-2.5 py-1 text-foreground shadow-sm dark:bg-input/30">{t('uniquePlayers')}</span>
                            <span className="flex-1 truncate text-center px-2.5 py-1">{t('concurrentPlayers')}</span>
                        </div>
                        <div className="text-xs mt-1.5">
                            <SkeletonText className="h-3 w-28" />
                        </div>
                    </div>
                    <div className="flex flex-row flex-wrap items-center justify-between gap-2 sm:justify-end">
                        <Skeleton className="h-8 w-[9.4rem]" />
                        <Skeleton className="h-[1.875rem] w-[9.55rem] sm:w-[10.3rem]" />
                        <Skeleton className="hidden lg:block h-8 w-8" />
                    </div>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3 min-h-4">
                    {range(6).map(i => <Skeleton key={i} className="h-4 w-[5.5rem]" />)}
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

export default function PopulationChartLoader(props: PopulationChartProps) {
    return (
        <Suspense fallback={<PopulationChartLoading />}>
            <PopulationChart {...props} />
        </Suspense>
    );
}
