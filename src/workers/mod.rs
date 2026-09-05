use std::sync::Arc;
use std::future::Future;
use redis::{AsyncCommands, RedisResult};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use sqlx::{Pool, Postgres};
use async_trait::async_trait;
use crate::core::utils::*;
use crate::FastCache;

pub mod consumer;
pub mod job;
pub mod map;
pub mod player;
#[cfg(test)]
pub mod test_support;
pub use map::MapWorker;
pub use player::PlayerWorker;
pub use job::{JobKind, RefreshJob};
use crate::models::maps::DbMap;
use crate::models::players::DbPlayer;
use crate::models::servers::DbServer;

const JOB_INFLIGHT_TTL: i64 = 300;

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
pub enum QueryPriority {
    Light,
    Heavy,
}

#[async_trait]
pub trait WorkerQuery<T>: Send + Sync {
    type Error: Send;

    async fn execute(&self) -> Result<T, Self::Error>;
    fn cache_key_pattern(&self) -> String;
    fn ttl(&self) -> u64;
    fn priority(&self) -> QueryPriority;
    fn job_kind(&self) -> JobKind;
}

pub struct BackgroundWorker {
    pub(crate) cache: Arc<FastCache>,
}

impl BackgroundWorker {
    pub fn new(cache: Arc<FastCache>) -> Self {
        Self { cache }
    }

    pub async fn execute_with_session_fallback<T, Q>(
        &self,
        query: Q,
        current_session: &str,
        previous_session: Option<&str>,
    ) -> WorkResult<CachedResult<T>>
    where
        T: Serialize + for<'de> Deserialize<'de> + Send + Sync + Clone + 'static,
        Q: WorkerQuery<T> + Send + Sync + Clone + 'static,
        Q::Error: Send + 'static + std::fmt::Display,
    {
        let (job, current_key, fallback_key) =
            RefreshJob::for_session(&query, current_session, previous_session);

        self.get_with_fallback(&current_key, fallback_key.as_deref(), job).await
    }
    pub async fn execute_queued<T, Q>(&self, query: Q) -> WorkResult<CachedResult<T>>
    where
        T: Serialize + for<'de> Deserialize<'de> + Send + Sync + Clone + 'static,
        Q: WorkerQuery<T> + Send + Sync + Clone + 'static,
        Q::Error: Send + 'static + std::fmt::Display,
    {
        let job = RefreshJob::for_query(&query);
        let cache_key = job.cache_key.clone();
        self.get_with_fallback(&cache_key, None, job).await
    }
    pub async fn execute_get<T, Q>(
        &self,
        query: Q,
        current_session: &str,
    ) -> WorkResult<CachedResult<T>>
    where
        T: Serialize + for<'de> Deserialize<'de> + Send + Sync + Clone + 'static,
        Q: WorkerQuery<T> + Send + Sync + Clone + 'static,
        Q::Error: Send + 'static + std::fmt::Display,
        WorkError: From<Q::Error>,
    {
        let pattern = query.cache_key_pattern();
        let current_key = pattern.replace("{session}", current_session);

        self.execute(
            &current_key,
            query.ttl(),
            move || {
                let query = query.clone();
                async move { query.execute().await }
            },
        ).await
    }
    pub async fn execute<T, E, F, Fut>(
        &self,
        current_key: &str,
        ttl: u64,
        query_fn: F,
    ) -> WorkResult<CachedResult<T>>
    where
        T: Serialize + DeserializeOwned + Send + Sync + Clone + 'static,
        E: Send + 'static + std::fmt::Display,
        F: Fn() -> Fut + Send + Clone + 'static,
        WorkError: From<E>,
        Fut: Future<Output = Result<T, E>> + Send + 'static,
    {

        if let Ok(result) = self.try_cache_lookup(current_key).await {
            return Ok(CachedResult::current_data(result));
        }

        let result = query_fn().await
            .map_err(|e| WorkError::from(e))?;

        self.cache_result(&current_key, &result, ttl).await;
        Ok(CachedResult::new_data(result))
    }
    pub async fn get_with_fallback<T>(
        &self,
        current_key: &str,
        fallback_key: Option<&str>,
        job: RefreshJob,
    ) -> WorkResult<CachedResult<T>>
    where
        T: Serialize + DeserializeOwned + Send + Sync + Clone + 'static,
    {
        if let Ok(result) = self.try_cache_lookup(current_key).await {
            tracing::debug!("FOUND FIRST CACHE");
            return Ok(CachedResult::current_data(result));
        }

        if let Some(fallback) = fallback_key {
            if let Ok(result) = self.try_cache_lookup(fallback).await {
                tracing::debug!("FOUND SECOND CACHE");
                self.enqueue_refresh_job(job).await;
                return Ok(CachedResult::backup_data(result));
            }
        }
        if let Some(latest) = job.latest_key.as_deref() {
            if let Ok(result) = self.try_cache_lookup(latest).await {
                tracing::debug!("FOUND LATEST CACHE");
                self.enqueue_refresh_job(job).await;
                return Ok(CachedResult::backup_data(result));
            }
        }

        tracing::debug!("CALCULATING INSTEAD");

        self.enqueue_refresh_job(job).await;
        Err(WorkError::Calculating)
    }

    pub async fn enqueue_refresh_job(&self, job: RefreshJob) {
        let payload = match serde_json::to_string(&job) {
            Ok(payload) => payload,
            Err(e) => {
                tracing::error!("Failed to serialize job {}: {e}", job.cache_key);
                return;
            }
        };

        let marker = job::inflight_key(&job.cache_key);
        if try_redis_lock(&self.cache.redis_pool, &marker, JOB_INFLIGHT_TTL).await.is_none() {
            tracing::debug!("ALREADY QUEUED: {}", job.cache_key);
            return;
        }

        let Ok(mut conn) = self.cache.redis_pool.get().await else {
            tracing::warn!("Failed to reach redis to enqueue {}", job.cache_key);
            return;
        };

        let queued: RedisResult<()> = conn.lpush(job.queue(), &payload).await;
        match queued {
            Ok(_) => tracing::info!("Queued {:?} refresh: {}", job.priority, job.cache_key),
            Err(e) => {
                tracing::warn!("Failed to enqueue {}: {e}", job.cache_key);
                let _: RedisResult<()> = conn.del(&marker).await;
            }
        }
    }

    async fn try_cache_lookup<T>(&self, key: &str) -> Result<T, ()>
    where
        T: for<'de> Deserialize<'de>,
    {
        let cache_key = format!("gfl-ze-watcher:{}", key);

        if let Some(val) = self.cache.memory.get(key).await {
            if let Ok(deserialized) = serde_json::from_str::<T>(&val) {
                return Ok(deserialized);
            }
        }
        if let Ok(mut conn) = self.cache.redis_pool.get().await {
            if let Ok(result_str) = conn.get::<_, String>(&cache_key).await {
                self.cache.memory.insert(key.to_string(), result_str.clone()).await;
                if let Ok(deserialized) = serde_json::from_str::<T>(&result_str) {
                    return Ok(deserialized);
                }
            }
        }

        Err(())
    }

    async fn cache_result<T>(&self, key: &str, data: &T, ttl: u64)
    where
        T: Serialize,
    {
        if let Ok(json_value) = serde_json::to_string(data) {
            self.cache_raw(key, &json_value, ttl).await;
        }
    }

    /// Stores an already-serialized result. The consumer runs `dispatch`, which erases the concrete
    /// `T` into JSON, so it has no typed value left to hand `cache_result`.
    pub async fn cache_raw(&self, key: &str, json_value: &str, ttl: u64) {
        let cache_key = format!("gfl-ze-watcher:{key}");
        self.cache.memory.insert(key.to_string(), json_value.to_string()).await;

        if let Ok(mut conn) = self.cache.redis_pool.get().await {
            let _: RedisResult<()> = conn.set_ex(&cache_key, json_value, ttl).await;
        }
    }

    pub async fn drop_cached(&self, key: &str) {
        self.cache.memory.invalidate(key).await;

        if let Ok(mut conn) = self.cache.redis_pool.get().await {
            let cache_key = format!("gfl-ze-watcher:{key}");
            let _: RedisResult<()> = conn.del(&cache_key).await;
        }
    }

    /// Drops every cached entry whose key matches a redis glob, across both tiers.
    ///
    /// Most player views are cached per session (`…:{server}:{player}:{session}`) with TTLs in
    /// the tens of days, so something that invalidates a player's whole history — relinking an
    /// account, say — has no single key to target. Redis is the authority on which keys exist;
    /// the memory tier is keyed on the bare key, so the same scan clears both.
    ///
    /// `SCAN` walks the whole keyspace for a non-prefix pattern, so this is for rare
    /// administrative changes, not request handling.
    pub async fn drop_cached_matching(&self, pattern: &str) {
        let Ok(mut conn) = self.cache.redis_pool.get().await else {
            tracing::warn!("Failed to reach redis to invalidate {pattern}");
            return;
        };

        let scan_pattern = format!("gfl-ze-watcher:{pattern}");
        let mut cursor: u64 = 0;
        let mut dropped = 0usize;

        loop {
            let scanned: RedisResult<(u64, Vec<String>)> = redis::cmd("SCAN")
                .arg(cursor)
                .arg("MATCH")
                .arg(&scan_pattern)
                .arg("COUNT")
                .arg(500)
                .query_async(&mut conn)
                .await;

            let Ok((next, keys)) = scanned else {
                tracing::warn!("SCAN failed while invalidating {pattern}");
                return;
            };

            for key in &keys {
                if let Some(bare) = key.strip_prefix("gfl-ze-watcher:") {
                    self.cache.memory.invalidate(bare).await;
                }
            }
            if !keys.is_empty() {
                dropped += keys.len();
                let _: RedisResult<()> = conn.del(&keys).await;
            }

            if next == 0 {
                break;
            }
            cursor = next;
        }

        tracing::info!("Invalidated {dropped} cached key(s) matching {pattern}");
    }
}

#[derive(Clone)]
pub struct PlayerContext {
    pub player: DbPlayer,
    pub server: DbServer,
    pub cache_key: CacheKey,
}
pub struct MapContext{
    pub server: DbServer,
    pub map: DbMap,
    pub cache_key: CacheKey,
}
pub type WorkResult<T> = Result<T, WorkError>;

#[derive(Clone)]
pub struct Query<T>{
    pub pool: Arc<Pool<Postgres>>,
    pub cache: Arc<FastCache>,
    pub data: T
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PlayerData{
    pub player_id: String,
    pub server_id: String,
    pub current_session: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PlayerSessionData{
    pub player_id: String,
    pub server_id: String,
    pub session_id: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MapData{
    pub map_name: String,
    pub server_id: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PlayerGlobalData{
    pub canonical_id: String,
}

#[derive(Debug)]
pub enum WorkError {
    NotFound,
    Calculating,
    Database(#[allow(dead_code)] sqlx::Error),
}

impl From<sqlx::Error> for WorkError {
    fn from(e: sqlx::Error) -> Self {
        WorkError::Database(e)
    }
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicUsize, Ordering};

    use super::test_support::fake_cache;
    use super::*;

    #[derive(Clone)]
    struct StubQuery {
        pattern: String,
        ttl: u64,
        priority: QueryPriority,
    }

    impl StubQuery {
        fn new(pattern: &str) -> Self {
            Self { pattern: pattern.to_string(), ttl: 1234, priority: QueryPriority::Heavy }
        }
    }

    #[async_trait]
    impl WorkerQuery<Vec<u8>> for StubQuery {
        type Error = sqlx::Error;

        async fn execute(&self) -> Result<Vec<u8>, Self::Error> {
            unreachable!("metadata-only stub")
        }
        fn cache_key_pattern(&self) -> String { self.pattern.clone() }
        fn ttl(&self) -> u64 { self.ttl }
        fn priority(&self) -> QueryPriority { self.priority }
        fn job_kind(&self) -> JobKind {
            JobKind::PlayerGlobalPlaytime { canonical_id: "stub".to_string() }
        }
    }

    fn for_session(
        current: &str, previous: Option<&str>,
    ) -> (RefreshJob, String, Option<String>) {
        let query = StubQuery::new("thing:server-1:player-1:{session}");
        RefreshJob::for_session::<Vec<u8>, _>(&query, current, previous)
    }

    #[test]
    fn session_id_is_substituted_into_both_keys() {
        let (job, current_key, fallback_key) = for_session("now", Some("before"));

        assert_eq!(current_key, "thing:server-1:player-1:now");
        assert_eq!(fallback_key.as_deref(), Some("thing:server-1:player-1:before"));
        assert_eq!(job.cache_key, current_key);
    }

    #[test]
    fn no_previous_session_means_no_fallback_and_nothing_to_evict() {
        let (job, _, fallback_key) = for_session("now", None);

        assert!(fallback_key.is_none());
        assert!(job.stale_key.is_none());
    }

    #[test]
    fn a_rolled_over_session_evicts_the_previous_key() {
        let (job, _, _) = for_session("now", Some("before"));

        assert_eq!(job.stale_key.as_deref(), Some("thing:server-1:player-1:before"));
    }

    /// The guard that matters: when the session has not actually rolled over, the previous key and
    /// the current key are the same string.
    #[test]
    fn an_unchanged_session_is_never_evicted() {
        let (job, current_key, fallback_key) = for_session("now", Some("now"));

        assert_eq!(fallback_key.as_deref(), Some(current_key.as_str()));
        assert!(
            job.stale_key.is_none(),
            "stale_key must not name the key the refresh is about to write",
        );
    }

    #[test]
    fn the_latest_alias_carries_no_session_id() {
        let (job, current_key, _) = for_session("now", Some("before"));
        let latest = job.latest_key.expect("a session-scoped query gets a latest alias");

        assert_eq!(latest, "thing:server-1:player-1:latest");
        assert!(!latest.contains("now"), "the alias must not name a session");
        assert_ne!(latest, current_key);
    }

    #[test]
    fn job_metadata_is_copied_from_the_query() {
        let (job, _, _) = for_session("now", None);

        assert_eq!(job.ttl, 1234);
        assert_eq!(job.queue(), job::QUEUE_HEAVY);
    }

    #[test]
    fn standalone_jobs_have_no_session_fallbacks() {
        let query = StubQuery::new("standalone:player-1");
        let job = RefreshJob::for_query::<Vec<u8>, _>(&query);

        assert_eq!(job.cache_key, "standalone:player-1");
        assert!(job.stale_key.is_none());
        assert!(job.latest_key.is_none());
        assert_eq!(job.queue(), job::QUEUE_HEAVY);
    }

    fn worker() -> BackgroundWorker {
        BackgroundWorker::new(fake_cache())
    }

    /// Counts closure invocations so a "cache hit" assertion can prove the query never ran, rather
    /// than only that the value came back correct.
    struct CountingQuery(Arc<AtomicUsize>);

    impl CountingQuery {
        fn new() -> Self { Self(Arc::new(AtomicUsize::new(0))) }
        fn calls(&self) -> usize { self.0.load(Ordering::SeqCst) }
        fn func(&self) -> impl Fn() -> std::pin::Pin<Box<dyn Future<Output = Result<String, sqlx::Error>> + Send>> + Clone + use<> {
            let counter = self.0.clone();
            move || {
                let counter = counter.clone();
                Box::pin(async move {
                    counter.fetch_add(1, Ordering::SeqCst);
                    Ok("computed".to_string())
                })
            }
        }
    }

    #[tokio::test]
    async fn execute_computes_and_caches_on_a_miss() {
        let worker = worker();
        let query = CountingQuery::new();

        let result: CachedResult<String> =
            worker.execute("k", 60, query.func()).await.expect("should compute");

        assert_eq!(result.result, "computed");
        assert!(result.is_new, "a freshly computed value is new");
        assert_eq!(query.calls(), 1);
    }

    #[tokio::test]
    async fn execute_serves_a_cached_value_without_running_the_query() {
        let worker = worker();
        let query = CountingQuery::new();

        worker.cache_raw("k", "\"from-cache\"", 60).await;
        let result: CachedResult<String> =
            worker.execute("k", 60, query.func()).await.expect("should hit cache");

        assert_eq!(result.result, "from-cache");
        assert!(!result.is_new, "a cached value is not new");
        assert_eq!(query.calls(), 0, "the query must not run on a cache hit");
    }

    #[tokio::test]
    async fn drop_cached_forces_a_recompute() {
        let worker = worker();
        let query = CountingQuery::new();

        worker.cache_raw("k", "\"from-cache\"", 60).await;
        worker.drop_cached("k").await;
        let result: CachedResult<String> =
            worker.execute("k", 60, query.func()).await.expect("should recompute");

        assert_eq!(result.result, "computed");
        assert_eq!(query.calls(), 1);
    }

    /// The two tiers key differently, memory on the bare key, redis on the prefixed one.
    #[tokio::test]
    async fn the_memory_tier_is_keyed_on_the_bare_key() {
        let worker = worker();
        worker.cache_raw("some-key", "\"v\"", 60).await;

        assert_eq!(worker.cache.memory.get("some-key").await.as_deref(), Some("\"v\""));
        assert!(worker.cache.memory.get("gfl-ze-watcher:some-key").await.is_none());
    }

    #[tokio::test]
    async fn an_undeserializable_cached_value_is_treated_as_a_miss() {
        let worker = worker();
        let query = CountingQuery::new();

        worker.cache_raw("k", "this is not json", 60).await;
        let result: CachedResult<String> =
            worker.execute("k", 60, query.func()).await.expect("should fall back to computing");

        assert_eq!(result.result, "computed");
        assert_eq!(query.calls(), 1);
    }

    #[tokio::test]
    async fn get_with_fallback_serves_the_previous_session_as_backup() {
        let worker = worker();
        worker.cache_raw("thing:before", "\"stale\"", 60).await;

        let (job, _, _) = for_session("now", Some("before"));
        let result: CachedResult<String> = worker
            .get_with_fallback("thing:now", Some("thing:before"), job)
            .await
            .expect("fallback should be served");

        assert_eq!(result.result, "stale");
        assert!(result.backup, "a fallback value is flagged as backup");
        assert!(!result.is_new);
    }

    #[tokio::test]
    async fn get_with_fallback_reports_calculating_when_neither_key_is_cached() {
        let worker = worker();
        let (job, _, _) = for_session("now", Some("before"));

        let result: WorkResult<CachedResult<String>> =
            worker.get_with_fallback("thing:now", Some("thing:before"), job).await;

        assert!(matches!(result, Err(WorkError::Calculating)));
    }

    #[tokio::test]
    async fn execute_queued_serves_a_hit_without_running_the_query() {
        let worker = worker();
        worker.cache_raw("standalone:player-1", "[1,2]", 60).await;

        let result: CachedResult<Vec<u8>> = worker
            .execute_queued(StubQuery::new("standalone:player-1"))
            .await
            .expect("a queued query should serve its cached value");

        assert_eq!(result.result, vec![1, 2]);
        assert!(!result.backup);
    }

    #[tokio::test]
    async fn the_latest_alias_is_served_once_both_session_keys_are_gone() {
        let worker = worker();
        worker.cache_raw("thing:server-1:player-1:latest", "\"from-latest\"", 60).await;

        let (job, _, _) = for_session("now", Some("before"));
        let result: CachedResult<String> = worker
            .get_with_fallback("thing:now", Some("thing:before"), job)
            .await
            .expect("the latest alias should be served");

        assert_eq!(result.result, "from-latest");
        assert!(result.backup, "the alias is a fallback value, not a current one");
    }

    /// Tier order matters: the alias is written by every refresh, so it can lag the session keys.
    #[tokio::test]
    async fn the_session_keys_are_preferred_over_the_latest_alias() {
        let worker = worker();
        worker.cache_raw("thing:before", "\"stale\"", 60).await;
        worker.cache_raw("thing:server-1:player-1:latest", "\"from-latest\"", 60).await;

        let (job, _, _) = for_session("now", Some("before"));
        let result: CachedResult<String> = worker
            .get_with_fallback("thing:now", Some("thing:before"), job)
            .await
            .expect("the previous session should win");

        assert_eq!(result.result, "stale");
    }

    #[tokio::test]
    async fn a_current_hit_wins_over_the_fallback() {
        let worker = worker();
        worker.cache_raw("thing:now", "\"fresh\"", 60).await;
        worker.cache_raw("thing:before", "\"stale\"", 60).await;

        let (job, _, _) = for_session("now", Some("before"));
        let result: CachedResult<String> = worker
            .get_with_fallback("thing:now", Some("thing:before"), job)
            .await
            .expect("current key should be served");

        assert_eq!(result.result, "fresh");
        assert!(!result.backup);
    }
}

#[cfg(test)]
mod cache_key_tests {
    use std::collections::HashSet;

    use crate::models::admins::DbEvent;
    use crate::models::maps::*;
    use crate::models::players::*;
    use crate::models::servers::DbServerMapPartial;
    use super::test_support::{map_query, player_global_query, player_query, player_session_query};
    use super::WorkerQuery;

    #[tokio::test]
    async fn no_two_queries_share_a_cache_key_pattern() {
        let patterns = vec![
            player_query::<Vec<DbPlayerSessionTime>>().cache_key_pattern(),
            player_query::<Vec<DbPlayerMapPlayed>>().cache_key_pattern(),
            player_query::<Option<DbPlayerRank>>().cache_key_pattern(),
            player_query::<Vec<DbMapRank>>().cache_key_pattern(),
            player_query::<Vec<DbPlayerAlias>>().cache_key_pattern(),
            player_query::<DbPlayerDetail>().cache_key_pattern(),
            player_query::<Option<DbPlayerWithLegacyRanks>>().cache_key_pattern(),
            player_query::<Vec<DbPlayerRegionTime>>().cache_key_pattern(),
            player_query::<Vec<DbPlayerHourCount>>().cache_key_pattern(),
            player_query::<Vec<DbPlayerOnlineHeatmap>>().cache_key_pattern(),
            player_session_query::<Vec<DbPlayerSeen>>().cache_key_pattern(),
            player_global_query::<DbGlobalPlaytimeSnapshot>().cache_key_pattern(),
            player_global_query::<Vec<DbPlayerCommunityPlaytime>>().cache_key_pattern(),
            map_query::<Vec<DbMapRegion>>().cache_key_pattern(),
            map_query::<Vec<DbMapRegionDate>>().cache_key_pattern(),
            map_query::<Vec<DbEvent>>().cache_key_pattern(),
            map_query::<Vec<DbMapSessionDistribution>>().cache_key_pattern(),
            map_query::<DbServerMapPartial>().cache_key_pattern(),
            map_query::<Option<DbMapMeta>>().cache_key_pattern(),
            map_query::<Vec<DbMapPlayerTypeTime>>().cache_key_pattern(),
            map_query::<DbMapInfo>().cache_key_pattern(),
            map_query::<DbMapAnalyze>().cache_key_pattern(),
        ];

        let unique: HashSet<&String> = patterns.iter().collect();
        assert_eq!(
            unique.len(), patterns.len(),
            "two WorkerQuery impls resolve to the same cache key; patterns were {patterns:#?}",
        );
        assert_eq!(patterns.len(), 22, "every WorkerQuery impl must be listed here");
    }
}
