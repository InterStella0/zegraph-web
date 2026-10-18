import {Suspense} from "react";
import UserProfile, {UserProfileLoading} from "components/users/UserProfile";
import UserCommunityConnections, {UserCommunityConnectionsLoading} from "components/users/UserCommunityConnections";
import ProfileOverview, {ProfileOverviewLoading} from "components/users/ProfileOverview";
import ProfileStatsCards, {ProfileStatsCardsLoading} from "components/users/ProfileStatsCards";
import ProfilePlaySessions, {ProfilePlaySessionsLoading} from "components/users/ProfilePlaySessions";
import getServerUser from "app/getServerUser";
import { redirect } from "next/navigation";
import { PlayerSessionTime, ProfileResponse } from "types/community.ts";
import {
    fetchApiUrl,
    fetchUrl,
    formatHours,
    formatOrdinal,
    formatTitle,
    socialMeta
} from "utils/generalUtils.ts";
import {Metadata} from "next";
import { oneDay, oneHour } from "app/servers/[server_slug]/util.ts";
import {getTranslations} from "next-intl/server";
import { GlobalPlayerSessionPage, PlayerProfilePicture } from "types/players.ts";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime)

export async function generateMetadata({ params }: {
    params: Promise<{ player_id: string }>
}): Promise<Metadata> {
    const { player_id } = await params;
    const t = await getTranslations('metadata');
    const tHeader = await getTranslations('players.profile.header');
    const profile: ProfileResponse = await fetchApiUrl(`/players/${player_id}/profile`);
    const summary = profile.summary
    const global = summary.global
    const name = profile.name || tHeader('unknownUser')

    const clauses: string[] = []
    const hours = formatHours(summary.total_playtime)
    if (summary.server_count){
        clauses.push(t('profileIntro', {
            name, hours, servers: summary.server_count, communities: summary.community_count
        }))
    }else{
        clauses.push(t('profileIntroNoServers', {name, hours}))
    }

    const rank = global.rank
    if (rank && rank <= global.total_ranked_players){
        clauses.push(t('profileRank', {
            rank: formatOrdinal(rank), total: global.total_ranked_players.toLocaleString()
        }))
    }

    const category = global.category
    if (category){
        if (category === "mixed"){
            const higherType =  global.casual_playtime > global.tryhard_playtime? "casual": "tryhard"
            clauses.push(t('playerType', {category, hours: formatHours(global[`${higherType}_playtime`]), type: higherType}))
        }else{
            clauses.push(t('playerType', {category, hours: formatHours(global[`${category}_playtime`]), type: category}))
        }
    }

    const bestRank = summary.best_rank
    if (bestRank){
        clauses.push(t('profileBestMap', {rank: formatOrdinal(bestRank.rank), map: bestRank.map}))
    }

    if (summary.last_online){
        const time = dayjs(summary.last_online).fromNow()
        const lastSession = summary.last_session_duration
        if (summary.is_online){
            clauses.push(t('profileOnline', {time}))
        }else if (lastSession && lastSession >= oneHour){
            clauses.push(t('profileLastOnlineDuration', {time, hours: formatHours(lastSession)}))
        }else{
            clauses.push(t('profileLastOnline', {time}))
        }
    }

    const description = clauses.join(' ')
    let image = ""
    try{
        const pfp: PlayerProfilePicture | null = await fetchUrl(`/players/${profile.steamid}/pfp`, {  next: { revalidate: oneDay } })
        image = pfp.full
    }catch(error){

    }

    const title = formatTitle(name)
    return {
        title: title,
        description: description,
        ...socialMeta({title, description, images: image? [image]: [], noTwitter: true}),
        alternates: {
            canonical: `/players/${profile.steamid}/profile`,
        },
    }
}

export default async function Page({ params }: { params: Promise<{ player_id: string }> }) {
    const { player_id } = await params;

    if (player_id === "me" && !await getServerUser()) {
        redirect('/');
    }

    const profilePromise: Promise<ProfileResponse> = fetchApiUrl(`/players/${player_id}/profile`);
    const heatmapPromise: Promise<PlayerSessionTime[]> = fetchApiUrl(`/players/${player_id}/playtime-heatmap`).catch(() => []);
    const pfpPromise: Promise<PlayerProfilePicture | null> = profilePromise
        .then(profile => fetchUrl(`/players/${profile.steamid}/pfp`, {  next: { revalidate: oneDay } }))
        .catch(() => null);
    const sessionsPromise: Promise<GlobalPlayerSessionPage | null> = fetchApiUrl(`/players/${player_id}/sessions`, { params: { page: 0 } })
        .catch(() => null);

    return (
        <div className="container mx-auto max-w-10xl px-2 py-8">
            <div className="flex flex-col gap-6">
                <Suspense fallback={<UserProfileLoading />}>
                    <UserProfile profilePromise={profilePromise} pfpPromise={pfpPromise} />
                </Suspense>
                <Suspense fallback={<ProfileOverviewLoading />}>
                    <ProfileOverview heatmapPromise={heatmapPromise} />
                </Suspense>
                <Suspense fallback={<ProfileStatsCardsLoading />}>
                    <ProfileStatsCards userId={player_id} profilePromise={profilePromise} />
                </Suspense>
                <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_450px] lg:gap-3">
                    <Suspense fallback={<UserCommunityConnectionsLoading />}>
                        <UserCommunityConnections profilePromise={profilePromise} />
                    </Suspense>
                    <div className="lg:mt-8">
                        <Suspense fallback={<ProfilePlaySessionsLoading />}>
                            <ProfilePlaySessions userId={player_id} initialDataPromise={sessionsPromise} />
                        </Suspense>
                    </div>
                </div>
            </div>
        </div>
    )
}
