"use client"
import {ReactNode, useCallback} from "react";
import {fetchApiServerUrl} from "utils/generalUtils";
import {PeriodProvider, usePeriod} from "components/period/Period";

export {
    PeriodChip,
    formatPeriodMonth,
    monthPeriod,
    parsePeriod,
    periodBounds,
    splitPeriod,
    splitRange,
    usePeriodLabel,
} from "components/period/Period";
export type {Period as PlayerPeriod} from "components/period/Period";

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

export const usePlayerPeriod = usePeriod;
