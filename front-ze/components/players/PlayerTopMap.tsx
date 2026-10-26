'use client'
import {useTranslations} from 'next-intl';
import {useEffect, useState} from "react";
import {APIError, formatNumber} from "utils/generalUtils";
import { Card } from "components/ui/card";
import { Input } from "components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "components/ui/table";
import { LazyDoughnutChart as Doughnut } from "components/graphs/LazyCharts";
import SkeletonBarGraph from "../graphs/SkeletonBarGraph.tsx";
import { Search } from "lucide-react";
import Link from "next/link";
import {PlayerMostPlayedMap} from "types/players.ts";
import {useChartTheme} from "lib/chartTheme";
import {useMediaQuery} from "lib/hooks/useMediaQuery";
import PaginationPage from "components/ui/PaginationPage.tsx";
import { ScreenReaderOnly } from "components/ui/ScreenReaderOnly";
import {withErrorCatch} from "components/common/withErrorCatch";
import {PeriodTitle, ServerPlayerProps, useServerPlayer} from "./common";
import {usePlayerStat} from "../../app/servers/[server_slug]/players/[player_id]/PlayerStatsPatch.tsx";

const ROWS_PER_PAGE = 10;

// HSL triplets shown at 80% opacity, one per map slice.
const MAP_COLORS = {
    light: ['0 72.2% 50.6%', '221.2 83.2% 53.3%', '47.9 95.8% 53.1%', '142.1 70.6% 45.3%', '262.1 83.3% 57.8%',
        '24.6 95% 53.1%', '346.8 77.2% 49.8%', '199 89.1% 48.4%', '142.1 76.2% 36.3%', '280 83.3% 57.8%'],
    dark: ['0 84.2% 60.2%', '217.2 91.2% 59.8%', '47.9 95.8% 53.1%', '142.1 76.2% 36.3%', '263.4 70% 50.4%',
        '24.6 95% 53.1%', '346.8 77.2% 49.8%', '199 89.1% 48.4%', '142.1 70.6% 45.3%', '280 83.3% 57.8%'],
};

function formatDuration(seconds: number) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) return `${hrs}h ${mins}m`;
    if (mins > 0) return `${mins}m ${secs.toFixed(0)}s`;
    return `${secs.toFixed(1)}s`;
}

function PlayerTopMapDisplay({ serverPlayerPromise }: ServerPlayerProps) {
    const t = useTranslations('players.topMaps');
    const tCommon = useTranslations('common');
    const { server, playerId } = useServerPlayer(serverPlayerPromise)
    const [viewType, setViewType] = useState<"chart" | "table">("chart");
    const [searchTerm, setSearchTerm] = useState<string>("");
    const [page, setPage] = useState<number>(0);
    const theme = useChartTheme();
    const isMobile = !!useMediaQuery('(max-width: 639.98px)');

    const { data: mapData, loading, error } = usePlayerStat<PlayerMostPlayedMap[]>(server.id, playerId, 'most_played_maps');
    const maps = (mapData ?? [])
        .map(e => ({ map: e.map, duration: e.duration, hours: e.duration / 3600, rank: e.rank }))
        .sort((a, b) => b.duration - a.duration);
    const filteredMaps = searchTerm
        ? maps.filter(map => map.map.toLowerCase().includes(searchTerm.toLowerCase()))
        : maps;
    const displayedMaps = viewType === "chart"
        ? maps.slice(0, isMobile ? 5 : 10)
        : filteredMaps.slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE);
    const totalPages = Math.ceil(filteredMaps.length / ROWS_PER_PAGE);

    useEffect(() => {
        setPage(0);
    }, [searchTerm, playerId]);

    const doughnutOptions = {
        maintainAspectRatio: false,
        cutout: '60%',
        plugins: {
            legend: {
                position: 'right' as const,
                align: 'center' as const,
                labels: {
                    boxWidth: 12,
                    padding: 16,
                    usePointStyle: true,
                    pointStyle: 'circle' as const,
                    color: theme.foreground,
                    font: { size: isMobile ? 10 : 12, weight: 500 },
                    generateLabels: (chart: any) => {
                        const { data } = chart;
                        if (!data.labels.length || !data.datasets.length) return [];
                        return data.labels.map((label: any, i: number) => ({
                            text: `${isMobile && label.length > 12 ? label.substring(0, 12) + '...' : label} (${data.datasets[0].data[i].toFixed(1)}h)`,
                            fillStyle: data.datasets[0].backgroundColor[i],
                            hidden: !chart.getDataVisibility(i),
                            index: i,
                            fontColor: theme.foreground,
                            pointStyle: 'circle'
                        }));
                    }
                }
            },
            tooltip: {
                ...theme.tooltip,
                cornerRadius: 8,
                padding: 12,
                callbacks: {
                    title: (tooltipItems: any) => displayedMaps[tooltipItems[0].dataIndex].map,
                    label: (context: any) => `${context.parsed.toFixed(1)} hours`
                }
            }
        },
        elements: {
            arc: { borderWidth: 2, borderColor: theme.background, hoverBorderWidth: 3 }
        }
    };

    const handleViewChange = (newValue: string) => {
        setViewType(newValue as "chart" | "table");
        if (newValue === "chart") {
            setSearchTerm("");
            setPage(1);
        }
    };

    const chartData = {
        labels: displayedMaps.map(e => e.map),
        datasets: [{
            label: t('hours'),
            data: displayedMaps.map(e => e.hours),
            backgroundColor: MAP_COLORS[theme.isDark ? 'dark' : 'light'].slice(0, displayedMaps.length).map(hsl => `hsla(${hsl} / 0.8)`),
            borderWidth: 0,
            hoverOffset: 8
        }]
    };

    const summary = maps.length === 0 ? t('noData') : t('summary', {
        count: maps.length,
        total: formatNumber(maps.reduce((sum, m) => sum + m.hours, 0)),
        topMap: maps[0].map,
        topHours: formatNumber(maps[0].hours),
    });

    return (
        <Card className="h-full w-full overflow-hidden">
            <div className="p-4 h-full flex flex-col">
                <div className="flex justify-between items-center mb-2">
                    <PeriodTitle title={t('title')} titleClassName="font-bold text-base sm:text-xl" />

                    <Tabs value={viewType} onValueChange={handleViewChange}>
                        <TabsList>
                            <TabsTrigger value="chart" className="max-sm:text-xs max-sm:px-2 max-sm:py-1">{t('chart')}</TabsTrigger>
                            <TabsTrigger value="table" className="max-sm:text-xs max-sm:px-2 max-sm:py-1">{t('table')}</TabsTrigger>
                        </TabsList>
                    </Tabs>
                </div>

                {viewType === "table" && (
                    <div className="mb-4">
                        <div className="relative">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder={t('searchMaps')}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-8"
                            />
                        </div>
                    </div>
                )}

                <div
                    className={`flex flex-col h-[280px] sm:h-[380px] ${viewType === "chart" ? 'items-center justify-center' : 'items-stretch justify-start'} pb-2 sm:pb-4`}
                >
                    {loading && <SkeletonBarGraph sorted />}
                    {error && (error instanceof APIError && error.code === 202 ?
                        <p className="text-muted-foreground">{t('stillCalculating')}</p> :
                        <p className="text-destructive">{t('loadFailed')}</p>
                    )}
                    {!loading && !error && maps.length === 0 && (
                        <p className="text-muted-foreground">{t('noMapData')}</p>
                    )}
                    {!loading && !error && maps.length > 0 && viewType === "chart" && (
                        <>
                            <ScreenReaderOnly id="map-playtime-summary">
                                {summary}
                            </ScreenReaderOnly>
                            <div
                                className="w-full h-full flex items-center justify-center"
                                role="img"
                                aria-label={t('ariaLabel')}
                                aria-describedby="map-playtime-summary"
                            >
                                <Doughnut
                                    // @ts-ignore
                                    options={doughnutOptions} data={chartData} />
                            </div>
                        </>
                    )}
                    {!loading && !error && maps.length > 0 && viewType === "table" && (
                        <div className="flex flex-col h-[280px] sm:h-[380px]">
                            <div className="overflow-auto h-[280px] sm:h-[380px]">
                                <Table>
                                    <TableHeader className="sticky top-0 bg-background">
                                        <TableRow>
                                            <TableHead className="font-bold">{t('rank')}</TableHead>
                                            <TableHead className="font-bold">{t('map')}</TableHead>
                                            <TableHead className="font-bold">{t('playRank')}</TableHead>
                                            <TableHead className="font-bold text-right">{t('time')}</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {displayedMaps.map((mapData) => (
                                            <TableRow key={mapData.map}>
                                                <TableCell>{maps.findIndex(m => m.map === mapData.map) + 1}</TableCell>
                                                <TableCell className="break-words">
                                                    <Link href={`/servers/${server.gotoLink}/maps/${mapData.map}`}>
                                                        {mapData.map}
                                                    </Link>
                                                </TableCell>
                                                <TableCell>
                                                    {mapData.rank > 0 ? tCommon('ordinal', {n: mapData.rank}) : t('noDataCell')}
                                                </TableCell>
                                                <TableCell className="text-right">{formatDuration(mapData.duration)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>

                            {totalPages > 1 && (
                                <div className="flex justify-center mt-4">
                                    <div className="space-y-2 flex flex-col items-center">
                                        <PaginationPage totalPages={totalPages} page={page} setPage={setPage} />
                                        <p className="text-xs text-muted-foreground text-center">
                                            {t('showing', {start: (page * ROWS_PER_PAGE) + 1, end: (page * ROWS_PER_PAGE) + displayedMaps.length, total: filteredMaps.length})}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {searchTerm && filteredMaps.length === 0 && (
                                <div className="flex justify-center mt-4">
                                    <p className="text-muted-foreground">
                                        {t('noMapsMatching', {query: searchTerm})}
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </Card>
    );
}

export default withErrorCatch(PlayerTopMapDisplay, t => t('players.topMaps.loadError'))
