import {ServerMapMatch} from "types/maps";
import {fetchServerUrl, fetchUrl} from "utils/generalUtils";
import {oneMinute} from "../util.ts";
import {ContinentStatistics} from "types/players.ts";

export async function getMatchNow(serverId: string): Promise<ServerMapMatch> {
    return fetchServerUrl(serverId, '/match-now', { next: {revalidate: oneMinute} })
}
export async function getContinentStatsNow(serverId: string): Promise<ContinentStatistics> {
    return fetchUrl(`/radars/${serverId}/live_statistics/continents`, { next: {revalidate: oneMinute} })
}
