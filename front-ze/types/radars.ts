import type { Feature, Geometry } from 'geojson';

export type CountryPlayer = {
    id: string,
    name: string,
    total_playtime: number,
    total_player_count: number,
    session_count: number,
    is_anonymous: boolean,
    /** True when this player is anonymized for this community, even if you are allowed to see
     *  the real name (you are them, a superuser, or a community admin). Render the `(Hidden)`
     *  marker off this, not off `is_anonymous`. */
    hidden_from_others: boolean,
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
