import {
    addOrdinalSuffix,
    DOMAIN,
    fetchServerUrl,
    formatHours, formatNumber,
    formatTitle,
    getMapImage,
    socialMeta,
    StillCalculate
} from "utils/generalUtils";
import { Card } from "components/ui/card";
import MapHeader from "components/maps/MapHeader.tsx";
import MapAnalyzeAttributes from "components/maps/MapAnalyzeAttributes.tsx";
import MapGuidesButton from "components/maps/MapGuidesButton";
import MapHeatRegion from "components/maps/MapHeatRegion.tsx";
import MapRegionDistribution from "components/maps/MapRegionDistribution.tsx";
import MapSessionList from "components/maps/MapSessionList.tsx";
import MapTopPlayerList from "components/maps/MapTopPlayerList.tsx";
import MapAverageSessionDistribution from "components/maps/MapAverageSessionDistribution.tsx";
import MapPlayerType from "components/maps/MapPlayerType.tsx";
import MapMusicSection from "components/maps/MapMusicSection.tsx";
import {getServerSlug} from "../../util";
import { MapRegion, ServerMapDetail} from "types/maps";
import {MapContextProvider} from "./MapContext";
import {AdSpot} from "components/ui/AdSpot";
import {Metadata} from "next";
import {
    PlayerBrief,
} from "types/players.ts";
import { getTranslations } from 'next-intl/server';

async function getMapInfoDetails(serverId: string, mapName: string): Promise<ServerMapDetail>{
    const toReturn = { info: null, analyze: null, notReady: false, name: mapName}
    try{
        const [ info, analyze, ..._ ] = await Promise.all([
            fetchServerUrl(serverId, `/maps/${mapName}/info`),
            fetchServerUrl(serverId, `/maps/${mapName}/analyze`),
            fetchServerUrl(serverId, `/maps/${mapName}/heat-regions`),
            fetchServerUrl(serverId, `/maps/${mapName}/regions`),
            fetchServerUrl(serverId, `/maps/${mapName}/sessions`, { params: { page: 0 } }),
            fetchServerUrl(serverId, `/maps/${mapName}/sessions_distribution`),
            fetchServerUrl(serverId, `/maps/${mapName}/top_players`),
            fetchServerUrl(serverId, `/maps/${mapName}/player_types`)
        ])
        toReturn.info = info
        toReturn.analyze = analyze
    }catch(e){
        if (e instanceof StillCalculate){
            toReturn.notReady = true
        }
    }
    return toReturn as ServerMapDetail
}
export async function generateMetadata({ params }: {
    params: Promise<{ server_slug: string, map_name: string }>
}): Promise<Metadata> {
    const { server_slug, map_name } = await params;
    const server = await getServerSlug(server_slug);
    const t = await getTranslations('metadata');
    let mapInfo: ServerMapDetail | null = null
    const title = formatTitle(t('mapOnServer', {map: map_name, name: server.community_name}))
    try{
        mapInfo = await getMapInfoDetails(server.id, map_name)
    }catch(error){
        if (error.code === 202){
            return {
                title,
                description: t('mapCalculating'),
            }
        }else if (error.code === 404){
            return {
                title: "ZE Graph",
                description: t('viewMapActivities', {name: server.community_name})
            };
        }else{
            return {}
        }
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
    return {
        title,
        description: description,
        ...socialMeta({title, description, images: [image]}),
        alternates: {
            canonical: `/servers/${server.gotoLink}/maps/${map_name}`,
            types: {
                "application/json+oembed": `/api/oembed?url=${DOMAIN}/api/${server.id}/maps/${map_name}`,
            },
        },
    }
}

export default async function Page({ params }){
    const { map_name, server_slug } = await params
    const server = await getServerSlug(server_slug);
    const mapInfo = await getMapInfoDetails(server?.id, map_name);

    const mapDetail = Promise.resolve(mapInfo);

    let jsonLd = null;

    if (mapInfo && mapInfo.analyze && !mapInfo.notReady) {
        const analyze = mapInfo.analyze;
        const info = mapInfo.info;

        // A ZE map is a level, not a game: model it as a CreativeWork that is part of the
        // Counter-Strike VideoGame. No aggregateRating here — playtime is not a 1-5 review
        // score, and emitting one is a structured-data guidelines violation.
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
            <MapContextProvider value={mapDetail}>
                <div className="grid grid-cols-12 gap-5 mx-10 max-sm:mx-2 my-2">
                    <div className="col-span-12 xl:col-span-8 lg:col-span-9">
                        <MapHeader />
                    </div>
                    <div className="col-span-12 xl:col-span-4 lg:col-span-3">
                        <MapAnalyzeAttributes />
                        <div className="mt-4">
                            <MapGuidesButton />
                        </div>
                    </div>
                    <div className="col-span-12">
                        <MapMusicSection />
                    </div>
                    <div className="col-span-12">
                        <AdSpot />
                    </div>
                    <div className="col-span-12">
                        <Card>
                            <MapHeatRegion />
                            <MapRegionDistribution />
                        </Card>
                    </div>
                    <div className="col-span-12 xl:col-span-4 lg:col-span-7 md:col-span-6">
                        <MapSessionList />
                    </div>
                    <div className="col-span-12 xl:col-span-4 lg:col-span-5 md:col-span-6">
                        <MapTopPlayerList />
                    </div>
                    <div className="col-span-12 xl:col-span-4 lg:col-span-12">
                        <div className="grid grid-cols-2 lg:grid-cols-1 gap-4">
                            <div className="xl:col-span-6 lg:col-span-6 md:col-span-12 col-span-12">
                                <MapAverageSessionDistribution />
                            </div>
                            <div className="xl:col-span-6 lg:col-span-6 md:col-span-12 col-span-12">
                                <MapPlayerType />
                            </div>
                        </div>
                    </div>
                </div>
            </MapContextProvider>
        </>
    )
}