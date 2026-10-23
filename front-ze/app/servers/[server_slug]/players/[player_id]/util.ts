import { DetailedPlayerInfo } from "types/players";
import {fetchApiServerUrl, StillCalculate} from "utils/generalUtils";
import dayjs from "lib/dayjs";
import { threeMinutes} from "../../util.ts";

export type PlayerInfo = DetailedPlayerInfo

const EXTERNAL_STATS_SERVER_IDS = new Set([
    '85568392935951359',
    '7ae2ca188ebf8be21d4f42b2827153ac',
    '674b592b744afc3c108d345a',
])
const PERIOD_STAT_PATHS = ['graph/sessions', 'most_played_maps', 'regions', 'hours_of_day', 'online_heatmap']

export function getPlayerStatSeeds(serverId: string, playerId: string, withPeriod: boolean): Record<string, Promise<unknown>> {
    const seed = (path: string, options = {}) =>
        fetchApiServerUrl(serverId, `/players/${playerId}/${path}`, options).catch(() => null)
    const seeds: Record<string, Promise<unknown>> = { infractions: seed('infractions') }
    if (EXTERNAL_STATS_SERVER_IDS.has(serverId))
        seeds.external_stats = seed('external_stats')
    if (!withPeriod) {
        for (const path of PERIOD_STAT_PATHS)
            seeds[path] = seed(path)
        seeds.sessions = seed('sessions', { params: { page: 0 } })
    }
    return seeds
}
type DetailReturningType = "raise" | "return"
type PlayerDetailReturnTypes = {
    return: PlayerInfo | StillCalculate,
    raise: PlayerInfo,
}
type PlayerDetailReturn<T extends keyof PlayerDetailReturnTypes> = PlayerDetailReturnTypes[T]

export async function getPlayerDetailed(
    server_id: string,
    player_id: string,
    onStillCalculate?: "raise",
): Promise<PlayerInfo>;
export async function getPlayerDetailed(
    server_id: string,
    player_id: string,
    onStillCalculate: "return",
): Promise<PlayerInfo | StillCalculate>;

export async function getPlayerDetailed<T extends DetailReturningType>(server_id: string, player_id: string, onStillCalculate: T = "raise" as T): Promise<PlayerDetailReturn<T>> {
    const raise = onStillCalculate === "raise"
    const [playerData, playingData] = await Promise.all([
        fetchApiServerUrl(server_id, `/players/${player_id}/detail`, {}, raise),
        fetchApiServerUrl(server_id, `/players/${player_id}/playing`, { next: { revalidate: threeMinutes } }, raise),
    ])

    if (playerData instanceof StillCalculate)
        return playerData as PlayerDetailReturn<T>

    const ended = playingData?.ended_at ?? null
    return {
        ...playerData,
        last_played: playingData?.started_at ?? null,
        last_played_ended: ended,
        online_since: playingData && ended == null ? playingData.started_at : null,
        last_played_duration: playingData && ended != null ? dayjs(ended).diff(dayjs(playingData.started_at), "seconds") : null,
    }
}
