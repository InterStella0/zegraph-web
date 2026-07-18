use chrono::{DateTime, Utc};
use poem_openapi::{Enum, Object};
use serde::{Deserialize, Serialize};

#[derive(Object)]
pub struct MapRank{
    pub rank: i64,
    pub map: String,
    pub total_playtime: f64
}

#[derive(Object)]
pub struct MapInfo{
    pub name: String,
    pub first_occurrence: DateTime<Utc>,
    pub cleared_at: Option<DateTime<Utc>>,
    pub is_tryhard: bool,
    pub is_casual: bool,
    pub has_lasers: bool,
    pub current_cooldown: Option<DateTime<Utc>>,
    pub pending_cooldown: bool,
    pub map_left: Option<i32>,
    pub map_left_last_update: Option<DateTime<Utc>>,
    pub no_noms: bool,
    pub enabled: bool,
    pub min_players: i16,
    pub max_players: i16,
    pub workshop_id: i64,
    pub creators: Option<String>,
    pub file_bytes: Option<i64>,
    pub removed: bool,
}

#[derive(Object)]
pub struct MapSessionDistribution{
    pub session_range: String,
    pub session_count: i64,
}

#[derive(Object)]
pub struct MapSessionMatch{
    pub time_id: i32,
    pub server_id: String,
    pub zombie_score: i16,
    pub human_score: i16,
    pub occurred_at: DateTime<Utc>
}

#[derive(Object)]
pub struct MapEventAverage{
    pub event_name: String,
    pub average: f64,
}

#[derive(Object)]
pub struct MapRegion {
    pub region_name: String,
    pub total_play_duration: f64
}

#[derive(Object)]
pub struct DailyMapRegion{
    pub date: DateTime<Utc>,
    pub regions: Vec<MapRegion>
}

#[derive(Object)]
pub struct Region{
    pub region_name: String,
    pub region_id: i64,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
}

#[derive(Object)]
pub struct MapPlayed{
    pub map: String,
    pub first_occurrence: DateTime<Utc>,
    pub cooldown: Option<DateTime<Utc>>,
    pub pending_cooldown: bool,
    pub map_left: Option<i32>,
    pub map_left_last_update: Option<DateTime<Utc>>,
    pub enabled: bool,
    pub is_tryhard: Option<bool>,
    pub is_casual: Option<bool>,
    pub has_lasers: Option<bool>,
    pub is_favorite: Option<bool>,
    pub cleared_at: Option<DateTime<Utc>>,
    pub total_time: f64,
    pub total_sessions: i32,
    pub last_played: Option<DateTime<Utc>>,
    pub last_played_ended: Option<DateTime<Utc>>,
    pub last_session_id: i32,
    pub unique_players: i32,
    pub total_cum_time: f64,
    pub removed: bool,
    pub no_noms: bool,
    pub min_players: Option<i16>,
    pub max_players: Option<i16>,
}

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

#[derive(Object, Serialize)]
pub struct Map3DModel {
    pub id: i32,
    pub map_name: String,
    pub res_type: String,
    pub credit: Option<String>,
    pub link_path: String,
    pub uploaded_by: Option<i64>,
    pub uploader_name: Option<String>,
    pub file_size: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Object, Serialize)]
pub struct MapWithModels {
    pub map_name: String,
    pub low_res_model: Option<Map3DModel>,
    pub high_res_model: Option<Map3DModel>,
}

#[derive(Object)]
pub struct MapPlayedPaginated{
    pub total_maps: i32,
    pub maps: Vec<MapPlayed>
}

#[derive(Object)]
pub struct MapAnalyze{
    pub map: String,
    pub unique_players: i64,
    pub cum_player_hours: f64,
    pub total_playtime: f64,
    pub total_sessions: i64,
    pub avg_playtime_before_quitting: f64,
    pub dropoff_rate: f64,
    pub last_played: DateTime<Utc>,
    pub last_played_ended: Option<DateTime<Utc>>,
    pub avg_players_per_session: f64,
}


#[derive(Object)]
pub struct ServerMapMusic{
    pub id: String,
    pub name: String,
    pub duration: f64,
    pub youtube_music: Option<String>,
    pub source: String,
    pub tags: Vec<String>,
    pub other_maps: Vec<String>,
    pub yt_source: Option<String>,
    pub yt_source_name: Option<String>,
}


#[derive(Object)]
pub struct ServerMap{
    pub map: String,
    pub server_id: String,
}

#[derive(Object)]
pub struct MapPlayerTypeTime{
    pub category: String,
    pub time_spent: f64,
}
