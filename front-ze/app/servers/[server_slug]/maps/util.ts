import {MapPlayedPaginated, ServerMapMatch} from "types/maps";
import {fetchApiServerUrl, fetchServerUrl, fetchUrl} from "utils/generalUtils";
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
export async function getMapsIndexNow(serverId: string): Promise<MapPlayedPaginated> {
    const data = await fetchApiServerUrl(serverId, '/maps/last/sessions', {
        params: { page: 0, sorted_by: 'LastPlayed' },
    })
    return data as MapPlayedPaginated
}
