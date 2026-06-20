import StatsCards from "components/players/StatsCards";
import PlayerRankings from "components/players/PlayerRankings";
import TopPerformers from "components/players/TopPerformers";
import PlayersOnline from "components/players/PlayersOnline.tsx";
import PlayerByCountries from "components/players/PlayerByCountries.tsx";
import {getServerSlug, oneHour} from "../util";
import type {ServerPageProps} from "../page";
import {Metadata} from "next";
import {BriefPlayers, ServerPlayersStatistic} from "types/players.ts";
import {fetchServerUrl, fetchUrl, formatHours, formatTitle} from "utils/generalUtils.ts";
import {Suspense} from "react";
import {getCachedPlayerStats, getCachedTopPlayers} from "lib/cachedFetches";
import {AdSpot} from "components/ui/AdSpot";

export async function generateMetadata({ params}: ServerPageProps): Promise<Metadata> {
    const { server_slug } = await params

    const server = await getServerSlug(server_slug)
    if (!server)
        return {}

    let description = `Play zombie escape on ${server.community_name} at ${server.fullIp}.`
    try{
        const stats: ServerPlayersStatistic = await getCachedPlayerStats(server.id);
        const allTime = stats.all_time
        description += ` There are ${allTime.total_players} unique players across ${allTime.countries} countries all-time.`
    }catch(e){}

    try{
        const data: BriefPlayers = await getCachedTopPlayers(server.id, 'today');
        const topPlayer = data.players[0]
        description += ` The most playtime player today is ${topPlayer.name} with ${formatHours(topPlayer.total_playtime)}.`
    }catch(e){}

    if (server.players)
        description += ` There are ${server.players} players online right now!`
    return {
        title: formatTitle(`${server.community_name} Players`),
        description: description,
        alternates: {
            canonical: `/servers/${server.gotoLink}/players`
        }
    }
}

export default async function Page({ params }: ServerPageProps){
    const { server_slug } = await params;
    const server = getServerSlug(server_slug)
    return <div className="m-6 max-sm:m-1.5">
        <div className="text-center mb-8">
            <h1 className="text-4xl font-bold mb-2">
                Players
            </h1>
            <p className="text-lg text-muted-foreground">
                Discover the tryhards and casuals (gigachads) in the community
            </p>
        </div>

        <StatsCards serverPromise={server} />

        <AdSpot className="my-6" />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 space-y-6">
                <Suspense fallback={<div>Loading...</div>}>
                    <PlayerRankings serverPromise={server} />
                    <TopPerformers serverPromise={server} />
                </Suspense>
            </div>

            <div className="lg:col-span-4 space-y-6">
                <Suspense fallback={<div>Loading...</div>}>
                    <PlayersOnline />
                    <PlayerByCountries />
                </Suspense>
            </div>
        </div>
    </div>
}