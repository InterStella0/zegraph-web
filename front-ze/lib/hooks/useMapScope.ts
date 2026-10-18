'use client'
import {useMemo} from "react";
import {Server} from "types/community";
import {ServerMapPlayed} from "types/maps";
import {fetchMapUrl} from "utils/generalUtils";
import {useServerData} from "../../app/servers/[server_slug]/ServerDataProvider";
import {useMapContext} from "../../app/servers/[server_slug]/maps/[map_name]/MapContext";
import {useServerMap} from "components/ui/ServerProvider";

export type MapScope = {
    server: Server | null,
    fetchMap: (endpoint: string, options?: object) => Promise<any>,
    sessionHref: (session: ServerMapPlayed) => string,
    playerHref: (playerId: string) => string,
    mapHref: (map: string) => string,
}

export function useMapScope(): MapScope {
    const server = useServerData()?.server ?? null
    const { name } = useMapContext<unknown>()
    const { serversMapped } = useServerMap()

    return useMemo(() => ({
        server,
        fetchMap: (endpoint, options = {}) => fetchMapUrl(server?.id ?? null, name, endpoint, options),
        sessionHref: session => {
            const slug = server?.gotoLink ?? serversMapped.get(session.server_id)?.gotoLink ?? session.server_id
            return `/servers/${slug}/maps/${session.map || name}/sessions/${session.time_id}`
        },
        playerHref: playerId => server
            ? `/servers/${server.gotoLink}/players/${playerId}`
            : `/players/${playerId}/profile`,
        mapHref: map => server ? `/servers/${server.gotoLink}/maps/${map}` : `/maps/${map}`,
    }), [server, name, serversMapped])
}
