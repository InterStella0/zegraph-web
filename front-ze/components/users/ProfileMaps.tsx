'use client';

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Skeleton } from "components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "components/ui/table";
import { SearchField } from "components/ui/SearchField";
import { LazyBarChart } from "components/graphs/LazyCharts";
import SplitBar from "components/players/SplitBar";
import { heatmapTooltip, useChartTheme } from "lib/chartTheme";
import { formatNumber, secondsToHours } from "utils/generalUtils";
import { GlobalPlayerMap } from "types/players";
import { FocusChip, useProfileCommunities } from "./ProfileContext";
import { ENTER, SWAP } from "./profileMotion";
import { ChartFigure, Empty, PageFooter, ProfileCard, ProfileCardHeader, ProfileCardLoading, usePaged } from "./ProfileCard";
import { categoryAxis, communitySeries, valueAxis } from "./profileChart";

const CHART_MAPS = 10;
const MAX_LABEL = 26;

export function ProfileMapsLoading() {
    return (
        <ProfileCardLoading className="h-full" titleWidth="w-56" controlSize="h-9 w-32">
            <Skeleton className="h-[400px] w-full" />
        </ProfileCardLoading>
    );
}

export default function ProfileMaps({ mapsPromise }: { mapsPromise: Promise<GlobalPlayerMap[] | null> }) {
    const t = useTranslations('players.profile.maps');
    const locale = useLocale();
    const theme = useChartTheme();
    const allMaps = use(mapsPromise);
    const { communities, nameOf, colorOf, focused } = useProfileCommunities();
    const [view, setView] = useState<"chart" | "table">("chart");
    const [search, setSearch] = useState("");

    const maps = useMemo(() => (allMaps ?? [])
        .map(map => {
            if (!focused) return map;
            const communities = map.communities.filter(c => c.community_id === focused);
            return { ...map, communities, total_duration: communities.reduce((sum, c) => sum + c.duration, 0) };
        })
        .filter(map => map.total_duration > 0)
        .sort((a, b) => b.total_duration - a.total_duration), [allMaps, focused]);

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();
        return term ? maps.filter(map => map.map.toLowerCase().includes(term)) : maps;
    }, [maps, search]);
    const paged = usePaged(filtered, [search, focused]);

    const formatValue = (seconds: number) => secondsToHours(seconds, locale);
    const withUnit = (seconds: number) => `${formatValue(seconds)} ${t('hrs')}`;

    const chartMaps = useMemo(() => maps.slice(0, CHART_MAPS), [maps]);
    const chartData = useMemo(() => {
        const keys = communities
            .map(community => community.id)
            .filter(id => chartMaps.some(map => map.communities.some(c => c.community_id === id)));
        return {
            labels: chartMaps.map(map => map.map),
            datasets: keys.map(key => ({
                ...communitySeries(
                    nameOf(key),
                    chartMaps.map(map => (map.communities.find(c => c.community_id === key)?.duration ?? 0) / 3600),
                    colorOf(key),
                ),
                borderRadius: 3,
                barPercentage: 0.7,
            })),
        };
    }, [chartMaps, communities, nameOf, colorOf]);

    const chartOptions = useMemo(() => ({
        maintainAspectRatio: false,
        indexAxis: 'y' as const,
        scales: {
            x: valueAxis(t('hoursAxis'), theme.foreground, theme),
            y: {
                ...categoryAxis(theme),
                ticks: {
                    color: theme.foreground,
                    autoSkip: false,
                    callback(this: any, value: any, index: number) {
                        const name: string = this.getLabelForValue(value);
                        const short = name.length > MAX_LABEL ? `${name.slice(0, MAX_LABEL - 1)}…` : name;
                        const rank = chartMaps[index]?.rank;
                        return rank != null ? `${short}  #${formatNumber(rank, 0, locale)}` : short;
                    },
                },
            },
        },
        plugins: {
            legend: { display: false },
            tooltip: {
                ...heatmapTooltip(theme),
                callbacks: {
                    label: (context: any) => `${context.dataset.label}: ${withUnit(context.parsed.x * 3600)}`,
                    footer: (items: any[]) => {
                        const map = chartMaps[items[0]?.dataIndex];
                        if (!map) return '';
                        const total = withUnit(map.total_duration);
                        return map.rank != null && map.total_players != null
                            ? [total, t('rankTooltip', {
                                rank: formatNumber(map.rank, 0, locale),
                                total: formatNumber(map.total_players, 0, locale),
                            })]
                            : total;
                    },
                },
            },
        },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [theme, chartMaps, locale, t]);

    const summary = chartMaps.length === 0
        ? t('noMaps')
        : t('summary', { maps: chartMaps.map(map => `${map.map} (${withUnit(map.total_duration)})`).join(', ') });

    return (
        <ProfileCard className={`h-full ${ENTER} delay-150`}>
            <ProfileCardHeader
                title={t('title')}
                groupClassName="flex flex-wrap items-baseline gap-x-3 gap-y-1"
                actions={<Tabs value={view} onValueChange={value => setView(value as "chart" | "table")}>
                    <TabsList className="h-8">
                        <TabsTrigger value="chart" className="text-xs px-3">{t('chart')}</TabsTrigger>
                        <TabsTrigger value="table" className="text-xs px-3">{t('table')}</TabsTrigger>
                    </TabsList>
                </Tabs>}
            >
                <span className="text-sm text-muted-foreground">{t('subtitle', { count: maps.length })}</span>
                <FocusChip />
            </ProfileCardHeader>

            {maps.length === 0 ? (
                <Empty className="h-[400px]">{t('noMaps')}</Empty>
            ) : view === "chart" ? (
                <ChartFigure id="profile-maps-summary" summary={summary} label={t('ariaLabel')} className={`h-[400px] ${SWAP}`}>
                    {/* @ts-ignore */}
                    <LazyBarChart data={chartData} options={chartOptions} />
                </ChartFigure>
            ) : (
                <div className={`space-y-3 ${SWAP}`}>
                    <SearchField value={search} onChange={event => setSearch(event.target.value)} placeholder={t('search')} />
                    <div className="rounded-md border border-border/60">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{t('map')}</TableHead>
                                    <TableHead className="hidden w-[30%] sm:table-cell">{t('split')}</TableHead>
                                    <TableHead className="text-right">{t("hours")}</TableHead>
                                    <TableHead className="text-right">{t('rank')}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody key={paged.page} className={SWAP}>
                                {paged.pageRows.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                                            {t('noMatch', { search })}
                                        </TableCell>
                                    </TableRow>
                                ) : paged.pageRows.map(map => (
                                    <TableRow key={map.map}>
                                        <TableCell className="max-w-[180px] truncate font-medium">
                                            <Link href={`/maps/${map.map}`} className="hover:underline" title={map.map}>
                                                {map.map}
                                            </Link>
                                        </TableCell>
                                        <TableCell className="hidden sm:table-cell">
                                            <SplitBar
                                                legend={false}
                                                size="sm"
                                                formatValue={withUnit}
                                                segments={map.communities.map(c => ({
                                                    key: c.community_id,
                                                    label: nameOf(c.community_id),
                                                    value: c.duration,
                                                    color: colorOf(c.community_id),
                                                }))}
                                            />
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">{formatValue(map.total_duration)}</TableCell>
                                        <TableCell className="text-right tabular-nums text-pink-500">
                                            {map.rank != null ? `#${formatNumber(map.rank, 0, locale)}` : '—'}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                    <PageFooter paged={paged} compact />
                </div>
            )}
        </ProfileCard>
    );
}
