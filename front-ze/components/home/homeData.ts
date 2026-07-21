import {fetchUrl} from "utils/generalUtils";
import {CommunityCountData, PopulationTimeType} from "types/home";
import {ContinentStatistics} from "types/players";

// Fetch a community's player-count series ending at `time` (the cursor). The backend
// returns a fixed number of `time_type`-sized buckets before that cursor, so panning the
// chart just moves the cursor. Returns [] on any error (incl. the endpoint not existing
// yet) so the UI degrades gracefully instead of throwing.
export async function fetchCommunityPopulation(
    communityId: string,
    timeType: PopulationTimeType,
    time: string,
    signal?: AbortSignal,
): Promise<CommunityCountData[]> {
    const params: Record<string, string> = {time_type: timeType, time};
    return fetchUrl(
        `/communities/${communityId}/unique_players`,
        {params, signal},
        false,
    ).catch(() => []) as Promise<CommunityCountData[]>;
}
export async function fetchAllCommunityPopulation(
    timeType: PopulationTimeType,
    time: string,
    signal?: AbortSignal
){
    return fetchCommunityPopulation('all', timeType, time, signal)
}

// Fetch the live continent distribution across all servers. Returns null on any error
// so the map can render without the breakdown.
export async function fetchGlobalContinents(signal?: AbortSignal): Promise<ContinentStatistics | null> {
    return fetchUrl("/radars/global/live_statistics/continents", {signal}, false)
        .catch(() => null) as Promise<ContinentStatistics | null>;
}

// Percentage change between the first and last points of a series. Returns null when it
// can't be computed (too few points, or first value is 0).
export function computeTrend(data: CommunityCountData[]): number | null {
    if (!data || data.length < 2) return null;
    const first = data[0].player_count;
    const last = data[data.length - 1].player_count;
    if (first === 0) return null;
    return ((last - first) / first) * 100;
}
