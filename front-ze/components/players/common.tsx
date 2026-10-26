import {ReactNode, use} from "react";
import {cn} from "components/lib/utils";
import {StillCalculate} from "utils/generalUtils";
import {ServerPlayerDetailed} from "../../app/servers/[server_slug]/players/[player_id]/page.tsx";
import {usePlayerStat} from "../../app/servers/[server_slug]/players/[player_id]/PlayerStatsPatch.tsx";
import {PeriodChip} from "components/period/Period";

export type ServerPlayerProps = { serverPlayerPromise: Promise<ServerPlayerDetailed> };

export function useServerPlayer(serverPlayerPromise: Promise<ServerPlayerDetailed>) {
    const { server, player } = use(serverPlayerPromise);
    return { server, player, playerId: player instanceof StillCalculate ? null : player.id };
}

export function useServerPlayerStat<T>(serverPlayerPromise: Promise<ServerPlayerDetailed>, path: string) {
    const { server, playerId } = useServerPlayer(serverPlayerPromise);
    return usePlayerStat<T>(server.id, playerId, path);
}

export function PeriodTitle({ title, className, titleClassName = "text-xl font-semibold" }: {
    title: ReactNode, className?: string, titleClassName?: string,
}) {
    return (
        <div className={cn("flex items-center gap-2", className)}>
            <h2 className={titleClassName}>{title}</h2>
            <PeriodChip />
        </div>
    );
}
