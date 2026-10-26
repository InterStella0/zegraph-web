import {
    getMapsDataSession,
    getMutualSessions,
    getServerSlugOrNotFound, getSessionInfo, SessionInfo
} from "../../../../util";
import {metadataFallback, serverMetadata, sessionSummary} from "../../../../serverMetadata";
import {fetchUrl, formatTitle, orNotFound, orNull} from "utils/generalUtils";
import {getPlayerDetailed, PlayerInfo} from "../../util";
import {Metadata} from "next";
import { PlayerProfilePicture} from "types/players.ts";
import dayjs from "lib/dayjs";
import SessionPlayerWrapper from "./SessionPlayerWrapper.tsx";
import {getSessionData} from "./utils.ts";

export async function generateMetadata({ params}: {
    params: Promise<{ server_slug: string, player_id: string, session_id: string }>
}): Promise<Metadata> {
    return serverMetadata(params, async (server, t, { player_id, session_id }) => {
        let player: PlayerInfo
        let info: SessionInfo<"player">
        try{
            player = await getPlayerDetailed(server.id, player_id)
            info = await getSessionInfo(server.id, session_id, "player", player_id)
        }catch(error){
            return metadataFallback(error, "player", formatTitle(player_id), server, t)
        }
        const [summary, maps, players, pfp] = await Promise.all([
            sessionSummary(t, info, ['werePlaying', 'arePlaying'], server.id, session_id, player.id, "player"),
            orNull(getMapsDataSession(server.id, player.id, session_id)),
            orNull(getMutualSessions(server.id, session_id, "player", player_id)),
            orNull<PlayerProfilePicture>(fetchUrl(`/players/${player.id}/pfp`)),
        ])
        let description = summary
        if (maps?.length) {
            const firstTwo = maps.slice(0, 2).map(e => e.map).join(", ")
            const remaining = maps.length - 2
            description += ' ' + (remaining > 0 ? t('playedThroughMore', {maps: firstTwo, count: remaining}) : t('playedThrough', {maps: firstTwo}))
        }
        if (player.online_since){
            description += ' ' + t('currentlyOnline', {time: dayjs(player.online_since).fromNow()});
        }else{
            description += ' ' + t('lastOnline', {time: dayjs(player.last_played_ended).fromNow()});
        }
        if (players)
            description += ` They have seen ${players.length} players in this session.`

        return {
            title: `${player.name}'s Session on ${server.community_name}`,
            description,
            path: `/players/${player.id}/sessions/${session_id}`,
            social: {images: [pfp?.full ?? ""], noTwitter: true},
        }
    })
}
export default async function Page({ params }){
    const { player_id, server_slug, session_id } = await params
    const server = await getServerSlugOrNotFound(server_slug);
    const sessionData = await orNotFound(getSessionData(server, player_id, session_id))
    return <SessionPlayerWrapper sessionPromise={Promise.resolve(sessionData)} />
}
