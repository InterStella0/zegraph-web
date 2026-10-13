"use client";

import { use, useEffect, useState, useCallback, useMemo, memo, type PointerEvent as ReactPointerEvent } from "react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { Badge } from "components/ui/badge";
import { Card } from "components/ui/card";
import { Separator } from "components/ui/separator";
import { Skeleton } from "components/ui/skeleton";
import {
    FetchStatusBucket,
    FetchStatusCommunityGroupTruncated,
    FetchStatusServerGroupTruncated,
} from "types/fetchStatus";
import {fetchUrl} from "utils/generalUtils.ts";
import { useTranslations } from 'next-intl';
import ErrorCatch from "components/ui/ErrorMessage.tsx";

dayjs.extend(relativeTime);

const POLL_INTERVAL = 10_000;
const BUCKET_COUNT = 90;
const BUCKET_MINUTES = 24 * 60 / BUCKET_COUNT; // ~16 min each

function getServerStatus(server: FetchStatusServerGroupTruncated) {
    let hasError = false, hasOutage = false, hasData = false;
    for (const track of server.tracks) {
        if (track.total_fetches === 0) continue;
        hasData = true;
        const errorRate = (track.total_fetches - track.total_ok) / track.total_fetches;
        if (errorRate >= 0.5) hasError = true;
        if (errorRate >= 0.9) hasOutage = true;
    }
    return { hasError, hasOutage, hasData };
}

function computeOverallStatus(communities: FetchStatusCommunityGroupTruncated[]): "operational" | "degraded" | "outage" {
    const servers = communities.flatMap((c) => c.servers);
    if (servers.length === 0) return "operational";
    const statuses = servers.map(getServerStatus);
    if (statuses.some((s) => s.hasData && s.hasOutage)) return "outage";
    if (statuses.some((s) => s.hasError)) return "degraded";
    return "operational";
}

function bucketColor(b: FetchStatusBucket): string {
    const total = b.ok + b.error;
    if (total === 0) return "bg-muted";
    if (b.error / total >= 0.5) return "bg-red-500";
    if (b.error > 0) return "bg-yellow-500";
    return "bg-green-500";
}

function bucketLabel(b: FetchStatusBucket): string {
    const total = b.ok + b.error;
    if (total === 0) return "No data";
    if (b.error > 0) return `${b.error} error${b.error > 1 ? "s" : ""}, ${b.ok} ok`;
    return `${b.ok} ok`;
}

const UptimeBar = memo(function UptimeBar({ buckets }: { buckets: FetchStatusBucket[] }) {
    // hovered bucket index + pointer x relative to the bar (for tooltip placement)
    const [hover, setHover] = useState<{ idx: number; x: number } | null>(null);

    // color is needed for every div on every render; precompute cheaply.
    const colors = useMemo(() => buckets.map(bucketColor), [buckets]);

    const handleMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
        const raw = (e.target as HTMLElement).dataset.idx;
        if (raw === undefined) {
            setHover(null);
            return;
        }
        const rect = e.currentTarget.getBoundingClientRect();
        setHover({ idx: Number(raw), x: e.clientX - rect.left });
    }, []);

    const clear = useCallback(() => setHover(null), []);

    const hovered = hover ? buckets[hover.idx] : null;
    // dayjs formatting is done only for the hovered bucket, not all 90 every render.
    let tooltip: { time: string; label: string; firstError: string | null } | null = null;
    if (hovered) {
        const minutesFromNow = (BUCKET_COUNT - 1 - hovered.bucket_index) * BUCKET_MINUTES;
        const end = dayjs().subtract(minutesFromNow, "minute");
        const start = end.subtract(BUCKET_MINUTES, "minute");
        tooltip = {
            time: `${start.format("MMM D, HH:mm")} – ${end.format("HH:mm")}`,
            label: bucketLabel(hovered),
            firstError: hovered.first_error,
        };
    }

    return (
        <div
            className="relative flex gap-px flex-1"
            onPointerMove={handleMove}
            onPointerLeave={clear}
        >
            {buckets.map((b, i) => (
                <div
                    key={b.bucket_index}
                    data-idx={b.bucket_index}
                    className={`h-8 flex-1 rounded-sm ${colors[i]} cursor-default transition-opacity hover:opacity-70${b.bucket_index % 2 !== 0 ? " hidden sm:block" : ""}`}
                />
            ))}
            {hover && tooltip && (
                <div
                    className="pointer-events-none absolute bottom-full mb-1.5 z-50 w-fit max-w-60 -translate-x-1/2 rounded-md bg-foreground px-3 py-1.5 text-xs text-background"
                    style={{ left: hover.x }}
                >
                    <p className="font-medium whitespace-nowrap">{tooltip.time}</p>
                    <p>{tooltip.label}</p>
                    {tooltip.firstError && (
                        <p className="mt-1 truncate text-red-300">{tooltip.firstError}</p>
                    )}
                </div>
            )}
        </div>
    );
});

function StatusBanner({
    status,
    lastUpdated,
}: {
    status: "operational" | "degraded" | "outage";
    lastUpdated: dayjs.Dayjs | null;
}) {
    const t = useTranslations('status.table');
    const config = {
        operational: {
            bg: "bg-green-500/10 border-green-500/30",
            dot: "bg-green-500",
            text: "text-green-600 dark:text-green-400",
            label: t('allOperational'),
        },
        degraded: {
            bg: "bg-yellow-500/10 border-yellow-500/30",
            dot: "bg-yellow-500",
            text: "text-yellow-600 dark:text-yellow-400",
            label: t('degradedPerformance'),
        },
        outage: {
            bg: "bg-red-500/10 border-red-500/30",
            dot: "bg-red-500",
            text: "text-red-600 dark:text-red-400",
            label: t('partialOutage'),
        },
    }[status];

    return (
        <div className={`rounded-xl border px-5 py-4 ${config.bg}`}>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <span className={`size-3 rounded-full ${config.dot} shrink-0`} />
                    <span className={`text-lg font-semibold ${config.text}`}>
                        {config.label}
                    </span>
                </div>
                <span className="text-xs text-muted-foreground">
                    {lastUpdated ? t('updated', {time: lastUpdated.fromNow()}) : t('loading')}
                </span>
            </div>
        </div>
    );
}

function ServerStatusCard({ group }: { group: FetchStatusServerGroupTruncated }) {
    const t = useTranslations('status.table');
    const { hasData, hasError, hasOutage } = getServerStatus(group);
    const statusLabel = !hasData
        ? t('noData')
        : hasOutage
        ? t('outage')
        : hasError
        ? t('degraded')
        : t('operational');
    const statusVariant: "default" | "destructive" | "outline" = !hasData
        ? "outline"
        : hasError
        ? "destructive"
        : "default";

    return (
        <Card className="gap-0 p-0 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3">
                <span className="font-semibold">{group.server_name}</span>
                <Badge variant={statusVariant} className="text-xs">
                    {statusLabel}
                </Badge>
            </div>
            <Separator />
            <div className="px-5 py-4 flex flex-col gap-3">
                {group.tracks.map((track) => {
                    const uptime =
                        track.total_fetches === 0
                            ? null
                            : Math.round((track.total_ok / track.total_fetches) * 100);

                    return (
                        <div key={track.label} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                            <span className="text-xs text-muted-foreground truncate font-mono sm:w-48 sm:shrink-0">
                                {track.label}
                            </span>
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                <UptimeBar buckets={track.buckets} />
                                <span className="text-xs text-muted-foreground w-10 text-right shrink-0">
                                    {uptime === null ? "–" : `${uptime}%`}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </Card>
    );
}

export function FetchStatusTableLoading() {
    return (
        <div className="flex flex-col gap-4">
            <Skeleton className="h-14 w-full rounded-xl" />
            {[1, 2, 3].map((i) => (
                <Card key={i} className="gap-0 p-0 overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-3">
                        <Skeleton className="h-5 w-40" />
                        <Skeleton className="h-5 w-20 rounded-full" />
                    </div>
                    <Separator />
                    <div className="px-5 py-4 flex flex-col gap-3">
                        {[1, 2].map((j) => (
                            <div key={j} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                                <Skeleton className="h-4 w-48 sm:shrink-0" />
                                <div className="flex items-center gap-3 flex-1">
                                    <Skeleton className="h-8 flex-1" />
                                    <Skeleton className="h-4 w-10 shrink-0" />
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            ))}
        </div>
    );
}

function FetchStatusTableDisplay({ initialDataPromise }: { initialDataPromise: Promise<FetchStatusCommunityGroupTruncated[]> }) {
    const t = useTranslations('status.table');
    const initialData = use(initialDataPromise);
    const [entries, setEntries] = useState<FetchStatusCommunityGroupTruncated[]>(initialData || []);
    const [lastUpdated, setLastUpdated] = useState<dayjs.Dayjs | null>(initialData ? dayjs() : null);

    const fetchData = useCallback(async () => {
        try {
            const data = await fetchUrl("/fetch-status-truncated", { next: { revalidate: 60 } });
            setEntries(data);
            setLastUpdated(dayjs());
        } catch {}
    }, []);

    useEffect(() => {
        const id = setInterval(fetchData, POLL_INTERVAL);
        return () => clearInterval(id);
    }, [fetchData]);

    const communities = entries;
    const overallStatus = computeOverallStatus(communities);

    return (
        <div className="flex flex-col gap-4">
            <StatusBanner status={overallStatus} lastUpdated={lastUpdated} />

            {communities.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-8">
                    {t('noFetchData')}
                </p>
            ) : (
                <>
                    {communities.map((community) => (
                        <div key={community.community_id} className="flex flex-col gap-3">
                            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider px-1">
                                {community.community_name}
                            </h2>
                            {community.servers.map((g) => (
                                <ServerStatusCard key={g.server_id} group={g} />
                            ))}
                        </div>
                    ))}

                    <div className="flex justify-between text-xs text-muted-foreground px-1 mt-1">
                        <span>{t('hoursAgo24')}</span>
                        <span>{t('now')}</span>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-muted-foreground px-1">
                        <span className="flex items-center gap-1.5">
                            <span className="size-3 rounded-sm bg-green-500 inline-block" />
                            {t('operational')}
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="size-3 rounded-sm bg-yellow-500 inline-block" />
                            {t('minorErrors')}
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="size-3 rounded-sm bg-red-500 inline-block" />
                            {t('degraded')}
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="size-3 rounded-sm bg-muted inline-block border" />
                            {t('noData')}
                        </span>
                    </div>
                </>
            )}
        </div>
    );
}

export default function FetchStatusTable({ initialDataPromise }: { initialDataPromise: Promise<FetchStatusCommunityGroupTruncated[]> }) {
    return (
        <ErrorCatch message="Fetch status couldn't be loaded.">
            <FetchStatusTableDisplay initialDataPromise={initialDataPromise} />
        </ErrorCatch>
    );
}
