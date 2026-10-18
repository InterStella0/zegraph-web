'use client'
import {ReactNode} from 'react';
import {useLocale, useTranslations} from 'next-intl';
import {secondsToHours} from "utils/generalUtils";
import {Skeleton} from "components/ui/skeleton";
import PaginationPage from "components/ui/PaginationPage.tsx";
import {HoverPrefetchLink} from "components/ui/HoverPrefetchLink.tsx";
import {GlobalMapPaginated, GlobalMapPlayed} from "types/maps.ts";
import GlobalMapStatusChip from "./GlobalMapStatusChip";
import CommunityAvatarStack from "./CommunityAvatarStack";
import {FavoriteButton, GlobalMapChips, globalMapImage, LastPlayed} from "./GlobalMapsTable";
import {cn} from "components/lib/utils";
import {GLOBAL_MAPS_PAGE_SIZE} from "./constants";

function GlobalMapCardSkeleton({ index }: { index: number }) {
    return (
        <div className="border border-border rounded-lg bg-card p-4">
            <div className="flex justify-between items-start mb-4">
                <div className="flex-1 mr-4">
                    <Skeleton className="h-4 mb-2" style={{width: `${7 + (index * 5) % 5}rem`}}/>
                    <div className="flex gap-1 mb-2">
                        <Skeleton className="h-5 w-10 rounded-full"/>
                        <Skeleton className="h-5 w-14 rounded-full"/>
                    </div>
                    <Skeleton className="h-5 w-24 rounded-full"/>
                </div>
                <Skeleton className="size-9 -mt-1 rounded-md"/>
            </div>
            <Skeleton className="w-full h-30 rounded-lg mb-4"/>
            <div className="grid grid-cols-2 gap-2">
                {Array.from({length: 4}).map((_, i) => (
                    <Skeleton key={i} className={`h-14 rounded${i === 0 ? ' col-span-full' : ''}`}/>
                ))}
            </div>
        </div>
    );
}

function Stat({ value, label, className = '' }: { value: ReactNode, label: string, className?: string }) {
    return (
        <div className={`text-center p-2 bg-muted/50 rounded ${className}`}>
            <p className="text-xl font-bold text-primary">{value}</p>
            <span className="text-xs text-muted-foreground font-medium">{label}</span>
        </div>
    );
}

function GlobalMapCard({ map, favorites, toggleFavorite }: {
    map: GlobalMapPlayed, favorites: Set<string>, toggleFavorite: (mapName: string) => void,
}) {
    const t = useTranslations('maps.table');
    const locale = useLocale();
    const image = globalMapImage(map, 'large');
    const inRotation = map.servers.some(server => server.enabled && !server.removed);

    return (
        <div className="border border-border rounded-lg bg-card p-4" style={{opacity: inRotation ? 1 : 0.6}}>
            <div className="flex justify-between items-start mb-4">
                <div className="flex-1 min-w-0 mr-4">
                    <HoverPrefetchLink
                        href={`/maps/${map.map}`}
                        className="block font-bold text-base leading-tight mb-2 truncate hover:text-primary transition-colors"
                    >
                        {map.map}
                    </HoverPrefetchLink>
                    <div className="mb-2">
                        <GlobalMapChips map={map}/>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <GlobalMapStatusChip map={map}/>
                        <CommunityAvatarStack servers={map.servers}/>
                    </div>
                </div>
                <FavoriteButton mapName={map.map} favorites={favorites} toggleFavorite={toggleFavorite} className="-mt-1"/>
            </div>

            <div className="rounded-lg overflow-hidden mb-4 h-30">
                {image ? (
                    <img src={image} alt={map.map} className="w-full h-30 object-cover"/>
                ) : (
                    <div className="w-full h-30 bg-muted"/>
                )}
            </div>

            <div className="grid grid-cols-2 gap-2">
                <Stat className="col-span-full" value={secondsToHours(map.total_cum_time, locale)} label={t('cumulativeHours')}/>
                <Stat value={map.unique_players.toLocaleString(locale)} label={t('players')}/>
                <Stat value={map.total_sessions.toLocaleString(locale)} label={t('sessions')}/>
                <Stat className="col-span-full" value={<LastPlayed map={map} short/>} label={t('lastPlayed')}/>
            </div>
        </div>
    );
}

export default function GlobalMapsMobileView({ mapsData, page, setPage, favorites, toggleFavorite, loading }: {
    mapsData: GlobalMapPaginated | null,
    page: number,
    setPage: (page: number) => void,
    favorites: Set<string>,
    toggleFavorite: (mapName: string) => void,
    loading: boolean,
}) {
    const tGlobal = useTranslations('maps.global');
    const total = mapsData?.total_maps || 0;
    const totalPages = Math.ceil(total / GLOBAL_MAPS_PAGE_SIZE);

    return (
        <>
            <div aria-busy={loading} className={cn("space-y-4 transition-opacity", loading && mapsData && "opacity-50")}>
                {mapsData?.maps?.map(map => (
                    <GlobalMapCard key={map.map} map={map} favorites={favorites} toggleFavorite={toggleFavorite}/>
                ))}
                {!mapsData && Array.from({length: GLOBAL_MAPS_PAGE_SIZE}).map((_, index) =>
                    <GlobalMapCardSkeleton key={index} index={index}/>
                )}
                {!loading && total === 0 && (
                    <p className="p-8 text-center text-muted-foreground">{tGlobal('noMapsFound')}</p>
                )}
            </div>

            <div className="flex justify-center mt-6 mb-4">
                <PaginationPage totalPages={totalPages} page={page} setPage={setPage}/>
            </div>
        </>
    );
}
