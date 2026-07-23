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

export function MapSessionWrapperLoading() {
    return (
        <div className="min-h-screen p-4 md:p-6 lg:p-8">
            <Skeleton className="rounded-lg h-40 w-full" />

            <div className="my-4">
                <Skeleton className="rounded-lg h-24 w-full" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-6">
                <div className="lg:col-span-7 xl:col-span-8 space-y-6">
                    <Skeleton className="rounded-lg h-64 w-full" />
                    <Skeleton className="rounded-lg h-96 w-full" />
                    <Skeleton className="rounded-lg h-96 w-full" />
                </div>

                <div className="lg:col-span-5 xl:col-span-4">
                    <Skeleton className="rounded-lg h-[600px] w-full" />
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
