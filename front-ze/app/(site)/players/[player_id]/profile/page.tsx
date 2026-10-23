import {ReactNode, Suspense} from "react";
import UserProfile, {UserProfileLoading} from "components/users/UserProfile";
import UserCommunityConnections, {UserCommunityConnectionsLoading} from "components/users/UserCommunityConnections";
import ProfilePlaytimeHistory, {ProfilePlaytimeHistoryLoading} from "components/users/ProfilePlaytimeHistory";
import ProfilePlaySessions, {ProfilePlaySessionsLoading} from "components/users/ProfilePlaySessions";
import ProfileMaps, {ProfileMapsLoading} from "components/users/ProfileMaps";
import ProfileOnlineActivity, {ProfileOnlineActivityLoading} from "components/users/ProfileOnlineActivity";
import ProfileInfractions, {ProfileInfractionsLoading} from "components/users/ProfileInfractions";
import {ProfileCommunitiesProvider} from "components/users/ProfileContext";
import getServerUser from "app/getServerUser";
import { redirect } from "next/navigation";
import { GlobalPlayerSessionTime, ProfileResponse } from "types/community.ts";
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
import {
    GlobalPlayerInfraction,
    GlobalPlayerMap,
    GlobalPlayerSessionPage,
    PlayerOnlineActivity,
    PlayerProfilePicture,
    PlayerSessionStats
} from "types/players.ts";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import {recordView} from "lib/recordView";

dayjs.extend(relativeTime)

function ProfileLayout({ hero, history, sessions, maps, activity, communities, infractions }: Record<
    'hero' | 'history' | 'sessions' | 'maps' | 'activity' | 'communities' | 'infractions', ReactNode
>) {
    return (
        <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12">{hero}</div>
            <div className="col-span-12 xl:col-span-8">{history}</div>
            <div className="col-span-12 xl:col-span-4">{sessions}</div>
            <div className="col-span-12 xl:col-span-6">{maps}</div>
            <div className="col-span-12 xl:col-span-6">{activity}</div>
            <div className="col-span-12">{communities}</div>
            <div className="col-span-12">{infractions}</div>
        </div>
    )
}

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

    const bestMapRank = summary.best_map_rank
    if (bestMapRank){
        clauses.push(t('profileBestMap', {rank: formatOrdinal(bestMapRank.rank), map: bestMapRank.map}))
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

    const seed = <T,>(endpoint: string, params?: Record<string, string | number>): Promise<T | null> =>
        fetchApiUrl(`/players/${player_id}${endpoint}`, params ? { params } : {}).catch(() => null);

    const profilePromise: Promise<ProfileResponse> = fetchApiUrl(`/players/${player_id}/profile`);
    const heatmapPromise: Promise<GlobalPlayerSessionTime[]> = seed<GlobalPlayerSessionTime[]>('/playtime-heatmap')
        .then(data => data ?? []);
    const pfpPromise: Promise<PlayerProfilePicture | null> = profilePromise
        .then(profile => fetchUrl(`/players/${profile.steamid}/pfp`, {  next: { revalidate: oneDay } }))
        .catch(() => null);
    // Counted under the Steam ID, the same player_id the server player pages count under.
    const viewsPromise: Promise<number | null> = profilePromise
        .then(profile => recordView('players', profile.steamid))
        .catch(() => null);
    const sessionsPromise = seed<GlobalPlayerSessionPage>('/sessions', { page: 0 });
    const sessionStatsPromise = seed<PlayerSessionStats>('/session-stats');
    const mapsPromise = seed<GlobalPlayerMap[]>('/maps');
    const activityPromise = seed<PlayerOnlineActivity>('/online-activity', { tz: 'UTC' });
    const infractionsPromise = seed<GlobalPlayerInfraction[]>('/infractions');

    return (
        <div className="container mx-auto max-w-10xl px-2 py-8">
            <Suspense fallback={
                <ProfileLayout
                    hero={<UserProfileLoading />}
                    history={<ProfilePlaytimeHistoryLoading />}
                    sessions={<ProfilePlaySessionsLoading />}
                    maps={<ProfileMapsLoading />}
                    activity={<ProfileOnlineActivityLoading />}
                    communities={<UserCommunityConnectionsLoading />}
                    infractions={<ProfileInfractionsLoading />}
                />
            }>
                <ProfileCommunitiesProvider profilePromise={profilePromise}>
                    <ProfileLayout
                        hero={<Suspense fallback={<UserProfileLoading />}>
                            <UserProfile profilePromise={profilePromise} pfpPromise={pfpPromise} viewsPromise={viewsPromise} />
                        </Suspense>}
                        history={<Suspense fallback={<ProfilePlaytimeHistoryLoading />}>
                            <ProfilePlaytimeHistory heatmapPromise={heatmapPromise} statsPromise={sessionStatsPromise} />
                        </Suspense>}
                        sessions={<Suspense fallback={<ProfilePlaySessionsLoading />}>
                            <ProfilePlaySessions userId={player_id} initialDataPromise={sessionsPromise} />
                        </Suspense>}
                        maps={<Suspense fallback={<ProfileMapsLoading />}>
                            <ProfileMaps mapsPromise={mapsPromise} />
                        </Suspense>}
                        activity={<Suspense fallback={<ProfileOnlineActivityLoading />}>
                            <ProfileOnlineActivity userId={player_id} initialDataPromise={activityPromise} />
                        </Suspense>}
                        communities={<Suspense fallback={<UserCommunityConnectionsLoading />}>
                            <UserCommunityConnections profilePromise={profilePromise} />
                        </Suspense>}
                        infractions={<Suspense fallback={<ProfileInfractionsLoading />}>
                            <ProfileInfractions profilePromise={profilePromise} infractionsPromise={infractionsPromise} />
                        </Suspense>}
                    />
                </ProfileCommunitiesProvider>
            </Suspense>
        </div>
    )
}
