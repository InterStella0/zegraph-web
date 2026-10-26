'use client'
import {Ban, Clock} from 'lucide-react';
import {secondsToHours, range} from "utils/generalUtils";
import {useLocalDayjs} from "lib/hooks/useLocalDayjs";
import Image from "next/image";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "components/ui/table";
import {Badge} from "components/ui/badge";
import {Tooltip, TooltipContent, TooltipTrigger} from "components/ui/tooltip";
import {Skeleton, SkeletonBadge, SkeletonText} from "components/ui/skeleton";
import {useVaryWidth} from "lib/hooks/useVaryWidth";
import PaginationPage from "components/ui/PaginationPage.tsx";
import {HoverPrefetchLink} from "components/ui/HoverPrefetchLink.tsx";
import MapNotifyButton from "components/maps/MapNotifyButton";
import {useMapImage} from "components/maps/useMapImage";
import {SteamProfile} from "types/steam";
import {Server} from "types/community.ts";
import {MapPlayed, MapPlayedPaginated} from "types/maps.ts";
import {MapCategoryChips} from "components/ui/CategoryChip.tsx";
import {FavoriteButton} from "components/maps/FavoriteButton";
import {isBlocked, mapBlockers} from "utils/mapCooldown";
import {useMapCooldownText} from "lib/hooks/useMapCooldownText";
import {useTranslations, useLocale} from 'next-intl';

export const MAPS_PAGE_SIZE = 25;

const MapsRowSkeleton = ({ index, showNotify }: { index: number, showNotify: boolean }) => {
    const varyWidth = useVaryWidth();
    return (
        <TableRow>
            <TableCell>
                <div className="flex items-center gap-4">
                    <Skeleton className="w-20 h-11 rounded" />
                    <div>
                        <div className="w-32 md:w-32 lg:w-60 xl:w-72 max-w-72">
                            <div className="text-sm font-medium">
                                <SkeletonText className="h-3.5" style={varyWidth(index, 7, 6, 5)} />
                            </div>
                        </div>
                        <div className="flex gap-1 mt-1">
                            <SkeletonBadge className="w-14" />
                        </div>
                    </div>
                </div>
            </TableCell>
            <TableCell>
                <SkeletonBadge className="w-[5.75rem]" />
            </TableCell>
            <TableCell align="right">
                <span className="text-sm"><Skeleton className="inline-block align-middle h-3.5 w-16" /></span>
            </TableCell>
            <TableCell align="right">
                <span className="text-sm"><Skeleton className="inline-block align-middle h-3.5 w-10" /></span>
            </TableCell>
            <TableCell align="right">
                <Skeleton className="inline-block align-middle h-3.5 w-10" />
            </TableCell>
            <TableCell align="right">
                <Skeleton className="inline-block align-middle h-3.5 w-6" />
            </TableCell>
            <TableCell align="center">
                <span className="text-sm"><Skeleton className="inline-block align-middle h-3.5 w-32" /></span>
            </TableCell>
            <TableCell align="center">
                {showNotify && <Skeleton className="inline-block align-middle size-9" />}
            </TableCell>
            <TableCell align="center">
                <Skeleton className="inline-block align-middle size-9" />
            </TableCell>
        </TableRow>
    );
}

export const StatusChip = ({ map }: { map: MapPlayed }) => {
    const t = useTranslations('maps.table');
    const cooldownText = useMapCooldownText();
    if (!map.enabled) return (
        <Badge variant="destructive" className="gap-1">
            <Ban className="h-3 w-3" />
            {t('disabled')}
        </Badge>
    );
    const blockers = mapBlockers(map.map_left, map.cooldown, map.nom_opens_at);
    if (isBlocked(blockers)) {
        const details = cooldownText.details(blockers, map);
        const badge = (
            <Badge variant="outline" className="gap-1 border-amber-500 text-amber-600 dark:text-amber-500">
                <Clock className="h-3 w-3" />
                <span suppressHydrationWarning>{cooldownText.label(blockers)}</span>
            </Badge>
        );
        if (details.length === 0) return badge;
        return (
            <Tooltip>
                <TooltipTrigger asChild>
                    <span className="inline-flex cursor-help">{badge}</span>
                </TooltipTrigger>
                <TooltipContent suppressHydrationWarning>
                    {details.map(line => <div key={line}>{line}</div>)}
                </TooltipContent>
            </Tooltip>
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

/** Category chips plus the player limits that differ from the server's. */
export function MapChips({ map, server }: { map: MapPlayed, server: Server }) {
    const t = useTranslations('maps.table');
    return <>
        <MapCategoryChips map={map} />
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
    </>
}

function MapRow({ server, map, favorites, toggleFavorite, user, getSubscriptionType, onNotificationChange }: {
    server: Server;
    map: MapPlayed;
    favorites: Set<string>;
    toggleFavorite: (mapName: string) => void;
    user: SteamProfile | null;
    getSubscriptionType: (mapName: string, serverId: string) => 'server' | 'all' | null;
    onNotificationChange: () => void;
}) {
    const locale = useLocale();
    const toDayjs = useLocalDayjs();
    const { data: mapImage } = useMapImage(map.map, server.id, 'small')

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
                                unoptimized
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
                            <MapChips map={map} server={server} />
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
                <span className="text-sm text-muted-foreground" suppressHydrationWarning>
                    {toDayjs(map.last_played).fromNow()}
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
                <FavoriteButton mapName={map.map} favorites={favorites} toggleFavorite={toggleFavorite} />
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
    const totalMaps = mapsData?.total_maps || 0;

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
                    {loading && range(MAPS_PAGE_SIZE).map(i =>
                        <MapsRowSkeleton key={i} index={i} showNotify={!!user} />
                    )}
                </TableBody>
            </Table>

            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <p className="text-sm text-muted-foreground">
                    {t('showing', {
                        start: page * MAPS_PAGE_SIZE + 1,
                        end: Math.min((page + 1) * MAPS_PAGE_SIZE, totalMaps),
                        total: totalMaps,
                    })}
                </p>
                <PaginationPage
                    totalPages={Math.ceil(totalMaps / MAPS_PAGE_SIZE)}
                    page={page}
                    setPage={(pageNum) => handleChangePage(null, pageNum)}
                />
            </div>
        </div>
    );
}
