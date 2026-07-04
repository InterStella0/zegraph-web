'use client';
import dynamic from 'next/dynamic';
import {useEffect, useState} from 'react';
import {Card, CardContent} from 'components/ui/card';
import {Badge} from 'components/ui/badge';
import {Skeleton} from 'components/ui/skeleton';
import {ContinentStatistics} from 'types/players';
import PlayerContinentCounter from 'components/players/PlayerContinentCounter';
import {fetchGlobalContinents} from './homeData';

const WorldRadarMap = dynamic(() => import('./WorldRadarMap'), {
    ssr: false,
    loading: () => <Skeleton className="h-full w-full rounded-md" />,
});

export default function WherePlayersMap() {
    const [geo, setGeo] = useState<ContinentStatistics | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);

    useEffect(() => {
        const controller = new AbortController();
        const load = () => {
            fetchGlobalContinents(controller.signal).then(data => {
                if (controller.signal.aborted) return;
                setGeo(data);
            });
        };
        load();
        const interval = setInterval(() => {
            load();
            setRefreshKey(k => k + 1);
        }, 60_000);
        return () => {
            controller.abort();
            clearInterval(interval);
        };
    }, []);

    return (
        <Card className="h-full">
            <CardContent className="p-4 sm:p-6 flex flex-col h-full">
                <div className="flex flex-row items-start justify-between gap-2 mb-3">
                    <div>
                        <h2 className="text-base sm:text-lg font-semibold">Where players are</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            {geo
                                ? `${geo.total_count.toLocaleString()} online`
                                : 'Live player distribution'}
                        </p>
                    </div>
                    <Badge variant="outline" className="font-mono text-[10px]">live sessions</Badge>
                </div>

                <div className="relative flex-1 min-h-[220px] rounded-md overflow-hidden bg-muted/30">
                    <WorldRadarMap refreshKey={refreshKey} />
                </div>

                {geo && geo.total_count > 0 && (
                    <PlayerContinentCounter continentData={geo} truncate={6} />
                )}
            </CardContent>
        </Card>
    );
}
