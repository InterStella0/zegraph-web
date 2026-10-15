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
    #[skip]
    pub qualified_rank: Option<i64>,
    #[skip]
    pub score: Option<f64>,
}

pub const BEST_MAP_RANK_MIN_HOURS: i32 = 5;

pub type BestMapKey<'a> = (f64, f64, &'a str);

pub fn best_map_rank_order(a: BestMapKey, b: BestMapKey) -> std::cmp::Ordering {
    a.0.total_cmp(&b.0)
        .then_with(|| b.1.total_cmp(&a.1))
        .then_with(|| a.2.cmp(b.2))
}

impl DbMapRank {
    fn best_map_key(&self) -> Option<BestMapKey<'_>> {
        self.qualified_rank?;
        let playtime = self.total_playtime.clone().map(pg_interval_to_f64).unwrap_or_default();
        Some((self.score?, playtime, self.map.as_deref()?))
    }

    pub fn best(ranks: Vec<Self>) -> Option<Self> {
        ranks.into_iter()
            .filter(|e| e.best_map_key().is_some())
            .min_by(|a, b| best_map_rank_order(a.best_map_key().unwrap(), b.best_map_key().unwrap()))
            .map(|e| Self { rank: e.qualified_rank, ..e })
    }
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

/// A player's time on a map over one period, as cached for the period's top-players list.
#[derive(Clone)]
#[auto_serde_with]
pub struct DbMapPeriodPlayer{
    pub player_id: String,
    pub player_name: String,
    pub total_playtime: Option<PgInterval>,
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

#[cfg(test)]
mod best_map_rank_tests {
    use super::*;
    use crate::models::admins::DbGlobalMapRankEntry;

    fn rank(map: &str, rank: Option<i64>, hours: i64, score: Option<f64>) -> DbMapRank {
        DbMapRank {
            map: Some(map.to_string()),
            rank: Some(999),
            total_playtime: Some(PgInterval { months: 0, days: 0, microseconds: hours * 3_600_000_000 }),
            qualified_rank: rank,
            score,
        }
    }

    fn best_map(ranks: Vec<DbMapRank>) -> Option<String> {
        DbMapRank::best(ranks).and_then(|e| e.map)
    }

    #[test]
    fn a_first_place_on_a_quiet_map_loses_to_a_better_fraction_on_a_busy_one() {
        let ranks = vec![
            rank("ze_quiet", Some(1), 6, Some(1.0 / 20.0)),
            rank("ze_busy", Some(3), 300, Some(3.0 / 4000.0)),
        ];
        assert_eq!(best_map(ranks).as_deref(), Some("ze_busy"));
    }

    #[test]
    fn equal_scores_go_to_the_most_playtime() {
        let ranks = vec![
            rank("ze_a", Some(1), 16, Some(0.01)),
            rank("ze_b", Some(1), 78, Some(0.01)),
            rank("ze_c", Some(1), 25, Some(0.01)),
        ];
        assert_eq!(best_map(ranks).as_deref(), Some("ze_b"));
    }

    #[test]
    fn equal_scores_and_playtime_go_to_the_map_name_whatever_the_input_order() {
        let forward = vec![rank("ze_a", Some(1), 10, Some(0.5)), rank("ze_b", Some(1), 10, Some(0.5))];
        let reversed = vec![rank("ze_b", Some(1), 10, Some(0.5)), rank("ze_a", Some(1), 10, Some(0.5))];
        assert_eq!(best_map(forward).as_deref(), Some("ze_a"));
        assert_eq!(best_map(reversed).as_deref(), Some("ze_a"));
    }

    #[test]
    fn the_picked_rank_is_the_one_the_score_was_computed_from() {
        let best = DbMapRank::best(vec![rank("ze_a", Some(3), 10, Some(0.3))]).unwrap();
        assert_eq!(best.rank, Some(3));
    }

    #[test]
    fn a_missing_rank_is_never_picked() {
        let ranks = vec![
            rank("ze_unranked", None, 100, Some(0.0)),
            rank("ze_ranked", Some(5), 10, Some(0.5)),
        ];
        assert_eq!(best_map(ranks).as_deref(), Some("ze_ranked"));
    }

    #[test]
    fn maps_without_a_score_are_skipped() {
        let ranks = vec![rank("ze_short", Some(1), 2, None), rank("ze_long", Some(9), 50, Some(0.9))];
        assert_eq!(best_map(ranks).as_deref(), Some("ze_long"));
        assert_eq!(best_map(vec![rank("ze_short", Some(1), 2, None)]), None);
    }

    #[test]
    fn a_sole_qualifying_player_scores_the_worst_possible() {
        let ranks = vec![
            rank("ze_alone", Some(1), 40, Some(1.0)),
            rank("ze_shared", Some(9), 10, Some(9.0 / 10.0)),
        ];
        assert_eq!(best_map(ranks).as_deref(), Some("ze_shared"));
    }

    #[test]
    fn global_entries_use_the_same_order() {
        let entry = |map: &str, rank: Option<i64>, score: Option<f64>, hours: f64| DbGlobalMapRankEntry {
            player_id: "1".into(),
            global_position: Some(1),
            map: Some(map.into()),
            rank,
            score,
            playtime_seconds: Some(hours * 3600.0),
        };
        let entries = [
            entry("ze_none", None, Some(0.0), 99.0),
            entry("ze_less", Some(1), Some(0.2), 10.0),
            entry("ze_more", Some(1), Some(0.2), 20.0),
        ];
        let best = entries.iter()
            .filter(|e| e.best_map_key().is_some())
            .min_by(|a, b| best_map_rank_order(a.best_map_key().unwrap(), b.best_map_key().unwrap()))
            .and_then(|e| e.map.as_deref());
        assert_eq!(best, Some("ze_more"));
    }
}
