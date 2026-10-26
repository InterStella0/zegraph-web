'use client'
import {DependencyList, useMemo} from "react";
import {Server} from "types/community";
import {ServerMapPlayed} from "types/maps";
import {fetchMapUrl} from "utils/generalUtils";
import {useServerData} from "../../app/servers/[server_slug]/ServerDataProvider";
import {useMapContext} from "../../app/servers/[server_slug]/maps/[map_name]/MapContext";
import {useServerMap} from "components/ui/ServerProvider";
import {usePeriod} from "components/period/Period";
import {useResource} from "lib/hooks/useResource";

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

type MapResourceOptions<T> = Omit<NonNullable<Parameters<typeof useResource<T>>[2]>, 'seed'> & {
    params?: Record<string, unknown>,
    deps?: DependencyList,
}

/**
 * Fetches a map endpoint for the current server (or every server on the global page) and period.
 * `seed` is the server-streamed first page; StillCalculate responses are retried.
 */
export function useMapResource<T>(endpoint: string, seed?: Promise<T | null> | null, options: MapResourceOptions<T> = {}) {
    const { params, deps = [], ...resourceOptions } = options
    const { name } = useMapContext<unknown>()
    const { period } = usePeriod()
    const { server, fetchMap } = useMapScope()
    return useResource<T>(signal => name
        ? fetchMap(endpoint, { params: period ? { ...params, period } : params, signal })
        : null, [server?.id, name, period, ...deps], { seed, retryNotReady: true, ...resourceOptions })
}
