import {getServerSlug} from "./util";
import {serverMetadata} from "./serverMetadata";
import {Metadata} from "next";
import {fetchServerUrl, orNull} from "utils/generalUtils.ts";
import {AdSpot} from "components/ui/AdSpot";
import {ServerContentWrapper} from "./ServerContentWrapper.tsx";
import {Server} from "types/community.ts";
import {ServerPlayersStatistic} from "types/players.ts";
import {MapPlayedPaginated} from "types/maps.ts";
import {getCachedPlayerStats} from "lib/cachedFetches";
import { getTranslations } from 'next-intl/server';

export async function createServerDescription(server: Server): Promise<string> {
    const t = await getTranslations('metadata');
    const [stats, data] = await Promise.all([
        orNull<ServerPlayersStatistic>(getCachedPlayerStats(server.id)),
        orNull<MapPlayedPaginated>(fetchServerUrl(server.id, '/maps/last/sessions', { params: { page: 1, sorted_by: 'LastPlayed' } })),
    ]);
    let description = t('serverIntro', {name: server.community_name, ip: server.fullIp});
    if (stats)
        description += ' ' + t('uniquePlayers', {players: stats.all_time.total_players.toLocaleString('en-US'), countries: stats.all_time.countries});
    if (data)
        description += ' ' + t('mapsPlayed', {count: data.total_maps});
    if (server.players)
        description += ' ' + t('playersOnline', {count: server.players});
    return description
}

export async function generateMetadata({ params}: {
    params: { server_slug: string }
}): Promise<Metadata> {
    return serverMetadata(params, async (server) => ({
        title: server.community_name,
        description: await createServerDescription(server),
        path: '',
        social: {images: server.community_icon ? [server.community_icon] : null, noTwitter: true},
    }))
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