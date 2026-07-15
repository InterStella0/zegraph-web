use crate::core::api_models::*;
use crate::core::utils::{format_pg_time_tz, PgIntervalNumber, TimeToChrono};
use crate::global_serializer::*;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_macros::{auto_serde_with, DbInto};
use sqlx::postgres::types::PgTimeTz;
use sqlx::{postgres::types::PgInterval, types::time::OffsetDateTime};
use std::fmt::{Display, Formatter};

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

#[derive(DbInto)]
#[auto_serde_with]
#[db_into(FetchStatusEntry)]
pub struct DbFetchStatus {
    pub fetch_id: i64,
    pub server_id: String,
    #[default("Unknown".into())]
    pub server_name: Option<String>,
    #[default("Unknown".into())]
    pub community_id: Option<String>,
    #[default("Unknown".into())]
    pub community_name: Option<String>,
    pub op_name: String,
    pub source_name: String,
    pub fetched_at: OffsetDateTime,
    pub ok: bool,
    pub error: Option<String>,
}

pub struct DbPlayerSitemap{
    pub server_id: Option<String>,
    pub server_readable_link: Option<String>,
    pub player_id: Option<String>,
    pub recent_online: Option<OffsetDateTime>,
}

pub struct DbMapSitemap{
    pub server_id: Option<String>,
    pub server_readable_link: Option<String>,
    pub map_name: Option<String>,
    pub last_played: Option<OffsetDateTime>,
}

pub struct DbServerSitemap{
    pub server_id: Option<String>,
    pub readable_link: Option<String>,
}

pub struct DbGuideSitemap{
    pub map_name: String,
    pub server_id: Option<String>,
    pub server_readable_link: Option<String>,
    pub slug: String,
    pub updated_at: OffsetDateTime,
}
#[derive(Clone, DbInto)]
#[auto_serde_with]
#[db_into(PlayerSession)]
pub struct DbPlayerSession{
    pub player_id: String,
    #[rename(id)]
    pub session_id: String,
    pub server_id: String,
    pub started_at: OffsetDateTime,
    pub ended_at: Option<OffsetDateTime>,
    pub last_verified: Option<OffsetDateTime>,
    #[skip]
    pub is_anonymous: Option<bool>
}
#[derive(Clone, DbInto)]
#[auto_serde_with]
#[db_into(PlayerDetailSession)]
pub struct DbPlayerDetailSession{
    #[rename(id)]
    pub player_id: String,
    #[rename(name)]
    #[default("Unknown".into())]
    pub player_name: Option<String>,
    pub session_id: String,
    #[skip]
    pub server_id: String,
    pub started_at: OffsetDateTime,
    pub ended_at: Option<OffsetDateTime>,
    pub is_anonymous: bool
}
#[derive(Clone, DbInto)]
#[auto_serde_with]
#[db_into(PlayerSession)]
pub struct DbPlayerSessionPage{
    pub last_verified: Option<OffsetDateTime>,
    pub player_id: String,
    #[rename(id)]
    pub session_id: String,
    pub server_id: String,
    pub started_at: OffsetDateTime,
    pub ended_at: Option<OffsetDateTime>,
    #[skip]
    pub total_rows: Option<i64>
}
#[derive(Serialize, Deserialize, DbInto)]
#[db_into(PlayerWithLegacyRanks)]
pub struct DbPlayerWithLegacyRanks {
    #[default("Invalid SteamID64".into())]
    pub steamid64: Option<String>,
    #[unwrap_default]
    pub points: Option<f64>,
    #[unwrap_default]
    pub human_time: Option<i64>,
    #[unwrap_default]
    pub zombie_time: Option<i64>,
    #[unwrap_default]
    pub zombie_killed: Option<i32>,
    #[unwrap_default]
    pub headshot: Option<i32>,
    #[unwrap_default]
    pub infected_time: Option<i32>,
    #[unwrap_default]
    pub item_usage: Option<i32>,
    #[unwrap_default]
    pub boss_killed: Option<i32>,
    #[unwrap_default]
    pub leader_count: Option<i32>,
    #[unwrap_default]
    pub td_count: Option<i32>,
    #[unwrap_default]
    pub rank_total_playtime: Option<i64>,
    #[unwrap_default]
    pub rank_points: Option<i64>,
    #[unwrap_default]
    pub rank_human_time: Option<i64>,
    #[unwrap_default]
    pub rank_zombie_time: Option<i64>,
    #[unwrap_default]
    pub rank_zombie_killed: Option<i64>,
    #[unwrap_default]
    pub rank_headshot: Option<i64>,
    #[unwrap_default]
    pub rank_infected_time: Option<i64>,
    #[unwrap_default]
    pub rank_item_usage: Option<i64>,
    #[unwrap_default]
    pub rank_boss_killed: Option<i64>,
    #[unwrap_default]
    pub rank_leader_count: Option<i64>,
    #[unwrap_default]
    pub rank_td_count: Option<i64>,
}

#[derive(Clone, DbInto)]
#[auto_serde_with]
#[db_into(PlayerSeen)]
pub struct DbPlayerSeen{
    #[rename(id)]
    pub player_id: String,
    #[rename(name)]
    pub player_name: String,
    pub total_time_together: Option<PgInterval>,
    #[method(to_utc_time)]
    pub last_seen: Option<OffsetDateTime>,
}
#[allow(dead_code)]
#[derive(Clone, DbInto)]
#[auto_serde_with]
#[db_into(SearchPlayer)]
#[extra(is_anonymous = false)]
pub struct DbPlayer{
    #[rename(id)]
    pub player_id: String,
    #[rename(name)]
    pub player_name: String,
    #[skip]
    pub created_at: OffsetDateTime,
    #[skip]
    pub associated_player_id: Option<String>
}

#[derive(Clone, DbInto)]
#[auto_serde_with]
#[db_into(SearchPlayer)]
pub struct DbPlayerAnonymized{
    #[rename(id)]
    pub player_id: String,
    #[rename(name)]
    pub player_name: String,
    pub is_anonymous: bool
}

#[derive(Clone, DbInto)]
#[auto_serde_with]
#[db_into(UserAnonymization)]
pub struct DbUserAnonymization {
    #[method(to_string)]
    pub user_id: i64,
    #[expr(self.community_id.map(|e| e.to_string()))]
    pub community_id: Option<uuid::Uuid>,
    pub anonymized: bool,
    pub hide_location: bool,
}

#[derive(Clone, DbInto)]
#[auto_serde_with]
#[db_into(DetailedPlayer)]
#[extra(aliases=vec![], ranks=None)]
pub struct DbPlayerDetail{
    #[rename(id)]
    pub player_id: String,
    #[rename(name)]
    pub player_name: String,
    pub created_at: OffsetDateTime,
    pub category: Option<String>,
    pub tryhard_playtime: Option<PgInterval>,
    pub casual_playtime: Option<PgInterval>,
    pub mixed_playtime: Option<PgInterval>,
    pub total_playtime: Option<PgInterval>,
    #[default(-1)]
    #[cast(i64)]
    pub rank: Option<i32>,
    #[skip]
    pub online_since: Option<OffsetDateTime>,
    #[skip]
    pub last_played: Option<OffsetDateTime>,
    #[skip]
    pub last_played_duration: Option<PgInterval>,
    pub associated_player_id: Option<String>
}
impl Into<DbPlayerBrief> for DbPlayerDetail{
    fn into(self) -> DbPlayerBrief {
        DbPlayerBrief{
            player_id: self.player_id,
            player_name: self.player_name,
            created_at: self.created_at,
            total_playtime: self.total_playtime,
            total_players: Some(0),
            rank: self.rank,
            online_since: self.online_since,
            last_played: self.last_played,
            last_played_duration: self.last_played_duration,
        }
    }
}
#[auto_serde_with]
pub struct DbMapLastPlayed{
    pub last_played: Option<OffsetDateTime>,
}
#[derive(Serialize, Deserialize, Clone, DbInto)]
#[db_into(MapEventAverage)]
pub struct DbEvent{
    #[default("Unknown".to_string())]
    pub event_name: Option<String>,
    #[unwrap_default]
    pub average: Option<f64>
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
#[derive(DbInto)]
#[db_into(Region)]
pub struct DbRegion{
    pub region_name: String,
    pub region_id: i64,
    #[expr(format_pg_time_tz(&self.start_time))]
    pub start_time: PgTimeTz,
    #[expr(format_pg_time_tz(&self.end_time))]
    pub end_time: PgTimeTz,
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
#[derive(Clone, DbInto)]
#[auto_serde_with]
#[db_into(PlayerTableRank)]
pub struct DbPlayerTable{
    #[rename(rank)]
    #[default(-1)]
    pub ranked: Option<i64>,
    #[rename(id)]
    pub player_id: String,
    #[rename(name)]
    #[default("Unknown Player".to_string())]
    pub player_name: Option<String>,
    pub total_playtime: PgInterval,
    pub casual_playtime: PgInterval,
    pub tryhard_playtime: PgInterval,
    pub mixed_playtime: PgInterval,
    #[skip]
    pub total_players: Option<i64>,
    pub is_anonymous: bool
}
#[derive(Clone, DbInto)]
#[auto_serde_with]
#[db_into(PlayerBrief)]
pub struct DbPlayerBrief{
    #[rename(id)]
    pub player_id: String,
    #[rename(name)]
    pub player_name: String,
    pub created_at: OffsetDateTime,
    pub total_playtime: Option<PgInterval>,
    #[skip]
    pub total_players: Option<i64>,
    #[default(-1)]
    #[cast(i64)]
    pub rank: Option<i32>,
    pub online_since: Option<OffsetDateTime>,
    #[method(to_utc_time)]
    pub last_played: Option<OffsetDateTime>,
    pub last_played_duration: Option<PgInterval>,
}

#[derive(Clone, DbInto)]
#[auto_serde_with]
#[db_into(PlayerAlias)]
pub struct DbPlayerAlias{
    pub name: String,
    pub created_at: OffsetDateTime,
}
#[derive(Clone, Debug, PartialEq, PartialOrd, sqlx::Type, Deserialize, Serialize)]
#[sqlx(type_name = "announcement_type_enum", rename_all = "PascalCase")]
pub enum AnnouncementTypeState {
    Basic,
    Rich
}
impl From<AnnouncementType> for AnnouncementTypeState{
    fn from(value: AnnouncementType) -> Self {
        match value {
            AnnouncementType::Basic => AnnouncementTypeState::Basic,
            AnnouncementType::Rich => AnnouncementTypeState::Rich
        }
    }
}
impl Into<AnnouncementType> for AnnouncementTypeState{
    fn into(self) -> AnnouncementType {
        match self{
            AnnouncementTypeState::Basic => AnnouncementType::Basic,
            AnnouncementTypeState::Rich => AnnouncementType::Rich
        }
    }
}
#[derive(Clone, DbInto)]
#[db_into(Announcement)]
#[extra(hidden = !self.show)]
#[auto_serde_with]
pub struct DbAnnouncement {
    pub id: String,
    #[method(into)]
    pub r#type: AnnouncementTypeState,
    pub title: Option<String>,
    pub text: String,
    pub created_at: OffsetDateTime,
    pub published_at: OffsetDateTime,
    pub expires_at: Option<OffsetDateTime>,
    #[skip]
    pub show: bool,
}


#[derive(Clone, DbInto)]
#[db_into(PlayerMostPlayedMap)]
#[extra(rank = 0)]
#[auto_serde_with]
#[allow(dead_code)]
pub struct DbPlayerMapPlayed {
    #[skip]
    pub server_id: Option<String>,
    #[unwrap_default]
    pub map: Option<String>,
    #[rename(duration)]
    pub played: Option<PgInterval>,
}

#[derive(DbInto)]
#[db_into(PlayerInfraction)]
pub struct DbPlayerInfraction{
    #[rename(id)]
    pub infraction_id: String,
    pub source: String,
    #[default("Unknown".into())]
    pub by: Option<String>,
    pub reason: Option<String>,
    pub infraction_time: Option<OffsetDateTime>,
    pub admin_avatar: Option<String>,
    #[unwrap_default]
    pub flags: Option<i64>
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

#[derive(Serialize, Deserialize)]
pub struct DbMapIsPlaying{
    pub result: Option<bool>
}

#[derive(Clone, DbInto)]
#[db_into(PlayerRegionTime)]
#[auto_serde_with]
pub struct DbPlayerRegionTime{
    #[rename(id)]
    #[default(-1)]
    pub region_id: Option<i16>,
    #[rename(name)]
    #[default("Unknown".into())]
    pub region_name: Option<String>,
    #[rename(duration)]
    #[method(to_f64)]
    pub played_time: Option<PgInterval>,
}


#[derive(PartialEq, Clone, DbInto)]
#[db_into(PlayerSessionTime)]
#[auto_serde_with]
pub struct DbPlayerSessionTime{
    #[method(to_utc_time)]
    pub bucket_time: Option<OffsetDateTime>,
    #[rename(hours)]
    #[unwrap_default]
    pub hour_duration: Option<f64>
}

#[derive(Clone)]
#[auto_serde_with]
pub struct DbServerMapPartial{
    pub map: String,
    pub total_playtime: Option<PgInterval>,
    pub total_sessions: Option<i64>,
    pub last_played: Option<OffsetDateTime>
}
#[derive(Clone)]
#[auto_serde_with]
pub struct DbPlayerSessionMapPlayed{
    pub time_id: i32,
    pub server_id: String,
    pub map: String,
    pub player_count: i32,
    pub started_at: OffsetDateTime,
    pub ended_at: Option<OffsetDateTime>,
    pub zombie_score: Option<i16>,
    pub human_score: Option<i16>,
    pub occurred_at: Option<OffsetDateTime>,
    pub extend_count: Option<i16>,
}
impl DbPlayerSessionMapPlayed{
    pub fn is_match_empty(&self) -> bool{
        self.zombie_score.is_none() || self.human_score.is_none()
    }
}
impl Into<PlayerSessionMapPlayed> for DbPlayerSessionMapPlayed{
    fn into(self) -> PlayerSessionMapPlayed{
        PlayerSessionMapPlayed{
            time_id: self.time_id,
            server_id: self.server_id,
            map: self.map,
            player_count: self.player_count,
            started_at: self.started_at.to_utc_time(),
            ended_at: self.ended_at.to_utc_optional(),
            match_data: vec![],
        }
    }
}
impl Into<MatchData> for DbPlayerSessionMapPlayed{
    fn into(self) -> MatchData{
        MatchData{
            zombie_score: self.zombie_score.unwrap_or_default(),
            human_score: self.human_score.unwrap_or_default(),
            occurred_at: self.occurred_at.to_utc_time(),
            extend_count: self.extend_count.unwrap_or_default(),
        }
    }
}
#[derive(Clone, DbInto)]
#[db_into(PlayersStatistic)]
#[auto_serde_with]
pub struct DbPlayersStatistic{
    #[method(to_f64)]
    pub total_cum_playtime: Option<PgInterval>,
    #[unwrap_default]
    pub total_players: Option<i64>,
    #[unwrap_default]
    pub countries: Option<i64>
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

#[derive(Serialize, Deserialize, DbInto)]
#[db_into(ServerMap)]
pub struct DbMap{
    pub server_id: String,
    pub map: String
}
#[derive(Serialize, Deserialize)]
pub struct DbAnyMap{
    pub map: String
}
#[derive(Serialize, Deserialize, DbInto)]
#[db_into(CountryStatistic)]
pub struct DbCountryStatistic{
    #[rename(code)]
    #[default("Unknown".into())]
    pub country_code: Option<String>,
    #[rename(name)]
    #[default("Unknown".into())]
    pub country_name: Option<String>,
    #[rename(count)]
    #[default(0)]
    pub players_per_country: Option<i64>,
    #[skip]
    pub total_players: Option<i64>,
}
#[derive(Serialize, Deserialize, DbInto)]
#[db_into(ContinentStatistic)]
pub struct DbContinentStatistic{
    #[rename(name)]
    #[default("Unknown".into())]
    pub continent: Option<String>,
    #[rename(count)]
    #[default(0)]
    pub players_per_continent: Option<i64>,
    #[skip]
    pub total_players: Option<i64>,
}
#[derive(DbInto)]
#[auto_serde_with]
#[db_into(CountryPlayer)]
pub struct DbCountryPlayer{
    #[rename(id)]
    #[default("Unknown".into())]
    pub player_id: Option<String>,
    #[rename(name)]
    #[default("Unknown".into())]
    pub player_name: Option<String>,
    #[default(0)]
    pub session_count: Option<i64>,
    #[skip]
    pub location_country: Option<String>,
    pub total_playtime: Option<PgInterval>,
    #[default(0)]
    pub total_player_count: Option<i64>,
}
#[derive(Serialize, Deserialize)]
pub struct DbCountryGeometry{
    pub country_name: Option<String>,
    pub geometry: Option<String>,
    pub country_code: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct DbPlayerHourCount{
    pub hours: Option<i32>,
    pub join_counted: Option<i64>,
    pub leave_counted: Option<i64>,
}

impl Into<(PlayerHourDay, PlayerHourDay)> for DbPlayerHourCount{
    fn into(self) -> (PlayerHourDay, PlayerHourDay) {
        let join = PlayerHourDay{
            event_type: EventType::Join,
            hour: self.hours.unwrap_or_default() as u8,
            count: self.join_counted.unwrap_or(0),
        };
        let leave = PlayerHourDay{
            event_type: EventType::Leave,
            hour: self.hours.unwrap_or_default() as u8,
            count: self.leave_counted.unwrap_or(0),
        };
        (join, leave)
    }
}


#[derive(DbInto)]
#[db_into(SteamProfile)]
#[extra(loccountrycode = Some("".to_string()), realname = None, gameid = None, gameextrainfo = None, gameserverip = None, locstatecode = None, loccityid = None, is_superuser = Some(false), is_map_manager = Some(false))]
pub struct DbSteam{
    #[rename(steamid)]
    #[method(to_string)]
    pub user_id: i64,
    #[rename(communityvisibilitystate)]
    #[expr(Some(i32::try_from(self.community_visibility_state).unwrap_or_default() as i64))]
    pub community_visibility_state: CommunityVisibilityState,
    #[rename(profilestate)]
    #[expr(Some(self.profile_state as i32))]
    pub profile_state: i64,
    #[rename(personaname)]
    #[expr(Some(self.persona_name))]
    pub persona_name: String,
    #[rename(profileurl)]
    #[expr(Some(self.profile_url))]
    pub profile_url: String,
    #[expr(Some(self.avatar))]
    pub avatar: String,
    #[rename(avatarmedium)]
    #[expr(Some(self.avatar_medium))]
    pub avatar_medium: String,
    #[rename(avatarfull)]
    #[expr(Some(self.avatar_full))]
    pub avatar_full: String,
    #[rename(avatarhash)]
    #[expr(Some(self.avatar_hash))]
    pub avatar_hash: String,
    #[rename(lastlogoff)]
    #[expr(if self.last_log_off == -1 { None } else { Some(self.last_log_off) })]
    pub last_log_off: i64,
    #[rename(personastate)]
    #[expr(Some(i32::try_from(self.persona_state).unwrap_or_default() as i64))]
    pub persona_state: PersonaState,
    #[rename(primaryclanid)]
    #[expr(Some(self.primary_clan_id))]
    pub primary_clan_id: String,
    #[rename(timecreated)]
    #[expr(Some(self.time_created))]
    pub time_created: i64,
    #[rename(personastateflags)]
    #[expr(Some(self.persona_state_flags as i32))]
    pub persona_state_flags: i64,
    #[rename(commentpermission)]
    #[expr(Some(if self.comment_permission { 1 } else { 0 }))]
    pub comment_permission: bool,
}

#[derive(Clone, Debug, PartialEq, PartialOrd, sqlx::Type, Deserialize, Serialize)]
#[sqlx(type_name = "community_visibility_state_enum")]
pub enum CommunityVisibilityState {
    Private,
    FriendsOnly,
    Public
}
impl TryFrom<i32> for CommunityVisibilityState {
    type Error = &'static str;

    fn try_from(value: i32) -> Result<Self, Self::Error> {
        match value {
            1 => Ok(CommunityVisibilityState::Private),
            2 => Ok(CommunityVisibilityState::FriendsOnly),
            3 => Ok(CommunityVisibilityState::Public),
            _ => Err("Invalid CommunityVisibilityState value"),
        }
    }
}
impl Into<i32> for CommunityVisibilityState {

    fn into(self) -> i32 {
        match self {
            CommunityVisibilityState::Private => 1i32,
            CommunityVisibilityState::FriendsOnly => 2i32,
            CommunityVisibilityState::Public => 3i32
        }
    }
}
impl Display for CommunityVisibilityState {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            CommunityVisibilityState::Private => f.write_str("Private"),
            CommunityVisibilityState::FriendsOnly => f.write_str("FriendsOnly"),
            CommunityVisibilityState::Public => f.write_str("Public")
        }
    }
}
#[derive(Clone, Debug, PartialEq, PartialOrd, sqlx::Type, Deserialize, Serialize)]
#[sqlx(type_name = "persona_state_enum")]
pub enum PersonaState{
    Offline,
    Online,
    Busy,
    Away,
    Snooze,
    LookingToTrade,
    LookingToPlay,
}
impl TryFrom<i32> for PersonaState {
    type Error = &'static str;

    fn try_from(value: i32) -> Result<Self, Self::Error> {
        match value {
            0 => Ok(PersonaState::Offline),
            1 => Ok(PersonaState::Online),
            2 => Ok(PersonaState::Busy),
            3 => Ok(PersonaState::Away),
            4 => Ok(PersonaState::Snooze),
            5 => Ok(PersonaState::LookingToTrade),
            6 => Ok(PersonaState::LookingToPlay),
            _ => Err("Invalid PersonaState value"),
        }
    }
}

impl Into<i32> for PersonaState {

    fn into(self) -> i32 {
        match self {
            PersonaState::Offline => 0i32,
            PersonaState::Online => 1i32,
            PersonaState::Busy => 2i32,
            PersonaState::Away => 3i32,
            PersonaState::Snooze => 4i32,
            PersonaState::LookingToTrade => 5i32,
            PersonaState::LookingToPlay => 6i32,
        }
    }
}
impl Display for PersonaState{
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            PersonaState::Offline => f.write_str("Offline"),
            PersonaState::Online => f.write_str("Online"),
            PersonaState::Busy => f.write_str("Busy"),
            PersonaState::Away => f.write_str("Away"),
            PersonaState::Snooze => f.write_str("Snooze"),
            PersonaState::LookingToTrade => f.write_str("LookingToTrade"),
            PersonaState::LookingToPlay => f.write_str("LookingToPlay"),
        }
    }
}

#[allow(dead_code)]
#[derive(DbInto)]
#[db_into(ServerMapMusic)]
pub struct DbAssociatedMapMusic{
    #[method(to_string)]
    pub id: uuid::Uuid,
    #[rename(name)]
    pub music_name: String,
    #[unwrap_default]
    pub duration: Option<f64>,
    pub youtube_music: Option<String>,
    #[default("Unknown".to_string())]
    pub source: Option<String>,
    #[skip]
    pub map_name: Option<String>,
    #[unwrap_default]
    pub other_maps: Option<Vec<String>>,
    #[unwrap_default]
    pub tags: Option<Vec<String>>,
    #[expr(self.yt_source.map(|v| v.to_string()))]
    pub yt_source: Option<i64>,
    #[expr(Some(if self.yt_source == Some(0) { String::from("System") } else { self.yt_source_name.unwrap_or("Unknown".into()) }))]
    pub yt_source_name: Option<String>,
}
#[derive(Clone, sqlx::Type, Deserialize, Serialize, Debug)]
#[sqlx(type_name = "data_vote_type_enum")]
pub enum DataVoteType{
    UpVote,
    DownVote
}

impl From<VoteType> for DataVoteType {
    fn from(vote_type: VoteType) -> Self {
        match vote_type {
            VoteType::UpVote => DataVoteType::UpVote,
            VoteType::DownVote => DataVoteType::DownVote,
        }
    }
}

impl Into<VoteType> for DataVoteType {
    fn into(self) -> VoteType {
        match self {
            DataVoteType::UpVote => VoteType::UpVote,
            DataVoteType::DownVote => VoteType::DownVote,
        }
    }
}

#[auto_serde_with]
pub struct DbGuideBrief{
    pub id: uuid::Uuid,
    pub map_name: String,
    pub server_id: Option<String>,
    pub author_id: i64
}
#[derive(Debug, DbInto)]
#[auto_serde_with]
#[db_into(Guide)]
#[extra(author = GuideAuthor { id: self.author_id.to_string(), name: self.author_name.unwrap_or("Unknown".into()), avatar: self.author_avatar })]
pub struct DbGuide {
    #[method(to_string)]
    pub id: uuid::Uuid,
    pub map_name: String,
    pub server_id: Option<String>,
    pub title: String,
    pub content: String,
    pub category: String,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
    pub upvotes: i64,
    pub downvotes: i64,
    pub comment_count: i64,
    #[expr(self.user_vote.map(Into::into))]
    pub user_vote: Option<DataVoteType>,
    #[skip]
    pub author_id: i64,
    #[skip]
    pub author_name: Option<String>,
    #[skip]
    pub author_avatar: Option<String>,
    pub slug: String,
    #[skip]
    pub total_guides: Option<i32>
}


#[derive(DbInto)]
#[auto_serde_with]
#[db_into(GuideComment)]
#[extra(author = GuideAuthor { id: self.author_id.to_string(), name: self.author_name.unwrap_or("Unknown".into()), avatar: self.author_avatar })]
pub struct DbGuideComment {
    #[method(to_string)]
    pub id: uuid::Uuid,
    #[method(to_string)]
    pub guide_id: uuid::Uuid,
    #[skip]
    pub author_id: i64,
    #[skip]
    pub author_name: Option<String>,
    #[skip]
    pub author_avatar: Option<String>,
    pub content: String,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
    pub upvotes: i64,
    pub downvotes: i64,
    #[expr(self.user_vote.map(Into::into))]
    pub user_vote: Option<DataVoteType>,
    #[skip]
    pub total_comments: Option<i32>
}
#[auto_serde_with]
pub struct DbGuideCommentBrief{
    pub id: uuid::Uuid,
    pub guide_id: uuid::Uuid,
    pub author_id: i64,
}

#[auto_serde_with]
pub struct DbReportGuide {
    guide_id: String,
    user_id: i64,
    reason: String,
    details: String,
    timestamp: OffsetDateTime
}

// Admin models for guide moderation
#[derive(DbInto)]
#[auto_serde_with]
#[db_into(GuideReportAdmin)]
pub struct DbGuideReportFull {
    #[method(to_string)]
    pub id: uuid::Uuid,
    #[method(to_string)]
    pub guide_id: uuid::Uuid,
    #[rename(reporter_id)]
    #[method(to_string)]
    pub user_id: i64,
    pub reason: String,
    pub details: String,
    pub status: String,
    #[expr(self.resolved_by.map(|id| id.to_string()))]
    pub resolved_by: Option<i64>,
    pub resolved_at: Option<OffsetDateTime>,
    #[rename(created_at)]
    pub timestamp: OffsetDateTime,
    // Joined fields
    pub guide_title: Option<String>,
    pub guide_map_name: Option<String>,
    #[expr(self.guide_author_id.map(|id| id.to_string()))]
    pub guide_author_id: Option<i64>,
    pub guide_author_name: Option<String>,
    pub reporter_name: Option<String>,
    pub resolver_name: Option<String>,
    #[skip]
    pub total_reports: Option<i64>,
}

#[derive(DbInto)]
#[auto_serde_with]
#[db_into(CommentReportAdmin)]
pub struct DbCommentReportFull {
    #[method(to_string)]
    pub id: uuid::Uuid,
    #[method(to_string)]
    pub comment_id: uuid::Uuid,
    #[rename(reporter_id)]
    #[method(to_string)]
    pub user_id: i64,
    pub reason: String,
    pub details: String,
    pub status: String,
    #[expr(self.resolved_by.map(|id| id.to_string()))]
    pub resolved_by: Option<i64>,
    pub resolved_at: Option<OffsetDateTime>,
    #[rename(created_at)]
    pub timestamp: OffsetDateTime,
    // Joined fields
    pub comment_content: Option<String>,
    #[expr(self.comment_author_id.map(|id| id.to_string()))]
    pub comment_author_id: Option<i64>,
    pub comment_author_name: Option<String>,
    #[expr(self.guide_id.map(|id| id.to_string()))]
    pub guide_id: Option<uuid::Uuid>,
    pub reporter_name: Option<String>,
    pub resolver_name: Option<String>,
    #[skip]
    pub total_reports: Option<i64>,
}

#[derive(DbInto)]
#[auto_serde_with]
#[db_into(MapMusicReportAdmin)]
pub struct DbMapMusicReportFull {
    #[method(to_string)]
    pub id: uuid::Uuid,
    #[method(to_string)]
    pub music_id: uuid::Uuid,
    #[rename(reporter_id)]
    #[method(to_string)]
    pub user_id: i64,
    pub reason: String,
    pub details: String,
    pub suggested_youtube_url: Option<String>,
    pub current_youtube_music: Option<String>,
    pub status: String,
    #[expr(self.resolved_by.map(|id| id.to_string()))]
    pub resolved_by: Option<i64>,
    pub resolved_at: Option<OffsetDateTime>,
    #[rename(created_at)]
    pub timestamp: OffsetDateTime,
    // Joined fields from map_music
    #[default("Unknown Track".to_string())]
    pub music_name: Option<String>,
    #[default(0.0)]
    pub music_duration: Option<f64>,
    #[default("Unknown".to_string())]
    pub music_source: Option<String>,
    // Reporter/resolver info
    pub reporter_name: Option<String>,
    pub resolver_name: Option<String>,
    // Associated maps (aggregated)
    #[unwrap_default]
    pub associated_maps: Option<Vec<String>>,
    #[skip]
    pub total_reports: Option<i64>,
}

#[derive(DbInto)]
#[auto_serde_with]
#[db_into(GuideBanAdmin)]
pub struct DbGuideBan {
    #[method(to_string)]
    pub id: uuid::Uuid,
    #[method(to_string)]
    pub user_id: i64,
    #[method(to_string)]
    pub banned_by: i64,
    pub reason: String,
    pub created_at: OffsetDateTime,
    pub expires_at: Option<OffsetDateTime>,
    pub is_active: bool,
    // Joined fields
    pub user_name: Option<String>,
    pub user_avatar: Option<String>,
    pub banned_by_name: Option<String>,
    #[skip]
    pub total_bans: Option<i64>,
}


#[derive(DbInto)]
#[auto_serde_with]
#[db_into(PushSubscription)]
pub struct DbPushSubscription {
    #[method(to_string)]
    pub id: uuid::Uuid,
    #[method(to_string)]
    pub user_id: i64,
    pub endpoint: String,
    #[skip]
    pub p256dh_key: String,
    #[skip]
    pub auth_key: String,
    #[skip]
    pub user_agent: Option<String>,
    pub created_at: OffsetDateTime,
    pub last_used_at: OffsetDateTime,
}

#[derive(DbInto)]
#[auto_serde_with]
#[db_into(NotificationPreferences)]
pub struct DbNotificationPreferences {
    #[method(to_string)]
    pub user_id: i64,
    pub announcements_enabled: bool,
    pub system_enabled: bool,
    pub map_specific_enabled: bool,
    pub updated_at: OffsetDateTime,
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

#[auto_serde_with]
pub struct DbVapidKey {
    pub id: i32,
    pub public_key: String,
    pub private_key: String,
    pub created_at: OffsetDateTime,
    pub is_active: bool,
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

#[derive(DbInto)]
#[auto_serde_with]
#[db_into(Character3DModel)]
#[extra(uploader_name = None)]
pub struct DbCharacter3DModel {
    pub id: i32,
    pub model_id: String,
    pub name: Option<String>,
    pub server_id: String,
    pub credit: Option<String>,
    pub link_path: String,
    pub uploaded_by: Option<i64>,
    pub thumbnail_path: Option<String>,
    pub file_size: i64,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
}

pub struct DbCommunityServerEntry {
    pub server_id: String,
    pub player_id: String,
    pub community_id: uuid::Uuid,
    pub community_name: Option<String>,
    pub community_shorten_name: Option<String>,
    pub community_icon_url: Option<String>,
}

pub struct DbProfileServerStat {
    pub online_count: Option<i64>,
    pub map: Option<String>,
    pub last_started_at: Option<OffsetDateTime>,
    pub last_ended_at: Option<OffsetDateTime>,
}

pub struct DbLinkedName {
    pub player_id: String,
    pub player_name: String,
    pub total_playtime: Option<PgInterval>,
}

/// A stored row of website.player_global_playtime, keyed by canonical player.
pub struct DbPlayerGlobalPlaytime {
    pub total_playtime: PgInterval,
    pub casual_playtime: PgInterval,
    pub tryhard_playtime: PgInterval,
    pub category: Option<String>,
    pub server_count: i32,
    pub community_count: i32,
    pub global_rank: Option<i64>,
    pub casual_rank: Option<i64>,
    pub tryhard_rank: Option<i64>,
    pub rank_calculated_at: Option<OffsetDateTime>,
    pub calculated_at: Option<OffsetDateTime>,
}

/// Live summation over website.player_playtime, used when the stored row is outdated.
pub struct DbGlobalSums {
    pub total_playtime: Option<PgInterval>,
    pub casual_playtime: Option<PgInterval>,
    pub tryhard_playtime: Option<PgInterval>,
    pub server_count: Option<i64>,
    pub community_count: Option<i64>,
    pub category: Option<String>,
}

pub struct DbGlobalRefreshTarget {
    pub player_id: String,
    pub server_id: String,
}

#[derive(Serialize, Deserialize)]
pub struct DbGlobalMapRankEntry {
    pub player_id: String,
    pub global_position: Option<i64>,
    pub map: Option<String>,
    pub rank: Option<i64>,
}

pub struct DbGuideBanStatus {
    pub reason: String,
    pub expires_at: Option<OffsetDateTime>,
}

pub struct DbMapName {
    pub map_name: String,
}

pub struct DbServerNameMaxPlayers {
    pub server_name: Option<String>,
    pub max_players: Option<i16>,
}

#[derive(DbInto)]
#[auto_serde_with]
#[db_into(ServerRequestAdmin)]
pub struct DbServerRequest {
    #[method(to_string)]
    pub id: uuid::Uuid,
    #[method(to_string)]
    pub user_id: i64,
    pub community_name: String,
    pub icon_url: Option<String>,
    #[expr(serde_json::from_value(self.servers).unwrap_or_default())]
    pub servers: serde_json::Value,
    pub game_type: String,
    pub elaboration: Option<String>,
    pub status: String,
    #[expr(self.reviewed_by.map(|id| id.to_string()))]
    pub reviewed_by: Option<i64>,
    pub reviewed_at: Option<OffsetDateTime>,
    pub created_at: OffsetDateTime,
    pub submitter_name: Option<String>,
    pub reviewer_name: Option<String>,
    #[skip]
    pub total_requests: Option<i64>,
}
