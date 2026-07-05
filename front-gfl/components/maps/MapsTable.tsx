'use client'
import { Ban, Clock, Heart} from 'lucide-react';
import dayjs from 'dayjs';
import {getMapImage, secondsToHours, simpleRandom} from "utils/generalUtils";
import {useEffect, useState} from "react";
import Link from "next/link";
import duration from "dayjs/plugin/duration";
import relativeTime from "dayjs/plugin/relativeTime";
import Image from "next/image";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "components/ui/table";
import {Badge} from "components/ui/badge";
import {Button} from "components/ui/button";
import {Skeleton} from "components/ui/skeleton";
import PaginationPage from "components/ui/PaginationPage.tsx";
import {HoverPrefetchLink} from "components/ui/HoverPrefetchLink.tsx";
import MapNotifyButton from "components/maps/MapNotifyButton";
import {SteamProfile} from "../../next-auth-steam/steam";
import {Server} from "types/community.ts";
import {MapPlayed, MapPlayedPaginated} from "types/maps.ts";
import CategoryChip from "components/ui/CategoryChip.tsx";
import {useTranslations, useLocale} from 'next-intl';

dayjs.extend(duration);
dayjs.extend(relativeTime);

const MapsRowSkeleton = () => {
    const [isClient, setIsClient] = useState<boolean>(false)
    useEffect(() => {
        setIsClient(true)
    }, []);
    return (
        <TableRow>
            <TableCell>
                <div className="flex items-center gap-4">
                    <Skeleton className="w-20 h-11" />
                    <div className="w-36 lg:w-64 xl:w-72">
                        <Skeleton className="h-4 mb-1" style={{width: `${simpleRandom(80, 140, isClient)}px`}} />
                        <Skeleton className="h-3" style={{width: `${simpleRandom(40, 80, isClient)}px`}} />
                    </div>
                </div>
            </TableCell>
            <TableCell>
                <div className="w-16 overflow-hidden">
                    <Skeleton className="h-4" style={{width: `${simpleRandom(40, 60, isClient)}px`}} />
                </div>
            </TableCell>
            {Array.from({ length: 6 }).map((_, j) => (
                <TableCell key={j}>
                    <div className="flex justify-end">
                        <Skeleton className="h-4" style={{width: `${simpleRandom(40, 60, isClient)}px`}} />
                    </div>
                </TableCell>
            ))}
        </TableRow>
    );
}

export const StatusChip = ({ map }) => {
    const t = useTranslations('maps.table');
    if (!map.enabled) return (
        <Badge variant="destructive" className="gap-1">
            <Ban className="h-3 w-3" />
            {t('disabled')}
        </Badge>
    );
    if (map.map_left != null && map.map_left > 0) {
        return (
            <Badge variant="outline" className="gap-1 border-amber-500 text-amber-600 dark:text-amber-500">
                <Clock className="h-3 w-3" />
                {t('mapsLeft', {count: map.map_left})}
            </Badge>
        );
    }
    if (map.pending_cooldown || map.cooldown) {
        const cooldown = dayjs(map.cooldown);
        if (cooldown.diff(dayjs(), "second") > 0)
            return (
                <Badge variant="outline" className="gap-1 border-amber-500 text-amber-600 dark:text-amber-500">
                    <Clock className="h-3 w-3" />
                    {cooldown.fromNow(true)}
                </Badge>
            );
    }
    if (!map.last_played_ended)
        return <Badge variant="default">{t('playing')}</Badge>;

    if (map.removed)
        return <Badge variant="destructive" className="gap-1">
            <Ban className="h-3 w-3" />
            {t('removed')}
        </Badge>
    return <Badge variant="outline" className="border-green-500 text-green-600 dark:text-green-500">{t('ready')}</Badge>;
};

function MapRow({ server, map, favorites, toggleFavorite, user, getSubscriptionType, onNotificationChange }: {
    server: Server;
    map: MapPlayed;
    favorites: Set<string>;
    toggleFavorite: (mapName: string) => void;
    user: SteamProfile | null;
    getSubscriptionType: (mapName: string, serverId: string) => 'server' | 'all' | null;
    onNotificationChange: () => void;
}) {
    const t = useTranslations('maps.table');
    const locale = useLocale();
    const [ mapImage, setMapImage ] = useState(null);
    const server_id = server.id
    useEffect(() => {
        getMapImage(server_id, map.map).then(e => setMapImage(e? e.small: null))
    }, [server_id, map.map])

    return (
        <TableRow
            className="transition-opacity"
            style={{opacity: map.enabled && !map.removed ? 1: 0.6}}
        >
            <TableCell>
                <div className="flex items-center gap-4">
                    <div className="rounded overflow-hidden w-20 h-11">
                        {mapImage ? (
                            <Image
                                height={45}
                                width={80}
                                src={mapImage}
                                alt={map.map}
                                className="object-cover"
                            />
                        ) : (
                            <Skeleton className="w-20 h-11" />
                        )}
                    </div>

                    <div>
                        <div className="w-32 md:w-32 lg:w-60 xl:w-72 max-w-72">
                            <HoverPrefetchLink
                                href={`/servers/${server.gotoLink}/maps/${map.map}/`}
                                className="text-sm font-medium truncate block hover:text-primary transition-colors"
                            >
                                {map.map}
                            </HoverPrefetchLink>
                        </div>
                        <div className="flex gap-1 mt-1">
                            {map.is_casual && !map.is_tryhard && <CategoryChip category="casual" size="small" />}
                            {map.is_tryhard && !map.is_casual  && <CategoryChip category="tryhard" size="small" />}
                            {map.is_tryhard && map.is_casual && <CategoryChip category="mixed" size="small" />}
                            {map.has_lasers && <CategoryChip category="lasers" title={t('lasersTitle')} size="small" />}
                            {map.no_noms && <CategoryChip category="no noms" title={t('noNomsTitle')} size="small" />}
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
                    </div>
                </div>
            </TableCell>
            <TableCell><StatusChip map={map} /></TableCell>
            <TableCell align="right">
                <span className="text-sm font-bold text-primary">
                    {secondsToHours(map.total_cum_time, locale)}
                </span>
            </TableCell>
            <TableCell align="right">
                <span className="text-sm font-bold text-primary">
                    {secondsToHours(map.total_time, locale)}
                </span>
            </TableCell>
            <TableCell align="right" className="font-medium">
                {map.unique_players.toLocaleString(locale)}
            </TableCell>
            <TableCell align="right" className="font-medium">
                {map.total_sessions}
            </TableCell>
            <TableCell align="center">
                <span className="text-sm text-muted-foreground">
                    {dayjs(map.last_played).fromNow()}
                </span>
            </TableCell>
            <TableCell align="center">
                <MapNotifyButton
                    mapName={map.map}
                    serverId={server.id}
                    user={user}
                    notifySubscriptionType={getSubscriptionType(map.map, server.id)}
                    onSubscriptionChange={onNotificationChange}
                />
            </TableCell>
            <TableCell align="center">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(map.map);
                    }}
                    className={`transition-all hover:scale-110 ${favorites.has(map.map) ? 'text-primary' : ''}`}
                >
                    {favorites.has(map.map) ? (
                        <Heart className="h-5 w-5 fill-current" />
                    ) : (
                        <Heart className="h-5 w-5" />
                    )}
                </Button>
            </TableCell>
        </TableRow>
    );
}

export default function MapsTable({
    mapsData,
    page,
    favorites,
    toggleFavorite,
    handleChangePage,
    loading,
    server,
    user,
    getSubscriptionType,
    onNotificationChange
}: {
    mapsData: MapPlayedPaginated;
    page: number;
    favorites: Set<string>;
    toggleFavorite: (mapName: string) => void;
    handleChangePage: (event: any, page: number) => void;
    loading: boolean;
    server: Server;
    user: SteamProfile | null;
    getSubscriptionType: (mapName: string, serverId: string) => 'server' | 'all' | null;
    onNotificationChange: () => void;
}) {
    const t = useTranslations('maps.table');
    const totalPages = Math.ceil((mapsData?.total_maps || 0) / 25);
    const startItem = page * 25 + 1;
    const endItem = Math.min((page + 1) * 25, mapsData?.total_maps || 0);

    return (
        <div className="border border-border rounded-lg bg-card overflow-hidden">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="font-bold">{t('map')}</TableHead>
                        <TableHead className="font-bold">{t('status')}</TableHead>
                        <TableHead align="right" className="font-bold text-right">{t('cumulativeHours')}</TableHead>
                        <TableHead align="right" className="font-bold text-right">{t('hours')}</TableHead>
                        <TableHead align="right" className="font-bold text-right">{t('players')}</TableHead>
                        <TableHead align="right" className="font-bold text-right">{t('sessions')}</TableHead>
                        <TableHead align="center" className="font-bold text-center">{t('lastPlayed')}</TableHead>
                        <TableHead align="center" className="font-bold text-center"></TableHead>
                        <TableHead align="center" className="font-bold text-center"></TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {!loading && mapsData?.maps?.map((map, index) => (
                        <MapRow
                            server={server}
                            key={index}
                            map={map}
                            toggleFavorite={toggleFavorite}
                            favorites={favorites}
                            user={user}
                            getSubscriptionType={getSubscriptionType}
                            onNotificationChange={onNotificationChange}
                        />
                    ))}
                    {loading && Array.from({ length: 25 }).map((_, i) =>
                        <MapsRowSkeleton key={i} />
                    )}
                </TableBody>
            </Table>

            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <p className="text-sm text-muted-foreground">
                    {t('showing', {start: startItem, end: endItem, total: mapsData?.total_maps || 0})}
                </p>
                <PaginationPage totalPages={totalPages} page={page} setPage={(pageNum) => handleChangePage(null, pageNum)} />
            </div>
        </div>
    );
}
