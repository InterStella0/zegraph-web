use std::fmt::Display;
use chrono::{DateTime, Utc};
use poem_openapi::{Enum, Object};
use crate::api_models::maps::MapRank;
use crate::api_models::misc::UserAnonymization;
use crate::api_models::servers::BaseCommunity;

#[derive(Object)]
pub struct PlayerRanks{
    pub global_playtime: i64,
    pub server_playtime: i64,
    pub casual_playtime: i64,
    pub tryhard_playtime: i64,
    pub mixed_playtime: i64,
    pub highest_map_rank: Option<MapRank>,
}
#[derive(Object)]
pub struct DetailedPlayer{
    pub id: String,
    pub name: String,
    pub aliases: Vec<PlayerAlias>,
    pub created_at: DateTime<Utc>,
    pub category: Option<String>,
    pub tryhard_playtime: f64,
    pub casual_playtime: f64,
    pub mixed_playtime: f64,
    pub total_playtime: f64,
    pub rank: i64,
    pub ranks: Option<PlayerRanks>,
    pub associated_player_id: Option<String>
}

#[derive(Object)]
pub struct PlayerAlias{
    pub name: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Object)]
pub struct BriefPlayers {
    pub total_players: i64,
    pub players: Vec<PlayerBrief>
}
#[derive(Object)]
pub struct PlayerTableRank{
    pub rank: i64,
    pub id: String,
    pub name: String,
    pub tryhard_playtime: f64,
    pub casual_playtime: f64,
    pub mixed_playtime: f64,
    pub total_playtime: f64,
    pub is_anonymous: bool
}
#[derive(Object)]
pub struct PlayersTableRanked{
    pub total_players: i64,
    pub players: Vec<PlayerTableRank>
}
#[derive(Object)]
pub struct PlayerBrief{
    pub id: String,
    pub name: String,
    pub created_at: DateTime<Utc>,
    pub total_playtime: f64,
    pub rank: i64,
    pub online_since: Option<DateTime<Utc>>,
    pub last_played: DateTime<Utc>,
    pub last_played_duration: f64,
    pub is_anonymous: bool,
}

#[derive(Object)]
pub struct MatchData {
    pub zombie_score: i16,
    pub human_score: i16,
    pub occurred_at: DateTime<Utc>,
    pub extend_count: i16,
}

#[derive(Object)]
pub struct PlayerSessionMapPlayed{
    pub time_id: i32,
    pub server_id: String,
    pub map: String,
    pub player_count: i32,
    pub started_at: DateTime<Utc>,
    pub ended_at: Option<DateTime<Utc>>,
    pub match_data: Vec<MatchData>
}

#[derive(Object)]
pub struct PlayerMostPlayedMap{
    pub map: String,
    pub duration: f64,
    pub rank: i64,
}

#[derive(Object)]
pub struct PlayerRegionTime{
    pub id: i16,
    pub name: String,
    pub duration: f64,
}

#[derive(Object)]
pub struct PlayerDetailSession{
    pub id: String,
    pub session_id: String,
    pub name: String,
    pub started_at: DateTime<Utc>,
    pub ended_at: Option<DateTime<Utc>>,
    pub is_anonymous: bool
}

#[derive(Object)]
pub struct PlayerSession{
    pub id: String,
    pub server_id: String,
    pub player_id: String,
    pub started_at: DateTime<Utc>,
    pub ended_at: Option<DateTime<Utc>>,
    pub last_verified: Option<DateTime<Utc>>
}

#[derive(Object)]
pub struct PlayerSeen{
    pub id: String,
    pub name: String,
    pub total_time_together: f64,
    pub last_seen: DateTime<Utc>,
}

#[derive(Object)]
pub struct PlayerSessionPage{
    pub total_pages: i64,
    pub rows: Vec<PlayerSession>
}

#[derive(Object)]
pub struct PlayerSessionTime{
    pub bucket_time: DateTime<Utc>,
    pub hours: f64,
}


#[derive(Enum)]
pub enum EventType{
    Join,
    Leave
}

impl Display for EventType{
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let result = match self {
            EventType::Join => "join",
            EventType::Leave => "leave"
        };
        write!(f, "{}", String::from(result))
    }
}

#[derive(Object)]
pub struct PlayerHourDay{
    pub event_type: EventType,
    pub hour: u8,
    pub count: i64,
}

#[derive(Object)]
pub struct PlayerOnlineHeatmap{
    pub hour_of_day: i32,
    pub hours_online: f64,
    pub online_count: i64,
}

#[derive(Object)]
pub struct PlayerWithLegacyRanks {
    pub steamid64: String,
    pub points: f64,
    pub human_time: i64,
    pub zombie_time: i64,
    pub zombie_killed: i32,
    pub headshot: i32,
    pub infected_time: i32,
    pub item_usage: i32,
    pub boss_killed: i32,
    pub leader_count: i32,
    pub td_count: i32,
    pub rank_total_playtime: i64,
    pub rank_points: i64,
    pub rank_human_time: i64,
    pub rank_zombie_time: i64,
    pub rank_zombie_killed: i64,
    pub rank_headshot: i64,
    pub rank_infected_time: i64,
    pub rank_item_usage: i64,
    pub rank_boss_killed: i64,
    pub rank_leader_count: i64,
    pub rank_td_count: i64,
}

#[derive(Object)]
pub struct PlayerInfraction{
    pub id: String,
    pub source: String,
    pub by: String,
    pub reason: Option<String>,
    pub infraction_time: Option<DateTime<Utc>>,
    pub flags: i64,
    pub admin_avatar: Option<String>
}

#[derive(Object)]
pub struct PlayerInfractionUpdate{
    pub id: i64,
    pub infractions: Vec<PlayerInfraction>,
}

#[derive(Object)]
pub struct PlayerProfilePicture{
    pub id: String,
    pub full: String,
    pub medium: String,
}

#[derive(Object)]
pub struct SearchPlayer{
    pub(crate) name: String,
    pub(crate) id: String,
    pub(crate) is_anonymous: bool
}

#[derive(Object)]
pub struct ServerPlayerDetail {
    pub server_id: String,
    pub server_name: String,
    pub player: DetailedPlayer,
}

pub type CommunityPlayerDetail = BaseCommunity<ServerPlayerDetail>;

#[derive(Object)]
pub struct LinkedName {
    pub name: String,
    pub total_playtime: f64,
    pub is_current: bool,
}

#[derive(Object)]
pub struct ProfileServerEntry {
    pub server_id: String,
    pub server_name: String,
    pub map: Option<String>,
    pub by_id: bool,
    pub online_count: i64,
    pub max_players: i64,
    pub is_online: bool,
    pub last_played: Option<DateTime<Utc>>,
    pub last_played_duration: Option<f64>,
    pub player: DetailedPlayer,
    pub linked_names: Vec<LinkedName>,
}

pub type ProfileCommunityDetail = BaseCommunity<ProfileServerEntry>;

#[derive(Object)]
pub struct GlobalMapRank {
    pub position: i64,
    pub map: String,
    pub rank: i64,
}

#[derive(Object, Clone, Default)]
pub struct GlobalPlaytimeSummary {
    pub total_playtime: f64,
    pub casual_playtime: f64,
    pub tryhard_playtime: f64,
    pub category: Option<String>,
    pub rank: Option<i64>,
    pub casual_rank: Option<i64>,
    pub tryhard_rank: Option<i64>,
    pub total_ranked_players: i64,
    pub server_count: i64,
    pub community_count: i64,
    pub is_outdated: bool,
    pub is_calculating: bool,
    pub calculated_at: Option<DateTime<Utc>>,
    pub rank_calculated_at: Option<DateTime<Utc>>,
}

#[derive(Object)]
pub struct ProfileSummary {
    pub total_playtime: f64,
    pub community_count: i64,
    pub server_count: i64,
    pub is_online: bool,
    pub last_online: Option<DateTime<Utc>>,
    pub last_session_duration: Option<f64>,
    pub best_rank: Option<GlobalMapRank>,
    pub global: GlobalPlaytimeSummary,
}

#[derive(Object)]
pub struct ProfileResponse {
    pub steamid: String, // String to avoid JS precision loss with large i64
    pub name: Option<String>,
    pub summary: ProfileSummary,
    pub communities: Vec<ProfileCommunityDetail>,
    pub is_owner: bool,
    pub anonymization: Option<Vec<UserAnonymization>>,
}

#[derive(Object, Clone)]
pub struct PlayersStatistic{
    pub total_cum_playtime: f64,
    pub total_players: i64,
    pub countries: i64
}
