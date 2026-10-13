'use client';
import dynamic from 'next/dynamic';
import {Card, CardContent} from 'components/ui/card';
import {Skeleton} from 'components/ui/skeleton';

const PopulationChart = dynamic(() => import('./PopulationChart'), {
    ssr: false,
    loading: () => (
        <Card className="h-full">
            <CardContent className="p-4 sm:p-6 flex flex-col h-full">
                <div className="flex flex-row items-start justify-between gap-2 mb-3">
                    <div>
                        <Skeleton className="h-6 sm:h-7 w-48" />
                        <Skeleton className="h-4 w-32 mt-0.5" />
                    </div>
                    <Skeleton className="h-8 w-40" />
                </div>
                <Skeleton className="h-4 w-64 mb-3" />
                <Skeleton className="flex-1 min-h-[240px] w-full rounded-md" />
            </CardContent>
        </Card>
    ),
});

type Props = {
    isExpanded: boolean;
    onToggleExpand: () => void;
};

export default function PopulationChartLoader({isExpanded, onToggleExpand}: Props) {
    return <PopulationChart isExpanded={isExpanded} onToggleExpand={onToggleExpand} />;
}
