"use client"
import {useTranslations} from "next-intl";
import {useCallback, useEffect, useRef, useState} from "react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { Button } from "components/ui/button";
import { History, RefreshCw } from "lucide-react";
import { fetchApiServerUrl, StillCalculate } from "utils/generalUtils";
import { DetailedPlayer } from "types/players.ts";
import { STALE_PATHS, usePlayerStatsPatch } from "./PlayerStatsPatch.tsx";

dayjs.extend(relativeTime)

const POLL_INTERVAL_MS = 30000;

const DEPENDENT_PATHS = STALE_PATHS.filter(path => path !== "detail");
const NO_CACHE = { cache: "no-store", headers: { "Cache-Control": "no-cache" } } as const;

export default function StalePlayerStats(
    { serverId, playerId, calculatedAt }:
    { serverId: string, playerId: string, calculatedAt: string | null },
) {
    const t = useTranslations('players.staleStats');
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [stillStale, setStillStale] = useState(false);
    const [done, setDone] = useState(false);
    const [cycle, setCycle] = useState(0);
    const patch = usePlayerStatsPatch();

    const applyPatches = patch?.applyPatches;

    const onRefresh = useCallback(async () => {
        setIsRefreshing(true);
        setStillStale(false);

        try {
            const detail: DetailedPlayer | StillCalculate = await fetchApiServerUrl(
                serverId, `/players/${playerId}/detail`, NO_CACHE, false,
            );

            if (detail instanceof StillCalculate || !detail || detail.is_stale) {
                setStillStale(true);
                return;
            }

            const results = await Promise.allSettled(DEPENDENT_PATHS.map(path =>
                fetchApiServerUrl(serverId, `/players/${playerId}/${path}`, NO_CACHE, false)
            ));

            const entries: [string, unknown][] = [["detail", detail]];
            results.forEach((result, index) => {
                if (result.status !== "fulfilled") return;
                if (result.value instanceof StillCalculate || result.value == null) return;
                entries.push([DEPENDENT_PATHS[index], result.value]);
            });

            applyPatches?.(entries);
            setDone(true);
        } catch {
            setStillStale(true);
        } finally {
            setIsRefreshing(false);
            setCycle(c => c + 1);
        }
    }, [serverId, playerId, applyPatches]);

    const onRefreshRef = useRef(onRefresh);
    useEffect(() => {
        onRefreshRef.current = onRefresh;
    }, [onRefresh]);

    useEffect(() => {
        if (done) return;

        const interval = setInterval(() => onRefreshRef.current(), POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [done, cycle]);

    if (done) return null;

    return (
        <div className="col-span-12 flex flex-wrap items-center gap-3 rounded-lg border border-dashed px-4 py-3 text-sm">
            <History className="w-4 h-4 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground">
                {stillStale
                    ? t('stillCalculating')
                    : calculatedAt
                        ? t('showingAsOf', { when: dayjs(calculatedAt).fromNow() })
                        : t('showingPrevious')}
            </span>

            <div
                aria-hidden="true"
                className="flex-1 min-w-12 h-0.5 rounded-full bg-border overflow-hidden"
            >
                {isRefreshing ? (
                    <div className="h-full w-full bg-primary animate-progress-indeterminate" />
                ) : (
                    <div
                        key={cycle}
                        className="stale-progress-fill h-full w-full origin-left bg-primary"
                        style={{ animationDuration: `${POLL_INTERVAL_MS}ms` }}
                    />
                )}
            </div>

            <Button
                variant="outline"
                size="sm"
                onClick={() => onRefresh()}
                disabled={isRefreshing}
            >
                <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? t('refreshing') : t('fetchLatest')}
            </Button>
        </div>
    );
}
