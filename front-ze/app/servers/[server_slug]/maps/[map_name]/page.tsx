import {
    DOMAIN,
    fetchServerUrl,
    fetchUrl,
    formatHours,
    formatTitle,
    getMapImage,
    StillCalculate
} from "utils/generalUtils";
import { Card } from "components/ui/card";
import MapHeader from "components/maps/MapHeader.tsx";
import MapAnalyzeAttributes from "components/maps/MapAnalyzeAttributes.tsx";
import MapHeatRegion from "components/maps/MapHeatRegion.tsx";
import MapRegionDistribution from "components/maps/MapRegionDistribution.tsx";
import MapSessionList from "components/maps/MapSessionList.tsx";
import MapTopPlayerList from "components/maps/MapTopPlayerList.tsx";
import MapAverageSessionDistribution from "components/maps/MapAverageSessionDistribution.tsx";
import MapPlayerType from "components/maps/MapPlayerType.tsx";
import MapMusicSection from "components/maps/MapMusicSection.tsx";
import {getServerSlugOrNotFound} from "../../util";
import {metadataFallback, serverMetadata} from "../../serverMetadata";
import {
    DailyMapRegion,
    MapRegion,
    MapSessionDistribution,
    ServerMapDetail,
    ServerMapMusic,
    ServerMapPlayedPaginated
} from "types/maps";
import {MapContextProvider} from "./MapContext";
import {MapPeriodProvider} from "./MapPeriod";
import PeriodSelector from "components/period/PeriodSelector";
import {AdSpot} from "components/ui/AdSpot";
import {Metadata} from "next";
import {
    BriefPlayers,
    ExtendedPlayerBrief,
    MapPlayerTypeTime,
    PlayerBrief,
    Region,
} from "types/players.ts";
import { notFound } from 'next/navigation';
import {recordView} from "lib/recordView";

async function getMapInfoDetails(serverId: string, mapName: string): Promise<ServerMapDetail>{
    const toReturn = { info: null, analyze: null, notReady: false, name: mapName}
    try{
        const [ info, analyze ] = await Promise.all([
            fetchServerUrl(serverId, `/maps/${mapName}/info`),
            fetchServerUrl(serverId, `/maps/${mapName}/analyze`),
        ])
        toReturn.info = info
        toReturn.analyze = analyze
    }catch(e){
        if (e instanceof StillCalculate){
            toReturn.notReady = true
        }else{
            throw e
        }
    }
    return toReturn as ServerMapDetail
}
export async function generateMetadata({ params }: {
    params: Promise<{ server_slug: string, map_name: string }>
}): Promise<Metadata> {
    return serverMetadata(params, async (server, t, { map_name }) => {
        let mapInfo: ServerMapDetail | null = null
        const title = t('mapOnServer', {map: map_name, name: server.community_name})
        try{
            mapInfo = await getMapInfoDetails(server.id, map_name)
        }catch(error){
            return metadataFallback(error, "map", formatTitle(title), server, t)
        }
        const creators = mapInfo?.info?.creators? t('createdBy', {creators: mapInfo.info.creators}) + ' ': ''
        let description = creators
        if (mapInfo.analyze){
            description += t('mapCumulative', {hours: formatHours(mapInfo.analyze.cum_player_hours), name: server.community_name, players: mapInfo.analyze.unique_players});
        }
        if (mapInfo.info?.removed){
            description += t('mapRemoved', {name: server.community_name})
        }
        try{
            const regions: MapRegion[] = await fetchServerUrl(server.id, `/maps/${map_name}/regions`)
            const regionMap = regions.sort((a, b) => b.total_play_duration - a.total_play_duration)
            const region = regionMap[0]
            description += ' ' + t('mainlyPlayed', {region: region.region_name, hours: formatHours(region.total_play_duration)})
        }catch (error){

        }
        try{
            const totalPlayers: PlayerBrief[] = await fetchServerUrl(server.id, `/maps/${map_name}/top_players`)
            const players = totalPlayers.sort((a, b) => b.total_playtime - a.total_playtime)
            const firstPlayer = players[0]
            description += ' ' + t('mostActivePlayer', {name: firstPlayer.name, hours: formatHours(firstPlayer.total_playtime)})
        }catch (e){}

        const image = await getMapImage(server.id, map_name).then(resp => resp?.large || null)
        return {title, description, path: `/maps/${map_name}`, social: {images: [image]}}
    })
}

export default async function Page({ params, searchParams }){
    const { map_name, server_slug } = await params
    const { period } = await searchParams
    const server = await getServerSlugOrNotFound(server_slug);
    const musicsPromise: Promise<ServerMapMusic[]> = fetchServerUrl(server.id, `/maps/${map_name}/musics`).catch(() => [])
    const seed = <T,>(endpoint: string, options = {}): Promise<T | null> | undefined =>
        period ? undefined : fetchUrl(endpoint, options).catch(() => null)
    const mapEndpoint = `/servers/${server.id}/maps/${map_name}`
    const heatRegionsPromise = seed<DailyMapRegion[]>(`${mapEndpoint}/heat-regions`)
    const regionsPromise = seed<MapRegion[]>(`${mapEndpoint}/regions`)
    const regionNamesPromise = seed<Region[]>(`/graph/${server.id}/get_regions`)
    const sessionsPromise = seed<ServerMapPlayedPaginated>(`${mapEndpoint}/sessions`, { params: { page: 0 } })
    const topPlayersPromise = seed<BriefPlayers>(`${mapEndpoint}/top_players`, { params: { page: 0 } })
        ?.then(data => {
            for (const player of data?.players ?? [])
                (player as ExtendedPlayerBrief).server_id = server.id
            return data
        })
    const distributionPromise = seed<MapSessionDistribution[]>(`${mapEndpoint}/sessions_distribution`)
    const playerTypesPromise = seed<MapPlayerTypeTime[]>(`${mapEndpoint}/player_types`)
    let mapInfo: ServerMapDetail
    try{
        mapInfo = await getMapInfoDetails(server.id, map_name);
    }catch(error: any){
        if (error?.code === 404) notFound()
        throw error
    }

    const mapDetail = Promise.resolve(mapInfo);
    const viewsPromise = recordView('maps', map_name);

    let jsonLd = null;

    if (mapInfo && mapInfo.analyze && !mapInfo.notReady) {
        const analyze = mapInfo.analyze;
        const info = mapInfo.info;

        jsonLd = {
            "@context": "https://schema.org",
            "@type": "CreativeWork",
            "name": map_name,
            "genre": "Zombie Escape",
            "description": `Zombie Escape map with ${formatHours(analyze.cum_player_hours || 0)} of cumulative playtime on ${server.community_name}`,
            "isPartOf": {
                "@type": "VideoGame",
                "name": "Counter-Strike",
                "gamePlatform": "PC"
            },
            "interactionStatistic": {
                "@type": "InteractionCounter",
                "interactionType": "https://schema.org/PlayAction",
                "userInteractionCount": analyze.unique_players || 0
            }
        };

        if (info?.creators) {
            jsonLd["author"] = {
                "@type": "Person",
                "name": info.creators
            };
        }

        jsonLd["url"] = `${DOMAIN}/servers/${server.gotoLink}/maps/${map_name}`;
    }

    return (
        <>
            {jsonLd && (
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
                />
            )}
            <MapPeriodProvider serverId={server.id} mapName={map_name}>
                <MapContextProvider value={mapDetail}>
                    <div className="grid grid-cols-12 gap-5 mx-10 max-sm:mx-2 my-2">
                        <div className="col-span-12">
                            <PeriodSelector />
                        </div>
                        <div className="col-span-12 xl:col-span-8 lg:col-span-9">
                            <MapHeader viewsPromise={viewsPromise} />
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
                                <MapHeatRegion initialDataPromise={heatRegionsPromise} />
                                <MapRegionDistribution initialDataPromise={regionsPromise} regionsPromise={regionNamesPromise} />
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
            </MapPeriodProvider>
        </>
    )
}