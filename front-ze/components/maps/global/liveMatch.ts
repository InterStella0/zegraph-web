import {getMapImage, NotFoundError} from "utils/generalUtils";
import {getContinentStatsNow, getMatchNow} from "../../../app/servers/[server_slug]/maps/util";
import {MapImage, ServerMapMatch} from "types/maps.ts";
import {ContinentStatistics} from "types/players.ts";
import {Community} from "types/community.ts";

export type LiveMatch = {
    match: ServerMapMatch | null,
    continents: ContinentStatistics | null,
    image: string | null,
    at: number,
};

type ImageLoader = (serverId: string, map: string) => Promise<MapImage | null>;

const serverImage: ImageLoader = getMapImage;

// The map from /communities is only a hint for fetching the image alongside the match; if the
// match reports a different map (it changed since), that image is fetched once the match is in.
export async function loadLiveMatch(
    serverId: string, mapHint: string | null | undefined, loadImage: ImageLoader = serverImage,
): Promise<LiveMatch> {
    const imageOf = (map: string) => loadImage(serverId, map).then(image => image?.large ?? null, () => null);
    const [match, continents, hinted] = await Promise.all([
        getMatchNow(serverId).catch(err => {
            // A 404 is just a server with no map session open right now.
            if (!(err instanceof NotFoundError)) console.error('Failed to load current match:', err);
            return null;
        }),
        getContinentStatsNow(serverId).catch(err => {
            console.error('Error fetching continent stats:', err);
            return null;
        }),
        mapHint ? imageOf(mapHint) : Promise.resolve(null),
    ]);
    const image = match?.map && match.map !== mapHint ? await imageOf(match.map) : hinted;
    return {match, continents, image, at: Date.now()};
}

export function prefetchLiveMatches(communities: Community[]): Record<string, Promise<LiveMatch>> {
    return Object.fromEntries(communities
        .flatMap(community => community.servers)
        .filter(server => server.status)
        .map(server => [server.id, loadLiveMatch(server.id, server.map)]));
}
