use std::sync::Arc;
use serde::{Deserialize, Serialize};
use sqlx::{Pool, Postgres};

use crate::core::model::*;
use crate::FastCache;
use super::map::MapBasicQuery;
use super::player::{run_global_playtime_job, PlayerBasicQuery, PlayerSessionQuery};
use super::{MapData, PlayerData, PlayerSessionData, Query, QueryPriority, WorkerQuery};

pub const QUEUE_HEAVY: &str = "gfl-ze-watcher:jobs:heavy";
pub const QUEUE_LIGHT: &str = "gfl-ze-watcher:jobs:light";

/// Marks a cache key as queued-or-running. Its presence is what a REST process reports as
/// "calculating"; its TTL is what lets a key recover if the worker dies mid-job.
pub fn inflight_key(cache_key: &str) -> String {
    format!("gfl-ze-watcher:job:inflight:{cache_key}")
}

/// A unit of work, fully described by data (no closures), so it can cross a process boundary.
///
/// `cache_key`, `ttl` and `priority` are resolved by the producer rather than re-derived by the
/// consumer: the producer already substituted `{session}` into `cache_key_pattern()`, and copying
/// the resolved values removes any chance of the two sides disagreeing about where a result lands.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RefreshJob {
    pub kind: JobKind,
    pub cache_key: String,
    pub ttl: u64,
    pub priority: QueryPriority,
}

impl RefreshJob {
    pub fn queue(&self) -> &'static str {
        match self.priority {
            QueryPriority::Heavy => QUEUE_HEAVY,
            QueryPriority::Light => QUEUE_LIGHT,
        }
    }
}

/// One variant per `WorkerQuery` impl. The `T` that used to be a phantom type parameter becomes a
/// tag here, because the queue carries bytes and not types.
#[derive(Debug, Clone, Serialize, Deserialize)]
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

    // PlayerSessionQuery<T>
    PlayerSeen(PlayerSessionData),

    /// Not a `WorkerQuery`: it re-derives every server's playtime for one player and upserts the
    /// summation, producing no cacheable value. It is the heaviest thing the app runs, which is
    /// exactly why it belongs out here rather than on the API's runtime.
    PlayerGlobalPlaytime { canonical_id: String },
}

/// Rebuilds the concrete query from its descriptor, runs it, and hands back the serialized result.
///
/// Returning JSON rather than a typed value is what lets a single function cover every arm: each
/// arm resolves to a different `T`, but they all serialize into the same cache. `None` means the
/// job was purely side-effecting and has no value to store.
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

        JobKind::PlayerSeen(d) => run!(player_session_query::<Vec<DbPlayerSeen>>(d, pool, cache)),

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
