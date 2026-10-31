import {fetchUrl} from "utils/generalUtils";
import {CommunityCountData, PopulationTimeType} from "types/home";
import {ContinentStatistics} from "types/players";
import {Community} from "types/community";

export const INITIAL_SELECTED_COMMUNITIES = 5;
/** The pseudo-community the backend combines every community under. */
export const ALL_COMMUNITY_ID = 'all';

/** Default chart selection: every community combined, then the first few communities. */
export const initialSelection = (communities: Community[]): string[] =>
    [ALL_COMMUNITY_ID, ...communities.slice(0, INITIAL_SELECTED_COMMUNITIES).map(c => c.id)];
export const INITIAL_POPULATION_TIME_TYPE: PopulationTimeType = 'OneHour';

export type PopulationPoint = {x: string, y: number};

/** `unique`: distinct players seen in each bucket. `concurrent`: the most online at once in it. */
export type PopulationMetric = 'unique' | 'concurrent';
const METRIC_ENDPOINTS: Record<PopulationMetric, string> = {
    unique: 'unique_players',
    concurrent: 'concurrent_players',
};

export type PopulationSeed = {
    time: string,
    lines: {id: string, points: PopulationPoint[]}[],
};

/** Player-count series for a community (`'all'` for every community); failures yield an empty series. */
export async function fetchCommunityPopulation(
    communityId: string,
    timeType: PopulationTimeType,
    time: string,
    signal?: AbortSignal,
    metric: PopulationMetric = 'unique',
): Promise<PopulationPoint[]> {
    const data: CommunityCountData[] = await fetchUrl(
        `/communities/${communityId}/${METRIC_ENDPOINTS[metric]}`,
        {params: {time_type: timeType, time}, signal},
        false,
    ).catch(() => []);
    return data.map(d => ({x: d.bucket_time, y: d.player_count}));
}

export async function fetchPopulationSeed(communities: Community[]): Promise<PopulationSeed> {
    const time = new Date().toJSON();
    const lines = await Promise.all(initialSelection(communities).map(async id => ({
        id,
        points: await fetchCommunityPopulation(id, INITIAL_POPULATION_TIME_TYPE, time),
    })));
    return {time, lines};
}

export async function fetchGlobalContinents(signal?: AbortSignal): Promise<ContinentStatistics | null> {
    return fetchUrl("/radars/global/live_statistics/continents", {signal}, false).catch(() => null);
}
