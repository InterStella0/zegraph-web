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
import {fetchServerUrl, getMapImage} from "utils/generalUtils.ts";

export type SessionData = {
    sessionInfo: SessionInfo<"map">,
    mutualSessions: MutualSessionReturn<"map">,
    graphData:  MapSessionMatch[],
    serverGraph:  ServerGraphType<"map">,
    mapImage: MapImage,
    continents: ContinentStatistics,
    server: Server,
    mapName: string
}

export default async function getSessionData(server: Server, mapName: string, sessionId: string): Promise<SessionData> {
    const serverId = server.id;
    const [
        sessionInfo,
        mutualSessions,
        graphData,
        serverGraph,
        mapImage,
        continents
    ] = await Promise.all([
        getSessionInfo(serverId, sessionId, "map", mapName),
        getMutualSessions(serverId, sessionId, "map", mapName),
        fetchServerUrl(serverId, `/sessions/${sessionId}/all-match`),
        getServerGraph(serverId, sessionId, mapName, 'map'),
        getMapImage(serverId, mapName),
        fetchServerUrl(serverId, `/sessions/${sessionId}/continents`)
    ]);
    return { sessionInfo, mutualSessions, graphData, serverGraph, mapImage, continents, server, mapName }
}