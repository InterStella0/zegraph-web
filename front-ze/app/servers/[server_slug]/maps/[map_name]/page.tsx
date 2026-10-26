import {fetchServerUrl, fetchUrl, formatHours, formatTitle, getMapImage, orNotFound, orNull} from "utils/generalUtils";
import MapMusicSection from "components/maps/MapMusicSection.tsx";
import {getServerSlugOrNotFound} from "../../util";
import {metadataFallback, serverMetadata} from "../../serverMetadata";
import {MapRegion, ServerMapDetail, ServerMapMusic} from "types/maps";
import {MapContextProvider} from "./MapContext";
import {MapPeriodProvider} from "./MapPeriod";
import {MapDetailGrid, MapSeeds} from "./loading";
import {Metadata} from "next";
import {BriefPlayers} from "types/players.ts";
import {recordView} from "lib/recordView";
import {JsonLd} from "components/common/JsonLd";
import {loadMapDetail, mapJsonLd} from "components/maps/mapDetail";

const getMapInfoDetails = (serverId: string, mapName: string): Promise<ServerMapDetail> => loadMapDetail(mapName,
    fetchServerUrl(serverId, `/maps/${mapName}/info`),
    fetchServerUrl(serverId, `/maps/${mapName}/analyze`),
)

export async function generateMetadata({ params }: {
    params: Promise<{ server_slug: string, map_name: string }>
}): Promise<Metadata> {
    return serverMetadata(params, async (server, t, { map_name }) => {
        let mapInfo: ServerMapDetail
        const title = t('mapOnServer', {map: map_name, name: server.community_name})
        try{
            mapInfo = await getMapInfoDetails(server.id, map_name)
        }catch(error){
            return metadataFallback(error, "map", formatTitle(title), server, t)
        }
        const [regions, topPlayers, image] = await Promise.all([
            orNull<MapRegion[]>(fetchServerUrl(server.id, `/maps/${map_name}/regions`)),
            orNull<BriefPlayers>(fetchServerUrl(server.id, `/maps/${map_name}/top_players`)),
            getMapImage(server.id, map_name).then(resp => resp?.large || null),
        ])
        let description = mapInfo.info?.creators ? t('createdBy', {creators: mapInfo.info.creators}) + ' ' : ''
        if (mapInfo.analyze){
            description += t('mapCumulative', {hours: formatHours(mapInfo.analyze.cum_player_hours), name: server.community_name, players: mapInfo.analyze.unique_players});
        }
        if (mapInfo.info?.removed){
            description += t('mapRemoved', {name: server.community_name})
        }
        const region = regions?.sort((a, b) => b.total_play_duration - a.total_play_duration)[0]
        if (region)
            description += ' ' + t('mainlyPlayed', {region: region.region_name, hours: formatHours(region.total_play_duration)})
        const topPlayer = topPlayers?.players?.sort((a, b) => b.total_playtime - a.total_playtime)[0]
        if (topPlayer && !topPlayer.is_anonymous)
            description += ' ' + t('mostActivePlayer', {name: topPlayer.name, hours: formatHours(topPlayer.total_playtime)})

        return {title, description, path: `/maps/${map_name}`, social: {images: [image]}}
    })
}

export default async function Page({ params, searchParams }){
    const { map_name, server_slug } = await params
    const { period } = await searchParams
    const server = await getServerSlugOrNotFound(server_slug);
    const musicsPromise: Promise<ServerMapMusic[]> = fetchServerUrl(server.id, `/maps/${map_name}/musics`).catch(() => [])
    const seed = (endpoint: string, options = {}) => fetchUrl(endpoint, options).catch(() => null)
    const mapEndpoint = `/servers/${server.id}/maps/${map_name}`
    const seeds: MapSeeds = period ? {} : {
        heatRegions: seed(`${mapEndpoint}/heat-regions`),
        regions: seed(`${mapEndpoint}/regions`),
        regionNames: seed(`/graph/${server.id}/get_regions`),
        sessions: seed(`${mapEndpoint}/sessions`, { params: { page: 0 } }),
        topPlayers: seed(`${mapEndpoint}/top_players`, { params: { page: 0 } }),
        distribution: seed(`${mapEndpoint}/sessions_distribution`),
        playerTypes: seed(`${mapEndpoint}/player_types`),
    }
    const mapInfo = await orNotFound(getMapInfoDetails(server.id, map_name))

    const jsonLd = mapInfo.analyze && mapJsonLd(map_name, mapInfo.analyze, `on ${server.community_name}`,
        `/servers/${server.gotoLink}/maps/${map_name}`, mapInfo.info?.creators)

    return (
        <>
            <JsonLd data={jsonLd} />
            <MapPeriodProvider serverId={server.id} mapName={map_name}>
                <MapContextProvider value={Promise.resolve(mapInfo)}>
                    <MapDetailGrid
                        music={<MapMusicSection musicsPromise={musicsPromise} />}
                        viewsPromise={recordView('maps', map_name)}
                        seeds={seeds}
                    />
                </MapContextProvider>
            </MapPeriodProvider>
        </>
    )
}
