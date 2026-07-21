import {getCommunityData} from "../../getCommunity";
import {Server} from "types/community";
import {PlayerBrief, PlayerSeen, PlayerSession} from "types/players";
import {fetchApiServerUrl, fetchServerUrl, fetchUrl} from "utils/generalUtils";
import {ServerMapPlayed} from "types/maps";
import {notFound} from "next/navigation";

export type ServerSlugPromise = Promise<Server | null>;


export const oneMinute = 60
export const threeMinutes = 3 * oneMinute
export const oneHour = 3600
export const oneDay = 24 * oneHour
export const sevenDay = oneDay * 7

export async function getServerSlug(slug: string): ServerSlugPromise {
    const data = await getCommunityData();
    return data.serversMapped.get(slug) ?? null
}

export async function getServerSlugOrNotFound(slug: string): Promise<Server> {
    const server = await getServerSlug(slug)
    if (!server) notFound()
    return server
}

export type SessionType = "player" | "map"
export type MutualSessionType = {
    "player": PlayerSeen[],
    "map": PlayerBrief[]
}
export type SessionInfoType = {
    "player": PlayerSession,
    "map": ServerMapPlayed
}

export type SessionInfo<T extends keyof SessionInfoType> = SessionInfoType[T]

export type MutualSessionReturn<T extends keyof MutualSessionType> = MutualSessionType[T];
export async function getMutualSessions<T extends SessionType>(server_id: string, session_id: string, type: T, object_id: string = ""): Promise<MutualSessionReturn<T>> {
    let url = ""
    switch (type) {
        case "player":
            url = `/players/${object_id}/sessions/${session_id}/might_friends`
            break
        case "map":
            url = `/sessions/${session_id}/players`
            break
        default:
            throw new TypeError("Invalid type. Pick player or map")
    }
    const data = await fetchServerUrl(server_id, url);
    return data as MutualSessionType[T]
}
export async function getSessionInfo<T extends SessionType>(server_id: string, session_id: string, type: T, object_id: string = ""): Promise<SessionInfo<T>> {
    let url = ""
    switch (type) {
        case "player":
            url = `/players/${object_id}/sessions/${session_id}/info`
            break
        case "map":
            url = `/sessions/${session_id}/info`
            break
        default:
            throw new TypeError("Invalid type. Pick player or map")
    }
    const data = await fetchServerUrl(server_id, url);
    return data as SessionInfoType[T]
}
export type GraphPlayerCount = {
    x: string,
    y: number,
}
export type ServerCountData = {
    bucket_time: string,
    player_count: number
}
type ServerGraphTypes = {
    "player": ServerCountData[],
    "map": ServerCountData[],
}
export type ServerGraphType<T extends keyof ServerGraphTypes> = ServerGraphTypes[T]
export async function getServerGraph<T extends SessionType>(server_id: string, session_id: string, object_id: string, type: T): Promise<ServerGraphType<T>>{
    let url = ""
    switch(type) {
        case "player":
            url = `/graph/${server_id}/unique_players/players/${object_id}/sessions/${session_id}`
            break
        case "map":
            url = `/graph/${server_id}/unique_players/maps/${object_id}/sessions/${session_id}`
            break
        default:
            return
    }
    const graphData = await fetchUrl(url);
    return graphData as ServerGraphType<T>
}
type MatchData = {
    zombie_score: number,
    human_score: number,
    occurred_at: string,
    extend_count: number,
}
export type PlayerSessionMapPlayed = {
    time_id: number,
    server_id: string,
    map: string,
    player_count: number,
    started_at: string,
    ended_at: string | null,
    match_data: MatchData[]
}
export async function getMapsDataSession(server_id: string, player_id: string, session_id: string): Promise<PlayerSessionMapPlayed[]> {
    const mapsData = await fetchApiServerUrl(server_id, `/players/${player_id}/sessions/${session_id}/maps`);

    return mapsData as PlayerSessionMapPlayed[];
}