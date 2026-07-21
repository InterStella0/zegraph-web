import {getPlayerDetailed, PlayerInfo} from "../../util.ts";
import {
    getMapsDataSession, getMutualSessions, getServerGraph,
    getSessionInfo,
    MutualSessionReturn,
    PlayerSessionMapPlayed,
    ServerGraphType,
    SessionInfo
} from "../../../../util.ts";
import {fetchApiServerUrl, getMapImage} from "utils/generalUtils.ts";
import {Server} from "types/community.ts";


export type SessionData = {
    sessionInfo: SessionInfo<"player">,
    mutualSessions: MutualSessionReturn<"player">,
    serverGraph: ServerGraphType<"player">,
    mapImages: Record<string, string>,
    server: Server,
    player: PlayerInfo,
    maps: PlayerSessionMapPlayed[]
}
async function getMapImages(server_id: string, player_id: string, session_id: string): Promise<Record<string, string>> {
    const mapsData: PlayerSessionMapPlayed[] = await fetchApiServerUrl(server_id, `/players/${player_id}/sessions/${session_id}/maps`);
    const imagePromises = mapsData.map(async (map) => {
        try {
            const imageData = await getMapImage(server_id, map.map);
            return { [map.map]: imageData?.extra_large || null };
        } catch (error) {
            console.error(`Failed to load image for ${map.map}:`, error);
            return { [map.map]: null };
        }
    });
    const imageResults = await Promise.all(imagePromises);
    const imageMap = imageResults.reduce((acc, curr) => ({ ...acc, ...curr }), {});
    return imageMap as Record<string, string>;
}

export async function getSessionData(server: Server, playerId: string, sessionId: string): Promise<SessionData> {
    const serverId = server.id;
    const player: PlayerInfo = await getPlayerDetailed(serverId, playerId);
    const [
        sessionInfo,
        maps,
        serverGraph,
        mutualSessions,
        mapImages
    ] = await Promise.all([
        getSessionInfo(serverId, sessionId, "player", playerId),
        getMapsDataSession(serverId, playerId, sessionId),
        getServerGraph(serverId, sessionId, playerId, "player"),
        getMutualSessions(serverId, sessionId, "player", playerId),
        getMapImages(serverId, playerId, sessionId),
    ]);
    return {
        sessionInfo,
        maps,
        serverGraph,
        mutualSessions,
        mapImages,
        player,
        server,
    } as SessionData
}