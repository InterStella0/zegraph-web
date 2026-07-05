'use client'
import {useTranslations} from 'next-intl';
import {useEffect, useState, useMemo, use} from "react";
import {addOrdinalSuffix, APIError, fetchApiServerUrl, formatNumber, formatHours, StillCalculate} from "utils/generalUtils";
import { Card } from "components/ui/card";
import { Input } from "components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "components/ui/table";
import { Button } from "components/ui/button";
import {
    Chart as ChartJS,
    ArcElement,
    Title,
    Tooltip,
    Legend
} from "chart.js";
import { LazyDoughnutChart as Doughnut } from "components/graphs/LazyCharts";
import ErrorCatch from "../ui/ErrorMessage.tsx";
import SkeletonBarGraph from "../graphs/SkeletonBarGraph.tsx";
import { Search } from "lucide-react";
import Link from "next/link";
import {ServerPlayerDetailed} from "../../app/servers/[server_slug]/players/[player_id]/page.tsx";
import {PlayerMostPlayedMap} from "types/players.ts";
import { useTheme } from "next-themes";
import PaginationPage from "components/ui/PaginationPage.tsx";
import { ScreenReaderOnly } from "components/ui/ScreenReaderOnly";

ChartJS.register(
    ArcElement,
    Title,
    Tooltip,
    Legend
);

export interface PlayerTopMap extends PlayerMostPlayedMap{
    hours: number;
}

function PlayerTopMapDisplay({ serverPlayerPromise }: { serverPlayerPromise: Promise<ServerPlayerDetailed>}) {
    const t = useTranslations('players.topMaps');
    const tCommon = useTranslations('common');
    const { server, player } = use(serverPlayerPromise)
    const playerId = !(player instanceof StillCalculate)? player.id: null
    const [maps, setMaps] = useState<PlayerTopMap[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<Error | null>(null);
    const [viewType, setViewType] = useState<"chart" | "table">("chart");
    const [searchTerm, setSearchTerm] = useState<string>("");
    const [page, setPage] = useState<number>(0);
    const { resolvedTheme } = useTheme();
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 640);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    const server_id = server.id
    const maxMapCount = isMobile ? 5 : 10;
    const rowsPerPage = 10;

    const filteredMaps = useMemo(() => {
        if (!searchTerm) return maps;
        return maps.filter(map =>
            map.map.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [maps, searchTerm]);

    const paginatedMaps = useMemo(() => {
        const startIndex = page * rowsPerPage;
        return filteredMaps.slice(startIndex, startIndex + rowsPerPage);
    }, [filteredMaps, page, rowsPerPage]);

    const displayedMaps = useMemo(() => {
        if (viewType === "chart") {
            return maps.slice(0, maxMapCount);
        }
        return paginatedMaps;
    }, [maps, paginatedMaps, viewType, maxMapCount]);

    const totalPages = Math.ceil(filteredMaps.length / rowsPerPage);

    useEffect(() => {
        setLoading(true);
        setError(null);

        fetchApiServerUrl(server_id, `/players/${playerId}/most_played_maps`)
            .then((resp: PlayerMostPlayedMap[]) => resp.map(e => ({
                map: e.map,
                duration: e.duration,
                hours: e.duration / 3600,
                rank: e.rank
            })))
            .then(values => {
                const sortedMaps = values.sort((a, b) => b.duration - a.duration);
                setMaps(sortedMaps);
                setLoading(false);
            })
            .catch(err => {
                setError(err);
                setLoading(false);
            });
    }, [server_id, playerId]);

    useEffect(() => {
        setPage(0);
    }, [searchTerm, playerId]);

    const isDark = resolvedTheme === 'dark';

    const doughnutOptions = {
        responsive: true,
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
                    color: isDark ? 'hsl(210 40% 98%)' : 'hsl(222.2 47.4% 11.2%)',
                    font: {
                        size: isMobile ? 10 : 12,
                        weight: 500
                    },
                    generateLabels: (chart: any) => {
                        const { data } = chart;
                        if (data.labels.length && data.datasets.length) {
                            return data.labels.map((label: any, i: number) => {
                                const hours = data.datasets[0].data[i];
                                const displayLabel = isMobile && label.length > 12
                                    ? label.substring(0, 12) + '...'
                                    : label;

                                return {
                                    text: `${displayLabel} (${hours.toFixed(1)}h)`,
                                    fillStyle: data.datasets[0].backgroundColor[i],
                                    hidden: !chart.getDataVisibility(i),
                                    index: i,
                                    fontColor: isDark ? 'hsl(210 40% 98%)' : 'hsl(222.2 47.4% 11.2%)',
                                    pointStyle: 'circle'
                                };
                            });
                        }
                        return [];
                    }
                }
            },
            tooltip: {
                backgroundColor: isDark ? 'rgba(50, 50, 50, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                titleColor: isDark ? 'hsl(210 40% 98%)' : 'hsl(222.2 47.4% 11.2%)',
                bodyColor: isDark ? 'hsl(210 40% 98%)' : 'hsl(222.2 47.4% 11.2%)',
                borderColor: isDark ? 'hsl(217.2 32.6% 17.5%)' : 'hsl(214.3 31.8% 91.4%)',
                borderWidth: 1,
                cornerRadius: 8,
                padding: 12,
                callbacks: {
                    title: (tooltipItems: any) => displayedMaps[tooltipItems[0].dataIndex].map,
                    label: (context: any) => `${context.parsed.toFixed(1)} hours`
                }
            }
        },
        elements: {
            arc: {
                borderWidth: 2,
                borderColor: isDark ? 'hsl(222.2 84% 4.9%)' : 'hsl(0 0% 100%)',
                hoverBorderWidth: 3
            }
        }
    };

    const handleViewChange = (newValue: string) => {
        setViewType(newValue as "chart" | "table");
        if (newValue === "chart") {
            setSearchTerm("");
            setPage(1);
        }
    };

    const generateColors = (count: number) => {
        const lightColors = [
            'hsla(0 72.2% 50.6% / 0.8)',      // destructive
            'hsla(221.2 83.2% 53.3% / 0.8)',  // primary
            'hsla(47.9 95.8% 53.1% / 0.8)',   // yellow
            'hsla(142.1 70.6% 45.3% / 0.8)',  // green
            'hsla(262.1 83.3% 57.8% / 0.8)',  // purple
            'hsla(24.6 95% 53.1% / 0.8)',     // orange
            'hsla(346.8 77.2% 49.8% / 0.8)',  // pink
            'hsla(199 89.1% 48.4% / 0.8)',    // cyan
            'hsla(142.1 76.2% 36.3% / 0.8)',  // dark green
            'hsla(280 83.3% 57.8% / 0.8)',    // violet
        ];

        const darkColors = [
            'hsla(0 84.2% 60.2% / 0.8)',      // destructive dark
            'hsla(217.2 91.2% 59.8% / 0.8)',  // primary dark
            'hsla(47.9 95.8% 53.1% / 0.8)',   // yellow
            'hsla(142.1 76.2% 36.3% / 0.8)',  // green dark
            'hsla(263.4 70% 50.4% / 0.8)',    // purple dark
            'hsla(24.6 95% 53.1% / 0.8)',     // orange
            'hsla(346.8 77.2% 49.8% / 0.8)',  // pink
            'hsla(199 89.1% 48.4% / 0.8)',    // cyan
            'hsla(142.1 70.6% 45.3% / 0.8)',  // light green
            'hsla(280 83.3% 57.8% / 0.8)',    // violet
        ];

        return isDark ? darkColors.slice(0, count) : lightColors.slice(0, count);
    };

    const chartData = {
        labels: displayedMaps.map(e => e.map),
        datasets: [{
            label: t('hours'),
            data: displayedMaps.map(e => e.hours),
            backgroundColor: generateColors(displayedMaps.length),
            borderWidth: 0,
            hoverOffset: 8
        }]
    };

    // Generate SEO summary
    const summary = useMemo(() => {
        if (maps.length === 0) {
            return t('noData');
        }

        const totalHours = maps.reduce((sum, m) => sum + m.hours, 0);
        const topMap = maps[0];

        return t('summary', {
            count: maps.length,
            total: formatNumber(totalHours),
            topMap: topMap.map,
            topHours: formatNumber(topMap.hours),
        });
    }, [maps, t]);

    const cardHeight = isMobile ? '280px' : '380px';

    const formatDuration = (seconds: number) => {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        if (hrs > 0) {
            return `${hrs}h ${mins}m`;
        } else if (mins > 0) {
            return `${mins}m ${secs.toFixed(0)}s`;
        } else {
            return `${secs.toFixed(1)}s`;
        }
    };

    const getRankForMap = (mapData: PlayerTopMap) => {
        return maps.findIndex(m => m.map === mapData.map) + 1;
    };

    return (
        <div className="p-4 h-full flex flex-col">
            <div className="flex justify-between items-center mb-2">
                <h2 className={`font-bold ${isMobile ? 'text-base' : 'text-xl'}`}>
                    {t('title')}
                </h2>

                <Tabs value={viewType} onValueChange={handleViewChange}>
                    <TabsList>
                        <TabsTrigger value="chart" className={isMobile ? 'text-xs px-2 py-1' : ''}>{t('chart')}</TabsTrigger>
                        <TabsTrigger value="table" className={isMobile ? 'text-xs px-2 py-1' : ''}>{t('table')}</TabsTrigger>
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
                className={`flex flex-col ${viewType === "chart" ? 'items-center justify-center' : 'items-stretch justify-start'} pb-2 sm:pb-4`}
                style={{ height: cardHeight }}
            >
                {loading && <SkeletonBarGraph sorted />}
                {error && (error instanceof APIError && error.code === 202 ?
                    <p className="text-muted-foreground">
                        {t('stillCalculating')}
                    </p> :
                    <p className="text-destructive">
                        {t('loadFailed')}
                    </p>
                )}
                {!loading && !error && maps.length === 0 && (
                    <p className="text-muted-foreground">
                        {t('noMapData')}
                    </p>
                )}
                {!loading && !error && maps.length > 0 && (
                    <>
                        {viewType === "chart" && (
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
                        {viewType === "table" && (
                            <div className="flex flex-col" style={{ height: cardHeight }}>
                                <div className="overflow-auto" style={{ height: cardHeight }}>
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
                                                        <TableCell>
                                                                {getRankForMap(mapData)}
                                                        </TableCell>
                                                        <TableCell className="break-words">
                                                            <Link href={`/servers/${server.gotoLink}/maps/${mapData.map}`}>
                                                                {mapData.map}
                                                            </Link>
                                                        </TableCell>
                                                        <TableCell>
                                                            {mapData.rank > 0? tCommon('ordinal', {n: mapData.rank}): t('noDataCell')}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            {formatDuration(mapData.duration)}
                                                        </TableCell>
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
                                                Showing {(page * rowsPerPage) + 1}-{(page * rowsPerPage) + displayedMaps.length} of {filteredMaps.length} maps
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
                    </>
                )}
            </div>
        </div>
    );
}

export default function PlayerTopMap({ serverPlayerPromise }: { serverPlayerPromise: Promise<ServerPlayerDetailed>}) {
    const t = useTranslations('players.topMaps');
    return (
        <ErrorCatch message={t('loadError')}>
            <Card className="h-full w-full overflow-hidden">
                <PlayerTopMapDisplay serverPlayerPromise={serverPlayerPromise} />
            </Card>
        </ErrorCatch>
    );
    
}
