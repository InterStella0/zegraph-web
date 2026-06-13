use std::collections::HashMap;
use std::sync::Arc;
use std::future::Future;
use redis::{AsyncCommands, RedisResult};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use sqlx::{Pool, Postgres};
use tokio::sync::{RwLock, Semaphore};
use async_trait::async_trait;
use crate::core::model::*;
use crate::core::utils::*;
use crate::FastCache;

pub mod map;
pub mod player;
pub use map::MapWorker;
pub use player::PlayerWorker;

#[derive(Clone, Copy)]
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
}

pub struct BackgroundWorker {
    pub(crate) cache: Arc<FastCache>,
    heavy_semaphore: Arc<Semaphore>,
    active_tasks: Arc<RwLock<HashMap<String, tokio::task::JoinHandle<()>>>>,
}

impl BackgroundWorker {
    pub fn new(cache: Arc<FastCache>, max_heavy_concurrent: usize) -> Self {
        Self {
            cache,
            heavy_semaphore: Arc::new(Semaphore::new(max_heavy_concurrent)),
            active_tasks: Arc::new(RwLock::new(HashMap::new())),
        }
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

        self.get_with_fallback(
            &current_key,
            fallback_key.as_deref(),
            query.ttl(),
            query.priority(),
            move || {
                let query = query.clone();
                async move { query.execute().await }
            },
        ).await
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
    pub async fn get_with_fallback<T, E, F, Fut>(
        &self,
        current_key: &str,
        fallback_key: Option<&str>,
        ttl: u64,
        priority: QueryPriority,
        query_fn: F,
    ) -> WorkResult<CachedResult<T>>
    where
        T: Serialize + DeserializeOwned + Send + Sync + Clone + 'static,
        E: Send + 'static + std::fmt::Display,
        F: Fn() -> Fut + Send + Clone + 'static,
        Fut: Future<Output = Result<T, E>> + Send + 'static,
    {

        if let Ok(result) = self.try_cache_lookup(current_key).await {
            tracing::debug!("FOUND FIRST CACHE");
            return Ok(CachedResult::current_data(result));
        }

        if let Some(fallback) = fallback_key {
            if let Ok(result) = self.try_cache_lookup(fallback).await {
                tracing::debug!("FOUND SECOND CACHE");
                self.spawn_refresh_task(current_key, ttl, priority, query_fn).await;
                return Ok(CachedResult::backup_data(result));
            }
        }

        tracing::debug!("CALCULATING INSTEAD");

        self.spawn_refresh_task(current_key, ttl, priority, query_fn).await;
        Err(WorkError::Calculating)
    }

    async fn spawn_refresh_task<T, E, F, Fut>(
        &self,
        key: &str,
        ttl: u64,
        priority: QueryPriority,
        query_fn: F,
    ) where
        T: Serialize + DeserializeOwned + Send + Sync + 'static,
        E: Send + 'static + std::fmt::Display,
        F: Fn() -> Fut + Send + 'static,
        Fut: Future<Output = Result<T, E>> + Send + 'static,
    {
        let task_key = format!("refresh:{}", key);
        let mut tasks = self.active_tasks.write().await;

        if let Some(handle) = tasks.get(&task_key) {
            if !handle.is_finished() {
                return;
            } else {
                tasks.remove(&task_key);
            }
        }

        let semaphore = match priority {
            QueryPriority::Heavy => Some(self.heavy_semaphore.clone()),
            QueryPriority::Light => None,
        };
        let cache = self.cache.clone();
        let active_tasks = self.active_tasks.clone();
        let key_owned = key.to_string();
        let task_key_clone = task_key.clone();

        let handle = tokio::spawn(async move {
            let _permit = if let Some(ref sem) = semaphore {
                Some(sem.acquire().await.expect("Failed to acquire semaphore?"))
            } else {
                None
            };

            tracing::info!("Starting background refresh ({}): {}",
                match priority {
                    QueryPriority::Heavy => "heavy",
                    QueryPriority::Light => "light",
                }, key_owned);

            match query_fn().await {
                Ok(result) => {
                    let temp_worker = BackgroundWorker {
                        cache,
                        heavy_semaphore: Arc::new(Semaphore::new(1)),
                        active_tasks: Arc::new(RwLock::new(HashMap::new())),
                    };
                    temp_worker.cache_result(&key_owned, &result, ttl).await;
                    tracing::info!("Background refresh completed: {}", key_owned);
                }
                Err(e) => {
                    tracing::warn!("Background refresh failed: {}:{}", key_owned, e);
                }
            }

            let mut tasks = active_tasks.write().await;
            tasks.remove(&task_key_clone);
        });

        tasks.insert(task_key, handle);
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
            let cache_key = format!("gfl-ze-watcher:{key}");
            self.cache.memory.insert(key.to_string(), json_value.clone()).await;

            if let Ok(mut conn) = self.cache.redis_pool.get().await {
                let _: RedisResult<()> = conn.set_ex(&cache_key, &json_value, ttl).await;
            }
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

#[derive(Clone)]
pub struct PlayerData{
    pub player_id: String,
    pub server_id: String,
    pub current_session: String,
}

#[derive(Clone)]
pub struct PlayerSessionData{
    pub player_id: String,
    pub server_id: String,
    pub session_id: String,
}
#[derive(Clone)]
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
