use std::sync::Arc;
use serde::{Deserialize, Serialize};
use sqlx::{Pool, Postgres};

use crate::FastCache;
use crate::models::admins::DbEvent;
use crate::models::maps::*;
use crate::models::players::*;
use crate::models::servers::*;
use super::map::MapBasicQuery;
use super::player::{run_global_playtime_job, PlayerBasicQuery, PlayerGlobalQuery, PlayerSessionQuery};
use super::{MapData, PlayerData, PlayerGlobalData, PlayerSessionData, Query, QueryPriority, WorkerQuery};

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
}

#[derive(Clone, Serialize, Deserialize)]
pub enum JobKind {
    // MapBasicQuery<T>
    MapRegions(MapData),
    MapHeatRegions(MapData),
    MapEvents(MapData),
    MapSessionDistribution(MapData),
    MapPartial(MapData),
    MapMetadata(MapData),
    MapPlayerTypeTime(MapData),
    MapInfo(MapData),
    MapAnalyze(MapData),

    // PlayerBasicQuery<T>
    PlayerSessionTime(PlayerData),
    PlayerMapPlayed(PlayerData),
    PlayerPlaytimeRanks(PlayerData),
    PlayerMapRanks(PlayerData),
    PlayerAliases(PlayerData),
    PlayerDetail(PlayerData),
    PlayerRegionTime(PlayerData),
    PlayerHourCount(PlayerData),
    PlayerOnlineHeatmap(PlayerData),

    // PlayerSessionQuery<T>
    PlayerSeen(PlayerSessionData),

    // PlayerGlobalQuery<T>
    PlayerGlobalSnapshot(PlayerGlobalData),
    PlayerCommunityPlaytime(PlayerGlobalData),

    /// Not a `WorkerQuery`
    PlayerGlobalPlaytime { canonical_id: String },
}

pub async fn dispatch(
    kind: &JobKind,
    pool: Arc<Pool<Postgres>>,
    cache: Arc<FastCache>,
) -> Result<Option<String>, JobError> {
    macro_rules! run {
        ($query:expr) => {{
            let result = $query.execute().await?;
            Some(serde_json::to_string(&result)?)
        }};
    }

    let json = match kind {
        JobKind::MapRegions(d) => run!(map_query::<Vec<DbMapRegion>>(d, pool, cache)),
        JobKind::MapHeatRegions(d) => run!(map_query::<Vec<DbMapRegionDate>>(d, pool, cache)),
        JobKind::MapEvents(d) => run!(map_query::<Vec<DbEvent>>(d, pool, cache)),
        JobKind::MapSessionDistribution(d) => {
            run!(map_query::<Vec<DbMapSessionDistribution>>(d, pool, cache))
        }
        JobKind::MapPartial(d) => run!(map_query::<DbServerMapPartial>(d, pool, cache)),
        JobKind::MapMetadata(d) => run!(map_query::<Option<DbMapMeta>>(d, pool, cache)),
        JobKind::MapPlayerTypeTime(d) => run!(map_query::<Vec<DbMapPlayerTypeTime>>(d, pool, cache)),
        JobKind::MapInfo(d) => run!(map_query::<DbMapInfo>(d, pool, cache)),
        JobKind::MapAnalyze(d) => run!(map_query::<DbMapAnalyze>(d, pool, cache)),

        JobKind::PlayerSessionTime(d) => {
            run!(player_query::<Vec<DbPlayerSessionTime>>(d, pool, cache))
        }
        JobKind::PlayerMapPlayed(d) => run!(player_query::<Vec<DbPlayerMapPlayed>>(d, pool, cache)),
        JobKind::PlayerPlaytimeRanks(d) => {
            run!(player_query::<Option<DbPlayerRank>>(d, pool, cache))
        }
        JobKind::PlayerMapRanks(d) => run!(player_query::<Vec<DbMapRank>>(d, pool, cache)),
        JobKind::PlayerAliases(d) => run!(player_query::<Vec<DbPlayerAlias>>(d, pool, cache)),
        JobKind::PlayerDetail(d) => run!(player_query::<DbPlayerDetail>(d, pool, cache)),
        JobKind::PlayerRegionTime(d) => run!(player_query::<Vec<DbPlayerRegionTime>>(d, pool, cache)),
        JobKind::PlayerHourCount(d) => run!(player_query::<Vec<DbPlayerHourCount>>(d, pool, cache)),
        JobKind::PlayerOnlineHeatmap(d) => {
            run!(player_query::<Vec<DbPlayerOnlineHeatmap>>(d, pool, cache))
        }

        JobKind::PlayerSeen(d) => run!(player_session_query::<Vec<DbPlayerSeen>>(d, pool, cache)),

        JobKind::PlayerGlobalSnapshot(d) => {
            run!(player_global_query::<DbGlobalPlaytimeSnapshot>(d, pool, cache))
        }
        JobKind::PlayerCommunityPlaytime(d) => {
            run!(player_global_query::<Vec<DbPlayerCommunityPlaytime>>(d, pool, cache))
        }

        JobKind::PlayerGlobalPlaytime { canonical_id } => {
            run_global_playtime_job(pool, cache, canonical_id).await?;
            None
        }
    };
    Ok(json)
}

fn map_query<T>(data: &MapData, pool: Arc<Pool<Postgres>>, cache: Arc<FastCache>) -> MapBasicQuery<T> {
    MapBasicQuery::raw(Query { pool, cache, data: data.clone() })
}

fn player_query<T>(
    data: &PlayerData, pool: Arc<Pool<Postgres>>, cache: Arc<FastCache>,
) -> PlayerBasicQuery<T> {
    PlayerBasicQuery::raw(Query { pool, cache, data: data.clone() })
}

fn player_session_query<T>(
    data: &PlayerSessionData, pool: Arc<Pool<Postgres>>, cache: Arc<FastCache>,
) -> PlayerSessionQuery<T> {
    PlayerSessionQuery::raw(Query { pool, cache, data: data.clone() })
}

fn player_global_query<T>(
    data: &PlayerGlobalData, pool: Arc<Pool<Postgres>>, cache: Arc<FastCache>,
) -> PlayerGlobalQuery<T> {
    PlayerGlobalQuery::raw(Query { pool, cache, data: data.clone() })
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
    use super::super::test_support::{map_data, player_data, player_global_data, player_session_data};
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

    fn all_job_kinds() -> Vec<JobKind> {
        let (p, m, s, g) = (player_data(), map_data(), player_session_data(), player_global_data());
        let kinds = vec![
            JobKind::MapRegions(m.clone()),
            JobKind::MapHeatRegions(m.clone()),
            JobKind::MapEvents(m.clone()),
            JobKind::MapSessionDistribution(m.clone()),
            JobKind::MapPartial(m.clone()),
            JobKind::MapMetadata(m.clone()),
            JobKind::MapPlayerTypeTime(m.clone()),
            JobKind::MapInfo(m.clone()),
            JobKind::MapAnalyze(m),
            JobKind::PlayerSessionTime(p.clone()),
            JobKind::PlayerMapPlayed(p.clone()),
            JobKind::PlayerPlaytimeRanks(p.clone()),
            JobKind::PlayerMapRanks(p.clone()),
            JobKind::PlayerAliases(p.clone()),
            JobKind::PlayerDetail(p.clone()),
            JobKind::PlayerRegionTime(p.clone()),
            JobKind::PlayerHourCount(p.clone()),
            JobKind::PlayerOnlineHeatmap(p),
            JobKind::PlayerSeen(s),
            JobKind::PlayerGlobalSnapshot(g.clone()),
            JobKind::PlayerCommunityPlaytime(g),
            JobKind::PlayerGlobalPlaytime { canonical_id: "canon".to_string() },
        ];

        for kind in &kinds {
            match kind {
                JobKind::MapRegions(_) | JobKind::MapHeatRegions(_) | JobKind::MapEvents(_)
                | JobKind::MapSessionDistribution(_) | JobKind::MapPartial(_)
                | JobKind::MapMetadata(_) | JobKind::MapPlayerTypeTime(_) | JobKind::MapInfo(_)
                | JobKind::MapAnalyze(_) | JobKind::PlayerSessionTime(_)
                | JobKind::PlayerMapPlayed(_) | JobKind::PlayerPlaytimeRanks(_)
                | JobKind::PlayerMapRanks(_) | JobKind::PlayerAliases(_) | JobKind::PlayerDetail(_)
                | JobKind::PlayerRegionTime(_) | JobKind::PlayerHourCount(_)
                | JobKind::PlayerOnlineHeatmap(_) | JobKind::PlayerSeen(_)
                | JobKind::PlayerGlobalSnapshot(_) | JobKind::PlayerCommunityPlaytime(_)
                | JobKind::PlayerGlobalPlaytime { .. } => {}
            }
        }
        kinds
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

        assert_eq!(tags.len(), 22, "all variants must be covered by all_job_kinds()");
    }
}
