'use client'
import {SessionHeader} from "components/sessions/SessionHeader.tsx";
import {SessionStats} from "components/sessions/SessionStats.tsx";
import {ServerPopChart} from "components/sessions/ServerPopChart.tsx";
import MatchScoreChart from "components/sessions/MatchScoreChart.tsx";
import MapsList from "components/sessions/MapsList.tsx";
import MutualSessionsDisplay from "components/sessions/MutualSessionsDisplay.tsx";
import {use, useEffect, useState} from "react";
import {getSessionData, SessionData} from "./utils.ts";
import {AdSpot} from "components/ui/AdSpot";


export default function SessionPlayerWrapper({ sessionPromise }: { sessionPromise: Promise<SessionData> }) {
    const serverData = use(sessionPromise)
    const [data, setData] = useState<SessionData>(serverData)

    // Preserve 65s polling for live sessions
    useEffect(() => {
        if (data.sessionInfo.ended_at !== null) return

        const loadCurrentMatch = async () => {
            const fresh = await getSessionData(
                data.server,
                data.player.id,
                data.sessionInfo.id
            )
            setData(fresh)
        }

        loadCurrentMatch().catch(console.error)
        const interval = setInterval(loadCurrentMatch, 65_000)
        return () => clearInterval(interval)
    }, [
        data.server,
        data.player.id,
        data.sessionInfo.id,
        data.sessionInfo.ended_at,
    ])

    const {
        server,
        player,
        sessionInfo,
        mutualSessions,
        serverGraph,
        maps,
        mapImages,
    } = data

    return (
        <div className="min-h-screen p-4 md:p-6 lg:p-8">
            <SessionHeader
                server={server}
                player={player}
                sessionInfo={sessionInfo}
            />

            <AdSpot className="my-4" />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-6">
                <div className="lg:col-span-7 xl:col-span-8 space-y-6">
                    <SessionStats
                        sessionInfo={sessionInfo}
                        maps={maps}
                        mutualSessions={mutualSessions}
                        serverGraph={serverGraph}
                    />

                    <ServerPopChart
                        sessionInfo={sessionInfo}
                        maps={maps}
                        serverGraph={serverGraph}
                    />

                    <MatchScoreChart
                        sessionInfo={sessionInfo}
                        maps={maps}
                    />

                    <MapsList
                        server={server}
                        maps={maps}
                        mapImages={mapImages}
                    />
                </div>

                <div className="lg:col-span-5 xl:col-span-4">
                    <MutualSessionsDisplay
                        server={server}
                        mutualSessions={mutualSessions}
                        type="player"
                    />
                </div>
            </div>
        </div>
    )
}
