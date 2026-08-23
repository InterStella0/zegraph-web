"use client"
import {
    createContext,
    ReactNode,
    use,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";
import {fetchApiServerUrl, StillCalculate} from "utils/generalUtils";
import {ServerPlayerDetailed} from "./page.tsx";
import {PlayerInfo} from "./util.ts";

/**
 * Every endpoint whose answer is recalculated together with the player's playtime. `detail` leads the
 * list because it is the only one that reports whether the recalculation has landed -- see
 * `StalePlayerStats`.
 */
export const STALE_PATHS = [
    "detail",
    "most_played_maps",
    "regions",
    "hours_of_day",
    "online_heatmap",
    "graph/sessions",
] as const;

export type StalePath = typeof STALE_PATHS[number];

type PatchMap = Record<string, unknown>;

type PlayerStatsPatchValue = {
    patches: PatchMap,
    /** Merges a whole batch in one render, so every chart on the page updates on the same frame. */
    applyPatches: (entries: Iterable<readonly [string, unknown]>) => void,
    isPatched: boolean,
};

const PlayerStatsPatchContext = createContext<PlayerStatsPatchValue | null>(null);

/**
 * Holds the freshly fetched values that replace what the components already rendered.
 *
 * This lives above the whole grid rather than inside `StalePlayerStats`: the banner removes itself the
 * moment the patch lands, and a provider owned by it would take the patch down with it, snapping every
 * chart back to the stale numbers.
 */
export function PlayerStatsPatchProvider({ children }: { children: ReactNode }) {
    const [patches, setPatches] = useState<PatchMap>({});

    const applyPatches = useCallback((entries: Iterable<readonly [string, unknown]>) => {
        setPatches(prev => {
            const next = { ...prev };
            for (const [path, value] of entries) {
                next[path] = value;
            }
            return next;
        });
    }, []);

    const value = useMemo(() => ({
        patches,
        applyPatches,
        isPatched: Object.keys(patches).length > 0,
    }), [patches, applyPatches]);

    return <PlayerStatsPatchContext.Provider value={value}>{children}</PlayerStatsPatchContext.Provider>;
}

export function usePlayerStatsPatch(): PlayerStatsPatchValue | null {
    return useContext(PlayerStatsPatchContext);
}

export type PlayerStatResult<T> = {
    data: T | null,
    loading: boolean,
    error: Error | null,
};

/**
 * Fetches one player endpoint and returns the patched value in preference to the fetched one.
 *
 * The fetch happens once; a patch never triggers a refetch, it simply wins. Outside the player page
 * there is no provider and this degrades to a plain fetch.
 */
export function usePlayerStat<T>(
    serverId: string | null | undefined,
    playerId: string | null | undefined,
    path: string,
    enabled: boolean = true,
): PlayerStatResult<T> {
    const ctx = useContext(PlayerStatsPatchContext);
    const patch = ctx?.patches[path] as T | undefined;

    const active = enabled && !!serverId && !!playerId;
    const [fetched, setFetched] = useState<T | null>(null);
    const [loading, setLoading] = useState<boolean>(active);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        if (!active) return;

        let cancelled = false;
        setLoading(true);
        setError(null);
        setFetched(null);

        fetchApiServerUrl(serverId as string, `/players/${playerId}/${path}`)
            .then((resp: T | StillCalculate) => {
                if (cancelled) return;
                // `fetchApiServerUrl` can resolve to this instead of throwing, depending on the caller.
                if (resp instanceof StillCalculate) throw resp;
                setFetched(resp);
            })
            .catch(err => {
                if (!cancelled) setError(err);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [serverId, playerId, path, active]);

    // A patch is an answer: it ends both the loading and the error state, even if the original fetch
    // failed while the data was mid-recalculation.
    if (patch !== undefined) {
        return { data: patch, loading: false, error: null };
    }
    return { data: fetched, loading, error };
}

/**
 * `use()`s the server-rendered player and folds the `detail` patch over it.
 *
 * Only the keys `/players/:id/detail` actually returns are overwritten. `online_since` and
 * `last_played*` are computed in `util.ts` from the separate `playing` endpoint, which is not part of
 * the recalculation, so they survive the merge untouched.
 */
export function usePatchedPlayer<T extends ServerPlayerDetailed>(
    serverPlayerPromise: Promise<T>,
): T {
    const resolved = use(serverPlayerPromise);
    const ctx = useContext(PlayerStatsPatchContext);
    const patch = ctx?.patches["detail"] as Partial<PlayerInfo> | undefined;

    return useMemo(() => {
        const { player } = resolved;
        if (!patch || player === null || player === undefined || player instanceof StillCalculate) {
            return resolved;
        }
        return { ...resolved, player: { ...player, ...patch } };
    }, [resolved, patch]);
}
