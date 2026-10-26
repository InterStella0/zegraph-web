import {fetchUrl} from "utils/generalUtils";
import {CommunityCountData, PopulationTimeType} from "types/home";
import {ContinentStatistics} from "types/players";
import {Community} from "types/community";

export const INITIAL_SELECTED_COMMUNITIES = 5;
export const INITIAL_POPULATION_TIME_TYPE: PopulationTimeType = 'OneHour';

export type PopulationPoint = {x: string, y: number};

export type PopulationSeed = {
    time: string,
    lines: {id: string, points: PopulationPoint[]}[],
};

/** Unique-player series for a community (`'all'` for every community); failures yield an empty series. */
export async function fetchCommunityPopulation(
    communityId: string,
    timeType: PopulationTimeType,
    time: string,
    signal?: AbortSignal,
): Promise<PopulationPoint[]> {
    const data: CommunityCountData[] = await fetchUrl(
        `/communities/${communityId}/unique_players`,
        {params: {time_type: timeType, time}, signal},
        false,
    ).catch(() => []);
    return data.map(d => ({x: d.bucket_time, y: d.player_count}));
}

export async function fetchPopulationSeed(communities: Community[]): Promise<PopulationSeed> {
    const time = new Date().toJSON();
    const lines = await Promise.all(communities.slice(0, INITIAL_SELECTED_COMMUNITIES).map(async c => ({
        id: c.id,
        points: await fetchCommunityPopulation(c.id, INITIAL_POPULATION_TIME_TYPE, time),
    })));
    return {time, lines};
}

export async function fetchGlobalContinents(signal?: AbortSignal): Promise<ContinentStatistics | null> {
    return fetchUrl("/radars/global/live_statistics/continents", {signal}, false).catch(() => null);
}
