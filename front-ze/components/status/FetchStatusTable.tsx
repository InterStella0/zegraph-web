"use client";

import { use, useState, type PointerEvent as ReactPointerEvent } from "react";
import dayjs, { Dayjs } from "lib/dayjs";
import { Badge } from "components/ui/badge";
import { Card } from "components/ui/card";
import { Separator } from "components/ui/separator";
import { Skeleton } from "components/ui/skeleton";
import {
    FetchStatusBucket,
    FetchStatusCommunityGroupTruncated,
    FetchStatusServerGroupTruncated,
} from "types/fetchStatus";
import { range } from "utils/generalUtils.ts";
import { useTranslations } from 'next-intl';
import {withErrorCatch} from "components/common/withErrorCatch";
import { SectionHeading, TILE, usePolling } from "./statusShared";

const POLL_INTERVAL = 10_000;
const BUCKET_COUNT = 90;
const BUCKET_MINUTES = 24 * 60 / BUCKET_COUNT;

type ServerStatus = "noData" | "outage" | "degraded" | "operational";
type OverallStatus = "operational" | "degraded" | "outage";

const STATUS_BADGE = { noData: "outline", outage: "destructive", degraded: "destructive", operational: "default" } as const;

const BANNER = {
    operational: { bg: "bg-green-500/10 border-green-500/30", dot: "bg-green-500", text: "text-green-600 dark:text-green-400", label: "allOperational" },
    degraded: { bg: "bg-yellow-500/10 border-yellow-500/30", dot: "bg-yellow-500", text: "text-yellow-600 dark:text-yellow-400", label: "degradedPerformance" },
    outage: { bg: "bg-red-500/10 border-red-500/30", dot: "bg-red-500", text: "text-red-600 dark:text-red-400", label: "partialOutage" },
};

const LEGEND = [
    ["bg-green-500", "operational"],
    ["bg-yellow-500", "minorErrors"],
    ["bg-red-500", "degraded"],
    ["bg-muted border", "noData"],
] as const;

// A track failing half its fetches degrades the server; failing nine in ten is an outage.
function serverStatus(server: FetchStatusServerGroupTruncated): ServerStatus {
    const errorRates = server.tracks
        .filter((track) => track.total_fetches > 0)
        .map((track) => (track.total_fetches - track.total_ok) / track.total_fetches);
    if (errorRates.length === 0) return "noData";
    if (errorRates.some((rate) => rate >= 0.9)) return "outage";
    return errorRates.some((rate) => rate >= 0.5) ? "degraded" : "operational";
}

function overallStatus(communities: FetchStatusCommunityGroupTruncated[]): OverallStatus {
    const statuses = communities.flatMap((c) => c.servers).map(serverStatus);
    if (statuses.includes("outage")) return "outage";
    return statuses.includes("degraded") ? "degraded" : "operational";
}

function bucketColor(b: FetchStatusBucket): string {
    const total = b.ok + b.error;
    if (total === 0) return "bg-muted";
    if (b.error / total >= 0.5) return "bg-red-500";
    if (b.error > 0) return "bg-yellow-500";
    return "bg-green-500";
}

function bucketLabel(b: FetchStatusBucket): string {
    if (b.ok + b.error === 0) return "No data";
    if (b.error > 0) return `${b.error} error${b.error > 1 ? "s" : ""}, ${b.ok} ok`;
    return `${b.ok} ok`;
}

function UptimeBar({ buckets }: { buckets: FetchStatusBucket[] }) {
    const [hover, setHover] = useState<{ idx: number; x: number } | null>(null);

    const handleMove = (e: ReactPointerEvent<HTMLDivElement>) => {
        const raw = (e.target as HTMLElement).dataset.idx;
        const rect = e.currentTarget.getBoundingClientRect();
        setHover(raw === undefined ? null : { idx: Number(raw), x: e.clientX - rect.left });
    };

    const hovered = hover ? buckets[hover.idx] : null;
    const end = hovered && dayjs().subtract((BUCKET_COUNT - 1 - hovered.bucket_index) * BUCKET_MINUTES, "minute");

    return (
        <div className="relative flex gap-px flex-1" onPointerMove={handleMove} onPointerLeave={() => setHover(null)}>
            {buckets.map((b) => (
                <div
                    key={b.bucket_index}
                    data-idx={b.bucket_index}
                    className={`h-8 flex-1 rounded-sm ${bucketColor(b)} cursor-default transition-opacity hover:opacity-70${b.bucket_index % 2 !== 0 ? " hidden sm:block" : ""}`}
                />
            ))}
            {hovered && (
                <div
                    className="pointer-events-none absolute bottom-full mb-1.5 z-50 w-fit max-w-60 -translate-x-1/2 rounded-md bg-foreground px-3 py-1.5 text-xs text-background"
                    style={{ left: hover.x }}
                >
                    <p className="font-medium whitespace-nowrap">
                        {end.subtract(BUCKET_MINUTES, "minute").format("MMM D, HH:mm")} – {end.format("HH:mm")}
                    </p>
                    <p>{bucketLabel(hovered)}</p>
                    {hovered.first_error && <p className="mt-1 truncate text-red-300">{hovered.first_error}</p>}
                </div>
            )}
        </div>
    );
}

function StatusBanner({ status, lastUpdated }: { status: OverallStatus; lastUpdated: Dayjs | null }) {
    const t = useTranslations('status.table');
    const config = BANNER[status];

    return (
        <div className={`rounded-xl border px-5 py-4 ${config.bg}`}>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <span className={`size-3 rounded-full ${config.dot} shrink-0`} />
                    <span className={`text-lg font-semibold ${config.text}`}>{t(config.label)}</span>
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
    const status = serverStatus(group);

    return (
        <Card className={TILE}>
            <div className="flex items-center justify-between px-5 py-3">
                <span className="font-semibold">{group.server_name}</span>
                <Badge variant={STATUS_BADGE[status]} className="text-xs">{t(status)}</Badge>
            </div>
            <Separator />
            <div className="px-5 py-4 flex flex-col gap-3">
                {group.tracks.map((track) => (
                    <div key={track.label} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                        <span className="text-xs text-muted-foreground truncate font-mono sm:w-48 sm:shrink-0">
                            {track.label}
                        </span>
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                            <UptimeBar buckets={track.buckets} />
                            <span className="text-xs text-muted-foreground w-10 text-right shrink-0">
                                {track.total_fetches === 0 ? "–" : `${Math.round((track.total_ok / track.total_fetches) * 100)}%`}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </Card>
    );
}

export function FetchStatusTableLoading() {
    return (
        <div className="flex flex-col gap-4">
            <Skeleton className="h-14 w-full rounded-xl" />
            {range(3).map((i) => (
                <Card key={i} className={TILE}>
                    <div className="flex items-center justify-between px-5 py-3">
                        <Skeleton className="h-5 w-40" />
                        <Skeleton className="h-5 w-20 rounded-full" />
                    </div>
                    <Separator />
                    <div className="px-5 py-4 flex flex-col gap-3">
                        {range(2).map((j) => (
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
    const { data, updatedAt } = usePolling(use(initialDataPromise), "/fetch-status-truncated", 60, POLL_INTERVAL);
    const communities = data || [];

    return (
        <div className="flex flex-col gap-4">
            <StatusBanner status={overallStatus(communities)} lastUpdated={updatedAt} />

            {communities.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-8">{t('noFetchData')}</p>
            ) : (
                <>
                    {communities.map((community) => (
                        <div key={community.community_id} className="flex flex-col gap-3">
                            <SectionHeading>{community.community_name}</SectionHeading>
                            {community.servers.map((g) => <ServerStatusCard key={g.server_id} group={g} />)}
                        </div>
                    ))}

                    <div className="flex justify-between text-xs text-muted-foreground px-1 mt-1">
                        <span>{t('hoursAgo24')}</span>
                        <span>{t('now')}</span>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-muted-foreground px-1">
                        {LEGEND.map(([swatch, label]) => (
                            <span key={label} className="flex items-center gap-1.5">
                                <span className={`size-3 rounded-sm ${swatch} inline-block`} />
                                {t(label)}
                            </span>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

export default withErrorCatch(FetchStatusTableDisplay, () => "Fetch status couldn't be loaded.")
