import {Metadata} from "next";
import {notFound} from "next/navigation";
import {getTranslations} from "next-intl/server";
import {Card} from "components/ui/card";
import {AdSpot} from "components/ui/AdSpot";
import MapAnalyzeAttributes from "components/maps/MapAnalyzeAttributes.tsx";
import MapMusicSection from "components/maps/MapMusicSection.tsx";
import MapSessionList from "components/maps/MapSessionList.tsx";
import MapTopPlayerList from "components/maps/MapTopPlayerList.tsx";
import MapAverageSessionDistribution from "components/maps/MapAverageSessionDistribution.tsx";
import MapPlayerType from "components/maps/MapPlayerType.tsx";
import GlobalMapHeader from "components/maps/global/GlobalMapHeader";
import MapServerBreakdown from "components/maps/global/MapServerBreakdown";
import {MapContextProvider} from "app/servers/[server_slug]/maps/[map_name]/MapContext";
import getServerUser from "app/getServerUser.ts";
import {getCommunityData} from "app/getCommunity";
import {
    DOMAIN,
    fetchApiUrl,
    fetchUrl,
    formatHours,
    formatTitle,
    socialMeta,
    StillCalculate,
    withImageDomain
} from "utils/generalUtils.ts";
import {
    DailyMapServer,
    GlobalMapDetail,
    GlobalMapInfo,
    MapSessionDistribution,
    ServerMapMusic,
    ServerMapPlayedPaginated
} from "types/maps";
import {BriefPlayers, MapPlayerTypeTime} from "types/players.ts";

const mapEndpoint = (mapName: string, endpoint: string) => `/maps/${encodeURIComponent(mapName)}${endpoint}`

async function getGlobalMapDetail(mapName: string): Promise<GlobalMapDetail> {
    const detail: GlobalMapDetail = { name: mapName, info: null, analyze: null, notReady: false }
    try {
        // Signed in, the info goes through the Next proxy so it can say whether this is a favorite.
        const [info, analyze] = await Promise.all([
            fetchApiUrl(mapEndpoint(mapName, '/info')),
            fetchUrl(mapEndpoint(mapName, '/analyze')),
        ])
        detail.info = info
        detail.analyze = analyze
    } catch (e) {
        // Still calculating is the only expected failure; anything else, a 404 included, must surface.
        if (e instanceof StillCalculate) {
            detail.notReady = true
        } else {
            throw e
        }
    }
    return detail
}

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
    const { serversMapped } = await getCommunityData()

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
    try {
        const topPlayers: BriefPlayers = await fetchUrl(mapEndpoint(map_name, '/top_players'), { params: { page: 0 } })
        const first = topPlayers.players[0]
        if (first && !first.is_anonymous)
            clauses.push(t('mostActivePlayer', {name: first.name, hours: formatHours(first.total_playtime)}))
    } catch (e) {}

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
    const user = await getServerUser()
    const seed = <T,>(endpoint: string, options = {}): Promise<T | null> =>
        fetchUrl(mapEndpoint(map_name, endpoint), options).catch(() => null)
    const musicsPromise: Promise<ServerMapMusic[]> = fetchUrl(mapEndpoint(map_name, '/musics')).catch(() => [])
    const heatServersPromise = seed<DailyMapServer[]>('/heat-servers')
    const sessionsPromise = seed<ServerMapPlayedPaginated>('/sessions', { params: { page: 0 } })
    const topPlayersPromise = seed<BriefPlayers>('/top_players', { params: { page: 0 } })
    const distributionPromise = seed<MapSessionDistribution[]>('/sessions_distribution')
    const playerTypesPromise = seed<MapPlayerTypeTime[]>('/player_types')

    let detail: GlobalMapDetail
    try {
        detail = await getGlobalMapDetail(map_name)
    } catch (error: any) {
        if (error?.code === 404) notFound()
        throw error
    }

    let jsonLd = null
    if (detail.analyze && !detail.notReady) {
        const analyze = detail.analyze
        const info = detail.info
        // A ZE map is a level, not a game: model it as a CreativeWork that is part of the
        // Counter-Strike VideoGame. No aggregateRating here: playtime is not a 1-5 review score.
        jsonLd = {
            "@context": "https://schema.org",
            "@type": "CreativeWork",
            "name": map_name,
            "genre": "Zombie Escape",
            "description": `Zombie Escape map with ${formatHours(analyze.cum_player_hours || 0)} of cumulative playtime across ${info?.map.servers.length ?? 0} servers`,
            "isPartOf": {
                "@type": "VideoGame",
                "name": "Counter-Strike",
                "gamePlatform": "PC"
            },
            "interactionStatistic": {
                "@type": "InteractionCounter",
                "interactionType": "https://schema.org/PlayAction",
                "userInteractionCount": analyze.unique_players || 0
            },
            "url": `${DOMAIN}/maps/${map_name}`,
        }
        if (info?.creators) {
            jsonLd["author"] = {
                "@type": "Person",
                "name": info.creators
            }
        }
    }

    return (
        <>
            {jsonLd && (
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
                />
            )}
            <MapContextProvider value={Promise.resolve(detail)}>
                <div className="grid grid-cols-12 gap-5 mx-10 max-sm:mx-2 my-2">
                    <div className="col-span-12 xl:col-span-8 lg:col-span-9">
                        <GlobalMapHeader loggedIn={!!user} />
                    </div>
                    <div className="col-span-12 xl:col-span-4 lg:col-span-3">
                        <MapAnalyzeAttributes />
                    </div>
                    <div className="col-span-12">
                        <MapMusicSection musicsPromise={musicsPromise} />
                    </div>
                    <div className="col-span-12">
                        <AdSpot />
                    </div>
                    <div className="col-span-12">
                        <Card>
                            <MapServerBreakdown initialDataPromise={heatServersPromise} />
                        </Card>
                    </div>
                    <div className="col-span-12 xl:col-span-4 lg:col-span-7 md:col-span-6">
                        <MapSessionList initialDataPromise={sessionsPromise} />
                    </div>
                    <div className="col-span-12 xl:col-span-4 lg:col-span-5 md:col-span-6">
                        <MapTopPlayerList initialDataPromise={topPlayersPromise} />
                    </div>
                    <div className="col-span-12 xl:col-span-4 lg:col-span-12">
                        <div className="grid grid-cols-2 lg:grid-cols-1 gap-4">
                            <div className="xl:col-span-6 lg:col-span-6 md:col-span-12 col-span-12">
                                <MapAverageSessionDistribution initialDataPromise={distributionPromise} />
                            </div>
                            <div className="xl:col-span-6 lg:col-span-6 md:col-span-12 col-span-12">
                                <MapPlayerType initialDataPromise={playerTypesPromise} />
                            </div>
                        </div>
                    </div>
                </div>
            </MapContextProvider>
        </>
    )
}
