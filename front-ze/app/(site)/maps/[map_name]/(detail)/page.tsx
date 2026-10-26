import {Metadata} from "next";
import {getTranslations} from "next-intl/server";
import {JsonLd} from "components/common/JsonLd";
import {loadMapDetail, mapJsonLd} from "components/maps/mapDetail";
import {MapContextProvider} from "app/servers/[server_slug]/maps/[map_name]/MapContext";
import getServerUser from "app/getServerUser.ts";
import {getCommunityData} from "app/getCommunity";
import {fetchApiUrl, fetchUrl, formatHours, formatTitle, orNotFound, orNull, socialMeta, withImageDomain} from "utils/generalUtils.ts";
import {GlobalMapDetail, GlobalMapInfo} from "types/maps";
import {BriefPlayers} from "types/players.ts";
import {recordView} from "lib/recordView";
import GlobalMapGrid, {GlobalMapSeeds} from "./GlobalMapGrid";

const mapEndpoint = (mapName: string, endpoint: string) => `/maps/${encodeURIComponent(mapName)}${endpoint}`

const getGlobalMapDetail = (mapName: string): Promise<GlobalMapDetail> => loadMapDetail(mapName,
    fetchApiUrl(mapEndpoint(mapName, '/info')),
    fetchUrl(mapEndpoint(mapName, '/analyze')),
)

export async function generateMetadata({ params }: {
    params: Promise<{ map_name: string }>
}): Promise<Metadata> {
    const { map_name } = await params
    const t = await getTranslations('metadata')
    const title = formatTitle(t('globalMapTitle', {map: map_name}))
    const alternates = { canonical: `/maps/${map_name}` }

    let info: GlobalMapInfo
    try {
        info = await fetchUrl(mapEndpoint(map_name, '/info'))
    } catch (error: any) {
        if (error?.code === 202) return { title, description: t('mapCalculating'), alternates }
        return { title, alternates }
    }
    const map = info.map
    const [{ serversMapped }, topPlayers] = await Promise.all([
        getCommunityData(),
        orNull<BriefPlayers>(fetchUrl(mapEndpoint(map_name, '/top_players'), { params: { page: 0 } })),
    ])

    const clauses: string[] = []
    if (info.creators) clauses.push(t('createdBy', {creators: info.creators}))
    const communities = new Set(map.servers.map(s => serversMapped.get(s.server_id)?.community_id ?? s.server_id))
    clauses.push(t('globalMapCumulative', {
        hours: formatHours(map.total_cum_time),
        servers: map.servers.length,
        communities: communities.size,
        players: map.unique_players,
    }))
    const topServer = map.servers.reduce<GlobalMapInfo['map']['servers'][number] | null>(
        (top, s) => !top || s.total_cum_time > top.total_cum_time ? s : top, null
    )
    if (topServer) {
        const server = serversMapped.get(topServer.server_id)
        clauses.push(t('globalMapTopServer', {
            server: server ? `${server.community_name} ${server.name}` : topServer.server_id,
            hours: formatHours(topServer.total_cum_time),
        }))
    }
    const first = topPlayers?.players?.[0]
    if (first && !first.is_anonymous)
        clauses.push(t('mostActivePlayer', {name: first.name, hours: formatHours(first.total_playtime)}))

    const description = clauses.join(' ')
    const image = map.image ? withImageDomain({...map.image}).large : null
    return {
        title,
        description,
        alternates,
        ...socialMeta({title, description, url: `/maps/${map_name}`, images: image ? [image] : []}),
    }
}

export default async function Page({ params }: { params: Promise<{ map_name: string }> }) {
    const { map_name } = await params
    const seed = <T,>(endpoint: string, options = {}): Promise<T | null> =>
        orNull(fetchUrl(mapEndpoint(map_name, endpoint), options))
    const seeds: GlobalMapSeeds = {
        musics: fetchUrl(mapEndpoint(map_name, '/musics')).catch(() => []),
        heatServers: seed('/heat-servers'),
        sessions: seed('/sessions', { params: { page: 0 } }),
        topPlayers: seed('/top_players', { params: { page: 0 } }),
        distribution: seed('/sessions_distribution'),
        playerTypes: seed('/player_types'),
    }
    const user = await getServerUser()
    const detail = await orNotFound(getGlobalMapDetail(map_name))
    const viewsPromise = recordView('maps', map_name)

    const { analyze, info } = detail
    const jsonLd = analyze && mapJsonLd(map_name, analyze, `across ${info?.map.servers.length ?? 0} servers`, `/maps/${map_name}`, info?.creators)

    return (
        <>
            <JsonLd data={jsonLd} />
            <MapContextProvider value={Promise.resolve(detail)}>
                <GlobalMapGrid loggedIn={!!user} viewsPromise={viewsPromise} seeds={seeds} />
            </MapContextProvider>
        </>
    )
}
