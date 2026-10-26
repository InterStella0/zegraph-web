'use client'
import MapsSearchControls, {MAP_SUGGEST, MapSuggestion, SortByIndex} from "components/maps/MapsSearchControls.tsx";
import {useSuggestSearch} from "components/ui/SuggestSearch";
import MapsFilterTabs, {FILTER_MODES, FilterTypes} from "components/maps/MapsFilterTab.tsx";
import MapsTable from "components/maps/MapsTable";
import MapsMobileView from "components/maps/MapsMobileView";
import {useFavoriteToggle} from "components/maps/FavoriteButton";
import {use, useState} from "react";
import {fetchApiServerUrl, fetchServerUrl} from "utils/generalUtils";
import { sendJson } from 'lib/sendJson';
import {MapPlayedPaginated, ServerMap} from "types/maps.ts";
import {ServerSlugPromise} from "../util.ts";
import {SteamProfile} from "types/steam";
import {useMapNotifications} from "lib/hooks/useMapNotifications";
import {useResource} from "lib/hooks/useResource";

function favoritesOf(data: MapPlayedPaginated | null): Set<string> {
    return new Set(data?.maps.filter(map => map.is_favorite).map(map => map.map) ?? []);
}

export default function MapsSearchIndex({ serverPromise, userPromise, initialDataPromise, idle = false }: {
    serverPromise: ServerSlugPromise,
    userPromise: Promise<SteamProfile | null>,
    initialDataPromise?: Promise<MapPlayedPaginated | null>,
    idle?: boolean,
}) {
    const server = use(serverPromise)
    const user = use(userPromise)
    const initialData = initialDataPromise ? use(initialDataPromise) : null
    const server_id = server.id;
    const { getSubscriptionType, refresh: refreshNotifications } = useMapNotifications(!!user);
    const [sortBy, setSortBy] = useState<SortByIndex>('LastPlayed');
    const [filterTab, setFilterTab] = useState<FilterTypes>('all');
    const [favorites, setFavorites] = useState<Set<string>>(() => user ? favoritesOf(initialData) : new Set());
    const [page, setPage] = useState<number>(0);

    const search = useSuggestSearch<MapSuggestion>({
        ...MAP_SUGGEST,
        fetch: (map, signal) => fetchServerUrl(server_id, '/maps/autocomplete', { params: { map }, signal })
            .then((data: ServerMap[]) => data.slice(0, 10)),
        onCommit: () => setPage(0),
    });
    const searchTerm = search.term;

    const { data: mapsData, loading } = useResource<MapPlayedPaginated>(signal => {
        if (!server_id || idle) return null;
        const filter = FILTER_MODES[filterTab];
        const params = {
            page,
            sorted_by: sortBy,
            ...(searchTerm && { search_map: searchTerm }),
            ...(filter && { filter }),
        };
        return fetchApiServerUrl(server_id, '/maps/last/sessions', { params, signal })
            .then((data: MapPlayedPaginated) => {
                if (user && data?.maps) setFavorites(favoritesOf(data));
                return data;
            });
    }, [server_id, page, sortBy, searchTerm, filterTab, user], { initial: initialData ?? undefined, keepData: true });

    const {toggleFavorite, loginDialog} = useFavoriteToggle(!!user, favorites, (mapName, favorite) => setFavorites(prev => {
        const next = new Set(prev);
        if (favorite) next.add(mapName);
        else next.delete(mapName);
        return next;
    }), (mapName, favorite) => favorite
        ? sendJson(`/servers/${server_id}/maps/set-favorite`, 'POST', { map_name: mapName })
        : fetchApiServerUrl(server_id, `/maps/${encodeURIComponent(mapName)}/unset-favorite`, { method: 'POST' }));

    return <>
        <MapsSearchControls
            search={search}
            setPage={setPage}
            sortBy={sortBy}
            setSortBy={setSortBy}
        />

        <MapsFilterTabs
            filterTab={filterTab}
            setFilterTab={setFilterTab}
            setPage={setPage}
        />

        <div className="hidden md:block">
            <MapsTable
                server={server}
                mapsData={mapsData}
                page={page}
                favorites={favorites}
                toggleFavorite={toggleFavorite}
                handleChangePage={(_event, newPage) => setPage(newPage)}
                loading={loading}
                user={user}
                getSubscriptionType={getSubscriptionType}
                onNotificationChange={refreshNotifications}
            />
        </div>

        <div className="block md:hidden">
            <MapsMobileView
                server={server}
                mapsData={mapsData}
                favorites={favorites}
                toggleFavorite={toggleFavorite}
                page={page}
                setPage={setPage}
                loading={loading}
            />
        </div>

        {loginDialog}
    </>
}
