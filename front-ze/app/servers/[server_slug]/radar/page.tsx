import {Metadata} from "next";
import {serverMetadata} from "../serverMetadata";
import {fetchServerUrl} from "utils/generalUtils.ts";
import {ServerPlayersStatistic} from "types/players.ts";
import RadarLayers from "./RadarLayers.tsx";

export async function generateMetadata({ params}: {
    params: Promise<{ server_slug: string }>
}): Promise<Metadata> {
    return serverMetadata(params, async (server, t) => {
        let description = t('playIntro', {name: server.community_name, ip: server.fullIp});
        try{
            const stats: ServerPlayersStatistic = await fetchServerUrl(server.id, '/players/stats', {});
            const allTime = stats.all_time
            description += ' ' + t('uniquePlayers', {players: allTime.total_players, countries: allTime.countries});
        }catch(e){}

        return {title: t('radarTitle', {name: server.community_name}), description, path: '/radar'}
    })
}

export default async function Page() {
    return <RadarLayers />
}