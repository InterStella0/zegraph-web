"use client"
import {useTranslations} from "next-intl";
import {useCallback, useEffect, useState} from "react";
import dayjs from "lib/dayjs";
import { Button } from "components/ui/button";
import { History, RefreshCw } from "lucide-react";
import { fetchApiServerUrl, NO_CACHE, StillCalculate } from "utils/generalUtils";
import { DetailedPlayer } from "types/players.ts";
import { STALE_PATHS, usePlayerStatsPatch } from "./PlayerStatsPatch.tsx";
import {usePeriod} from "components/period/Period";

const POLL_INTERVAL_MS = 30000;

const DEPENDENT_PATHS = STALE_PATHS.filter(path => path !== "detail");

type StalePlayerStatsProps = { serverId: string, playerId: string, calculatedAt: string | null };

export default function StalePlayerStats(props: StalePlayerStatsProps) {
    const { period } = usePeriod();
    if (period) return null;
    return <StalePlayerStatsBanner {...props} />;
}

function StalePlayerStatsBanner({ serverId, playerId, calculatedAt }: StalePlayerStatsProps) {
    const t = useTranslations('players.staleStats');
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [stillStale, setStillStale] = useState(false);
    const [done, setDone] = useState(false);
    const [cycle, setCycle] = useState(0);
    const applyPatches = usePlayerStatsPatch()?.applyPatches;

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
                if (result.status === "fulfilled" && result.value != null && !(result.value instanceof StillCalculate))
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

    useEffect(() => {
        if (done) return;
        const interval = setInterval(onRefresh, POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [done, cycle, onRefresh]);

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
                    <div className="h-full w-1/3 bg-primary animate-progress-indeterminate" />
                ) : (
                    <div
                        key={cycle}
                        className="stale-progress-fill h-full w-full origin-left bg-primary"
                        style={{ animationDuration: `${POLL_INTERVAL_MS}ms` }}
                    />
                )}
            </div>

            <Button variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing}>
                <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? t('refreshing') : t('fetchLatest')}
            </Button>
        </div>
    );
}
