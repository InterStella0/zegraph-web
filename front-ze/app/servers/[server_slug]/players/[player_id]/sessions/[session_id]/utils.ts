import {getPlayerDetailed, PlayerInfo} from "../../util.ts";
import {
    getMapsDataSession, getMutualSessions, getServerGraph,
    getSessionInfo,
    MutualSessionReturn,
    PlayerSessionMapPlayed,
    ServerGraphType,
    SessionInfo
} from "../../../../util.ts";
import {getMapImage} from "utils/generalUtils.ts";
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

async function getMapImages(serverId: string, maps: PlayerSessionMapPlayed[]): Promise<Record<string, string>> {
    const images = await Promise.all(maps.map(async ({map}) => [map, (await getMapImage(serverId, map))?.extra_large || null]));
    return Object.fromEntries(images);
}

export async function getSessionData(server: Server, playerId: string, sessionId: string): Promise<SessionData> {
    const serverId = server.id;
    const mapsPromise = getMapsDataSession(serverId, playerId, sessionId);
    const [player, sessionInfo, maps, serverGraph, mutualSessions, mapImages] = await Promise.all([
        getPlayerDetailed(serverId, playerId),
        getSessionInfo(serverId, sessionId, "player", playerId),
        mapsPromise,
        getServerGraph(serverId, sessionId, playerId, "player"),
        getMutualSessions(serverId, sessionId, "player", playerId),
        mapsPromise.then(maps => getMapImages(serverId, maps)),
    ]);
    return { sessionInfo, maps, serverGraph, mutualSessions, mapImages, player, server };
}
