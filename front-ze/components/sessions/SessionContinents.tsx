'use client'
import dynamic from "next/dynamic";
import {useTranslations} from 'next-intl';
import dayjs from "lib/dayjs";
import {Card, CardHeader, CardTitle, CardContent, CardDescription} from "components/ui/card";
import {Skeleton, SkeletonText} from "components/ui/skeleton";
import PlayerContinentCounter from "components/players/PlayerContinentCounter.tsx";
import {range} from "utils/generalUtils";
import {ServerMapPlayed} from "types/maps";
import {ContinentStatistics} from "types/players";

const RadarMap = dynamic(() => import("components/radars/RadarMap"), {
    ssr: false,
});

function ContinentsSkeleton() {
    return (
        <div className="mt-2">
            <div className="space-y-3">
                {range(6).map(i => (
                    <div key={i}>
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium">
                                <SkeletonText className="h-3.5 w-24" />
                            </span>
                            <span className="text-sm font-semibold">
                                <SkeletonText className="h-3.5 w-12" />
                            </span>
                        </div>
                        <Skeleton className="h-2 w-full rounded-full" />
                    </div>
                ))}
            </div>
        </div>
    );
}

/** Without data it renders as its own loading skeleton. */
export default function SessionContinents({ sessionInfo, continents }: {
    sessionInfo?: ServerMapPlayed, continents?: ContinentStatistics,
}) {
    const t = useTranslations('sessions');
    return (
        <Card className="p-0 gap-0 overflow-hidden">
            <CardHeader className="px-5 pt-5">
                <CardTitle>{t('continentDistribution')}</CardTitle>
            </CardHeader>
            <CardDescription className="px-5 pt-0 mb-3">
                {t('continentSubtitle')}
            </CardDescription>
            <CardContent className="p-0">
                <div className="mx-5 mb-5">
                    {continents ? <PlayerContinentCounter continentData={continents} truncate={6} /> : <ContinentsSkeleton />}
                </div>
                {sessionInfo ? (
                    <RadarMap
                        dateDisplay={{ start: dayjs(sessionInfo.started_at), end: sessionInfo.ended_at ? dayjs(sessionInfo.ended_at) : dayjs() }}
                        height="45vh"
                    />
                ) : (
                    <Skeleton className="w-full h-[45vh] rounded-none" />
                )}
            </CardContent>
        </Card>
    );
}
