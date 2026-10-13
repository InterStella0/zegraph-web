import {
    getMapsDataSession,
    getMutualSessions,
    getServerGraph,
    getServerSlugOrNotFound, getSessionInfo, SessionInfo
} from "../../../../util";
import {fetchUrl, formatHours, formatTitle, socialMeta} from "utils/generalUtils";
import {getPlayerDetailed, PlayerInfo} from "../../util";
import {Metadata} from "next";
import { PlayerProfilePicture} from "types/players.ts";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import SessionPlayerWrapper from "./SessionPlayerWrapper.tsx";
import {getSessionData} from "./utils.ts";
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

dayjs.extend(relativeTime)

export async function generateMetadata({ params}: {
    params: Promise<{ server_slug: string, player_id: string, session_id: string }>
}): Promise<Metadata> {
    const { server_slug, player_id, session_id } = await params;
    const server = await getServerSlugOrNotFound(server_slug);
    const t = await getTranslations('metadata');
    let player: PlayerInfo | null = null
    let info: SessionInfo<"player"> | null = null;
    try{
        player = await getPlayerDetailed(server.id, player_id)
        info = await getSessionInfo(server.id, session_id, "player", player_id)
    }catch(error){
        if (error.code === 202){
            return {
                title: formatTitle(player_id),
                description: t('playerCalculating'),
            }
        }else if (error.code === 404){
            return {
                title: "ZE Graph",
                description: t('viewPlayerActivities', {name: server.community_name})
            };
        }else{
            return {}
        }
    }
    let description = ``
    if (info.ended_at){
        description += t('werePlaying', {hours: formatHours(dayjs(info.ended_at).diff(dayjs(info.started_at), 'seconds', true))})
    }else{
        description += t('arePlaying', {hours: formatHours(dayjs().diff(dayjs(info.started_at), 'seconds', true))})
    }
    try{
        const serverCounts = await getServerGraph(server.id, session_id, player.id, "player")
        const playerCounts = serverCounts.map(e => e.player_count)
        const [min, max] = [Math.min(...playerCounts), Math.max(...playerCounts)]
        description += ' ' + t('playerCountRange', {min, max})
    }catch (error){}

    try{
        const maps = await getMapsDataSession(server.id, player.id, session_id)
        if (maps && maps.length > 0) {
            const mapNames = maps.map(e => e.map)
            const firstTwo = mapNames.slice(0, 2).join(", ")

            const remaining = mapNames.length - 2

            description += ' ' + (remaining > 0 ? t('playedThroughMore', {maps: firstTwo, count: remaining}) : t('playedThrough', {maps: firstTwo}))
        }
    }catch(error){}

    if (player.online_since){
        description += ' ' + t('currentlyOnline', {time: dayjs(player.online_since).fromNow()});
    }else{
        description += ' ' + t('lastOnline', {time: dayjs(player.last_played_ended).fromNow()});
    }
    try{
        const players = await getMutualSessions(server.id, session_id, "player", player_id)

        description += ` They have seen ${players.length} players in this session.`
    }catch(error){}
    let image = ""
    try{
        const pfp: PlayerProfilePicture | null = await fetchUrl(`/players/${player.id}/pfp`)
        image = pfp.full
    }catch(error){

    }

    const title = formatTitle(`${player.name}'s Session on ${server.community_name}`)
    return {
        title: title,
        description: description,
        alternates: {
            canonical: `/servers/${server.gotoLink}/players/${player.id}/sessions/${session_id}`,
        },
        ...socialMeta({title, description, images: [image], noTwitter: true}),
    }
}
export default async function Page({ params }){
    const { player_id, server_slug, session_id } = await params
    const server = await getServerSlugOrNotFound(server_slug);

    // Resolve server-side (instead of streaming the promise into the client
    // wrapper) so an invalid player_id/session_id 404s properly instead of a
    // raw rejection crossing the server/client boundary.
    let sessionData
    try{
        sessionData = await getSessionData(server, player_id, session_id)
    }catch(error: any){
        if (error?.code === 404) notFound()
        throw error
    }

    return <SessionPlayerWrapper sessionPromise={Promise.resolve(sessionData)} />
}
