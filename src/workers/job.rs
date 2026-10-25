use std::sync::Arc;
use serde::{Deserialize, Serialize};
use sqlx::{Pool, Postgres};

use crate::FastCache;
use crate::models::admins::DbEvent;
use crate::models::maps::*;
use crate::models::players::*;
use crate::models::servers::*;
use super::player::run_global_playtime_job;
use super::{MapData, MapPeriodData, PlayerData, PlayerGlobalData, PlayerPeriodData, PlayerSessionData, Query, QueryPriority, WorkerQ, WorkerQuery};

pub const QUEUE_HEAVY: &str = "gfl-ze-watcher:jobs:heavy";
pub const QUEUE_LIGHT: &str = "gfl-ze-watcher:jobs:light";

pub fn inflight_key(cache_key: &str) -> String {
    format!("gfl-ze-watcher:job:inflight:{cache_key}")
}

#[derive(Clone, Serialize, Deserialize)]
pub struct RefreshJob {
    pub kind: JobKind,
    pub cache_key: String,
    pub ttl: u64,
    pub priority: QueryPriority,
    #[serde(default)]
    pub stale_key: Option<String>,
    #[serde(default)]
    pub latest_key: Option<String>,
}

pub const LATEST_SESSION_ALIAS: &str = "latest";

impl RefreshJob {
    pub fn queue(&self) -> &'static str {
        match self.priority {
            QueryPriority::Heavy => QUEUE_HEAVY,
            QueryPriority::Light => QUEUE_LIGHT,
        }
    }

    pub(crate) fn for_session<T, Q>(
        query: &Q,
        current_session: &str,
        previous_session: Option<&str>,
    ) -> (Self, String, Option<String>)
    where
        Q: WorkerQuery<T> + ?Sized,
    {
        let pattern = query.cache_key_pattern();
        let current_key = pattern.replace("{session}", current_session);
        let fallback_key = previous_session.map(|prev| pattern.replace("{session}", prev));

        let job = Self {
            kind: query.job_kind(),
            cache_key: current_key.clone(),
            ttl: query.ttl(),
            priority: query.priority(),
            stale_key: fallback_key.as_deref()
                .filter(|k| *k != current_key)
                .map(str::to_string),
            latest_key: Some(pattern.replace("{session}", LATEST_SESSION_ALIAS))
                .filter(|k| *k != current_key),
        };

        (job, current_key, fallback_key)
    }

    pub(crate) fn for_query<T, Q>(query: &Q) -> Self
    where
        Q: WorkerQuery<T> + ?Sized,
    {
        Self {
            kind: query.job_kind(),
            cache_key: query.cache_key_pattern(),
            ttl: query.ttl(),
            priority: query.priority(),
            stale_key: None,
            latest_key: None,
        }
    }
}

macro_rules! job_registry {
    ($($variant:ident($data:ident) => $out:ty,)*) => {
        #[derive(Clone, Serialize, Deserialize)]
        pub enum JobKind {
            $($variant($data),)*
            PlayerGlobalPlaytime { canonical_id: String },
        }

        pub async fn dispatch(
            kind: &JobKind,
            pool: Arc<Pool<Postgres>>,
            cache: Arc<FastCache>,
        ) -> Result<Option<String>, JobError> {
            let json = match kind {
                $(JobKind::$variant(d) => {
                    let result = WorkerQ::<_, $out>::raw(Query { pool, cache, data: d.clone() }).execute().await?;
                    Some(serde_json::to_string(&result)?)
                })*
                JobKind::PlayerGlobalPlaytime { canonical_id } => {
                    run_global_playtime_job(pool, cache, canonical_id).await?;
                    None
                }
            };
            Ok(json)
        }

        #[cfg(test)]
        fn all_job_kinds() -> Vec<JobKind> {
            use super::test_support::Fixture;
            vec![
                $(JobKind::$variant(Fixture::fixture()),)*
                JobKind::PlayerGlobalPlaytime { canonical_id: "canon".to_string() },
            ]
        }
    };
}

job_registry! {
    MapRegions(MapData) => Vec<DbMapRegion>,
    MapHeatRegions(MapData) => Vec<DbMapRegionDate>,
    MapEvents(MapData) => Vec<DbEvent>,
    MapSessionDistribution(MapData) => Vec<DbMapSessionDistribution>,
    MapPartial(MapData) => DbServerMapPartial,
    MapMetadata(MapData) => Option<DbMapMeta>,
    MapPlayerTypeTime(MapData) => Vec<DbMapPlayerTypeTime>,
    MapInfo(MapData) => DbMapInfo,
    MapAnalyze(MapData) => DbMapAnalyze,

    MapPeriodAnalyze(MapPeriodData) => DbMapAnalyze,
    MapPeriodRegions(MapPeriodData) => Vec<DbMapRegion>,
    MapPeriodHeatRegions(MapPeriodData) => Vec<DbMapRegionDate>,
    MapPeriodSessionDistribution(MapPeriodData) => Vec<DbMapSessionDistribution>,
    MapPeriodPlayerTypeTime(MapPeriodData) => Vec<DbMapPlayerTypeTime>,
    MapPeriodTopPlayers(MapPeriodData) => Vec<DbMapPeriodPlayer>,

    PlayerSessionTime(PlayerData) => Vec<DbPlayerSessionTime>,
    PlayerMapPlayed(PlayerData) => Vec<DbPlayerMapPlayed>,
    PlayerPlaytimeRanks(PlayerData) => Option<DbPlayerRank>,
    PlayerMapRanks(PlayerData) => Vec<DbMapRank>,
    PlayerAliases(PlayerData) => Vec<DbPlayerAlias>,
    PlayerDetail(PlayerData) => DbPlayerDetail,
    PlayerLegacyStats(PlayerData) => Option<DbGflPlayerStats>,
    PlayerNideStats(PlayerData) => Option<DbNidePlayerStats>,
    PlayerMapeadoresStats(PlayerData) => Option<DbMapeadoresPlayerStats>,
    PlayerRunawayStats(PlayerData) => Option<DbRunawayPlayerStats>,
    PlayerRegionTime(PlayerData) => Vec<DbPlayerRegionTime>,
    PlayerHourCount(PlayerData) => Vec<DbPlayerHourCount>,
    PlayerOnlineHeatmap(PlayerData) => Vec<DbPlayerOnlineHeatmap>,
    PlayerMightFriends(PlayerData) => Vec<DbPlayerSeen>,

    PlayerPeriodMapPlayed(PlayerPeriodData) => Vec<DbPlayerMapPlayed>,
    PlayerPeriodDetail(PlayerPeriodData) => DbPlayerDetail,
    PlayerPeriodSessionTime(PlayerPeriodData) => Vec<DbPlayerSessionTime>,
    PlayerPeriodHourCount(PlayerPeriodData) => Vec<DbPlayerHourCount>,
    PlayerPeriodOnlineHeatmap(PlayerPeriodData) => Vec<DbPlayerOnlineHeatmap>,
    PlayerPeriodRegionTime(PlayerPeriodData) => Vec<DbPlayerRegionTime>,
    PlayerPeriodPlayedWith(PlayerPeriodData) => Vec<DbPlayerSeen>,

    PlayerSeen(PlayerSessionData) => Vec<DbPlayerSeen>,

    PlayerGlobalSnapshot(PlayerGlobalData) => DbGlobalPlaytimeSnapshot,
}

#[derive(Debug)]
pub enum JobError {
    Database(sqlx::Error),
    Serde(serde_json::Error),
}

impl From<sqlx::Error> for JobError {
    fn from(e: sqlx::Error) -> Self {
        JobError::Database(e)
    }
}

impl From<serde_json::Error> for JobError {
    fn from(e: serde_json::Error) -> Self {
        JobError::Serde(e)
    }
}

impl std::fmt::Display for JobError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            JobError::Database(e) => write!(f, "database: {e}"),
            JobError::Serde(e) => write!(f, "serde: {e}"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::super::test_support::{player_data, player_period_data};
    use super::*;

    fn job(priority: QueryPriority) -> RefreshJob {
        RefreshJob {
            kind: JobKind::PlayerSessionTime(player_data()),
            cache_key: "player-session:server-1:player-1:sess".to_string(),
            ttl: 3600,
            priority,
            stale_key: Some("player-session:server-1:player-1:old".to_string()),
            latest_key: Some("player-session:server-1:player-1:latest".to_string()),
        }
    }

    #[test]
    fn priority_selects_the_queue() {
        assert_eq!(job(QueryPriority::Heavy).queue(), QUEUE_HEAVY);
        assert_eq!(job(QueryPriority::Light).queue(), QUEUE_LIGHT);
        assert_ne!(QUEUE_HEAVY, QUEUE_LIGHT);
    }

    #[test]
    fn the_inflight_marker_has_a_stable_shape() {
        assert_eq!(inflight_key("map-info:s1:ze_map"), "gfl-ze-watcher:job:inflight:map-info:s1:ze_map");
    }

    #[test]
    fn a_job_survives_a_round_trip_through_the_queue() {
        let original = job(QueryPriority::Heavy);
        let encoded = serde_json::to_string(&original).expect("serializable");
        let decoded: RefreshJob = serde_json::from_str(&encoded).expect("deserializable");

        assert_eq!(decoded.cache_key, original.cache_key);
        assert_eq!(decoded.ttl, original.ttl);
        assert_eq!(decoded.stale_key, original.stale_key);
        assert_eq!(decoded.latest_key, original.latest_key);
        assert_eq!(decoded.queue(), QUEUE_HEAVY);
        assert!(matches!(decoded.kind, JobKind::PlayerSessionTime(d) if d.player_id == player_data().player_id));
    }

    #[test]
    fn a_payload_predating_stale_key_still_deserializes() {
        let legacy = r#"{
            "kind": {"PlayerAliases": {"player_id": "p", "server_id": "s", "current_session": "sess"}},
            "cache_key": "player-aliases:p:sess",
            "ttl": 60,
            "priority": "Light"
        }"#;

        let decoded: RefreshJob = serde_json::from_str(legacy).expect("legacy payload must decode");

        assert!(decoded.stale_key.is_none());
        assert!(decoded.latest_key.is_none());
        assert_eq!(decoded.queue(), QUEUE_LIGHT);
    }

    #[test]
    fn a_period_job_survives_a_round_trip_through_the_queue() {
        let encoded = serde_json::to_string(&JobKind::PlayerPeriodDetail(player_period_data(false)))
            .expect("serializable");
        let decoded: JobKind = serde_json::from_str(&encoded).expect("deserializable");

        assert!(matches!(
            decoded,
            JobKind::PlayerPeriodDetail(d) if d.period == player_period_data(false).period && !d.closed
        ));
    }

    #[test]
    fn every_job_kind_round_trips_to_a_distinct_tag() {
        let mut tags = std::collections::HashSet::new();

        for kind in all_job_kinds() {
            let encoded = serde_json::to_string(&kind).expect("serializable");
            serde_json::from_str::<JobKind>(&encoded).expect("deserializable");

            let tag = encoded.split(['{', '"']).find(|s| !s.is_empty()).unwrap().to_string();
            assert!(tags.insert(tag.clone()), "two JobKind variants share the tag {tag}");
        }

        assert_eq!(tags.len(), 39, "all variants must be covered by all_job_kinds()");
    }
}
