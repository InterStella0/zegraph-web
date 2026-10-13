'use client'
import {Heart} from 'lucide-react';
import {secondsToHours} from "utils/generalUtils";
import {loadMapImage} from "lib/batchLoader";
import {StatusChip} from "./MapsTable";
import dayjs from "dayjs";
import {Dispatch, useEffect, useState} from "react";
import Link from "next/link";
import {Badge} from "components/ui/badge";
import {Button} from "components/ui/button";
import {Skeleton} from "components/ui/skeleton";
import PaginationPage from "components/ui/PaginationPage.tsx";
import {Server} from "types/community.ts";
import {MapPlayedPaginated} from "types/maps.ts";
import CategoryChip from "components/ui/CategoryChip.tsx";
import {useTranslations, useLocale} from 'next-intl';

export const MapsMobileViewSkeleton = ({ index }: { index: number }) => {
    const t = useTranslations('maps.table');
    return (
        <div className="border border-border rounded-lg bg-card p-4">
            <div className="flex justify-between items-start mb-4">
                <div className="flex-1 mr-4">
                    <div className="font-bold text-base leading-tight mb-2">
                        <Skeleton className="inline-block align-middle h-4" style={{width: `${7 + (index * 5) % 5}rem`}} />{'\u200b'}
                    </div>
                    <div className="flex gap-1 flex-wrap mb-2">
                        <Skeleton className="inline-flex border border-transparent px-2 py-0.5 text-xs rounded-full w-14">{'\u200b'}</Skeleton>
                    </div>
                    <Skeleton className="inline-flex border border-transparent px-2 py-0.5 text-xs rounded-full w-16">{'\u200b'}</Skeleton>
                </div>
                <Skeleton className="size-9 -mt-1 rounded-md" />
            </div>
            <Skeleton className="w-full h-30 rounded-lg mb-4" />
            <div className="grid grid-cols-2 gap-2">
                {[t('cumulativeHours'), t('hours'), t('players'), t('sessions'), t('lastPlayed')].map((label, i) => (
                    <div key={label} className={`text-center p-2 bg-muted/50 rounded${i === 0 ? ' col-span-full' : ''}`}>
                        <div className="text-xl font-bold">
                            <Skeleton className="inline-block align-middle h-5 w-16" />{'\u200b'}
                        </div>
                        <span className="text-xs text-muted-foreground font-medium">
                            {label}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function MapCardView({ server, map, favorites, toggleFavorite }){
    const t = useTranslations('maps.table');
    const locale = useLocale();
    const server_id = server.id
    const [mapImage, setMapImage] = useState(null);
    useEffect(() => {
        loadMapImage(map.map, server_id).then(e => setMapImage(e? e.large: null))
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
                        {map.has_lasers && <CategoryChip category="lasers" size="small" title={t('lasersTitle')} />}
                        {map.no_noms && <CategoryChip category="no noms" size="small" title={t('noNomsTitle')} />}
                        {map.min_players != null && map.min_players > 0 && (
                            <Badge variant="outline" className="text-xs">
                                {t('min', {count: map.min_players})}
                            </Badge>
                        )}
                        {map.max_players != null && (map.max_players != server.max_players && map.max_players != 0)  && (
                            <Badge variant="outline" className="text-xs">
                                {t('max', {count: map.max_players})}
                            </Badge>
                        )}
                    </div>
                    <StatusChip map={map} />
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
                        {secondsToHours(map.total_cum_time, locale)}
                    </p>
                    <span className="text-xs text-muted-foreground font-medium">
                        {t('cumulativeHours')}
                    </span>
                </div>
                <div className="text-center p-2 bg-muted/50 rounded">
                    <p className="text-xl font-bold text-primary">
                        {secondsToHours(map.total_time, locale)}
                    </p>
                    <span className="text-xs text-muted-foreground font-medium">
                        {t('hours')}
                    </span>
                </div>
                <div className="text-center p-2 bg-muted/50 rounded">
                    <p className="text-xl font-bold text-primary">
                        {map.unique_players.toLocaleString(locale)}
                    </p>
                    <span className="text-xs text-muted-foreground font-medium">
                        {t('players')}
                    </span>
                </div>
                <div className="text-center p-2 bg-muted/50 rounded">
                    <p className="text-xl font-bold text-primary">
                        {map.total_sessions}
                    </p>
                    <span className="text-xs text-muted-foreground font-medium">
                        {t('sessions')}
                    </span>
                </div>
                <div className="text-center p-2 bg-muted/50 rounded">
                    <p className="text-xl font-bold text-primary">
                        {dayjs(map.last_played).fromNow(true)}
                    </p>
                    <span className="text-xs text-muted-foreground font-medium">
                        {t('lastPlayed')}
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
                    return <MapsMobileViewSkeleton key={index} index={index} />
                })}
            </div>

            <div className="flex justify-center mt-6 mb-4">
                <PaginationPage totalPages={totalPages} page={page} setPage={setPage} />
            </div>
        </>
    );
}
