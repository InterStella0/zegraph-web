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
    applyPatches: (entries: Iterable<readonly [string, unknown]>) => void,
    isPatched: boolean,
};

const PlayerStatsPatchContext = createContext<PlayerStatsPatchValue | null>(null);

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

    if (patch !== undefined) {
        return { data: patch, loading: false, error: null };
    }
    return { data: fetched, loading, error };
}

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
