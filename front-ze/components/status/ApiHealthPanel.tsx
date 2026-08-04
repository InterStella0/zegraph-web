"use client";

import { use, useState, useEffect, useCallback, useMemo } from "react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import localizedFormat from "dayjs/plugin/localizedFormat";
import { ChevronDown } from "lucide-react";
import { Card } from "components/ui/card";
import { Separator } from "components/ui/separator";
import { Skeleton } from "components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "components/ui/collapsible";
import { ApiHealth, DependencyHealth } from "types/health";
import { fetchUrl } from "utils/generalUtils.ts";
import { useTranslations, useLocale } from "next-intl";
import ErrorCatch from "components/ui/ErrorMessage.tsx";

dayjs.extend(relativeTime);
dayjs.extend(localizedFormat);

// Deliberately slower than the fetch-status table's 10s. Every call runs live probes — a postgres
// SELECT 1, a redis connection doing PING + 2 LLEN + 3 reads, a TCP connect to QGIS and a WMS
// GetCapabilities with a 3s timeout — so each open tab is real work on top of the container
// healthcheck already hitting the same endpoint.
const POLL_INTERVAL = 30_000;

/** Shared by the tiles and the up/down dot: `null` latency is unknown, not instant. */
function tone(up: boolean) {
    return up
        ? { dot: "bg-green-500", text: "text-green-600 dark:text-green-400" }
        : { dot: "bg-red-500", text: "text-red-600 dark:text-red-400" };
}

function DependencyTile({ name, health }: { name: string; health: DependencyHealth }) {
    const t = useTranslations("status.api");
    const up = health.status === "up";
    const colors = tone(up);

    return (
        <Card className="gap-0 p-0 overflow-hidden">
            <div className="px-4 py-3 flex flex-col gap-1.5">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">{name}</span>
                <div className="flex items-baseline gap-2">
                    <span className={`size-2.5 rounded-full shrink-0 self-center ${colors.dot}`} />
                    <span className={`text-sm font-semibold ${colors.text}`}>
                        {up ? t("up") : t("down")}
                    </span>
                    {health.latency_ms !== null && (
                        <span className="text-sm text-muted-foreground tabular-nums">
                            {health.latency_ms}ms
                        </span>
                    )}
                </div>
                {health.error && (
                    <span className="text-xs text-red-600 dark:text-red-400 break-words" title={health.error}>
                        {health.error}
                    </span>
                )}
            </div>
        </Card>
    );
}

function QgisTile({ health }: { health: ApiHealth["qgis"] }) {
    const t = useTranslations("status.api");
    const wms = health.wms;

    return (
        <Card className="gap-0 p-0 overflow-hidden">
            <div className="px-4 py-3 flex flex-col gap-1.5">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">{t("qgis")}</span>
                <div className="flex items-baseline gap-2">
                    <span className={`size-2.5 rounded-full shrink-0 self-center ${tone(health.status === "up").dot}`} />
                    <span className={`text-sm font-semibold ${tone(health.status === "up").text}`}>
                        {health.status === "up" ? t("up") : t("down")}
                    </span>
                    {health.latency_ms !== null && (
                        <span className="text-sm text-muted-foreground tabular-nums">{health.latency_ms}ms</span>
                    )}
                </div>
                {health.error && (
                    <span className="text-xs text-red-600 dark:text-red-400 break-words" title={health.error}>
                        {health.error}
                    </span>
                )}
                {/* The backend keeps QGIS out of the overall verdict — the browser reaches it through
                    nginx and every API endpoint serves fine without it — so this stays informational. */}
                {wms && (
                    <span className="text-xs text-muted-foreground">
                        {t("wms")}:{" "}
                        <span className={tone(wms.status === "up").text}>
                            {wms.status === "up" ? t("up") : t("down")}
                        </span>
                        {wms.latency_ms !== null && <span className="tabular-nums"> {wms.latency_ms}ms</span>}
                    </span>
                )}
            </div>
        </Card>
    );
}

/// Leads with the cumulative tally, which climbs week to week; the instantaneous depth is the
/// secondary line, where a 0 is the healthy reading rather than a missing one.
function JobsTile({ queues }: { queues: ApiHealth["queues"] }) {
    const t = useTranslations("status.api");
    const locale = useLocale();

    const compact = useMemo(
        () => new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }),
        [locale],
    );

    // null is "redis was unreachable", which is not the same claim as "nothing has run".
    const known = queues.completed_heavy !== null && queues.completed_light !== null;
    const total = known ? queues.completed_heavy! + queues.completed_light! : null;
    const queued =
        queues.heavy !== null && queues.light !== null ? queues.heavy + queues.light : null;

    return (
        <Card className="gap-0 p-0 overflow-hidden">
            <div className="px-4 py-3 flex flex-col gap-1.5">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">{t("jobsRun")}</span>
                <span
                    className="text-sm font-semibold tabular-nums"
                    title={
                        known
                            ? t("jobsBreakdown", {
                                  heavy: queues.completed_heavy!.toLocaleString(locale),
                                  light: queues.completed_light!.toLocaleString(locale),
                              })
                            : undefined
                    }
                >
                    {total === null ? "–" : compact.format(total)}
                </span>
                <span className="text-xs text-muted-foreground">
                    {queued === null ? t("queuedUnknown") : t("queued", { count: queued })}
                </span>
            </div>
        </Card>
    );
}

function ServedHeadline({ traffic }: { traffic: NonNullable<ApiHealth["traffic"]> }) {
    const t = useTranslations("status.api");
    const locale = useLocale();

    const compact = useMemo(
        () => new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }),
        [locale],
    );

    // `fromNow(true)` drops the "ago" suffix so the count reads as a span: "over the past 5 months".
    const period = traffic.since !== null ? dayjs.unix(traffic.since).fromNow(true) : null;
    const exact = [
        t("exactCount", { count: traffic.served.toLocaleString(locale) }),
        traffic.since !== null ? t("exactSince", { date: dayjs.unix(traffic.since).format("LL") }) : null,
    ]
        .filter(Boolean)
        .join(" · ");

    return (
        <Card className="gap-0 p-0 overflow-hidden">
            <div className="px-5 py-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="text-lg sm:text-xl font-semibold" title={exact}>
                    {period
                        ? t("servedRelative", { count: compact.format(traffic.served), period })
                        : t("servedNoPeriod", { count: compact.format(traffic.served) })}
                </p>
                <p className="text-sm text-muted-foreground tabular-nums">
                    {t("avgResponse", { ms: traffic.average_ms.toFixed(1) })}
                </p>
            </div>
        </Card>
    );
}

function TopEndpoints({ traffic }: { traffic: NonNullable<ApiHealth["traffic"]> }) {
    const t = useTranslations("status.api");
    const locale = useLocale();
    const [open, setOpen] = useState(false);

    if (traffic.busiest.length === 0) return null;

    return (
        <Collapsible open={open} onOpenChange={setOpen}>
            <Card className="gap-0 p-0 overflow-hidden">
                <CollapsibleTrigger className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium hover:bg-accent/50 transition-colors cursor-pointer">
                    <span>{t("topEndpoints", { count: traffic.busiest.length })}</span>
                    <ChevronDown
                        className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
                    />
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <Separator />
                    <div className="px-5 py-3 flex flex-col gap-2">
                        <div className="flex items-center gap-3 text-xs text-muted-foreground uppercase tracking-wider">
                            <span className="flex-1 min-w-0">{t("colEndpoint")}</span>
                            <span className="w-20 text-right shrink-0">{t("colServed")}</span>
                            <span className="w-20 text-right shrink-0">{t("colAvg")}</span>
                        </div>
                        {traffic.busiest.map((stat) => (
                            <div key={stat.endpoint} className="flex items-center gap-3 text-sm">
                                <span className="flex-1 min-w-0 truncate font-mono text-xs" title={stat.endpoint}>
                                    {stat.endpoint}
                                </span>
                                <span className="w-20 text-right shrink-0 tabular-nums">
                                    {stat.served.toLocaleString(locale)}
                                </span>
                                <span className="w-20 text-right shrink-0 tabular-nums text-muted-foreground">
                                    {stat.average_ms.toFixed(1)}ms
                                </span>
                            </div>
                        ))}
                    </div>
                </CollapsibleContent>
            </Card>
        </Collapsible>
    );
}

export function ApiHealthPanelLoading() {
    return (
        <div className="flex flex-col gap-3">
            <Skeleton className="h-16 w-full rounded-xl" />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-20 w-full rounded-xl" />
                ))}
            </div>
            <Skeleton className="h-11 w-full rounded-xl" />
        </div>
    );
}

function ApiHealthPanelDisplay({ initialDataPromise }: { initialDataPromise: Promise<ApiHealth> }) {
    const t = useTranslations("status.api");
    const initialData = use(initialDataPromise);
    const [health, setHealth] = useState<ApiHealth | null>(initialData ?? null);

    const fetchData = useCallback(async () => {
        try {
            const data = await fetchUrl("/health", { next: { revalidate: 30 } });
            setHealth(data);
        } catch {}
    }, []);

    useEffect(() => {
        const id = setInterval(fetchData, POLL_INTERVAL);
        return () => clearInterval(id);
    }, [fetchData]);

    if (!health) return <ApiHealthPanelLoading />;

    return (
        <div className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider px-1">
                {t("sectionTitle")}
            </h2>

            {health.traffic ? (
                <ServedHeadline traffic={health.traffic} />
            ) : (
                <p className="text-sm text-muted-foreground px-1">{t("metricsUnavailable")}</p>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <DependencyTile name={t("postgres")} health={health.postgres} />
                <DependencyTile name={t("redis")} health={health.redis} />
                <QgisTile health={health.qgis} />
                <JobsTile queues={health.queues} />
            </div>

            {health.traffic && <TopEndpoints traffic={health.traffic} />}
        </div>
    );
}

export default function ApiHealthPanel({ initialDataPromise }: { initialDataPromise: Promise<ApiHealth> }) {
    const t = useTranslations("status.api");
    return (
        <ErrorCatch message={t("loadFailed")}>
            <ApiHealthPanelDisplay initialDataPromise={initialDataPromise} />
        </ErrorCatch>
    );
}
