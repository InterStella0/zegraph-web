import {
    getMutualSessions, getServerGraph,
    getSessionInfo,
    MutualSessionReturn,
    ServerGraphType,
    SessionInfo
} from "../../../../util.ts";
import {MapImage, MapSessionMatch} from "types/maps.ts";
import {ContinentStatistics} from "types/players.ts";
import {Server} from "types/community.ts";
import {AuthenticationError, fetchApiServerUrl, fetchServerUrl, getMapImage, hasSession} from "utils/generalUtils.ts";

export type SessionData = {
    sessionInfo: SessionInfo<"map">,
    mutualSessions: MutualSessionReturn<"map">,
    /** `null` for logged-out visitors: match history is login-only. */
    graphData:  MapSessionMatch[] | null,
    serverGraph:  ServerGraphType<"map">,
    mapImage: MapImage,
    continents: ContinentStatistics,
    server: Server,
    mapName: string
}

async function getSessionMatches(serverId: string, sessionId: string): Promise<MapSessionMatch[] | null> {
    if (!(await hasSession())) return null;
    return fetchApiServerUrl(serverId, `/sessions/${sessionId}/all-match`).catch(error => {
        if (error instanceof AuthenticationError) return null;
        throw error;
    });
}

export default async function getSessionData(server: Server, mapName: string, sessionId: string): Promise<SessionData> {
    const serverId = server.id;
    const [sessionInfo, mutualSessions, graphData, serverGraph, mapImage, continents] = await Promise.all([
        getSessionInfo(serverId, sessionId, "map", mapName),
        getMutualSessions(serverId, sessionId, "map", mapName),
        getSessionMatches(serverId, sessionId),
        getServerGraph(serverId, sessionId, mapName, 'map'),
        getMapImage(serverId, mapName),
        fetchServerUrl(serverId, `/sessions/${sessionId}/continents`)
    ]);
    return { sessionInfo, mutualSessions, graphData, serverGraph, mapImage, continents, server, mapName }
}