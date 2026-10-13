import {
    getMapsDataSession,
    getMutualSessions,
    getServerSlugOrNotFound, getSessionInfo, SessionInfo
} from "../../../../util";
import {metadataFallback, serverMetadata, sessionSummary} from "../../../../serverMetadata";
import {fetchUrl, formatTitle} from "utils/generalUtils";
import {getPlayerDetailed, PlayerInfo} from "../../util";
import {Metadata} from "next";
import { PlayerProfilePicture} from "types/players.ts";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import SessionPlayerWrapper from "./SessionPlayerWrapper.tsx";
import {getSessionData} from "./utils.ts";
import { notFound } from 'next/navigation';

dayjs.extend(relativeTime)

export async function generateMetadata({ params}: {
    params: Promise<{ server_slug: string, player_id: string, session_id: string }>
}): Promise<Metadata> {
    return serverMetadata(params, async (server, t, { player_id, session_id }) => {
        let player: PlayerInfo | null = null
        let info: SessionInfo<"player"> | null = null;
        try{
            player = await getPlayerDetailed(server.id, player_id)
            info = await getSessionInfo(server.id, session_id, "player", player_id)
        }catch(error){
            return metadataFallback(error, "player", formatTitle(player_id), server, t)
        }
        let description = await sessionSummary(t, info, ['werePlaying', 'arePlaying'], server.id, session_id, player.id, "player")

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

        return {
            title: `${player.name}'s Session on ${server.community_name}`,
            description,
            path: `/players/${player.id}/sessions/${session_id}`,
            social: {images: [image], noTwitter: true},
        }
    })
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
