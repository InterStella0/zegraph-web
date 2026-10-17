'use client'
import {Heart} from 'lucide-react';
import dayjs from 'dayjs';
import relativeTime from "dayjs/plugin/relativeTime";
import Image from "next/image";
import {useLocale, useTranslations} from 'next-intl';
import {secondsToHours, withImageDomain} from "utils/generalUtils";
import {useLocalDayjs} from "lib/hooks/useHydrated";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "components/ui/table";
import {Badge} from "components/ui/badge";
import {Button} from "components/ui/button";
import {Skeleton} from "components/ui/skeleton";
import PaginationPage from "components/ui/PaginationPage.tsx";
import CategoryChip from "components/ui/CategoryChip.tsx";
import {GAME_META} from "components/ui/ServerIndicator";
import {GlobalMapPaginated, GlobalMapPlayed} from "types/maps.ts";
import GlobalMapStatusChip from "./GlobalMapStatusChip";
import CommunityAvatarStack from "./CommunityAvatarStack";
import {cn} from "components/lib/utils";
import {GLOBAL_MAPS_PAGE_SIZE} from "./constants";

dayjs.extend(relativeTime);

export function globalMapImage(map: GlobalMapPlayed, size: 'small' | 'large'): string | null {
    return map.image ? withImageDomain({...map.image})[size] : null;
}

export function GlobalMapChips({ map }: { map: GlobalMapPlayed }) {
    const t = useTranslations('maps.table');
    return (
        <div className="flex gap-1 flex-wrap">
            {map.games.map(game => {
                const meta = GAME_META[game];
                return meta && (
                    <Badge key={game} variant="outline" className={`text-xs ${meta.className}`}>
                        {meta.label}
                    </Badge>
                );
            })}
            {map.is_casual && !map.is_tryhard && <CategoryChip category="casual" size="small"/>}
            {map.is_tryhard && !map.is_casual && <CategoryChip category="tryhard" size="small"/>}
            {map.is_tryhard && map.is_casual && <CategoryChip category="mixed" size="small"/>}
            {map.has_lasers && <CategoryChip category="lasers" title={t('lasersTitle')} size="small"/>}
            {map.no_noms && <CategoryChip category="no noms" title={t('noNomsTitle')} size="small"/>}
        </div>
    );
}

export function FavoriteButton({ mapName, favorites, toggleFavorite, className = '' }: {
    mapName: string, favorites: Set<string>, toggleFavorite: (mapName: string) => void, className?: string,
}) {
    const isFavorite = favorites.has(mapName);
    return (
        <Button
            variant="ghost"
            size="icon"
            onClick={() => toggleFavorite(mapName)}
            className={`transition-all hover:scale-110 ${isFavorite ? 'text-primary' : ''} ${className}`}
        >
            <Heart className={`h-5 w-5 ${isFavorite ? 'fill-current' : ''}`}/>
        </Button>
    );
}

export function LastPlayed({ map, short = false }: { map: GlobalMapPlayed, short?: boolean }) {
    const t = useTranslations('maps.global');
    const toDayjs = useLocalDayjs();
    if (map.is_playing) return <>{t('now')}</>;
    if (!map.last_played) return <>-</>;
    return <span suppressHydrationWarning>{toDayjs(map.last_played).fromNow(short)}</span>;
}

function GlobalMapRowSkeleton({ index }: { index: number }) {
    return (
        <TableRow>
            <TableCell>
                <div className="flex items-center gap-4">
                    <Skeleton className="w-20 h-11 rounded"/>
                    <div>
                        <Skeleton className="h-3.5" style={{width: `${7 + (index * 5) % 6}rem`}}/>
                        <div className="flex gap-1 mt-1.5">
                            <Skeleton className="h-5 w-10 rounded-full"/>
                            <Skeleton className="h-5 w-14 rounded-full"/>
                        </div>
                    </div>
                </div>
            </TableCell>
            <TableCell><Skeleton className="h-6 w-28"/></TableCell>
            <TableCell><Skeleton className="h-5 w-24 rounded-full"/></TableCell>
            <TableCell align="right"><Skeleton className="inline-block h-3.5 w-16"/></TableCell>
            <TableCell align="right"><Skeleton className="inline-block h-3.5 w-12"/></TableCell>
            <TableCell align="right"><Skeleton className="inline-block h-3.5 w-10"/></TableCell>
            <TableCell align="center"><Skeleton className="inline-block h-3.5 w-20"/></TableCell>
            <TableCell align="center"><Skeleton className="inline-block size-9"/></TableCell>
        </TableRow>
    );
}

function GlobalMapRow({ map, favorites, toggleFavorite }: {
    map: GlobalMapPlayed, favorites: Set<string>, toggleFavorite: (mapName: string) => void,
}) {
    const locale = useLocale();
    const image = globalMapImage(map, 'small');
    const inRotation = map.servers.some(server => server.enabled && !server.removed);

    return (
        <TableRow className="transition-opacity" style={{opacity: inRotation ? 1 : 0.6}}>
            <TableCell>
                <div className="flex items-center gap-4">
                    <div className="rounded overflow-hidden w-20 h-11 flex-shrink-0">
                        {image ? (
                            <Image unoptimized height={45} width={80} src={image} alt={map.map} className="object-cover"/>
                        ) : (
                            <div className="w-20 h-11 bg-muted"/>
                        )}
                    </div>
                    <div className="min-w-0">
                        <div className="w-32 lg:w-56 xl:w-72 max-w-72">
                            <span className="text-sm font-medium truncate block">{map.map}</span>
                        </div>
                        <div className="mt-1">
                            <GlobalMapChips map={map}/>
                        </div>
                    </div>
                </div>
            </TableCell>
            <TableCell><CommunityAvatarStack servers={map.servers}/></TableCell>
            <TableCell><GlobalMapStatusChip map={map}/></TableCell>
            <TableCell align="right">
                <span className="text-sm font-bold text-primary">
                    {secondsToHours(map.total_cum_time, locale)}
                </span>
            </TableCell>
            <TableCell align="right" className="font-medium">
                {map.unique_players.toLocaleString(locale)}
            </TableCell>
            <TableCell align="right" className="font-medium">
                {map.total_sessions.toLocaleString(locale)}
            </TableCell>
            <TableCell align="center">
                <span className="text-sm text-muted-foreground">
                    <LastPlayed map={map}/>
                </span>
            </TableCell>
            <TableCell align="center">
                <FavoriteButton mapName={map.map} favorites={favorites} toggleFavorite={toggleFavorite}/>
            </TableCell>
        </TableRow>
    );
}

export default function GlobalMapsTable({ mapsData, page, setPage, favorites, toggleFavorite, loading }: {
    mapsData: GlobalMapPaginated | null,
    page: number,
    setPage: (page: number) => void,
    favorites: Set<string>,
    toggleFavorite: (mapName: string) => void,
    loading: boolean,
}) {
    const t = useTranslations('maps.table');
    const tGlobal = useTranslations('maps.global');
    const total = mapsData?.total_maps || 0;
    const totalPages = Math.ceil(total / GLOBAL_MAPS_PAGE_SIZE);
    const startItem = total === 0 ? 0 : page * GLOBAL_MAPS_PAGE_SIZE + 1;
    const endItem = Math.min((page + 1) * GLOBAL_MAPS_PAGE_SIZE, total);

    return (
        <div className="border border-border rounded-lg bg-card overflow-hidden">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="font-bold">{t('map')}</TableHead>
                        <TableHead className="font-bold">{tGlobal('communities')}</TableHead>
                        <TableHead className="font-bold">{t('status')}</TableHead>
                        <TableHead className="font-bold text-right">{t('cumulativeHours')}</TableHead>
                        <TableHead className="font-bold text-right">{t('players')}</TableHead>
                        <TableHead className="font-bold text-right">{t('sessions')}</TableHead>
                        <TableHead className="font-bold text-center">{t('lastPlayed')}</TableHead>
                        <TableHead/>
                    </TableRow>
                </TableHeader>
                {/* The previous page stays up, dimmed, while the next one loads. */}
                <TableBody aria-busy={loading} className={cn("transition-opacity", loading && mapsData && "opacity-50")}>
                    {mapsData?.maps?.map(map => (
                        <GlobalMapRow key={map.map} map={map} favorites={favorites} toggleFavorite={toggleFavorite}/>
                    ))}
                    {!mapsData && Array.from({length: GLOBAL_MAPS_PAGE_SIZE}).map((_, i) =>
                        <GlobalMapRowSkeleton key={i} index={i}/>
                    )}
                </TableBody>
            </Table>
            {!loading && total === 0 && (
                <p className="p-8 text-center text-muted-foreground">{tGlobal('noMapsFound')}</p>
            )}

            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <p className="text-sm text-muted-foreground">
                    {t('showing', {start: startItem, end: endItem, total})}
                </p>
                <PaginationPage totalPages={totalPages} page={page} setPage={setPage}/>
            </div>
        </div>
    );
}
