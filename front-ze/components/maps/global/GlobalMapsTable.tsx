'use client'
import Image from "next/image";
import {useLocale, useTranslations} from 'next-intl';
import {range, secondsToHours, withImageDomain} from "utils/generalUtils";
import {useLocalDayjs} from "lib/hooks/useLocalDayjs";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "components/ui/table";
import {Badge} from "components/ui/badge";
import {Skeleton, varyWidth} from "components/ui/skeleton";
import PaginationPage from "components/ui/PaginationPage.tsx";
import {MapCategoryChips} from "components/ui/CategoryChip.tsx";
import {FavoriteButton} from "../FavoriteButton";
import {GAME_META} from "components/ui/ServerIndicator";
import {HoverPrefetchLink} from "components/ui/HoverPrefetchLink.tsx";
import {GlobalMapPaginated, GlobalMapPlayed} from "types/maps.ts";
import GlobalMapStatusChip from "./GlobalMapStatusChip";
import CommunityAvatarStack from "./CommunityAvatarStack";
import {cn} from "components/lib/utils";
import {GLOBAL_MAPS_PAGE_SIZE} from "./constants";

export type GlobalMapsListProps = {
    mapsData: GlobalMapPaginated | null,
    page: number,
    setPage: (page: number) => void,
    favorites: Set<string>,
    toggleFavorite: (mapName: string) => void,
    loading: boolean,
};

export function globalMapImage(map: GlobalMapPlayed, size: 'small' | 'medium' | 'large' | 'extra_large'): string | null {
    return map.image ? withImageDomain({...map.image})[size] : null;
}

/** Maps out of rotation on every server are dimmed. */
export const rotationStyle = (map: GlobalMapPlayed) =>
    ({opacity: map.servers.some(server => server.enabled && !server.removed) ? 1 : 0.6});

export function GameBadges({ games, className }: { games: string[], className?: string }) {
    return games.map(game => {
        const meta = GAME_META[game];
        return meta && (
            <Badge key={game} variant="outline" className={cn(className, "text-xs", meta.className)}>
                {meta.label}
            </Badge>
        );
    });
}

export function GlobalMapChips({ map }: { map: GlobalMapPlayed }) {
    return (
        <div className="flex gap-1 flex-wrap">
            <GameBadges games={map.games}/>
            <MapCategoryChips map={map}/>
        </div>
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
                        <Skeleton className="h-3.5" style={varyWidth(index, 7, 6, 5)}/>
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

    return (
        <TableRow className="transition-opacity" style={rotationStyle(map)}>
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
                            <HoverPrefetchLink
                                href={`/maps/${map.map}`}
                                className="text-sm font-medium truncate block hover:text-primary transition-colors"
                            >
                                {map.map}
                            </HoverPrefetchLink>
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

export default function GlobalMapsTable({ mapsData, page, setPage, favorites, toggleFavorite, loading }: GlobalMapsListProps) {
    const t = useTranslations('maps.table');
    const tGlobal = useTranslations('maps.global');
    const total = mapsData?.total_maps || 0;
    const startItem = total === 0 ? 0 : page * GLOBAL_MAPS_PAGE_SIZE + 1;
    const endItem = Math.min((page + 1) * GLOBAL_MAPS_PAGE_SIZE, total);
    const columns: [string, string?][] = [
        [t('map')], [tGlobal('communities')], [t('status')], [t('cumulativeHours'), 'text-right'],
        [t('players'), 'text-right'], [t('sessions'), 'text-right'], [t('lastPlayed'), 'text-center'],
    ];

    return (
        <div className="border border-border rounded-lg bg-card overflow-hidden">
            <Table>
                <TableHeader>
                    <TableRow>
                        {columns.map(([label, align]) => (
                            <TableHead key={label} className={cn("font-bold", align)}>{label}</TableHead>
                        ))}
                        <TableHead/>
                    </TableRow>
                </TableHeader>
                <TableBody aria-busy={loading} className={cn("transition-opacity", loading && mapsData && "opacity-50")}>
                    {mapsData?.maps?.map(map => (
                        <GlobalMapRow key={map.map} map={map} favorites={favorites} toggleFavorite={toggleFavorite}/>
                    ))}
                    {!mapsData && range(GLOBAL_MAPS_PAGE_SIZE).map(i => <GlobalMapRowSkeleton key={i} index={i}/>)}
                </TableBody>
            </Table>
            {!loading && total === 0 && (
                <p className="p-8 text-center text-muted-foreground">{tGlobal('noMapsFound')}</p>
            )}

            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <p className="text-sm text-muted-foreground">
                    {t('showing', {start: startItem, end: endItem, total})}
                </p>
                <PaginationPage totalPages={Math.ceil(total / GLOBAL_MAPS_PAGE_SIZE)} page={page} setPage={setPage}/>
            </div>
        </div>
    );
}
