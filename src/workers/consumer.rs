use std::sync::Arc;
use std::time::Duration;
use redis::RedisResult;
use sqlx::{Pool, Postgres};
use tokio::sync::Semaphore;

use crate::api_models::common::METRICS_JOBS_KEY;
use crate::FastCache;
use super::job::{dispatch, inflight_key, RefreshJob, QUEUE_HEAVY, QUEUE_LIGHT};
use super::{BackgroundWorker, QueryPriority};

pub const DEFAULT_HEAVY_CONCURRENCY: usize = 2;
pub const LIGHT_CONCURRENCY: usize = 15;
pub const HEAVY_CONCURRENCY_ENV: &str = "HEAVY_JOB_CONCURRENCY";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct JobConcurrency {
    pub heavy: usize,
    pub light: usize,
}

impl JobConcurrency {
    pub fn from_env() -> Self {
        let heavy = std::env::var(HEAVY_CONCURRENCY_ENV)
            .ok()
            .map(|raw| parse_heavy_concurrency(&raw).unwrap_or_else(|message| panic!("{message}")))
            .unwrap_or(DEFAULT_HEAVY_CONCURRENCY);

        Self { heavy, light: LIGHT_CONCURRENCY }
    }

    pub fn total(self) -> usize {
        self.heavy + self.light
    }

    pub fn assert_fits_pool(self, pool_size: u32) {
        assert!(
            self.total() <= pool_size as usize,
            "worker concurrency ({}) exceeds PostgreSQL pool size ({pool_size})",
            self.total(),
        );
    }
}

fn parse_heavy_concurrency(raw: &str) -> Result<usize, String> {
    let value = raw.trim().parse::<usize>().map_err(|_| {
        format!("{HEAVY_CONCURRENCY_ENV} must be a positive integer, got '{raw}'")
    })?;
    if value == 0 {
        return Err(format!("{HEAVY_CONCURRENCY_ENV} must be at least 1"));
    }
    Ok(value)
}

const POP_TIMEOUT_SECS: usize = 5;

pub const BLOCKING_RESPONSE_TIMEOUT: Duration = Duration::from_secs(POP_TIMEOUT_SECS as u64 + 1);

pub fn spawn_consumers(
    pool: Arc<Pool<Postgres>>,
    cache: Arc<FastCache>,
    blocking_redis: deadpool_redis::Pool,
    concurrency: JobConcurrency,
) {
    for (queue, concurrency) in [
        (QUEUE_HEAVY, concurrency.heavy),
        (QUEUE_LIGHT, concurrency.light),
    ] {
        let pool = pool.clone();
        let cache = cache.clone();
        let blocking_redis = blocking_redis.clone();
        tokio::spawn(async move {
            consume(queue, concurrency, pool, cache, blocking_redis).await;
        });
    }
}

async fn consume(
    queue: &'static str,
    concurrency: usize,
    pool: Arc<Pool<Postgres>>,
    cache: Arc<FastCache>,
    blocking_redis: deadpool_redis::Pool,
) {
    let semaphore = Arc::new(Semaphore::new(concurrency));
    tracing::info!("Worker consuming {queue} (concurrency {concurrency})");

    loop {
        let Ok(permit) = semaphore.clone().acquire_owned().await else {
            tracing::error!("{queue}: semaphore closed, consumer stopping");
            return;
        };

        let payload = match pop(queue, &blocking_redis).await {
            Ok(Some(payload)) => payload,
            Ok(None) => continue, // pop timed out
            Err(e) => {
                tracing::warn!("{queue}: pop failed: {e}");
                tokio::time::sleep(Duration::from_secs(1)).await;
                continue;
            }
        };

        let job: RefreshJob = match serde_json::from_str(&payload) {
            Ok(job) => job,
            Err(e) => {
                tracing::error!("{queue}: undeserializable job dropped: {e}");
                continue;
            }
        };

        let pool = pool.clone();
        let cache = cache.clone();
        tokio::spawn(async move {
            run_job(job, pool, cache).await;
            drop(permit);
        });
    }
}

async fn pop(queue: &str, blocking_redis: &deadpool_redis::Pool) -> RedisResult<Option<String>> {
    let mut conn = blocking_redis.get().await.map_err(|e| {
        redis::RedisError::from((redis::ErrorKind::Io, "redis pool", e.to_string()))
    })?;

    let popped: Option<(String, String)> = redis::cmd("BRPOP")
        .arg(queue)
        .arg(POP_TIMEOUT_SECS)
        .query_async(&mut *conn)
        .await?;

    Ok(popped.map(|(_, payload)| payload))
}

async fn run_job(job: RefreshJob, pool: Arc<Pool<Postgres>>, cache: Arc<FastCache>) {
    let started = std::time::Instant::now();
    tracing::info!("Starting refresh ({:?}): {}", job.priority, job.cache_key);

    match dispatch(&job.kind, pool, cache.clone()).await {
        Ok(Some(json)) => {
            let worker = BackgroundWorker::new(cache.clone());
            worker.cache_raw(&job.cache_key, &json, job.ttl).await;
            if let Some(latest) = &job.latest_key {
                worker.cache_raw(latest, &json, job.ttl).await;
            }
            if let Some(stale) = &job.stale_key {
                worker.drop_cached(stale).await;
            }
            tracing::info!("Refresh completed in {:?}: {}", started.elapsed(), job.cache_key);
        }

        Ok(None) => {
            tracing::info!("Job completed in {:?}: {}", started.elapsed(), job.cache_key);
        }
        Err(e) => {
            tracing::warn!("Refresh failed: {}: {e}", job.cache_key);
        }
    }

    finish_job(&job.cache_key, job.priority, &cache).await;
}

async fn finish_job(cache_key: &str, priority: QueryPriority, cache: &FastCache) {
    let marker = inflight_key(cache_key);
    let field = match priority {
        QueryPriority::Heavy => "heavy",
        QueryPriority::Light => "light",
    };

    if let Ok(mut conn) = cache.redis_pool.get().await {
        let _: RedisResult<()> = redis::pipe()
            .del(&marker)
            .hincr(METRICS_JOBS_KEY, field, 1)
            .query_async(&mut *conn)
            .await;
    }
}
