'use client'
import MapSessionHeader from "components/sessions/MapSessionHeader.tsx";
import MapSessionStats from "components/sessions/MapSessionStats.tsx";
import { ServerPopChart } from "components/sessions/ServerPopChart.tsx";
import MapMatchScoreChart from "components/sessions/MapMatchScoreChart.tsx";
import SessionContinents from "components/sessions/SessionContinents.tsx";
import MutualSessionsDisplay from "components/sessions/MutualSessionsDisplay.tsx";
import {SessionStatGrid} from "components/sessions/SessionStats.tsx";
import {SessionChartCard, SessionLayout, useLiveSession} from "components/sessions/SessionLayout";
import getSessionData, { SessionData } from "./utils.ts";
import {Skeleton, SkeletonBadge, SkeletonText} from "components/ui/skeleton";
import {useTranslations} from "next-intl";

const statSkeleton = (width: string) => <SkeletonText className={`h-7 md:h-8 ${width}`} />;

export function MapSessionWrapperLoading() {
    const t = useTranslations('sessions');
    return <SessionLayout
        header={
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6">
                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <Skeleton className="size-9 rounded-md flex-shrink-0" />
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                        <Skeleton className="w-[100px] h-[80px] rounded-lg flex-shrink-0" />
                        <div className="min-w-0">
                            <div className="text-xl sm:text-2xl font-semibold">
                                <SkeletonText className="h-5 sm:h-6 w-[150px] sm:w-[200px]" />
                            </div>
                            <div className="text-sm">
                                <SkeletonText className="h-3.5 w-28" />
                            </div>
                        </div>
                    </div>
                </div>
                <SkeletonBadge className="sm:ml-auto w-[10.5rem]" />
            </div>
        }
        main={<>
            <SessionStatGrid stats={[
                [<>{statSkeleton('w-10')} {statSkeleton('w-12')}</>, t('totalDuration')],
                [statSkeleton('w-16 max-w-full'), t('matchScore')],
                [statSkeleton('w-16 max-w-full'), t('totalPlayers')],
                [statSkeleton('w-16 max-w-full'), t('serverPopRange')],
            ]} />
            <SessionChartCard title={t('serverPopTitle')} description={t('serverPopSubtitle')}>
                <Skeleton className="h-full w-full" />
            </SessionChartCard>
            <SessionChartCard title={t('matchScoreProgression')} description={<SkeletonText className="h-3.5 w-64 max-w-full" />}>
                <Skeleton className="h-full w-full" />
            </SessionChartCard>
            <SessionContinents />
        </>}
        side={<MutualSessionsDisplay type="map" />}
    />;
}

const reload = (data: SessionData) => getSessionData(data.server, data.mapName, `${data.sessionInfo.time_id}`);

export default function MapSessionWrapper({ initialData }: { initialData: SessionData }) {
    const { sessionInfo, mutualSessions, graphData, serverGraph, mapImage, continents, server } = useLiveSession(initialData, reload);

    return <SessionLayout
        header={<MapSessionHeader sessionInfo={sessionInfo} server={server} mapImage={mapImage?.small || null} />}
        main={<>
            <MapSessionStats
                sessionInfo={sessionInfo}
                mutualSessions={mutualSessions}
                serverGraph={serverGraph}
                graphMatch={graphData}
            />
            <ServerPopChart sessionInfo={sessionInfo} serverGraph={serverGraph} maps={null} />
            <MapMatchScoreChart sessionInfo={sessionInfo} graphMatch={graphData} />
            {sessionInfo && continents && <SessionContinents sessionInfo={sessionInfo} continents={continents} />}
        </>}
        side={<MutualSessionsDisplay server={server} mutualSessions={mutualSessions} type="map" />}
    />;
}
