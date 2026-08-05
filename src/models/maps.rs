use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_macros::{auto_serde_with, DbInto};
use sqlx::postgres::types::PgInterval;
use time::OffsetDateTime;

use crate::core::utils::*;
use crate::global_serializer::*;
use crate::api_models::maps::*;
use crate::api_models::admins::*;
use crate::api_models::players::*;

#[auto_serde_with]
pub struct DbMapLastPlayed{
    pub last_played: Option<OffsetDateTime>,
}
#[derive(Serialize, Deserialize, Clone, DbInto)]
#[db_into(MapSessionDistribution)]
pub struct DbMapSessionDistribution{
    pub session_range: String,
    #[cast(i64)]
    pub session_count: i32,
}
#[derive(Clone, DbInto)]
#[auto_serde_with]
#[db_into(MapRegion)]
#[allow(dead_code)]
pub struct DbMapRegion {
    #[skip]
    pub map: Option<String>,
    #[default("Unknown Region".to_string())]
    pub region_name: Option<String>,
    pub total_play_duration: Option<PgInterval>
}
#[derive(Clone, DbInto)]
#[auto_serde_with]
#[db_into(MapRegionDate)]
pub struct DbMapRegionDate {
    pub date: Option<OffsetDateTime>,
    #[unwrap_default]
    pub region_name: Option<String>,
    pub total_play_duration: Option<PgInterval>
}

#[derive(Clone, DbInto)]
#[auto_serde_with]
#[db_into(PlayerRanks)]
#[extra(highest_map_rank = None)]
pub struct DbPlayerRank{
    #[unwrap_default]
    pub global_playtime: Option<i64>,
    #[rename(server_playtime)]
    #[unwrap_default]
    pub total_playtime: Option<i64>,
    #[unwrap_default]
    pub casual_playtime: Option<i64>,
    #[unwrap_default]
    pub tryhard_playtime: Option<i64>,
    #[unwrap_default]
    pub mixed_playtime: Option<i64>,
}
#[derive(Clone, DbInto)]
#[auto_serde_with]
#[db_into(MapRank)]
pub struct DbMapRank{
    #[unwrap_default]
    pub map: Option<String>,
    #[unwrap_default]
    pub rank: Option<i64>,
    pub total_playtime: Option<PgInterval>,
}

#[derive(DbInto)]
#[db_into(MapRegion)]
pub struct MapRegionDate{
    pub region_name: String,
    pub total_play_duration: f64,
    #[skip]
    pub date: Option<DateTime<Utc>>
}

#[derive(Serialize, Deserialize)]
pub struct DbMapIsPlaying{
    pub result: Option<bool>
}


#[derive(Clone, DbInto)]
#[auto_serde_with]
#[db_into(MapAnalyze)]
pub struct DbMapAnalyze{
    pub map: String,
    pub unique_players: i64,
    pub cum_player_hours: Option<PgInterval>,
    pub total_playtime: Option<PgInterval>,
    #[cast(i64)]
    pub total_sessions: i32,
    #[method(to_utc_time)]
    pub last_played: Option<OffsetDateTime>,
    pub last_played_ended: Option<OffsetDateTime>,
    pub avg_playtime_before_quitting: Option<PgInterval>,
    #[unwrap_default]
    pub dropoff_rate: Option<f64>,
    #[unwrap_default]
    pub avg_players_per_session: Option<f64>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct DbMapMeta{
    pub name: String,
    pub image_url: Option<String>,
    pub creators: Option<String>,
    pub workshop_id: i64,
    pub file_bytes: Option<i64>,
    pub is_tryhard: Option<bool>,
    pub is_casual: Option<bool>,
    pub has_lasers: Option<bool>,
    pub resolved_workshop_id: Option<i64>,
}
pub struct DbMapBriefInfo{
    pub name: String,
    pub is_tryhard: Option<bool>,
    pub is_casual: Option<bool>,
    #[allow(dead_code)]
    pub first_occurrence: OffsetDateTime,
}

#[derive(Clone, DbInto)]
#[auto_serde_with]
#[db_into(MapPlayerTypeTime)]
pub struct DbMapPlayerTypeTime{
    #[default("Unknown".into())]
    pub category: Option<String>,
    pub time_spent: Option<PgInterval>
}
#[derive(Clone, DbInto)]
#[auto_serde_with]
#[db_into(MapInfo)]
#[extra(creators = None, file_bytes = None)]
pub struct DbMapInfo{
    pub name: String,
    pub first_occurrence: OffsetDateTime,
    pub cleared_at: Option<OffsetDateTime>,
    #[unwrap_default]
    pub is_tryhard: Option<bool>,
    #[unwrap_default]
    pub is_casual: Option<bool>,
    #[unwrap_default]
    pub has_lasers: Option<bool>,
    pub current_cooldown: Option<OffsetDateTime>,
    #[unwrap_default]
    pub pending_cooldown: Option<bool>,
    pub map_left: Option<i32>,
    pub map_left_last_update: Option<OffsetDateTime>,
    pub no_noms: bool,
    #[default(0)]
    pub workshop_id: Option<i64>,
    #[skip]
    pub resolved_workshop_id: Option<i64>,
    pub enabled: bool,
    #[unwrap_default]
    pub min_players: Option<i16>,
    #[unwrap_default]
    pub max_players: Option<i16>,
    pub removed: bool,
}


#[derive(Serialize, Deserialize, DbInto)]
#[db_into(ServerMap)]
pub struct DbMap{
    pub server_id: String,
    pub map: String
}

#[derive(DbInto)]
#[auto_serde_with]
#[db_into(MapChangeSubscription)]
pub struct DbMapChangeSubscription {
    #[method(to_string)]
    pub id: uuid::Uuid,
    #[skip]
    pub user_id: i64,
    pub server_id: String,
    #[skip]
    pub subscription_id: uuid::Uuid,
    pub created_at: OffsetDateTime,
    pub triggered: bool,
    #[skip]
    pub triggered_at: Option<OffsetDateTime>,
}

#[derive(DbInto)]
#[auto_serde_with]
#[db_into(MapNotifySubscription)]
pub struct DbMapNotifySubscription {
    #[method(to_string)]
    pub id: uuid::Uuid,
    #[skip]
    pub user_id: i64,
    pub map_name: String,
    pub server_id: Option<String>,
    #[skip]
    pub subscription_id: uuid::Uuid,
    pub created_at: OffsetDateTime,
    pub triggered: bool,
    #[skip]
    pub triggered_at: Option<OffsetDateTime>,
}

#[derive(DbInto)]
#[auto_serde_with]
#[db_into(Map3DModel)]
#[extra(uploader_name = None)]
pub struct DbMap3DModel {
    pub id: i32,
    pub map_name: String,
    pub res_type: String,
    pub credit: Option<String>,
    pub link_path: String,
    pub uploaded_by: Option<i64>,
    pub file_size: i64,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
}
