import {getServerSlug, getServerSlugOrNotFound} from "./util";
import {Metadata} from "next";
import {fetchServerUrl, formatTitle, socialMeta} from "utils/generalUtils.ts";
import {AdSpot} from "components/ui/AdSpot";
import {ServerContentWrapper} from "./ServerContentWrapper.tsx";
import {Server} from "types/community.ts";
import {ServerPlayersStatistic} from "types/players.ts";
import {MapPlayedPaginated} from "types/maps.ts";
import {getCachedPlayerStats} from "lib/cachedFetches";
import { getTranslations } from 'next-intl/server';

export async function createServerDescription(server: Server): Promise<string> {
    const t = await getTranslations('metadata');
    let description = t('serverIntro', {name: server?.community_name, ip: server.fullIp});
    try{
        const stats: ServerPlayersStatistic = await getCachedPlayerStats(server.id);
        const allTime = stats.all_time
        description += ' ' + t('uniquePlayers', {players: allTime.total_players.toLocaleString('en-US'), countries: allTime.countries});
    }catch(e){}

    try{
        const parameters = {
            page: 1, sorted_by: 'LastPlayed'
        }
        const data: MapPlayedPaginated = await fetchServerUrl(server.id, '/maps/last/sessions', { params: parameters });

        description += ' ' + t('mapsPlayed', {count: data.total_maps});
    }catch(e){}
    if (server.players)
        description += ' ' + t('playersOnline', {count: server.players});

    return description
}

export async function generateMetadata({ params}: {
    params: { server_slug: string }
}): Promise<Metadata> {
    const { server_slug } = await params
    const server = await getServerSlugOrNotFound(server_slug)
    const description = await createServerDescription(server);
    const title = formatTitle(server.community_name)
    const image = server.community_icon
    return {
        title: title,
        description: description,
        alternates: {
            canonical: `/servers/${server.gotoLink}`
        },
        ...socialMeta({title, description, images: image? [image]: null, noTwitter: true})
    }
}

export interface ServerPageProps {
    params: Promise<{ server_slug: string }>;
}
export default async function Page({ params }: ServerPageProps){
    const { server_slug } = await params
    const serverPromise = getServerSlug(server_slug)
    return <div className="mx-7 my-3 max-sm:mx-1.5">
        <AdSpot className="w-full mb-3" />
        <ServerContentWrapper serverPromise={serverPromise} />
    </div>
}