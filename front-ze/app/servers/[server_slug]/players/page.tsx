import StatsCards from "components/players/StatsCards";
import PlayerRankings from "components/players/PlayerRankings";
import TopPerformers from "components/players/TopPerformers";
import PlayersOnline from "components/players/PlayersOnline.tsx";
import PlayerByCountries from "components/players/PlayerByCountries.tsx";
import {getServerSlug} from "../util";
import {serverMetadata} from "../serverMetadata";
import type {ServerPageProps} from "../page";
import {Metadata} from "next";
import {BriefPlayers, ServerPlayersStatistic} from "types/players.ts";
import {fetchApiServerUrl, fetchServerUrl, formatHours, orNull} from "utils/generalUtils.ts";
import {getCachedPlayerStats, getCachedTopPlayers} from "lib/cachedFetches";
import {PlayersLayout} from "./loading";

export async function generateMetadata({ params}: ServerPageProps): Promise<Metadata> {
    return serverMetadata(params, async (server, t) => {
        const [stats, topPlayers] = await Promise.all([
            orNull<ServerPlayersStatistic>(getCachedPlayerStats(server.id)),
            orNull<BriefPlayers>(getCachedTopPlayers(server.id, 'today')),
        ])
        let description = t('playIntro', {name: server.community_name, ip: server.fullIp});
        if (stats)
            description += ' ' + t('uniquePlayers', {players: stats.all_time.total_players, countries: stats.all_time.countries});
        const topPlayer = topPlayers?.players?.[0]
        if (topPlayer)
            description += ' ' + t('topPlayerToday', {name: topPlayer.name, hours: formatHours(topPlayer.total_playtime)});
        if (server.players)
            description += ' ' + t('playersOnline', {count: server.players});
        const image = server.community_icon
        return {
            title: t('playersTitle', {name: server.community_name}),
            description,
            path: '/players',
            social: {images: image? [image]: null, noTwitter: true},
        }
    })
}

export default async function Page({ params }: ServerPageProps){
    const { server_slug } = await params;
    const server = getServerSlug(server_slug)
    const rankingsPromise = server.then(s => fetchApiServerUrl(s.id, '/players/table', {params: {page: 0, mode: 'Total'}}));
    const topPlayersPromise = server.then(s => getCachedTopPlayers(s.id, 'today'));
    const onlinePromise = server.then(s => fetchServerUrl(s.id, '/players/playing'));
    const countriesPromise = server.then(s => fetchServerUrl(s.id, '/players/countries'));

    return <PlayersLayout
        stats={<StatsCards serverPromise={server} />}
        main={<>
            <PlayerRankings serverPromise={server} initialDataPromise={rankingsPromise} />
            <TopPerformers serverPromise={server} initialDataPromise={topPlayersPromise} />
        </>}
        side={<>
            <PlayersOnline initialDataPromise={onlinePromise} />
            <PlayerByCountries initialDataPromise={countriesPromise} />
        </>}
    />
}
