import {ServerPlayerDetailedWithError} from "./page.tsx";
import {use} from "react";
import {notFound} from "next/navigation";
import {StillCalculate} from "utils/generalUtils.ts";
import PlayerCardDetail from "components/players/PlayerCardDetail.tsx";
import PlayerSessionList from "components/players/PlayerSessionList.tsx";
import PlayerTopMap from "components/players/PlayerTopMap.tsx";
import PlayerRegionPlayTime from "components/players/PlayerRegionPlayTime.tsx";
import PlayerInfractionRecord from "components/players/PlayerInfractionRecord.tsx";
import PlayerHourOfDay from "components/players/PlayerHourOfDay.tsx";
import StillCalculatingPlayer from "./StillCalculatingPlayer.tsx";
import AccessDenied from "./AccessDenied.tsx";

export default function ResolvePlayerInformation({ serverPlayerPromise }: { serverPlayerPromise: Promise<ServerPlayerDetailedWithError> }) {
    const { player, error } = use(serverPlayerPromise)

    if (error && error.code === 403) {
        return <AccessDenied />;
    }

    if (error && error.code === 404) {
        notFound();
    }

    if (player === null || player === undefined || player instanceof StillCalculate || !player.id) {
        return <StillCalculatingPlayer />;
    }

    return   <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 xl:col-span-8">
            <PlayerCardDetail serverPlayerPromise={serverPlayerPromise} />
        </div>
        <div className="col-span-12 md:col-span-6 xl:col-span-4">
            <PlayerSessionList serverPlayerPromise={serverPlayerPromise} />
        </div>
        <div className="col-span-12 md:col-span-6 xl:col-span-8">
            <PlayerTopMap serverPlayerPromise={serverPlayerPromise} />
        </div>
        <div className="col-span-12 md:col-span-6 xl:col-span-4">
            <PlayerRegionPlayTime serverPlayerPromise={serverPlayerPromise} />
        </div>
        <div className="col-span-12 md:col-span-6 xl:col-span-4">
            <PlayerInfractionRecord serverPlayerPromise={serverPlayerPromise} />
        </div>
        <div className="col-span-12 xl:col-span-8">
            <PlayerHourOfDay serverPlayerPromise={serverPlayerPromise} />
        </div>
    </div>
}