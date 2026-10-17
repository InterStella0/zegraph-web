'use client'
import {use, useEffect, useState} from 'react';
import {useTranslations} from 'next-intl';
import {Map as MapIcon} from 'lucide-react';
import {fetchApiUrl, fetchUrl} from "utils/generalUtils";
import {useResource} from "lib/hooks/useResource";
import {GlobalMapPaginated} from "types/maps.ts";
import {SteamProfile} from "types/steam";
import {Skeleton} from "components/ui/skeleton";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "components/ui/select";
import LoginDialog from "components/ui/LoginDialog.tsx";
import {GAME_META} from "components/ui/ServerIndicator";
import MapsSearchControls from "components/maps/MapsSearchControls.tsx";
import MapsFilterTabs, {FilterTypes} from "components/maps/MapsFilterTab.tsx";
import {withErrorCatch} from "components/common/withErrorCatch";
import {SortByIndex} from "../../../app/servers/[server_slug]/maps/MapsSearchIndex.tsx";
import GlobalMapsTable from "./GlobalMapsTable";
import GlobalMapsMobileView from "./GlobalMapsMobileView";
import {GLOBAL_MAPS_DEFAULT_SORT} from "./constants";

const GLOBAL_TABS: FilterTypes[] = ['all', 'casual', 'tryhard', 'lasers', 'playing', 'favorites'];
// Only metrics with a column in the global table; there is no plain "Hours" column.
const GLOBAL_SORT_OPTIONS: SortByIndex[] = ['HighestCumHour', 'UniquePlayers', 'FrequentlyPlayed', 'LastPlayed'];
const ALL_GAMES = 'all';
const SEARCH_DEBOUNCE_MS = 600;

function getFilterMode(tab: FilterTypes) {
    switch (tab) {
        case 'casual': return 'Casual';
        case 'tryhard': return 'TryHard';
        case 'lasers': return 'HasLaser';
        case 'playing': return 'Playing';
        case 'favorites': return 'Favorite';
        default: return null;
    }
}

function favoritesOf(data: GlobalMapPaginated | null): Set<string> {
    return new Set(data?.maps.filter(map => map.is_favorite).map(map => map.map) ?? []);
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

    const [searchInput, setSearchInput] = useState<string>('');
    const [searchTerm, setSearchTerm] = useState<string>('');
    const [sortBy, setSortBy] = useState<SortByIndex>(GLOBAL_MAPS_DEFAULT_SORT);
    const [filterTab, setFilterTab] = useState<FilterTypes>('all');
    const [game, setGame] = useState<string>(ALL_GAMES);
    const [page, setPage] = useState<number>(0);
    const [favorites, setFavorites] = useState<Set<string>>(() => favoritesOf(initialData));
    const [autocompleteOptions, setAutocompleteOptions] = useState<{map: string}[]>([]);
    const [autocompleteLoading, setAutocompleteLoading] = useState<boolean>(false);
    const [loginDialogOpen, setLoginDialogOpen] = useState<boolean>(false);

    useEffect(() => {
        const trimmed = searchInput.trim();
        const timer = setTimeout(() => {
            setSearchTerm(trimmed);
            setPage(0);
        }, trimmed ? SEARCH_DEBOUNCE_MS : 0);
        return () => clearTimeout(timer);
    }, [searchInput]);

    useEffect(() => {
        const trimmed = searchInput.trim();
        if (!trimmed) {
            setAutocompleteOptions([]);
            return;
        }
        const controller = new AbortController();
        const timer = setTimeout(() => {
            setAutocompleteLoading(true);
            fetchUrl('/maps/autocomplete', {params: {map: trimmed}, signal: controller.signal})
                .then((data: {map: string}[]) => setAutocompleteOptions(data.slice(0, 10)))
                .catch(err => {
                    if (!controller.signal.aborted) {
                        console.error('Failed to load autocomplete:', err);
                        setAutocompleteOptions([]);
                    }
                })
                .finally(() => {
                    if (!controller.signal.aborted) setAutocompleteLoading(false);
                });
        }, 300);
        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [searchInput]);

    const filterMode = getFilterMode(filterTab);
    const { data, loading, error } = useResource<GlobalMapPaginated>(signal => fetchApiUrl('/maps', {
        params: {
            page,
            sorted_by: sortBy,
            ...(searchTerm && {search_map: searchTerm}),
            ...(filterMode && {filter: filterMode}),
            ...(game !== ALL_GAMES && {game}),
        },
        signal,
    }), [page, sortBy, searchTerm, filterMode, game], {initial: initialData, errorLog: 'Error fetching global maps:'});

    useEffect(() => {
        if (data) setFavorites(favoritesOf(data));
    }, [data]);

    const toggleFavorite = async (mapName: string) => {
        if (!user) {
            setLoginDialogOpen(true);
            return;
        }
        const isFavorite = favorites.has(mapName);
        const action = isFavorite ? 'unset-favorite' : 'set-favorite';
        try {
            await fetchApiUrl(`/maps/${encodeURIComponent(mapName)}/${action}`, {method: 'POST'});
            setFavorites(prev => {
                const next = new Set(prev);
                if (isFavorite) next.delete(mapName);
                else next.add(mapName);
                return next;
            });
        } catch (err) {
            console.error('Failed to toggle favorite:', err);
        }
    };

    return (
        <>
            <GlobalMapsHeader total={initialData?.total_maps ?? 0}/>

            <MapsSearchControls
                searchInput={searchInput}
                setSearchInput={setSearchInput}
                setSearchTerm={setSearchTerm}
                setPage={setPage}
                sortBy={sortBy}
                setSortBy={setSortBy}
                autocompleteOptions={autocompleteOptions}
                autocompleteLoading={autocompleteLoading}
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
                    <div className="hidden md:block">
                        <GlobalMapsTable
                            mapsData={data}
                            page={page}
                            setPage={setPage}
                            favorites={favorites}
                            toggleFavorite={toggleFavorite}
                            loading={loading}
                        />
                    </div>
                    <div className="block md:hidden">
                        <GlobalMapsMobileView
                            mapsData={data}
                            page={page}
                            setPage={setPage}
                            favorites={favorites}
                            toggleFavorite={toggleFavorite}
                            loading={loading}
                        />
                    </div>
                </>
            )}

            <LoginDialog open={loginDialogOpen} onClose={() => setLoginDialogOpen(false)}/>
        </>
    );
}

export default withErrorCatch(GlobalMapsIndexDisplay, t => t('maps.global.loadError'))
