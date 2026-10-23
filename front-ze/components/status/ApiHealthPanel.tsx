"use client";

import { ReactNode, use, useState, useMemo } from "react";
import dayjs from "lib/dayjs";
import { ChevronDown } from "lucide-react";
import { Card } from "components/ui/card";
import { Separator } from "components/ui/separator";
import { Skeleton } from "components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "components/ui/collapsible";
import { LazyLineChart as Line } from "components/graphs/LazyCharts";
import { ApiHealth, AvgGraphPoint, DependencyHealth } from "types/health";
import { range } from "utils/generalUtils.ts";
import { useTranslations, useLocale } from "next-intl";
import { useTheme } from "next-themes";
import {withErrorCatch} from "components/common/withErrorCatch";
import { SectionHeading, TILE, usePolling } from "./statusShared";

const POLL_INTERVAL = 30_000;

const SERIES = [
    { label: "seriesResponseTime", axis: "y", field: "value", light: "oklch(0.50 0.18 335)", dark: "oklch(0.66 0.19 340)" },
    { label: "seriesRequestVolume", axis: "y1", field: "count", light: "oklch(0.72 0.12 305)", dark: "oklch(0.52 0.16 300)" },
] as const;

function tone(up: boolean) {
    return up
        ? { dot: "bg-green-500", text: "text-green-600 dark:text-green-400" }
        : { dot: "bg-red-500", text: "text-red-600 dark:text-red-400" };
}

const formatCompact = (value: number, locale: string) =>
    new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(value);

function Tile({ label, children }: { label: string; children: ReactNode }) {
    return (
        <Card className={TILE}>
            <div className="px-4 py-3 flex flex-col gap-1.5">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">{label}</span>
                {children}
            </div>
        </Card>
    );
}

function DependencyTile({ name, health, children }: { name: string; health: DependencyHealth; children?: ReactNode }) {
    const t = useTranslations("status.api");
    const up = health.status === "up";
    const colors = tone(up);

    return (
        <Tile label={name}>
            <div className="flex items-baseline gap-2">
                <span className={`size-2.5 rounded-full shrink-0 self-center ${colors.dot}`} />
                <span className={`text-sm font-semibold ${colors.text}`}>{t(up ? "up" : "down")}</span>
                {health.latency_ms !== null && (
                    <span className="text-sm text-muted-foreground tabular-nums">{health.latency_ms}ms</span>
                )}
            </div>
            {health.error && (
                <span className="text-xs text-red-600 dark:text-red-400 break-words" title={health.error}>
                    {health.error}
                </span>
            )}
            {children}
        </Tile>
    );
}

function JobsTile({ queues: { heavy, light, completed_heavy, completed_light } }: { queues: ApiHealth["queues"] }) {
    const t = useTranslations("status.api");
    const locale = useLocale();
    const known = completed_heavy !== null && completed_light !== null;
    const queued = heavy !== null && light !== null ? heavy + light : null;

    return (
        <Tile label={t("jobsRun")}>
            <span
                className="text-sm font-semibold tabular-nums"
                title={known
                    ? t("jobsBreakdown", { heavy: completed_heavy.toLocaleString(locale), light: completed_light.toLocaleString(locale) })
                    : undefined}
            >
                {known ? formatCompact(completed_heavy + completed_light, locale) : "–"}
            </span>
            <span className="text-xs text-muted-foreground">
                {queued === null ? t("queuedUnknown") : t("queued", { count: queued })}
            </span>
        </Tile>
    );
}

function ServedHeadline({ traffic }: { traffic: NonNullable<ApiHealth["traffic"]> }) {
    const t = useTranslations("status.api");
    const locale = useLocale();
    const since = traffic.since !== null ? dayjs.unix(traffic.since) : null;
    const count = formatCompact(traffic.served, locale);
    const exact = [
        t("exactCount", { count: traffic.served.toLocaleString(locale) }),
        since && t("exactSince", { date: since.format("LL") }),
    ].filter(Boolean).join(" · ");

    return (
        <Card className={TILE}>
            <div className="px-5 py-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="text-lg sm:text-xl font-semibold" title={exact}>
                    {since ? t("servedRelative", { count, period: since.fromNow(true) }) : t("servedNoPeriod", { count })}
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
            <Card className={TILE}>
                <CollapsibleTrigger className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium hover:bg-accent/50 transition-colors cursor-pointer">
                    <span>{t("topEndpoints", { count: traffic.busiest.length })}</span>
                    <ChevronDown className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
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
                                <span className="w-20 text-right shrink-0 tabular-nums">{stat.served.toLocaleString(locale)}</span>
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

function GraphTile({ points }: { points: AvgGraphPoint[] }) {
    const t = useTranslations("status.api");
    const locale = useLocale();
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === "dark";

    const data = useMemo(() => ({
        datasets: SERIES.map((series) => ({
            label: t(series.label),
            yAxisID: series.axis,
            data: points.map((p) => ({ x: p.timestamp * 1000, y: p[series.field] })),
            borderColor: isDark ? series.dark : series.light,
            backgroundColor: "transparent",
            borderWidth: 1.5,
            pointRadius: 0,
            tension: 0.2,
            fill: false,
        })),
    }), [points, isDark, t]);

    const options = useMemo(() => {
        const ink = isDark ? "oklch(0.708 0 0)" : "oklch(0.556 0.08 340)";
        const valueScale = (text: string) => ({
            title: { display: true, text, color: ink },
            beginAtZero: true,
            ticks: { maxTicksLimit: 6, color: ink },
            border: { display: false },
        });
        return {
            animation: false,
            maintainAspectRatio: false,
            interaction: { mode: "index" as const, intersect: false, axis: "x" as const },
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
                    filter: (ctx: { parsed: { y: number | null } }) => ctx.parsed.y !== null,
                    callbacks: {
                        title: (items: { parsed: { x: number } }[]) =>
                            items[0] ? dayjs(items[0].parsed.x).format("MMM D, HH:mm") : "",
                        label: (ctx: { parsed: { y: number | null }; dataset: { label?: string; yAxisID?: string } }) => {
                            const y = ctx.parsed.y;
                            if (y === null) return "";
                            const value = ctx.dataset.yAxisID === "y1" ? y.toLocaleString(locale) : `${y.toFixed(1)} ms`;
                            return `${ctx.dataset.label}: ${value}`;
                        },
                    },
                },
            },
            scales: {
                x: {
                    type: "time" as const,
                    time: { displayFormats: { hour: "MMM D", day: "MMM D" } },
                    ticks: { maxTicksLimit: 6, maxRotation: 0, font: { size: 10 }, color: ink },
                    grid: { display: false },
                    border: { display: false },
                },
                y: {
                    ...valueScale(`${t("seriesResponseTime")} (ms)`),
                    grid: { color: isDark ? "oklch(1 0 0 / 0.08)" : "oklch(0 0 0 / 0.06)" },
                },
                y1: { ...valueScale(t("seriesRequestVolume")), position: "right" as const, grid: { drawOnChartArea: false } },
            },
        };
    }, [isDark, locale, t]);

    if (points.length === 0) return null;

    return (
        <Card className={TILE}>
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
                {range(4).map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
            </div>
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-11 w-full rounded-xl" />
        </div>
    );
}

function ApiHealthPanelDisplay({ initialDataPromise }: { initialDataPromise: Promise<ApiHealth> }) {
    const t = useTranslations("status.api");
    const { data: health } = usePolling<ApiHealth | null>(use(initialDataPromise) ?? null, "/health", 30, POLL_INTERVAL);

    if (!health) return <ApiHealthPanelLoading />;
    const wms = health.qgis.wms;

    return (
        <div className="flex flex-col gap-3">
            <SectionHeading>{t("sectionTitle")}</SectionHeading>

            {health.traffic ? (
                <ServedHeadline traffic={health.traffic} />
            ) : (
                <p className="text-sm text-muted-foreground px-1">{t("metricsUnavailable")}</p>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <DependencyTile name={t("database")} health={health.postgres} />
                <DependencyTile name={t("redis")} health={health.redis} />
                <DependencyTile name={t("qgis")} health={health.qgis}>
                    {wms && (
                        <span className="text-xs text-muted-foreground">
                            {t("wms")}:{" "}
                            <span className={tone(wms.status === "up").text}>{t(wms.status === "up" ? "up" : "down")}</span>
                            {wms.latency_ms !== null && <span className="tabular-nums"> {wms.latency_ms}ms</span>}
                        </span>
                    )}
                </DependencyTile>
                <JobsTile queues={health.queues} />
            </div>

            {health.avg_graph && <GraphTile points={health.avg_graph} />}

            {health.traffic && <TopEndpoints traffic={health.traffic} />}
        </div>
    );
}

export default withErrorCatch(ApiHealthPanelDisplay, t => t('status.api.loadFailed'))
