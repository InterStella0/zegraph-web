import {ServerPlayerDetailedWithError} from "./page.tsx";
import {use} from "react";
import {notFound} from "next/navigation";
import {StillCalculate} from "utils/generalUtils.ts";
import PlayerCardDetail from "components/players/PlayerCardDetail.tsx";
import PlayerSessionTabs from "components/players/PlayerSessionTabs.tsx";
import PlayerTopMap from "components/players/PlayerTopMap.tsx";
import PlayerRegionPlayTime from "components/players/PlayerRegionPlayTime.tsx";
import PlayerInfractionRecord from "components/players/PlayerInfractionRecord.tsx";
import PlayerHourOfDay from "components/players/PlayerHourOfDay.tsx";
import StillCalculatingPlayer from "./StillCalculatingPlayer.tsx";
import StalePlayerStats from "./StalePlayerStats.tsx";
import {PlayerStatSeedsProvider, PlayerStatsPatchProvider, PlayerStatSuspense} from "./PlayerStatsPatch.tsx";
import {PlayerPeriodProvider} from "./PlayerPeriod.tsx";
import PeriodSelector from "components/period/PeriodSelector.tsx";
import AccessDenied from "./AccessDenied.tsx";
import {SteamProfile} from "../../../../../next-auth-steam/steam.ts";

export default function ResolvePlayerInformation({ serverPlayerPromise, userPromise, statSeeds }: {
    serverPlayerPromise: Promise<ServerPlayerDetailedWithError>,
    userPromise: Promise<SteamProfile | null>,
    statSeeds: Record<string, Promise<unknown>>,
}) {
    const { player, server, error } = use(serverPlayerPromise)

    if (error && error.code === 403) {
        return <AccessDenied />;
    }

    if (error && error.code === 404) {
        notFound();
    }

    if (player === null || player === undefined || player instanceof StillCalculate || !player.id) {
        return <StillCalculatingPlayer />;
    }

    return <PlayerStatsPatchProvider>
        <PlayerStatSeedsProvider promises={statSeeds}>
        <PlayerPeriodProvider serverId={server.id} playerId={player.id}>
            <div className="grid grid-cols-12 gap-4">
                <div className="col-span-12">
                    <PeriodSelector />
                </div>
                {player.is_stale && <StalePlayerStats
                    serverId={server.id}
                    playerId={player.id}
                    calculatedAt={player.calculated_at}
                />}
                <div className="col-span-12 xl:col-span-8">
                    <PlayerCardDetail serverPlayerPromise={serverPlayerPromise} userPromise={userPromise} />
                </div>
                <div className="col-span-12 md:col-span-6 xl:col-span-4">
                    <PlayerStatSuspense>
                        <PlayerSessionTabs serverPlayerPromise={serverPlayerPromise} />
                    </PlayerStatSuspense>
                </div>
                <div className="col-span-12 md:col-span-6 xl:col-span-8">
                    <PlayerStatSuspense>
                        <PlayerTopMap serverPlayerPromise={serverPlayerPromise} />
                    </PlayerStatSuspense>
                </div>
                <div className="col-span-12 md:col-span-6 xl:col-span-4">
                    <PlayerStatSuspense>
                        <PlayerRegionPlayTime serverPlayerPromise={serverPlayerPromise} />
                    </PlayerStatSuspense>
                </div>
                <div className="col-span-12 md:col-span-6 xl:col-span-4">
                    <PlayerStatSuspense>
                        <PlayerInfractionRecord serverPlayerPromise={serverPlayerPromise} />
                    </PlayerStatSuspense>
                </div>
                <div className="col-span-12 xl:col-span-8">
                    <PlayerStatSuspense>
                        <PlayerHourOfDay serverPlayerPromise={serverPlayerPromise} />
                    </PlayerStatSuspense>
                </div>
            </div>
        </PlayerPeriodProvider>
        </PlayerStatSeedsProvider>
    </PlayerStatsPatchProvider>
}