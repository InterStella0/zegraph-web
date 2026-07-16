use serde::{Deserialize, Serialize};
use serde_macros::{auto_serde_with, DbInto};
use sqlx::postgres::types::PgInterval;
use time::OffsetDateTime;
use crate::api_models::servers::*;
use crate::api_models::maps::*;
use crate::core::utils::*;
use crate::global_serializer::*;

#[derive(Serialize, Deserialize, Clone)]
#[allow(dead_code)]
pub struct DbServer{
    pub server_name: Option<String>,
    pub server_id: String,
    pub server_ip: Option<String>,
    pub server_port: Option<i32>,
    pub max_players: Option<i16>,
    pub server_fullname: Option<String>,
    pub readable_link: Option<String>,
    pub server_website: Option<String>,
    pub server_discord_link: Option<String>,
    pub server_source: Option<String>,
    pub game: Option<String>,
    pub source_by_id: Option<bool>,
    pub timezone: Option<String>,
}

#[derive(Serialize, Deserialize, DbInto)]
#[db_into(Server)]
pub struct DbServerCommunity{
    #[skip]
    pub community_id: String,
    #[skip]
    pub community_name: Option<String>,
    #[skip]
    pub community_shorten_name: Option<String>,
    #[skip]
    pub community_icon_url: Option<String>,
    #[rename(id)]
    #[default("Unknown".into())]
    pub server_id: Option<String>,
    #[rename(name)]
    #[default("Unknown".into())]
    pub server_name: Option<String>,
    #[rename(port)]
    #[default(0)]
    #[cast(u16)]
    pub server_port: Option<i32>,
    #[rename(ip)]
    #[default("No IP".into())]
    pub server_ip: Option<String>,
    #[default(0)]
    #[cast(u16)]
    pub max_players: Option<i16>,
    #[rename(server_name)]
    #[default("Unknown".into())]
    pub server_fullname: Option<String>,
    #[default(0)]
    #[cast(u16)]
    pub player_count: Option<i64>,
    #[unwrap_default]
    pub online: Option<bool>,
    pub readable_link: Option<String>,
    #[rename(website)]
    pub server_website: Option<String>,
    #[rename(discord_link)]
    pub server_discord_link: Option<String>,
    #[rename(source)]
    pub server_source: Option<String>,
    pub game: Option<String>,
    #[rename(by_id)]
    #[unwrap_default]
    pub source_by_id: Option<bool>,
    pub map: Option<String>
}



#[derive(PartialEq, Clone, DbInto)]
#[db_into(ServerCountData)]
#[auto_serde_with]
pub struct DbServerCountData{
    #[skip]
    pub server_id: Option<String>,
    #[method(to_utc_time)]
    pub bucket_time: Option<OffsetDateTime>,
    #[cast(i32)]
    pub player_count: Option<i64>
}


#[derive(Clone)]
#[auto_serde_with]
pub struct DbServerMapPartial{
    pub map: String,
    pub total_playtime: Option<PgInterval>,
    pub total_sessions: Option<i64>,
    pub last_played: Option<OffsetDateTime>
}

#[derive(Clone, DbInto)]
#[db_into(ServerMapMatch)]
#[auto_serde_with]
pub struct DbServerMatch{
    pub time_id: i32,
    pub server_id: String,
    pub map: String,
    #[method(to_utc_time)]
    pub started_at: OffsetDateTime,
    #[cast(i16)]
    pub player_count: Option<i64>,
    pub zombie_score: Option<i16>,
    pub human_score: Option<i16>,
    pub occurred_at: Option<OffsetDateTime>,
    pub estimated_time_end: Option<OffsetDateTime>,
    pub server_time_end: Option<OffsetDateTime>,
    pub extend_count: Option<i16>,
}

#[derive(Clone, DbInto)]
#[db_into(MapSessionMatch)]
#[auto_serde_with]
pub struct DbServerSessionMatch{
    #[default(-1)]
    pub time_id: Option<i32>,
    #[default("Unknown".into())]
    pub server_id: Option<String>,
    #[unwrap_default]
    pub zombie_score: Option<i16>,
    #[unwrap_default]
    pub human_score: Option<i16>,
    #[method(to_utc_time)]
    pub occurred_at: Option<OffsetDateTime>,
}
#[derive(Clone, DbInto)]
#[auto_serde_with]
#[db_into(ServerMapPlayed)]
pub struct DbServerMapPlayed{
    #[skip]
    pub total_sessions: Option<i32>,
    pub time_id: i32,
    pub server_id: String,
    #[unwrap_default]
    pub map: Option<String>,
    pub player_count: i32,
    pub started_at: OffsetDateTime,
    pub ended_at: Option<OffsetDateTime>,
}

#[derive(DbInto)]
#[db_into(MapPlayed)]
pub struct DbServerMap{
    #[skip]
    pub total_maps: Option<i64>,
    #[skip]
    #[allow(dead_code)]
    pub server_id: String,
    pub map: String,
    pub first_occurrence: OffsetDateTime,
    pub cooldown: Option<OffsetDateTime>,
    #[unwrap_default]
    pub pending_cooldown: Option<bool>,
    pub map_left: Option<i32>,
    pub map_left_last_update: Option<OffsetDateTime>,
    #[unwrap_default]
    pub enabled: Option<bool>,
    pub is_tryhard: Option<bool>,
    pub is_casual: Option<bool>,
    pub has_lasers: Option<bool>,
    pub is_favorite: Option<bool>,
    pub cleared_at: Option<OffsetDateTime>,
    pub total_time: Option<PgInterval>,
    #[unwrap_default]
    pub total_sessions: Option<i32>,
    pub last_played: Option<OffsetDateTime>,
    pub last_played_ended: Option<OffsetDateTime>,
    #[unwrap_default]
    pub last_session_id: Option<i32>,
    #[rename(total_cum_time)]
    pub cum_player_hours: Option<PgInterval>,
    pub removed: bool,
    pub no_noms: bool,
    pub min_players: Option<i16>,
    pub max_players: Option<i16>,
    #[unwrap_default]
    pub unique_players: Option<i32>,
}

