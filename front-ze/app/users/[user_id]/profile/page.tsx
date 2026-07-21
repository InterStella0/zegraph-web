import UserProfile from "components/users/UserProfile";
import UserCommunityConnections from "components/users/UserCommunityConnections";
import ProfileOverview from "components/users/ProfileOverview";
import ProfileStatsCards from "components/users/ProfileStatsCards";
import getServerUser from "../../../getServerUser";
import { redirect } from "next/navigation";
import { ProfileResponse } from "types/community.ts";
import {
    fetchApiUrl,
    fetchUrl,
    formatHours,
    formatOrdinal,
    formatTitle,
    socialMeta
} from "utils/generalUtils.ts";
import ResponsiveAppBar from "components/ui/ResponsiveAppBar.tsx";
import Footer from "components/ui/Footer";
import {Metadata} from "next";
import { oneDay, oneHour } from "../../../servers/[server_slug]/util.ts";
import {getTranslations} from "next-intl/server";
import { PlayerProfilePicture } from "types/players.ts";
import dayjs from "dayjs";

export async function generateMetadata({ params }: {
    params: Promise<{ user_id: string }>
}): Promise<Metadata> {
    const { user_id } = await params;
    const t = await getTranslations('metadata');
    const tHeader = await getTranslations('players.profile.header');
    const profile: ProfileResponse = await fetchApiUrl(`/accounts/${user_id}/profile`);
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
    // Unranked players come back as total_ranked_players + 1, not null.
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
            canonical: `/users/${profile.steamid}/profile`,
        },
    }
}

export default async function Page({ params }: { params: Promise<{ user_id: string }> }) {
    const { user_id } = await params;

    if (user_id === "me" && !await getServerUser()) {
        redirect('/');
    }

    const sessionUserPromise = getServerUser();
    const profilePromise: Promise<ProfileResponse> = fetchApiUrl(`/accounts/${user_id}/profile`);

    return (<>
        <ResponsiveAppBar userPromise={sessionUserPromise} server={null} setDisplayCommunity={null} />
        <div className="container mx-auto max-w-7xl px-4 py-8">
            <div className="flex flex-col gap-6">
                <UserProfile profilePromise={profilePromise} />
                <ProfileOverview userId={user_id} />
                <ProfileStatsCards userId={user_id} profilePromise={profilePromise} />
                <UserCommunityConnections profilePromise={profilePromise} />
            </div>
        </div>
        <Footer />
    </>)
}
