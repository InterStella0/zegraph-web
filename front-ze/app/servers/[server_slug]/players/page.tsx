import StatsCards from "components/players/StatsCards";
import PlayerRankings from "components/players/PlayerRankings";
import TopPerformers from "components/players/TopPerformers";
import PlayersOnline from "components/players/PlayersOnline.tsx";
import PlayerByCountries from "components/players/PlayerByCountries.tsx";
import {getServerSlugOrNotFound, getServerSlug} from "../util";
import type {ServerPageProps} from "../page";
import {Metadata} from "next";
import {getTranslations} from "next-intl/server";
import {BriefPlayers, ServerPlayersStatistic} from "types/players.ts";
import {formatHours, formatTitle, socialMeta} from "utils/generalUtils.ts";
import {Suspense} from "react";
import {getCachedPlayerStats, getCachedTopPlayers} from "lib/cachedFetches";
import {AdSpot} from "components/ui/AdSpot";

export async function generateMetadata({ params}: ServerPageProps): Promise<Metadata> {
    const { server_slug } = await params

    const server = await getServerSlugOrNotFound(server_slug)

    const t = await getTranslations('metadata');
    let description = t('playIntro', {name: server.community_name, ip: server.fullIp});
    try{
        const stats: ServerPlayersStatistic = await getCachedPlayerStats(server.id);
        const allTime = stats.all_time
        description += ' ' + t('uniquePlayers', {players: allTime.total_players, countries: allTime.countries});
    }catch(e){}

    try{
        const data: BriefPlayers = await getCachedTopPlayers(server.id, 'today');
        const topPlayer = data.players[0]
        description += ' ' + t('topPlayerToday', {name: topPlayer.name, hours: formatHours(topPlayer.total_playtime)});
    }catch(e){}

    if (server.players)
        description += ' ' + t('playersOnline', {count: server.players});
    const title = formatTitle(t('playersTitle', {name: server.community_name}))
    const image = server.community_icon
    return {
        title: title,
        description: description,
        alternates: {
            canonical: `/servers/${server.gotoLink}/players`
        },
        ...socialMeta({title, description, images: image? [image]: null, noTwitter: true})
    }
}

export default async function Page({ params }: ServerPageProps){
    const { server_slug } = await params;
    const server = getServerSlug(server_slug)
    const t = await getTranslations('players.page')
    return <div className="m-6 max-sm:m-1.5">
        <div className="text-center mb-8">
            <h1 className="text-4xl font-bold mb-2">
                {t('title')}
            </h1>
            <p className="text-lg text-muted-foreground">
                {t('subtitle')}
            </p>
        </div>

        <StatsCards serverPromise={server} />

        <AdSpot className="my-6" />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 space-y-6">
                <Suspense fallback={<div>{t('loading')}</div>}>
                    <PlayerRankings serverPromise={server} />
                    <TopPerformers serverPromise={server} />
                </Suspense>
            </div>

            <div className="lg:col-span-4 space-y-6">
                <Suspense fallback={<div>{t('loading')}</div>}>
                    <PlayersOnline />
                    <PlayerByCountries />
                </Suspense>
            </div>
        </div>
    </div>
}