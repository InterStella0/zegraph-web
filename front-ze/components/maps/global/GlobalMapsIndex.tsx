'use client'
import {use, useEffect, useMemo, useReducer, useState} from 'react';
import {useTranslations} from 'next-intl';
import {Map as MapIcon} from 'lucide-react';
import {fetchApiUrl, fetchUrl} from "utils/generalUtils";
import {useMediaQuery} from "lib/hooks/useMediaQuery";
import {GlobalMapPaginated} from "types/maps.ts";
import {SteamProfile} from "types/steam";
import {Skeleton} from "components/ui/skeleton";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "components/ui/select";
import {GAME_META} from "components/ui/ServerIndicator";
import MapsSearchControls, {MAP_SUGGEST, MapSuggestion} from "components/maps/MapsSearchControls.tsx";
import {useSuggestSearch} from "components/ui/SuggestSearch";
import MapsFilterTabs, {FILTER_MODES, FilterTypes} from "components/maps/MapsFilterTab.tsx";
import {withErrorCatch} from "components/common/withErrorCatch";
import {SortByIndex} from "components/maps/MapsSearchControls";
import GlobalMapsTable from "./GlobalMapsTable";
import {useFavoriteToggle} from "../FavoriteButton";
import GlobalMapsMobileView from "./GlobalMapsMobileView";
import {GLOBAL_MAPS_DEFAULT_SORT, GLOBAL_MAPS_PAGE_SIZE} from "./constants";

const GLOBAL_TABS: FilterTypes[] = ['all', 'casual', 'tryhard', 'lasers', 'playing', 'favorites'];
const GLOBAL_SORT_OPTIONS: SortByIndex[] = ['HighestCumHour', 'UniquePlayers', 'FrequentlyPlayed', 'LastPlayed'];
const ALL_GAMES = 'all';
const SEARCH_DEBOUNCE_MS = 600;
const PAGE_CACHE_TTL_MS = 60_000;

const pageCache = new Map<string, {data: GlobalMapPaginated, at: number}>();
const pageRequests = new Map<string, Promise<GlobalMapPaginated>>();
const favoriteOverrides = new Map<string, boolean>();
let favoritesVersion = 0;

function cachedPage(key: string): GlobalMapPaginated | undefined {
    const entry = pageCache.get(key);
    return entry && Date.now() - entry.at < PAGE_CACHE_TTL_MS ? entry.data : undefined;
}

function loadPage(key: string): Promise<GlobalMapPaginated> {
    const cached = cachedPage(key);
    if (cached) return Promise.resolve(cached);
    let request = pageRequests.get(key);
    if (!request) {
        const params = JSON.parse(key);
        const version = favoritesVersion;
        request = fetchApiUrl('/maps', {params})
            .then((data: GlobalMapPaginated) => {
                if (params.filter !== 'Favorite' || version === favoritesVersion)
                    pageCache.set(key, {data, at: Date.now()});
                return data;
            })
            .finally(() => pageRequests.delete(key));
        pageRequests.set(key, request);
    }
    return request;
}

function pageKey(page: number, sortBy: SortByIndex, searchTerm: string, filterMode: string | null, game: string) {
    return JSON.stringify({
        page,
        sorted_by: sortBy,
        ...(searchTerm && {search_map: searchTerm}),
        ...(filterMode && {filter: filterMode}),
        ...(game !== ALL_GAMES && {game}),
    });
}

function recordFavorite(mapName: string, isFavorite: boolean) {
    favoriteOverrides.set(mapName, isFavorite);
    favoritesVersion++;
    for (const key of pageCache.keys()) {
        if (JSON.parse(key).filter === 'Favorite') pageCache.delete(key);
    }
}

function favoritesOf(data: GlobalMapPaginated | null): Set<string> {
    return new Set(data?.maps
        .filter(map => favoriteOverrides.get(map.map) ?? map.is_favorite)
        .map(map => map.map) ?? []);
}

function GlobalMapsHeader({ total }: { total: number | null }) {
    const t = useTranslations('maps.global');
    return (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-4 px-3 sm:px-0">
            <MapIcon className="w-5 h-5 text-primary shrink-0"/>
            <h1 className="text-xl font-semibold">{t('title')}</h1>
            {total == null ? (
                <Skeleton className="h-4 w-64 max-w-full basis-full sm:basis-auto"/>
            ) : (
                <p className="text-sm text-muted-foreground min-w-0 basis-full sm:basis-auto">{t('subtitle', {count: total})}</p>
            )}
        </div>
    );
}

export function GlobalMapsIndexLoading() {
    return (
        <>
            <GlobalMapsHeader total={null}/>
            <Skeleton className="h-[5.5rem] rounded-lg mb-6"/>
            <Skeleton className="h-12 rounded-lg mb-6"/>
            <Skeleton className="h-[40rem] rounded-lg"/>
        </>
    );
}

function GlobalMapsIndexDisplay({ initialDataPromise, userPromise }: {
    initialDataPromise: Promise<GlobalMapPaginated>,
    userPromise: Promise<SteamProfile | null>,
}) {
    const t = useTranslations('maps.global');
    const initialData = use(initialDataPromise);
    const user = use(userPromise);

    const [sortBy, setSortBy] = useState<SortByIndex>(GLOBAL_MAPS_DEFAULT_SORT);
    const [filterTab, setFilterTab] = useState<FilterTypes>('all');
    const [game, setGame] = useState<string>(ALL_GAMES);
    const [page, setPage] = useState<number>(0);
    const [favoritesTick, bumpFavorites] = useReducer((n: number) => n + 1, 0);
    const isDesktop = useMediaQuery('(min-width: 48rem)');

    const search = useSuggestSearch<MapSuggestion>({
        ...MAP_SUGGEST,
        fetch: (map, signal) => fetchUrl('/maps/autocomplete', {params: {map}, signal})
            .then((data: MapSuggestion[]) => data.slice(0, 10)),
        commitDelay: SEARCH_DEBOUNCE_MS,
        onCommit: () => setPage(0),
    });
    const searchTerm = search.term;

    const filterMode = FILTER_MODES[filterTab] ?? null;
    const key = pageKey(page, sortBy, searchTerm, filterMode, game);
    const [initialKey] = useState(key);
    const [shown, setShown] = useState<{key: string, data: GlobalMapPaginated}>({key: initialKey, data: initialData});
    const [failedKey, setFailedKey] = useState<string | null>(null);
    const cached = cachedPage(key);
    const data = cached ?? shown.data;
    const loading = !cached && shown.key !== key && failedKey !== key;
    const error = failedKey === key;
    const totalPages = Math.ceil((data?.total_maps ?? 0) / GLOBAL_MAPS_PAGE_SIZE);

    useEffect(() => {
        pageCache.set(initialKey, {data: initialData, at: Date.now()});
    }, [initialKey, initialData]);

    useEffect(() => {
        let cancelled = false;
        loadPage(key)
            .then(result => {
                if (cancelled) return;
                setShown({key, data: result});
                setFailedKey(null);
            })
            .catch(err => {
                if (cancelled) return;
                console.error('Error fetching global maps:', err);
                setFailedKey(key);
            });
        return () => {
            cancelled = true;
        };
    }, [key]);

    useEffect(() => {
        if (loading || page + 1 >= totalPages) return;
        const nextKey = pageKey(page + 1, sortBy, searchTerm, filterMode, game);
        loadPage(nextKey).catch(() => {});
    }, [loading, page, totalPages, sortBy, searchTerm, filterMode, game]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const favorites = useMemo(() => favoritesOf(data), [data, favoritesTick]);

    const {toggleFavorite, loginDialog} = useFavoriteToggle(!!user, favorites, (mapName, favorite) => {
        recordFavorite(mapName, favorite);
        bumpFavorites();
    });
    const listProps = {mapsData: data, page, setPage, favorites, toggleFavorite, loading};

    return (
        <>
            <GlobalMapsHeader total={initialData?.total_maps ?? 0}/>

            <MapsSearchControls
                search={search}
                setPage={setPage}
                sortBy={sortBy}
                setSortBy={setSortBy}
                sortOptions={GLOBAL_SORT_OPTIONS}
            >
                <Select
                    value={game}
                    onValueChange={(value: string) => {
                        setGame(value);
                        setPage(0);
                    }}
                >
                    <SelectTrigger className="w-full md:w-fit">
                        <SelectValue placeholder={t('allGames')}/>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={ALL_GAMES}>{t('allGames')}</SelectItem>
                        {Object.entries(GAME_META).map(([value, meta]) => (
                            <SelectItem key={value} value={value}>{meta.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </MapsSearchControls>

            <MapsFilterTabs filterTab={filterTab} setFilterTab={setFilterTab} setPage={setPage} tabs={GLOBAL_TABS}/>

            {error ? (
                <div className="border border-border rounded-lg bg-card p-8 text-center">
                    <p className="text-destructive">{t('loadError')}</p>
                </div>
            ) : (
                <>
                    {isDesktop !== false && <div className="hidden md:block"><GlobalMapsTable {...listProps}/></div>}
                    {isDesktop !== true && <div className="block md:hidden"><GlobalMapsMobileView {...listProps}/></div>}
                </>
            )}

            {loginDialog}
        </>
    );
}

export default withErrorCatch(GlobalMapsIndexDisplay, t => t('maps.global.loadError'))
