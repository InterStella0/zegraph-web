"use client";

import { use, useState, useEffect, useCallback, useMemo } from "react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import localizedFormat from "dayjs/plugin/localizedFormat";
import { Chart as ChartJS, Filler, Legend, LinearScale, LineController, LineElement, PointElement, TimeScale, Tooltip } from "chart.js";
import 'chartjs-adapter-dayjs-4/dist/chartjs-adapter-dayjs-4.esm';
import { ChevronDown } from "lucide-react";
import { Card } from "components/ui/card";
import { Separator } from "components/ui/separator";
import { Skeleton } from "components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "components/ui/collapsible";
import { LazyLineChart as Line } from "components/graphs/LazyCharts";
import { ApiHealth, AvgGraphPoint, DependencyHealth } from "types/health";
import { fetchUrl } from "utils/generalUtils.ts";
import { useTranslations, useLocale } from "next-intl";
import { useTheme } from "next-themes";
import ErrorCatch from "components/ui/ErrorMessage.tsx";

dayjs.extend(relativeTime);
dayjs.extend(localizedFormat);

ChartJS.register(LinearScale, PointElement, LineElement, LineController, TimeScale, Tooltip, Filler, Legend);

// Deliberately slower than the fetch-status table's 10s.
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

function JobsTile({ queues }: { queues: ApiHealth["queues"] }) {
    const t = useTranslations("status.api");
    const locale = useLocale();

    const compact = useMemo(
        () => new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }),
        [locale],
    );

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
                            <span className="w-28 text-right shrink-0 whitespace-nowrap">{t("colAvg")}</span>
                        </div>
                        {traffic.busiest.map((stat) => (
                            <div key={stat.endpoint} className="flex items-center gap-3 text-sm">
                                <span className="flex-1 min-w-0 truncate font-mono text-xs" title={stat.endpoint}>
                                    {stat.endpoint}
                                </span>
                                <span className="w-20 text-right shrink-0 tabular-nums">
                                    {stat.served.toLocaleString(locale)}
                                </span>
                                <span className="w-28 text-right shrink-0 tabular-nums text-muted-foreground">
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

/**
 * The two series sit on separate scales, so the pair has to survive being told apart by color
 * alone. The theme's own chart ramp is all one hue family and fails that; these steps are the
 * nearest pair that passes CVD separation against the card surface in both modes.
 */
const SERIES_COLORS = {
    light: { responseTime: "oklch(0.50 0.18 335)", requestVolume: "oklch(0.72 0.12 305)" },
    dark: { responseTime: "oklch(0.66 0.19 340)", requestVolume: "oklch(0.52 0.16 300)" },
};

function GraphTile({ points }: { points: AvgGraphPoint[] }) {
    const t = useTranslations("status.api");
    const locale = useLocale();
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === "dark";

    const data = useMemo(() => {
        const colors = isDark ? SERIES_COLORS.dark : SERIES_COLORS.light;
        const mark = {
            backgroundColor: "transparent",
            borderWidth: 1.5,
            pointRadius: 0,
            tension: 0.2,
            fill: false,
        };
        return {
            datasets: [
                {
                    ...mark,
                    label: t("seriesResponseTime"),
                    yAxisID: "y",
                    data: points.map((p) => ({ x: p.timestamp * 1000, y: p.value })),
                    borderColor: colors.responseTime,
                },
                {
                    ...mark,
                    label: t("seriesRequestVolume"),
                    yAxisID: "y1",
                    data: points.map((p) => ({ x: p.timestamp * 1000, y: p.count })),
                    borderColor: colors.requestVolume,
                },
            ],
        };
    }, [points, isDark, t]);

    const options = useMemo(() => {
        const ink = isDark ? "oklch(0.708 0 0)" : "oklch(0.556 0.08 340)";
        return {
            animation: false,
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: "nearest", intersect: false },
            plugins: {
                legend: {
                    display: true,
                    position: "bottom" as const,
                    labels: {
                        color: ink,
                        usePointStyle: true,
                        pointStyle: "line" as const,
                        boxWidth: 16,
                        boxHeight: 2,
                        font: { size: 10 },
                    },
                },
                tooltip: {
                    callbacks: {
                        title: (items: { parsed: { x: number } }[]) => {
                            const first = items[0];
                            return first ? dayjs(first.parsed.x).format("MMM D, HH:mm") : "";
                        },
                        // Each series carries its own unit; the axis it belongs to says which.
                        label: (ctx: { parsed: { y: number | null }; dataset: { label?: string; yAxisID?: string } }) => {
                            const y = ctx.parsed.y;
                            if (y === null) return "";
                            const value = ctx.dataset.yAxisID === "y1"
                                ? y.toLocaleString(locale)
                                : `${y.toFixed(1)} ms`;
                            return `${ctx.dataset.label}: ${value}`;
                        },
                    },
                },
            },
            scales: {
                x: {
                    type: "time" as const,
                    time: {
                        displayFormats: { hour: "MMM D", day: "MMM D" },
                    },
                    ticks: { maxTicksLimit: 6, maxRotation: 0, font: { size: 10 }, color: ink },
                    grid: { display: false },
                    border: { display: false },
                },
                y: {
                    title: { display: true, text: `${t("seriesResponseTime")} (ms)`, color: ink },
                    beginAtZero: true,
                    ticks: { maxTicksLimit: 6, color: ink },
                    grid: { color: isDark ? "oklch(1 0 0 / 0.08)" : "oklch(0 0 0 / 0.06)" },
                    border: { display: false },
                },
                y1: {
                    position: "right" as const,
                    title: { display: true, text: t("seriesRequestVolume"), color: ink },
                    beginAtZero: true,
                    ticks: { maxTicksLimit: 6, color: ink },
                    // Only the left scale draws gridlines; two interleaved grids read as noise.
                    grid: { drawOnChartArea: false },
                    border: { display: false },
                },
            },
        };
    }, [isDark, locale, t]);

    if (points.length === 0) return null;

    return (
        <Card className="gap-0 p-0 overflow-hidden">
            <div className="px-5 py-4 flex flex-col gap-3">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">{t("avgGraphTitle")}</span>
                <div className="h-44 w-full">
                    <Line
                        data={data}
                        // @ts-ignore dynamic() collapses the chart generics; option literals widen to string
                        options={options}
                    />
                </div>
            </div>
        </Card>
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
            <Skeleton className="h-32 w-full rounded-xl" />
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
                <DependencyTile name={t("database")} health={health.postgres} />
                <DependencyTile name={t("redis")} health={health.redis} />
                <QgisTile health={health.qgis} />
                <JobsTile queues={health.queues} />
            </div>

            {health.avg_graph && <GraphTile points={health.avg_graph} />}

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
