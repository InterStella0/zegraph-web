"use client"
import {ReactNode, useCallback} from "react";
import {fetchApiServerUrl} from "utils/generalUtils";
import {PeriodProvider} from "components/period/Period";

export function PlayerPeriodProvider({ serverId, playerId, children }: {
    serverId: string,
    playerId: string,
    children: ReactNode,
}) {
    const fetchPeriods = useCallback(
        () => fetchApiServerUrl(serverId, `/players/${playerId}/periods`),
        [serverId, playerId],
    );
    return <PeriodProvider fetchPeriods={fetchPeriods}>{children}</PeriodProvider>;
}
