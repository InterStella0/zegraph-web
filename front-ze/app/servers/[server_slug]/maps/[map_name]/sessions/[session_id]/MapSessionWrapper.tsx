'use client'
import MapSessionHeader from "components/sessions/MapSessionHeader.tsx";
import MapSessionStats from "components/sessions/MapSessionStats.tsx";
import { ServerPopChart } from "components/sessions/ServerPopChart.tsx";
import MapMatchScoreChart from "components/sessions/MapMatchScoreChart.tsx";
import SessionContinents from "components/sessions/SessionContinents.tsx";
import MutualSessionsDisplay from "components/sessions/MutualSessionsDisplay.tsx";
import { useEffect, useState } from "react";
import getSessionData, { SessionData } from "./utils.ts";
import {AdSpot} from "components/ui/AdSpot";
import {Skeleton} from "components/ui/skeleton";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "components/ui/card";
import {useTranslations} from "next-intl";

export function MapSessionWrapperLoading() {
    const t = useTranslations('sessions');
    return (
        <div className="min-h-screen p-4 md:p-6 lg:p-8">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6">
                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <Skeleton className="size-9 rounded-md flex-shrink-0" />
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                        <Skeleton className="w-[100px] h-[80px] rounded-lg flex-shrink-0" />
                        <div className="min-w-0">
                            <div className="text-xl sm:text-2xl font-semibold">
                                <Skeleton className="inline-block align-middle h-5 sm:h-6 w-[150px] sm:w-[200px]" />{'\u200b'}
                            </div>
                            <div className="text-sm">
                                <Skeleton className="inline-block align-middle h-3.5 w-28" />{'\u200b'}
                            </div>
                        </div>
                    </div>
                </div>
                <Skeleton className="inline-flex border border-transparent px-2 py-0.5 text-xs rounded-full sm:ml-auto w-[10.5rem]">{'\u200b'}</Skeleton>
            </div>

            <AdSpot className="my-4" />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-6">
                <div className="lg:col-span-7 xl:col-span-8 space-y-6">
                    <Card className="mb-6">
                        <CardContent className="p-6">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                                {[t('totalDuration'), t('matchScore'), t('totalPlayers'), t('serverPopRange')].map((label, i) => (
                                    <div key={label} className="text-center">
                                        <div className="text-3xl md:text-4xl font-bold mb-1">
                                            {i === 0 ? (
                                                <>
                                                    <Skeleton className="inline-block align-middle h-7 md:h-8 w-10" /> <Skeleton className="inline-block align-middle h-7 md:h-8 w-12" />
                                                </>
                                            ) : (
                                                <Skeleton className="inline-block align-middle h-7 md:h-8 w-16 max-w-full" />
                                            )}{'\u200b'}
                                        </div>
                                        <div className="text-sm text-muted-foreground">
                                            {label}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="mb-6">
                        <CardHeader>
                            <CardTitle>{t('serverPopTitle')}</CardTitle>
                            <CardDescription>{t('serverPopSubtitle')}</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Skeleton className="h-[300px] w-full" />
                        </CardContent>
                    </Card>
                    <Card className="mb-6">
                        <CardHeader>
                            <CardTitle>{t('matchScoreProgression')}</CardTitle>
                            <CardDescription>
                                <Skeleton className="inline-block align-middle h-3.5 w-64 max-w-full" />{'\u200b'}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Skeleton className="h-[300px] w-full" />
                        </CardContent>
                    </Card>
                    <Card className="p-0 gap-0 overflow-hidden">
                        <CardHeader className="px-5 pt-5">
                            <CardTitle>{t('continentDistribution')}</CardTitle>
                        </CardHeader>
                        <CardDescription className="px-5 pt-0 mb-3">
                            {t('continentSubtitle')}
                        </CardDescription>
                        <CardContent className="p-0">
                            <div className="mx-5 mb-5">
                                <div className="mt-2">
                                    <div className="space-y-3">
                                        {Array.from({length: 6}).map((_, i) => (
                                            <div key={i}>
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-sm font-medium">
                                                        <Skeleton className="inline-block align-middle h-3.5 w-24" />{'\u200b'}
                                                    </span>
                                                    <span className="text-sm font-semibold">
                                                        <Skeleton className="inline-block align-middle h-3.5 w-12" />{'\u200b'}
                                                    </span>
                                                </div>
                                                <Skeleton className="h-2 w-full rounded-full" />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <Skeleton className="w-full h-[45vh] rounded-none" />
                        </CardContent>
                    </Card>
                </div>

                <div className="lg:col-span-5 xl:col-span-4">
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle>{t('players')}</CardTitle>
                                <Skeleton className="h-9 w-44" />
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            {Array.from({length: 30}).map((_, i) => (
                                <div key={i} className="flex items-center gap-4 p-4 border-b last:border-0">
                                    <Skeleton className="w-[40px] h-[40px] rounded-full flex-shrink-0" />
                                    <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-4">
                                        <div className="min-w-0">
                                            <div className="font-medium">
                                                <Skeleton className="inline-block align-middle h-4" style={{width: `${5 + (i * 3) % 6}rem`}} />{'\u200b'}
                                            </div>
                                            <div className="text-sm hidden sm:block">
                                                <Skeleton className="inline-block align-middle h-3.5 w-36" />{'\u200b'}
                                            </div>
                                        </div>
                                        <div className="text-sm font-semibold flex-shrink-0">
                                            <Skeleton className="inline-block align-middle h-3.5 w-16" />{'\u200b'}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

export default function MapSessionWrapper({ initialData }: { initialData: SessionData }) {
    const [data, setData] = useState<SessionData>(initialData)

    useEffect(() => {
        if (data.sessionInfo.ended_at !== null) return

        const loadCurrentMatch = async () => {
            const fresh = await getSessionData(
                data.server,
                data.mapName,
                `${data.sessionInfo.time_id}`
            )

            setData(fresh)
        }

        loadCurrentMatch().catch(console.error)
        const interval = setInterval(loadCurrentMatch, 65_000)
        return () => clearInterval(interval)
    }, [
        data.server,
        data.mapName,
        data.sessionInfo.time_id,
        data.sessionInfo.ended_at,
    ])

    const { sessionInfo, mutualSessions, graphData, serverGraph, mapImage, continents, server } = data

    return (
        <div className="min-h-screen p-4 md:p-6 lg:p-8">
            <MapSessionHeader sessionInfo={sessionInfo} server={server} mapImage={mapImage?.small || null} />

            <AdSpot className="my-4" />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-6">
                <div className="lg:col-span-7 xl:col-span-8 space-y-6">
                    <MapSessionStats
                        sessionInfo={sessionInfo}
                        mutualSessions={mutualSessions}
                        serverGraph={serverGraph}
                        graphMatch={graphData}
                    />
                    <ServerPopChart sessionInfo={sessionInfo} serverGraph={serverGraph} maps={null} />
                    <MapMatchScoreChart sessionInfo={sessionInfo} graphMatch={graphData} />
                    {sessionInfo && continents && <SessionContinents sessionInfo={sessionInfo} continents={continents} />}
                </div>

                <div className="lg:col-span-5 xl:col-span-4">
                    <MutualSessionsDisplay
                        server={server}
                        mutualSessions={mutualSessions}
                        type="map"
                    />
                </div>
            </div>
        </div>
    );
}
