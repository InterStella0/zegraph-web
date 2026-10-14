import { DetailedPlayerInfo } from "types/players";
import {fetchApiServerUrl, StillCalculate} from "utils/generalUtils";
import dayjs from "dayjs";
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

function handleOnStillCalculate(value: DetailReturningType){
    switch (value){
        case "raise":
            return true
        case "return":
            return false
    }
}
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
    const stillCalculate = handleOnStillCalculate(onStillCalculate)

    const [playerData, playingData] = await Promise.all([
        fetchApiServerUrl(server_id, `/players/${player_id}/detail`, {}, stillCalculate),
        fetchApiServerUrl(server_id, `/players/${player_id}/playing`, { next: { revalidate: threeMinutes } }, stillCalculate),
    ])

    if (playerData instanceof StillCalculate)
        return playerData as PlayerDetailReturn<T>

    let prop: PlayerInfo = {
        ...playerData,
        last_played: playingData.started_at,
        last_played_ended: playingData.ended_at,
        online_since: null,
        last_played_duration: null
    }
    if (prop.last_played_ended == null)
        prop.online_since = playingData.started_at
    else {
        prop.last_played_duration = dayjs(playingData.ended_at).diff(dayjs(playingData.started_at), "seconds")
    }
    return prop
}
