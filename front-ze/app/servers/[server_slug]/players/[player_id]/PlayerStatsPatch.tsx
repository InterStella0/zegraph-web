"use client"
import {createContext, ReactNode, Suspense, use, useCallback, useContext, useEffect, useMemo, useRef, useState} from "react";
import {fetchApiServerUrl, NO_CACHE, StillCalculate} from "utils/generalUtils";
import {ServerPlayerDetailed} from "./page.tsx";
import {PlayerInfo} from "./util.ts";
import {usePeriod} from "components/period/Period";

export const STALE_PATHS = ["detail", "most_played_maps", "regions", "hours_of_day", "online_heatmap", "graph/sessions"] as const;

type PatchMap = Record<string, unknown>;

type PlayerStatsPatchValue = {
    patches: PatchMap,
    applyPatches: (entries: Iterable<readonly [string, unknown]>) => void,
};

const PlayerStatsPatchContext = createContext<PlayerStatsPatchValue | null>(null);

export function PlayerStatsPatchProvider({ children }: { children: ReactNode }) {
    const [patches, setPatches] = useState<PatchMap>({});

    const applyPatches = useCallback((entries: Iterable<readonly [string, unknown]>) => {
        setPatches(prev => ({ ...prev, ...Object.fromEntries(entries) }));
    }, []);

    const value = useMemo(() => ({ patches, applyPatches }), [patches, applyPatches]);

    return <PlayerStatsPatchContext.Provider value={value}>{children}</PlayerStatsPatchContext.Provider>;
}

type PlayerStatSeeds = {
    promises: Record<string, Promise<unknown>>,
    idle: boolean,
};

const PlayerStatSeedsContext = createContext<PlayerStatSeeds | null>(null);

const IDLE_SEEDS: PlayerStatSeeds = { promises: {}, idle: true };

export function PlayerStatSeedsProvider({ promises, children }: {
    promises: Record<string, Promise<unknown>>,
    children: ReactNode,
}) {
    const value = useMemo(() => ({ promises, idle: false }), [promises]);
    return <PlayerStatSeedsContext.Provider value={value}>{children}</PlayerStatSeedsContext.Provider>;
}

export function PlayerStatSuspense({ children }: { children: ReactNode }) {
    const fallback = <PlayerStatSeedsContext.Provider value={IDLE_SEEDS}>{children}</PlayerStatSeedsContext.Provider>;
    return <Suspense fallback={fallback}>{children}</Suspense>;
}

export function usePlayerStatSeed<T>(path: string, enabled: boolean = true): { seed: T | null, idle: boolean } {
    const seeds = useContext(PlayerStatSeedsContext);
    const idle = !!seeds?.idle;
    const promise = enabled && !idle ? seeds?.promises[path] as Promise<T | null> | undefined : undefined;
    return { seed: promise ? use(promise) : null, idle };
}

export const usePlayerStatsPatch = (): PlayerStatsPatchValue | null => useContext(PlayerStatsPatchContext);

type PlayerStatResult<T> = {
    data: T | null,
    loading: boolean,
    error: Error | null,
};

const RETRY_FIRST_MS = 2000;
const RETRY_MAX_MS = 15000;
const MAX_RETRIES = 30;

export function usePlayerStat<T>(
    serverId: string | null | undefined,
    playerId: string | null | undefined,
    path: string,
    enabled: boolean = true,
): PlayerStatResult<T> {
    const ctx = useContext(PlayerStatsPatchContext);
    const { period } = usePeriod();
    const patch = period ? undefined : ctx?.patches[path] as T | undefined;
    const { seed, idle } = usePlayerStatSeed<T>(path, enabled && !period);

    const active = enabled && !!serverId && !!playerId && !idle;
    const [fetched, setFetched] = useState<T | null>(seed);
    const [loading, setLoading] = useState<boolean>(idle || (active && seed === null));
    const [error, setError] = useState<Error | null>(null);
    const isFirstRun = useRef(seed !== null);

    useEffect(() => {
        if (!active) return;
        if (isFirstRun.current) {
            isFirstRun.current = false;
            return;
        }

        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        setLoading(true);
        setError(null);
        setFetched(null);

        const params = period ? { params: { period } } : {};
        const attempt = (retries: number, delay: number) => {
            const options = retries > 0 ? { ...params, ...NO_CACHE } : params;
            fetchApiServerUrl(serverId as string, `/players/${playerId}/${path}`, options, false)
                .then((resp: T | StillCalculate) => {
                    if (cancelled) return;
                    if (resp instanceof StillCalculate) {
                        if (retries >= MAX_RETRIES) throw resp;
                        timer = setTimeout(() => attempt(retries + 1, Math.min(delay * 2, RETRY_MAX_MS)), delay);
                        return;
                    }
                    setFetched(resp);
                    setLoading(false);
                })
                .catch(err => {
                    if (cancelled) return;
                    setError(err);
                    setLoading(false);
                });
        };
        attempt(0, RETRY_FIRST_MS);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [serverId, playerId, path, active, period]);

    return patch !== undefined ? { data: patch, loading: false, error: null } : { data: fetched, loading, error };
}

export function usePatchedPlayer<T extends ServerPlayerDetailed>(
    serverPlayerPromise: Promise<T>,
): T {
    const resolved = use(serverPlayerPromise);
    const ctx = useContext(PlayerStatsPatchContext);
    const patch = ctx?.patches["detail"] as Partial<PlayerInfo> | undefined;

    return useMemo(() => {
        const { player } = resolved;
        if (!patch || !player || player instanceof StillCalculate) return resolved;
        return { ...resolved, player: { ...player, ...patch } };
    }, [resolved, patch]);
}
