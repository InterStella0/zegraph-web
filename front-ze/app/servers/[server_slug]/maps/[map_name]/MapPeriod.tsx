"use client"
import {ReactNode, useCallback} from "react";
import {fetchServerUrl} from "utils/generalUtils";
import {PeriodProvider} from "components/period/Period";

export function MapPeriodProvider({ serverId, mapName, children }: {
    serverId: string,
    mapName: string,
    children: ReactNode,
}) {
    const fetchPeriods = useCallback(
        () => fetchServerUrl(serverId, `/maps/${mapName}/periods`),
        [serverId, mapName],
    );
    return <PeriodProvider fetchPeriods={fetchPeriods}>{children}</PeriodProvider>;
}
