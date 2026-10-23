'use client'
import {secondsToHours, range} from "utils/generalUtils";
import {MapChips, MAPS_PAGE_SIZE, StatusChip} from "./MapsTable";
import {FavoriteButton} from "./FavoriteButton";
import {useMapImage} from "components/maps/useMapImage";
import {useLocalDayjs} from "lib/hooks/useLocalDayjs";
import {Dispatch, ReactNode} from "react";
import Link from "next/link";
import {Skeleton, SkeletonBadge, SkeletonText} from "components/ui/skeleton";
import PaginationPage from "components/ui/PaginationPage.tsx";
import {Server} from "types/community.ts";
import {MapPlayed, MapPlayedPaginated} from "types/maps.ts";
import {cn} from "components/lib/utils";
import {useTranslations, useLocale} from 'next-intl';

const STAT_LABELS = ['cumulativeHours', 'hours', 'players', 'sessions', 'lastPlayed'] as const

/** The stat tiles of a map card, in STAT_LABELS order; skeleton values when `values` is missing. */
function StatTiles({ values }: { values?: ReactNode[] }) {
    const t = useTranslations('maps.table');
    return (
        <div className="grid grid-cols-2 gap-2">
            {STAT_LABELS.map((label, i) => (
                <div key={label} className={cn("text-center p-2 bg-muted/50 rounded", i === 0 && "col-span-full")}>
                    {values ? (
                        <p className="text-xl font-bold text-primary" suppressHydrationWarning>
                            {values[i]}
                        </p>
                    ) : (
                        <div className="text-xl font-bold">
                            <SkeletonText className="h-5 w-16" />
                        </div>
                    )}
                    <span className="text-xs text-muted-foreground font-medium">
                        {t(label)}
                    </span>
                </div>
            ))}
        </div>
    );
}

const MapsMobileViewSkeleton = () => (
    <div className="border border-border rounded-lg bg-card p-4">
        <div className="flex justify-between items-start mb-4">
            <div className="flex-1 mr-4">
                <div className="font-bold text-base leading-tight mb-2">
                    <SkeletonText className="h-4 w-28" />
                </div>
                <div className="flex gap-1 flex-wrap mb-2">
                    <SkeletonBadge className="w-14" />
                </div>
                <SkeletonBadge className="w-16" />
            </div>
            <Skeleton className="size-9 -mt-1 rounded-md" />
        </div>
        <Skeleton className="w-full h-30 rounded-lg mb-4" />
        <StatTiles />
    </div>
);

function MapCardView({ server, map, favorites, toggleFavorite }: {
    server: Server, map: MapPlayed, favorites: Set<string>, toggleFavorite: (mapName: string) => void,
}){
    const locale = useLocale();
    const toDayjs = useLocalDayjs();
    const { data: mapImage } = useMapImage(map.map, server.id, 'large')

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
                        <MapChips map={map} server={server} />
                    </div>
                    <StatusChip map={map} />
                </div>
                <FavoriteButton mapName={map.map} favorites={favorites} toggleFavorite={toggleFavorite} className="-mt-1" />
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

            <StatTiles values={[
                secondsToHours(map.total_cum_time, locale),
                secondsToHours(map.total_time, locale),
                map.unique_players.toLocaleString(locale),
                map.total_sessions,
                toDayjs(map.last_played).fromNow(true),
            ]} />
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
                {loading && range(MAPS_PAGE_SIZE).map(index => <MapsMobileViewSkeleton key={index} />)}
            </div>

            <div className="flex justify-center mt-6 mb-4">
                <PaginationPage totalPages={Math.ceil((mapsData?.total_maps || 0) / MAPS_PAGE_SIZE)} page={page} setPage={setPage} />
            </div>
        </>
    );
}
