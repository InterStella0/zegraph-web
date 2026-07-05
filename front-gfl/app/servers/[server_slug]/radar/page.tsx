import {Metadata} from "next";
import {getServerSlug} from "../util.ts";
import {fetchServerUrl, formatTitle} from "utils/generalUtils.ts";
import {ServerPlayersStatistic} from "types/players.ts";
import RadarLayers from "./RadarLayers.tsx";
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({ params}: {
    params: Promise<{ server_slug: string }>
}): Promise<Metadata> {
    const { server_slug } = await params

    const server = await getServerSlug(server_slug)
    if (!server)
        return {}

    const t = await getTranslations('metadata');
    let description = t('playIntro', {name: server.community_name, ip: server.fullIp});
    try{
        const stats: ServerPlayersStatistic = await fetchServerUrl(server.id, '/players/stats', {});
        const allTime = stats.all_time
        description += ' ' + t('uniquePlayers', {players: allTime.total_players, countries: allTime.countries});
    }catch(e){}

    return {
        title: formatTitle(t('radarTitle', {name: server.community_name})),
        description: description,
        alternates: {
            canonical: `/servers/${server.gotoLink}/radar`
        }
    }
}

export default async function Page() {
    return <RadarLayers />
}