import type { Feature, Geometry } from 'geojson';

export type CountryPlayer = {
    id: string,
    name: string,
    total_playtime: number,
    total_player_count: number,
    session_count: number,
    is_anonymous: boolean,
}

export type CountryPlayers = {
    geojson: string,
    count: number,
    name: string,
    code: string,
    players: CountryPlayer[],
}

export type CountryProperties = {
    name: string,
    code: string,
}

// Assembled client side in PlayerMapControl from the geojson string of CountryPlayers.
export type CountryFeature = Feature<Geometry, CountryProperties>
