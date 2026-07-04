'use client'
import {Heart} from 'lucide-react';
import {getMapImage, secondsToHours, simpleRandom} from "utils/generalUtils";
import {getStatusChip} from "./MapsTable";
import dayjs from "dayjs";
import {Dispatch, useEffect, useState} from "react";
import Link from "next/link";
import {Badge} from "components/ui/badge";
import {Button} from "components/ui/button";
import {Skeleton} from "components/ui/skeleton";
import {Pagination, PaginationContent, PaginationFirst, PaginationItem, PaginationLast, PaginationLink, PaginationNext, PaginationPrevious} from "components/ui/pagination";
import {Server} from "types/community.ts";
import {MapPlayedPaginated} from "types/maps.ts";
import CategoryChip from "components/ui/CategoryChip.tsx";

export const MapsMobileViewSkeleton = () => {
    const [isClient, setIsClient] = useState(false)

    useEffect(() => {
        setIsClient(true)
    }, [])
    return (
        <div className="border border-border rounded-lg bg-card p-4">
            <div className="flex justify-between items-start mb-4">
                <div className="flex-1 mr-4">
                    <Skeleton className="mb-2" style={{width: isClient? `${simpleRandom(40, 80)}%`: '40%', height: '24px'}} />
                    <div className="flex gap-2 mb-2">
                        <Skeleton className="w-15 h-5 rounded" />
                        {isClient && Math.round(simpleRandom(0, 1)) !== 0 && <Skeleton className="w-17 h-5 rounded"/>}
                    </div>
                    <Skeleton className="w-12 h-6 rounded" />
                </div>
                <Skeleton className="w-10 h-10 rounded-full" />
            </div>
            <Skeleton className="w-full h-30 rounded-lg mb-4" />
            <div className="grid grid-cols-2 gap-2">
                {Array.from({ length: 4 }).map((_, j) => (
                    <div key={j} className="text-center p-2 bg-muted/50 rounded">
                        <Skeleton className="w-3/5 h-6 mx-auto mb-1" />
                        <Skeleton className="w-4/5 h-4 mx-auto" />
                    </div>
                ))}
            </div>
        </div>
    );
}

function MapCardView({ server, map, favorites, toggleFavorite }){
    const server_id = server.id
    const [mapImage, setMapImage] = useState(null);
    useEffect(() => {
        getMapImage(server_id, map.map).then(e => setMapImage(e? e.large: null))
    }, [server_id, map.map])

    return (
        <div
            className="border border-border rounded-lg bg-card p-4 transition-all hover:shadow-md"
            style={{opacity: !map.enabled ? 0.6 : 1}}
        >
            <div className="flex justify-between items-start mb-4">
                <div className="flex-1 mr-4">
                    <Link
                        href={`/servers/${server.gotoLink}/maps/${map.map}/`}
                        className="block font-bold text-base leading-tight mb-2 truncate max-w-48 sm:max-w-96 hover:text-primary transition-colors"
                    >
                        {map.map}
                    </Link>
                    <div className="flex gap-1 flex-wrap mb-2">
                        {map.is_casual && !map.is_tryhard && <CategoryChip category="casual" size="small" />}
                        {map.is_tryhard && !map.is_casual && <CategoryChip category="tryhard" size="small" />}
                        {map.is_tryhard && map.is_casual && <CategoryChip category="mixed" size="small" />}
                        {map.has_lasers && <CategoryChip category="lasers" size="small" title="Map contains killable lasers" />}
                        {map.no_noms && <CategoryChip category="no noms" size="small" title="Nominations disabled" />}
                        {map.min_players != null && map.min_players > 0 && (
                            <Badge variant="outline" className="text-xs">
                                Min {map.min_players}
                            </Badge>
                        )}
                        {map.max_players != null && (map.max_players != server.max_players && map.max_players != 0)  && (
                            <Badge variant="outline" className="text-xs">
                                Max {map.max_players}
                            </Badge>
                        )}
                    </div>
                    {getStatusChip(map)}
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(map.map);
                    }}
                    className={`-mt-1 ${favorites.has(map.map) ? 'text-primary' : ''}`}
                >
                    {favorites.has(map.map) ? (
                        <Heart className="h-5 w-5 fill-current" />
                    ) : (
                        <Heart className="h-5 w-5" />
                    )}
                </Button>
            </div>

            <div className="rounded-lg overflow-hidden mb-4 h-30">
                {mapImage ? (
                    <img
                        src={mapImage}
                        alt={map.map}
                        className="w-full h-30 object-cover"
                    />
                ) : (
                    <Skeleton className="w-full h-30" />
                )}
            </div>

            <div className="grid grid-cols-2 gap-2">
                <div className="col-span-full text-center p-2 bg-muted/50 rounded">
                    <p className="text-xl font-bold text-primary">
                        {secondsToHours(map.total_cum_time)}
                    </p>
                    <span className="text-xs text-muted-foreground font-medium">
                        Cumulative Hours
                    </span>
                </div>
                <div className="text-center p-2 bg-muted/50 rounded">
                    <p className="text-xl font-bold text-primary">
                        {secondsToHours(map.total_time)}
                    </p>
                    <span className="text-xs text-muted-foreground font-medium">
                        Hours
                    </span>
                </div>
                <div className="text-center p-2 bg-muted/50 rounded">
                    <p className="text-xl font-bold text-primary">
                        {map.unique_players.toLocaleString()}
                    </p>
                    <span className="text-xs text-muted-foreground font-medium">
                        Players
                    </span>
                </div>
                <div className="text-center p-2 bg-muted/50 rounded">
                    <p className="text-xl font-bold text-primary">
                        {map.total_sessions}
                    </p>
                    <span className="text-xs text-muted-foreground font-medium">
                        Sessions
                    </span>
                </div>
                <div className="text-center p-2 bg-muted/50 rounded">
                    <p className="text-xl font-bold text-primary">
                        {dayjs(map.last_played).fromNow(true)}
                    </p>
                    <span className="text-xs text-muted-foreground font-medium">
                        Last Played
                    </span>
                </div>
            </div>
        </div>
    );
}

export default function MapsMobileView({
    server,
    mapsData,
    favorites,
    toggleFavorite,
    page,
    setPage,
    loading
}: {
    server: Server,
    mapsData: MapPlayedPaginated | null,
    favorites: Set<string>,
    toggleFavorite: (mapName: string) => Promise<void>,
    page: number,
    setPage: Dispatch<number>,
    loading: boolean
}) {
    const totalPages = Math.ceil((mapsData?.total_maps || 0) / 25);

    return (
        <>
            <div className="space-y-4">
                {!loading && mapsData?.maps?.map((map) => (
                    <MapCardView
                        key={map.map}
                        server={server}
                        map={map}
                        favorites={favorites}
                        toggleFavorite={toggleFavorite}
                    />
                ))}
                {loading && Array.from({ length: 25 }).map((_, index) => {
                    return <MapsMobileViewSkeleton key={index} />
                })}
            </div>

            <div className="flex justify-center mt-6 mb-4">
                <Pagination>
                    <PaginationContent>
                        <PaginationItem>
                            <PaginationFirst
                                onClick={() => setPage(0)}
                                className={page === 0 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                            />
                        </PaginationItem>
                        <PaginationItem>
                            <PaginationPrevious
                                onClick={() => page > 0 && setPage(page - 1)}
                                className={page === 0 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                            />
                        </PaginationItem>
                        {Array.from({ length: Math.min(3, totalPages) }, (_, i) => {
                            let pageNum;
                            if (totalPages <= 3) {
                                pageNum = i;
                            } else if (page < 2) {
                                pageNum = i;
                            } else if (page >= totalPages - 2) {
                                pageNum = totalPages - 3 + i;
                            } else {
                                pageNum = page - 1 + i;
                            }

                            return (
                                <PaginationItem key={pageNum}>
                                    <PaginationLink
                                        onClick={() => setPage(pageNum)}
                                        isActive={page === pageNum}
                                        className="cursor-pointer"
                                    >
                                        {pageNum + 1}
                                    </PaginationLink>
                                </PaginationItem>
                            );
                        })}
                        <PaginationItem>
                            <PaginationNext
                                onClick={() => page < totalPages - 1 && setPage(page + 1)}
                                className={page >= totalPages - 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                            />
                        </PaginationItem>
                        <PaginationItem>
                            <PaginationLast
                                onClick={() => setPage(totalPages - 1)}
                                className={page >= totalPages - 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                            />
                        </PaginationItem>
                    </PaginationContent>
                </Pagination>
            </div>
        </>
    );
}
