'use client';
import dynamic from 'next/dynamic';
import {Card, CardContent} from 'components/ui/card';
import {Skeleton} from 'components/ui/skeleton';

const PopulationChart = dynamic(() => import('./PopulationChart'), {
    ssr: false,
    loading: () => (
        <Card className="h-full">
            <CardContent className="p-4 sm:p-6">
                <Skeleton className="h-6 w-48 mb-4" />
                <Skeleton className="h-[240px] w-full rounded-md" />
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
