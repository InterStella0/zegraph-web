import {fetchUrl} from "utils/generalUtils";
import {CommunityCountData, PopulationTimeType} from "types/home";
import {ContinentStatistics} from "types/players";
import {Community} from "types/community";

export const INITIAL_SELECTED_COMMUNITIES = 5;
export const INITIAL_POPULATION_TIME_TYPE: PopulationTimeType = 'OneHour';

export type PopulationSeed = {
    time: string,
    lines: {id: string, points: {x: string, y: number}[]}[],
};

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

export async function fetchPopulationSeed(communities: Community[]): Promise<PopulationSeed> {
    const time = new Date().toJSON();
    const lines = await Promise.all(communities.slice(0, INITIAL_SELECTED_COMMUNITIES).map(async c => {
        const data = await fetchCommunityPopulation(c.id, INITIAL_POPULATION_TIME_TYPE, time);
        return {id: c.id, points: data.map(d => ({x: d.bucket_time, y: d.player_count}))};
    }));
    return {time, lines};
}

export async function fetchGlobalContinents(signal?: AbortSignal): Promise<ContinentStatistics | null> {
    return fetchUrl("/radars/global/live_statistics/continents", {signal}, false)
        .catch(() => null) as Promise<ContinentStatistics | null>;
}
