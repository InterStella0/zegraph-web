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
