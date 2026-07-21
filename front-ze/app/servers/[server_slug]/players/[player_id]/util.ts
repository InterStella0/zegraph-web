import { DetailedPlayerInfo } from "types/players";
import {fetchApiServerUrl, StillCalculate} from "utils/generalUtils";
import dayjs from "dayjs";
import { threeMinutes} from "../../util.ts";

export type PlayerInfo = DetailedPlayerInfo
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

    const [playerData, playingData, ..._] = await Promise.all([
        fetchApiServerUrl(server_id, `/players/${player_id}/detail`, {}, stillCalculate),
        fetchApiServerUrl(server_id, `/players/${player_id}/playing`, { next: { revalidate: threeMinutes } }, stillCalculate),
        fetchApiServerUrl(server_id, `/players/${player_id}/most_played_maps`, {}, false),
        fetchApiServerUrl(server_id, `/players/${player_id}/regions`, {}, false),
        fetchApiServerUrl(server_id, `/players/${player_id}/infractions`, {}, false),
        fetchApiServerUrl(server_id, `/players/${player_id}/hours_of_day`, {}, false),
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