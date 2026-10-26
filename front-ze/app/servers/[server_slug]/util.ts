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
type MutualSessionType = {
    "player": PlayerSeen[],
    "map": PlayerBrief[]
}
type SessionInfoType = {
    "player": PlayerSession,
    "map": ServerMapPlayed
}

export type SessionInfo<T extends SessionType> = SessionInfoType[T]
export type MutualSessionReturn<T extends SessionType> = MutualSessionType[T];

const sessionPath = (type: SessionType, sessionId: string, objectId: string) =>
    type === "player" ? `/players/${objectId}/sessions/${sessionId}` : `/sessions/${sessionId}`

export async function getMutualSessions<T extends SessionType>(server_id: string, session_id: string, type: T, object_id: string = ""): Promise<MutualSessionReturn<T>> {
    const suffix = type === "player" ? "might_friends" : "players"
    return fetchServerUrl(server_id, `${sessionPath(type, session_id, object_id)}/${suffix}`)
}
export async function getSessionInfo<T extends SessionType>(server_id: string, session_id: string, type: T, object_id: string = ""): Promise<SessionInfo<T>> {
    return fetchServerUrl(server_id, `${sessionPath(type, session_id, object_id)}/info`)
}
export type GraphPlayerCount = {
    x: string,
    y: number,
}
export type ServerCountData = {
    bucket_time: string,
    player_count: number
}
export type ServerGraphType<T extends SessionType> = ServerCountData[]
export async function getServerGraph<T extends SessionType>(server_id: string, session_id: string, object_id: string, type: T): Promise<ServerGraphType<T>> {
    return fetchUrl(`/graph/${server_id}/unique_players/${type}s/${object_id}/sessions/${session_id}`)
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
    return fetchApiServerUrl(server_id, `/players/${player_id}/sessions/${session_id}/maps`);
}
