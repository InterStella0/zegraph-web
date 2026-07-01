'use client';
import dynamic from 'next/dynamic';
import {useEffect, useState} from 'react';
import {Card, CardContent} from 'components/ui/card';
import {Badge} from 'components/ui/badge';
import {Skeleton} from 'components/ui/skeleton';
import {GlobalGeoStatistics} from 'types/home';
import {fetchGlobalGeo} from './homeData';

// The map itself is a QGIS WMS layer covering all servers (see WorldRadarMap), so it
// renders regardless of the geo endpoint. The geo fetch only drives the header/legend.
const WorldRadarMap = dynamic(() => import('./WorldRadarMap'), {
    ssr: false,
    loading: () => <Skeleton className="h-full w-full rounded-md" />,
});

const REGION_DOT = '#34d399';

export default function WherePlayersMap() {
    const [geo, setGeo] = useState<GlobalGeoStatistics | null>(null);
    // Bumped every minute to slide the WMS time window forward (keeps the map ~live).
    const [refreshKey, setRefreshKey] = useState(0);

    useEffect(() => {
        const controller = new AbortController();
        const load = () => {
            fetchGlobalGeo(controller.signal).then(data => {
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

    const regions = geo?.regions ?? [];
    const sortedRegions = [...regions].sort((a, b) => b.count - a.count);
    const hasData = regions.length > 0;

    return (
        <Card className="h-full">
            <CardContent className="p-4 sm:p-6 flex flex-col h-full">
                <div className="flex flex-row items-start justify-between gap-2 mb-3">
                    <div>
                        <h2 className="text-base sm:text-lg font-semibold">Where players are</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            {geo
                                ? `${geo.total_online.toLocaleString()} online · ${geo.country_count} countries`
                                : 'Live player distribution'}
                        </p>
                    </div>
                    <Badge variant="outline" className="font-mono text-[10px]">live sessions</Badge>
                </div>

                <div className="relative flex-1 min-h-[220px] rounded-md overflow-hidden bg-muted/30">
                    <WorldRadarMap refreshKey={refreshKey} />
                </div>

                {hasData && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
                        {sortedRegions.map(region => (
                            <div key={region.name} className="flex flex-row items-center gap-1.5">
                                <span className="h-2 w-2 rounded-full" style={{backgroundColor: REGION_DOT}} />
                                <span className="text-xs text-muted-foreground">{region.name}</span>
                                <span className="text-xs font-medium">{region.count.toLocaleString()}</span>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
