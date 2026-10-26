'use client';
import dynamic from 'next/dynamic';
import {Suspense, use, useEffect, useState} from 'react';
import {Card, CardContent} from 'components/ui/card';
import {Badge} from 'components/ui/badge';
import {Skeleton} from 'components/ui/skeleton';
import {ContinentStatistics} from 'types/players';
import ContinentChips from './ContinentChips';
import {fetchGlobalContinents} from './homeData';
import {useTranslations} from 'next-intl';

const WorldRadarMap = dynamic(() => import('./WorldRadarMap'), {
    ssr: false,
    loading: () => <Skeleton className="h-full w-full rounded-md" />,
});

type GeoProps = {
    continentsPromise: Promise<ContinentStatistics | null>,
    refreshed: ContinentStatistics | null | undefined,
};

function useGeo({continentsPromise, refreshed}: GeoProps): ContinentStatistics | null {
    const initial = use(continentsPromise);
    return refreshed === undefined ? initial : refreshed;
}

function OnlineCount(props: GeoProps) {
    const t = useTranslations('home');
    const geo = useGeo(props);
    return geo ? t('onlineCount', {count: geo.total_count}) : t('liveDistribution');
}

function Continents(props: GeoProps) {
    const geo = useGeo(props);
    return geo && geo.total_count > 0 ? <ContinentChips continentData={geo} /> : null;
}

const CONTINENT_CHIP_WIDTHS = [128, 70, 80, 125, 85, 90];

function ContinentsLoading() {
    return (
        <div className="flex flex-wrap gap-1.5 mt-3">
            {CONTINENT_CHIP_WIDTHS.map((width, i) => <Skeleton key={i} className="h-6 rounded-full" style={{width}} />)}
        </div>
    );
}

export default function WherePlayersMap({continentsPromise}: {continentsPromise: Promise<ContinentStatistics | null>}) {
    const t = useTranslations('home');
    const [refreshed, setRefreshed] = useState<ContinentStatistics | null | undefined>();
    const [refreshKey, setRefreshKey] = useState(0);

    useEffect(() => {
        const controller = new AbortController();
        const interval = setInterval(() => {
            fetchGlobalContinents(controller.signal).then(data => {
                if (!controller.signal.aborted) setRefreshed(data);
            });
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
                        <h2 className="text-base sm:text-lg font-semibold">{t('wherePlayersAre')}</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            <Suspense fallback={t('liveDistribution')}>
                                <OnlineCount continentsPromise={continentsPromise} refreshed={refreshed} />
                            </Suspense>
                        </p>
                    </div>
                    <Badge variant="outline" className="font-mono text-[10px]">{t('liveSessions')}</Badge>
                </div>

                <div className="relative flex-1 min-h-[220px] rounded-md overflow-hidden bg-muted/30">
                    <WorldRadarMap refreshKey={refreshKey} />
                </div>

                <Suspense fallback={<ContinentsLoading />}>
                    <Continents continentsPromise={continentsPromise} refreshed={refreshed} />
                </Suspense>
            </CardContent>
        </Card>
    );
}
