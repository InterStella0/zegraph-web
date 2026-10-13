import {fetchServerUrl, fetchUrl, getMapImage, withImageDomain} from "utils/generalUtils";
import {MapImage} from "types/maps";
import {PlayerProfilePicture} from "types/players";

type FetchMany<V> = (group: string, keys: string[]) => Promise<Record<string, V>>;
type FetchOne<V> = (key: string, group: string) => Promise<V | null>;

const MAX_BATCH = 100;

export function createBatchLoader<V>(fetchMany: FetchMany<V>, fetchOne: FetchOne<V>, retryMissing: boolean) {
    const cache = new Map<string, Promise<V | null>>();
    let queue = new Map<string, Map<string, (value: V | null) => void>>();
    let scheduled = false;

    const cacheKey = (group: string, key: string) => `${group}\u0000${key}`;

    function flush() {
        const groups = queue;
        queue = new Map();
        scheduled = false;
        for (const [group, pending] of groups) {
            const keys = [...pending.keys()].sort();
            for (let i = 0; i < keys.length; i += MAX_BATCH) {
                const chunk = keys.slice(i, i + MAX_BATCH);
                fetchMany(group, chunk)
                    .then(result => ({ result, failed: false }), () => ({ result: {} as Record<string, V>, failed: true }))
                    .then(({ result, failed }) => {
                        for (const key of chunk) {
                            const found = result?.[key] ?? null;
                            const value = found === null && (failed || retryMissing)
                                ? fetchOne(key, group).catch(() => null)
                                : Promise.resolve(found);
                            value.then(resolved => {
                                if (resolved === null) cache.delete(cacheKey(group, key));
                                pending.get(key)(resolved);
                            });
                        }
                    });
            }
        }
    }

    return function load(key: string, group: string = ""): Promise<V | null> {
        const id = cacheKey(group, key);
        const cached = cache.get(id);
        if (cached) return cached;

        const promise = new Promise<V | null>(resolve => {
            let pending = queue.get(group);
            if (!pending) {
                pending = new Map();
                queue.set(group, pending);
            }
            pending.set(key, resolve);
        });
        cache.set(id, promise);
        if (!scheduled) {
            scheduled = true;
            setTimeout(flush, 0);
        }
        return promise;
    };
}

export const loadPlayerPfp = createBatchLoader<PlayerProfilePicture>(
    (_, ids) => fetchUrl('/players/pfps', { params: { ids: ids.join(',') } }),
    id => fetchUrl(`/players/${id}/pfp`),
    true,
);

export const loadMapImage = createBatchLoader<MapImage>(
    (serverId, maps) => fetchServerUrl(serverId, '/maps/images', { params: { maps: maps.join(',') } })
        .then((images: Record<string, MapImage>) => {
            for (const image of Object.values(images)) withImageDomain(image);
            return images;
        }),
    (map, serverId) => getMapImage(serverId, map),
    false,
);
