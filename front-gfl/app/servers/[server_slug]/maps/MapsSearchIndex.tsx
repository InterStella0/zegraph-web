'use client'
import MapsSearchControls from "components/maps/MapsSearchControls.tsx";
import MapsFilterTabs, {FilterTypes} from "components/maps/MapsFilterTab.tsx";
import MapsTable from "components/maps/MapsTable";
import MapsMobileView from "components/maps/MapsMobileView";
import LoginDialog from "components/ui/LoginDialog.tsx";
import {use, useEffect, useState} from "react";
import {fetchApiServerUrl, fetchServerUrl} from "utils/generalUtils";
import {MapPlayedPaginated, ServerMap} from "types/maps.ts";
import {ServerSlugPromise} from "../util.ts";
import {SteamProfile} from "../../../../next-auth-steam/steam.ts";
import {useMapNotifications} from "lib/hooks/useMapNotifications";

import {useTranslations} from 'next-intl';

export type SortByIndex = "LastPlayed" |  "HighestCumHour" |  "UniquePlayers" |  "FrequentlyPlayed" |  "HighestHour"

export default function MapsSearchIndex({ serverPromise, userPromise }: { serverPromise: ServerSlugPromise, userPromise: Promise<SteamProfile | null> }) {
    const t = useTranslations('maps.searchIndex');
    const server = use(serverPromise)
    const user = use(userPromise)
    const server_id = server.id;
    const { getSubscriptionType, refresh: refreshNotifications } = useMapNotifications(!!user);
    const [mapsData, setMapsData] = useState<MapPlayedPaginated | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [autocompleteOptions, setAutocompleteOptions] = useState<ServerMap[]>([]);

    const [searchTerm, setSearchTerm] = useState<string>('');
    const [searchInput, setSearchInput] = useState<string>('');
    const [sortBy, setSortBy] = useState<SortByIndex>('LastPlayed');
    const [filterTab, setFilterTab] = useState<FilterTypes>('all');
    const [favorites, setFavorites] = useState<Set<string>>(new Set());
    const [page, setPage] = useState<number>(0);
    const [autocompleteLoading, setAutocompleteLoading] = useState<boolean>(false);
    const [loginDialogOpen, setLoginDialogOpen] = useState<boolean>(false);

    useEffect(() => {
        if (!searchInput.trim()) {
            setSearchTerm('');
            setPage(0);
            return;
        }

        const timer = setTimeout(() => {
            setSearchTerm(searchInput);
            setPage(0);
        }, 3000);

        return () => clearTimeout(timer);
    }, [searchInput]);

    useEffect(() => {
        if (!server_id || !searchInput.trim()) {
            setAutocompleteOptions([]);
            return;
        }

        const loadAutocomplete = async () => {
            try {
                setAutocompleteLoading(true);
                const data = await fetchServerUrl(server_id, '/maps/autocomplete', {
                    params: { map: searchInput.trim() }
                });
                setAutocompleteOptions(data.slice(0, 10));
            } catch (err) {
                console.error('Failed to load autocomplete:', err);
                setAutocompleteOptions([]);
            } finally {
                setAutocompleteLoading(false);
            }
        };

        const timer = setTimeout(loadAutocomplete, 300);
        return () => clearTimeout(timer);
    }, [server_id, searchInput]);

    useEffect(() => {
        if (!server_id) return;

        const loadMaps = async () => {
            try {
                setLoading(true);
                setError(null);

                const filterMode = getFilterMode(filterTab);
                const params = {
                    page: page,
                    sorted_by: sortBy,
                    ...(searchTerm && { search_map: searchTerm }),
                    ...(filterMode && { filter: filterMode })
                };

                const data: MapPlayedPaginated = await fetchApiServerUrl(server_id, '/maps/last/sessions', { params });
                setMapsData(data);

                if (user && data?.maps) {
                    const favoriteSet = new Set<string>();
                    data.maps.forEach(map => {
                        if (map.is_favorite) {
                            favoriteSet.add(map.map);
                        }
                    });
                    setFavorites(favoriteSet);
                }
            } catch (err) {
                setError(err.message || t('loadFailed'));
            } finally {
                setLoading(false);
            }
        };

        loadMaps().then(() => {}).catch(console.error);
    }, [server_id, page, sortBy, searchTerm, filterTab, user]);

    const getFilterMode = (tab: FilterTypes) => {
        switch (tab) {
            case 'casual': return 'Casual';
            case 'tryhard': return 'TryHard';
            case 'available': return 'Available';
            case 'favorites': return 'Favorite';
            case 'lasers': return 'HasLaser';
            default: return null;
        }
    }

    const toggleFavorite = async (mapName: string) => {
        if (!user) {
            setLoginDialogOpen(true);
            return;
        }

        const isFavorited = favorites.has(mapName);
        try {
            if (isFavorited) {
                await fetchApiServerUrl(server_id, `/maps/${encodeURIComponent(mapName)}/unset-favorite`, {
                    method: 'POST',
                });
                setFavorites(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(mapName);
                    return newSet;
                });
            } else {
                await fetchApiServerUrl(server_id, '/maps/set-favorite', {
                    method: 'POST',
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        map_name: mapName,
                    })
                })
                setFavorites(prev => new Set([...prev, mapName]));
            }
        } catch (err) {
            console.error('Failed to toggle favorite:', err);
        }
    }

    const handleChangePage = (event, newPage) => {
        setPage(newPage);
    }


    return <>
        <MapsSearchControls
            searchInput={searchInput}
            setSearchInput={setSearchInput}
            setSearchTerm={setSearchTerm}
            setPage={setPage}
            sortBy={sortBy}
            setSortBy={setSortBy}
            autocompleteOptions={autocompleteOptions}
            autocompleteLoading={autocompleteLoading}
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
                handleChangePage={handleChangePage}
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

        <LoginDialog
            open={loginDialogOpen}
            onClose={() => setLoginDialogOpen(false)}
        />
    </>
}