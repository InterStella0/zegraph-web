use chrono::{DateTime, Utc};
use poem_openapi::{Enum, Object};
use serde::{Deserialize, Serialize};

/// A player's rank on a single map, by playtime.
#[derive(Object)]
pub struct MapRank{
    pub rank: i64,
    pub map: String,
    pub total_playtime: f64
}

/// Full metadata for one map on one server.
#[derive(Object)]
pub struct MapInfo{
    pub name: String,
    /// When this map was first ever played on this server.
    pub first_occurrence: DateTime<Utc>,
    /// When this map was permanently removed from rotation, if it was.
    pub cleared_at: Option<DateTime<Utc>>,
    pub is_tryhard: bool,
    pub is_casual: bool,
    pub has_lasers: bool,
    /// When this map's nomination cooldown expires, if one is active.
    pub current_cooldown: Option<DateTime<Utc>>,
    /// Whether a cooldown is queued to start once the map is next played.
    pub pending_cooldown: bool,
    /// Remaining map-count-based cooldown, if `current_cooldown` is count-based rather than
    /// time-based.
    pub map_left: Option<i32>,
    pub map_left_last_update: Option<DateTime<Utc>>,
    /// Whether nominations for this map are disabled.
    pub no_noms: bool,
    /// Whether the map is currently allowed in rotation at all.
    pub enabled: bool,
    pub min_players: i16,
    pub max_players: i16,
    /// Steam Workshop ID for this map, if sourced from the Workshop.
    pub workshop_id: i64,
    pub creators: Option<String>,
    pub file_bytes: Option<i64>,
    /// Whether this map has been permanently deleted (see `AdminMapsApi::delete_map`).
    pub removed: bool,
}

/// One bucket of a map's session-length histogram, e.g. `"10-20 min"`.
#[derive(Object)]
pub struct MapSessionDistribution{
    pub session_range: String,
    pub session_count: i64,
}

/// A single match (round) result within a map session.
#[derive(Object)]
pub struct MapSessionMatch{
    /// Unique ID of the map session this match belongs to.
    pub time_id: i32,
    pub server_id: String,
    pub zombie_score: i16,
    pub human_score: i16,
    pub occurred_at: DateTime<Utc>
}

/// Average occurrence count of a tracked in-game event type, on a map.
#[derive(Object)]
pub struct MapEventAverage{
    pub event_name: String,
    pub average: f64,
}

/// Total playtime spent in one geographic region, on a map.
#[derive(Object)]
pub struct MapRegion {
    pub region_name: String,
    pub total_play_duration: f64
}

/// A map's regional playtime breakdown for a single day.
#[derive(Object)]
pub struct DailyMapRegion{
    pub date: DateTime<Utc>,
    pub regions: Vec<MapRegion>
}

/// A time window during which a geographic region was active on a map (used for heat-map charts).
#[derive(Object)]
pub struct Region{
    pub region_name: String,
    pub region_id: i64,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
}

/// A map's listing entry, as shown in a server's map table.
#[derive(Object)]
pub struct MapPlayed{
    pub map: String,
    pub first_occurrence: DateTime<Utc>,
    /// When this map's nomination cooldown expires, if one is active.
    pub cooldown: Option<DateTime<Utc>>,
    pub pending_cooldown: bool,
    pub map_left: Option<i32>,
    pub map_left_last_update: Option<DateTime<Utc>>,
    pub enabled: bool,
    pub is_tryhard: Option<bool>,
    pub is_casual: Option<bool>,
    pub has_lasers: Option<bool>,
    /// Whether the requesting user has favorited this map (`None` if not signed in).
    pub is_favorite: Option<bool>,
    pub cleared_at: Option<DateTime<Utc>>,
    pub total_time: f64,
    pub total_sessions: i32,
    pub last_played: Option<DateTime<Utc>>,
    pub last_played_ended: Option<DateTime<Utc>>,
    /// ID of the map's most recent play session.
    pub last_session_id: i32,
    pub unique_players: i32,
    /// Sum of every player's individual playtime on this map (player-hours, not wall-clock time).
    pub total_cum_time: f64,
    pub removed: bool,
    pub no_noms: bool,
    pub min_players: Option<i16>,
    pub max_players: Option<i16>,
}

/// 3D model resolution tier.
#[derive(Enum, Serialize, Deserialize, Clone, Copy)]
pub enum ResType {
    #[oai(rename = "low")]
    Low,
    #[oai(rename = "high")]
    High,
}

impl ResType {
    pub fn as_str(&self) -> &'static str {
        match self {
            ResType::Low => "low",
            ResType::High => "high",
        }
    }

    pub fn parse(s: &str) -> Option<ResType> {
        match s {
            "low" => Some(ResType::Low),
            "high" => Some(ResType::High),
            _ => None,
        }
    }
}

/// An uploaded 3D model for a map, at one resolution tier.
#[derive(Object, Serialize)]
pub struct Map3DModel {
    pub id: i32,
    pub map_name: String,
    pub res_type: String,
    pub credit: Option<String>,
    /// URL to fetch the model file from.
    pub link_path: String,
    pub uploaded_by: Option<i64>,
    pub uploader_name: Option<String>,
    pub file_size: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// A map's uploaded 3D models, by resolution tier.
#[derive(Object, Serialize)]
pub struct MapWithModels {
    pub map_name: String,
    pub low_res_model: Option<Map3DModel>,
    pub high_res_model: Option<Map3DModel>,
}

/// A page of a server's map listing.
#[derive(Object)]
pub struct MapPlayedPaginated{
    pub total_maps: i32,
    pub maps: Vec<MapPlayed>
}

/// Aggregate performance metrics for a map.
#[derive(Object)]
pub struct MapAnalyze{
    pub map: String,
    pub unique_players: i64,
    /// Sum of every player's individual playtime on this map (player-hours, not wall-clock time).
    pub cum_player_hours: f64,
    pub total_playtime: f64,
    pub total_sessions: i64,
    /// Average time a player spends on the map before leaving.
    pub avg_playtime_before_quitting: f64,
    /// Fraction of players who leave partway through a session on this map.
    pub dropoff_rate: f64,
    pub last_played: DateTime<Utc>,
    pub last_played_ended: Option<DateTime<Utc>>,
    pub avg_players_per_session: f64,
}


/// A music track associated with a map.
#[derive(Object)]
pub struct ServerMapMusic{
    pub id: String,
    pub name: String,
    pub duration: f64,
    pub youtube_music: Option<String>,
    pub source: String,
    pub tags: Vec<String>,
    /// Other maps that also use this same track.
    pub other_maps: Vec<String>,
    /// User ID who last set/credited the YouTube link, if any.
    pub yt_source: Option<String>,
    pub yt_source_name: Option<String>,
}


/// A map identified on a server.
#[derive(Object)]
pub struct ServerMap{
    pub map: String,
    pub server_id: String,
}

/// Time spent by one player-type category (e.g. casual, tryhard) on a map.
#[derive(Object)]
pub struct MapPlayerTypeTime{
    pub category: String,
    pub time_spent: f64,
}
