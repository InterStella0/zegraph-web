import {ServerMapMatch} from "types/maps";
import {fetchServerUrl, fetchUrl} from "utils/generalUtils";
import {oneMinute} from "../util.ts";
import {ContinentStatistics} from "types/players.ts";

export async function getMatchNow(serverId: string): Promise<ServerMapMatch> {
    const currentMatch = await fetchServerUrl(serverId, '/match-now', { next: {revalidate: oneMinute} })
    return currentMatch as ServerMapMatch
}
export async function getContinentStatsNow(serverId: string): Promise<ContinentStatistics> {
    const data = await fetchUrl(`/radars/${serverId}/live_statistics/continents`, { next: {revalidate: oneMinute} })
    return data as ContinentStatistics
}
