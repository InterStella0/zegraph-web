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
pub use map::MapWorker;
pub use player::PlayerWorker;
pub use job::{JobKind, RefreshJob};
use crate::models::maps::DbMap;
use crate::models::players::DbPlayer;
use crate::models::servers::DbServer;

/// How long a queued-or-running marker survives without the worker clearing it. Bounds how long a
/// key stays stuck as "calculating" if the worker dies mid-job.
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
    /// The serializable descriptor a worker process needs to rebuild and re-run this query.
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
        let pattern = query.cache_key_pattern();
        let current_key = pattern.replace("{session}", current_session);
        let fallback_key = previous_session.map(|prev| pattern.replace("{session}", prev));

        let job = RefreshJob {
            kind: query.job_kind(),
            cache_key: current_key.clone(),
            ttl: query.ttl(),
            priority: query.priority(),
            // Drop the previous session's key once the refresh lands; guard against evicting the
            // key we're about to write in case the session id hasn't actually rolled over.
            stale_key: fallback_key.as_deref()
                .filter(|k| *k != current_key)
                .map(str::to_string),
        };

        self.get_with_fallback(&current_key, fallback_key.as_deref(), job).await
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

        tracing::debug!("CALCULATING INSTEAD");

        self.enqueue_refresh_job(job).await;
        Err(WorkError::Calculating)
    }

    /// Hands the query to the worker process and returns immediately.
    ///
    /// The `SET NX EX` marker is the dedup: it replaces the old in-process `active_tasks` map,
    /// which only ever deduped within one process and so double-ran every heavy query as soon as
    /// the API was scaled past one replica. Its TTL is also the crash guard — if the worker dies
    /// holding a job, the marker expires and the next reader re-enqueues, which is why a plain
    /// `BRPOP` (at-most-once) is enough here and an ack/redelivery protocol is not.
    pub async fn enqueue_refresh_job(&self, job: RefreshJob) {
        // Serialize before claiming the marker: a failure afterwards would strand the key as
        // "calculating" with nothing queued to clear it.
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
            // Leaving the marker set would stall this key until the TTL expires, so drop it and
            // let the next request retry immediately.
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

    /// Evicts a key from both cache tiers. The mirror of `cache_raw`: memory holds the bare key,
    /// redis the `gfl-ze-watcher:`-prefixed one.
    pub async fn drop_cached(&self, key: &str) {
        self.cache.memory.invalidate(key).await;

        if let Ok(mut conn) = self.cache.redis_pool.get().await {
            let cache_key = format!("gfl-ze-watcher:{key}");
            let _: RedisResult<()> = conn.del(&cache_key).await;
        }
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

#[allow(dead_code)]
#[derive(Debug)]
pub enum WorkError {
    NotFound,
    Calculating,
    Database(sqlx::Error),
}

impl From<sqlx::Error> for WorkError {
    fn from(e: sqlx::Error) -> Self {
        WorkError::Database(e)
    }
}
