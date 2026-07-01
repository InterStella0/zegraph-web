// Types for the redesigned landing page (`/`).

// Response shape for `GET /communities/:community_id/unique_players?time_type=...`
// (backend implemented by user). Matches the existing `ServerCountData` shape used by
// the server dashboard graph.
export type CommunityCountData = {
    bucket_time: string, // ISO8601 UTC
    player_count: number,
}

// Granularity toggle for the population chart / sparklines.
export type PopulationTimeType = "TenMinutes" | "OneHour" | "OneDay"

// Response shape for the new aggregate geo endpoint (backend implemented by user),
// e.g. `GET /radars/global/live_statistics`. Aggregated across all servers, with a
// lat/lng per region so the frontend can place bubbles on the world map.
export type RegionGeoStat = {
    name: string,   // e.g. "W. Europe", "N. America"
    count: number,  // online players from that region
    lat: number,
    lng: number,
}

export type GlobalGeoStatistics = {
    total_online: number,
    country_count: number,
    regions: RegionGeoStat[],
}
