import {Suspense} from "react";
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
    orNull,
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
import dayjs from "lib/dayjs";
import {recordView} from "lib/recordView";

const fetchPfp = (steamid: string): Promise<PlayerProfilePicture | null> =>
    orNull(fetchUrl(`/players/${steamid}/pfp`, { next: { revalidate: oneDay } }))

export async function generateMetadata({ params }: {
    params: Promise<{ player_id: string }>
}): Promise<Metadata> {
    const { player_id } = await params;
    const t = await getTranslations('metadata');
    const tHeader = await getTranslations('players.profile.header');
    const profile: ProfileResponse = await fetchApiUrl(`/players/${player_id}/profile`);
    const { summary } = profile
    const global = summary.global
    const name = profile.name || tHeader('unknownUser')

    const hours = formatHours(summary.total_playtime)
    const clauses: string[] = [summary.server_count
        ? t('profileIntro', { name, hours, servers: summary.server_count, communities: summary.community_count })
        : t('profileIntroNoServers', {name, hours})]

    const rank = global.rank
    if (rank && rank <= global.total_ranked_players){
        clauses.push(t('profileRank', {
            rank: formatOrdinal(rank), total: global.total_ranked_players.toLocaleString()
        }))
    }

    const category = global.category
    if (category){
        // A mixed player is described by whichever of casual or tryhard they play more.
        const type = category !== "mixed" ? category : (global.casual_playtime > global.tryhard_playtime ? "casual" : "tryhard")
        clauses.push(t('playerType', {category, hours: formatHours(global[`${type}_playtime`]), type}))
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
    const image = (await fetchPfp(profile.steamid))?.full
    const title = formatTitle(name)
    return {
        title,
        description,
        ...socialMeta({title, description, images: image ? [image] : [], noTwitter: true}),
        alternates: { canonical: `/players/${profile.steamid}/profile` },
    }
}

export default async function Page({ params }: { params: Promise<{ player_id: string }> }) {
    const { player_id } = await params;

    if (player_id === "me" && !await getServerUser()) {
        redirect('/');
    }

    const seed = <T,>(endpoint: string, params?: Record<string, string | number>): Promise<T | null> =>
        orNull(fetchApiUrl(`/players/${player_id}${endpoint}`, params ? { params } : {}));

    const profilePromise: Promise<ProfileResponse> = fetchApiUrl(`/players/${player_id}/profile`);
    const heatmapPromise = seed<GlobalPlayerSessionTime[]>('/playtime-heatmap').then(data => data ?? []);
    const pfpPromise = orNull(profilePromise.then(profile => fetchPfp(profile.steamid)));
    // Counted under the Steam ID, the same player_id the server player pages count under.
    const viewsPromise: Promise<number | null> = orNull(profilePromise.then(profile => recordView('players', profile.steamid)));
    const sessionsPromise = seed<GlobalPlayerSessionPage>('/sessions', { page: 0 });
    const sessionStatsPromise = seed<PlayerSessionStats>('/session-stats');
    const mapsPromise = seed<GlobalPlayerMap[]>('/maps');
    const activityPromise = seed<PlayerOnlineActivity>('/online-activity', { tz: 'UTC' });
    const infractionsPromise = seed<GlobalPlayerInfraction[]>('/infractions');

    const sections = [
        { span: "col-span-12", fallback: <UserProfileLoading />,
            content: <UserProfile profilePromise={profilePromise} pfpPromise={pfpPromise} viewsPromise={viewsPromise} /> },
        { span: "col-span-12 xl:col-span-8", fallback: <ProfilePlaytimeHistoryLoading />,
            content: <ProfilePlaytimeHistory heatmapPromise={heatmapPromise} statsPromise={sessionStatsPromise} /> },
        { span: "col-span-12 xl:col-span-4", fallback: <ProfilePlaySessionsLoading />,
            content: <ProfilePlaySessions userId={player_id} initialDataPromise={sessionsPromise} /> },
        { span: "col-span-12 xl:col-span-6", fallback: <ProfileMapsLoading />,
            content: <ProfileMaps mapsPromise={mapsPromise} /> },
        { span: "col-span-12 xl:col-span-6", fallback: <ProfileOnlineActivityLoading />,
            content: <ProfileOnlineActivity userId={player_id} initialDataPromise={activityPromise} /> },
        { span: "col-span-12", fallback: <UserCommunityConnectionsLoading />,
            content: <UserCommunityConnections profilePromise={profilePromise} /> },
        { span: "col-span-12", fallback: <ProfileInfractionsLoading />,
            content: <ProfileInfractions profilePromise={profilePromise} infractionsPromise={infractionsPromise} /> },
    ]
    // The same grid twice: all placeholders until the profile resolves, then each card streams in on its own.
    const layout = (streamed: boolean) => (
        <div className="grid grid-cols-12 gap-4">
            {sections.map(({ span, fallback, content }, i) => (
                <div key={i} className={span}>
                    {streamed ? <Suspense fallback={fallback}>{content}</Suspense> : fallback}
                </div>
            ))}
        </div>
    )

    return (
        <div className="container mx-auto max-w-10xl px-2 py-8">
            <Suspense fallback={layout(false)}>
                <ProfileCommunitiesProvider profilePromise={profilePromise}>{layout(true)}</ProfileCommunitiesProvider>
            </Suspense>
        </div>
    )
}
