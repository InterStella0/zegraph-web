use serde::{Deserialize, Serialize};
use serde_macros::{auto_serde_with, DbInto};
use sqlx::postgres::types::PgInterval;
use time::OffsetDateTime;
use crate::api_models::players::*;
use crate::core::utils::*;
use crate::global_serializer::*;

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
            is_anonymous: false,
        }
    }
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
    pub is_anonymous: bool,
}

#[derive(Clone, DbInto)]
#[auto_serde_with]
#[db_into(PlayerAlias)]
pub struct DbPlayerAlias{
    pub name: String,
    pub created_at: OffsetDateTime,
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