'use client'
import {loadMapImage} from "lib/batchLoader";
import {useResource} from "lib/hooks/useResource";
import {MapImage} from "types/maps";

/** A map's image URL at one size, batched with the other map images on the page; null when it has none. */
export function useMapImage(map: string, serverId: string, size: Exclude<keyof MapImage, 'map_name'>) {
    return useResource<string | null>(
        () => loadMapImage(map, serverId).then(image => image ? image[size] : null),
        [serverId, map],
    )
}
