use std::sync::Arc;
use std::time::Duration;
use redis::RedisResult;
use sqlx::{Pool, Postgres};
use tokio::sync::Semaphore;

use crate::api_models::common::METRICS_JOBS_KEY;
use crate::FastCache;
use super::job::{dispatch, inflight_key, RefreshJob, QUEUE_HEAVY, QUEUE_LIGHT};
use super::{BackgroundWorker, QueryPriority};

/// Heavy queries are the ones that used to contend with request handling. With a single worker
/// replica this bound is the true global limit — the old in-process semaphore never was one,
/// because every API replica had its own.
const HEAVY_CONCURRENCY: usize = 5;
const LIGHT_CONCURRENCY: usize = 20;

/// How long a `BRPOP` parks before looping. It only exists so the redis connection is returned to
/// the pool periodically; a job still wakes the consumer immediately, it does not wait this out.
const POP_TIMEOUT_SECS: usize = 5;

/// Connections popping jobs must tolerate the whole `POP_TIMEOUT_SECS` park. redis defaults
/// `response_timeout` to 500ms, which aborts the park long before the server answers nil, so the
/// consumer needs its own pool rather than the shared cache one.
pub const BLOCKING_RESPONSE_TIMEOUT: Duration = Duration::from_secs(POP_TIMEOUT_SECS as u64 + 1);

/// `blocking_redis` is separate from `cache.redis_pool` because only the `BRPOP` here needs a
/// response timeout long enough to cover the park; see [`BLOCKING_RESPONSE_TIMEOUT`].
pub fn spawn_consumers(
    pool: Arc<Pool<Postgres>>,
    cache: Arc<FastCache>,
    blocking_redis: deadpool_redis::Pool,
) {
    for (queue, concurrency) in [
        (QUEUE_HEAVY, HEAVY_CONCURRENCY),
        (QUEUE_LIGHT, LIGHT_CONCURRENCY),
    ] {
        let pool = pool.clone();
        let cache = cache.clone();
        let blocking_redis = blocking_redis.clone();
        tokio::spawn(async move {
            consume(queue, concurrency, pool, cache, blocking_redis).await;
        });
    }
}

/// One loop per queue rather than a single `BRPOP` over both, so a backlog of heavy jobs cannot
/// starve the light ones behind it.
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
        // Taken before the pop so we never hold more jobs than we can run: a job pulled off the
        // list is off it for good, so popping past our capacity would risk losing it on a crash.
        let Ok(permit) = semaphore.clone().acquire_owned().await else {
            tracing::error!("{queue}: semaphore closed, consumer stopping");
            return;
        };

        let payload = match pop(queue, &blocking_redis).await {
            Ok(Some(payload)) => payload,
            Ok(None) => continue, // pop timed out, nothing queued
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

    // BRPOP against LPUSH gives FIFO. Returns (queue_name, payload), or nil on timeout.
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
            if let Some(stale) = &job.stale_key {
                worker.drop_cached(stale).await;
            }
            tracing::info!("Refresh completed in {:?}: {}", started.elapsed(), job.cache_key);
        }
        // Side-effecting job (its work landed in Postgres); there is no value to cache.
        Ok(None) => {
            tracing::info!("Job completed in {:?}: {}", started.elapsed(), job.cache_key);
        }
        Err(e) => {
            tracing::warn!("Refresh failed: {}: {e}", job.cache_key);
        }
    }

    // Cleared whether the job succeeded or failed. On success the result is already cached, so the
    // next reader gets data; on failure the next reader re-enqueues rather than waiting out the TTL.
    finish_job(&job.cache_key, job.priority, &cache).await;
}

/// Clears the in-flight marker and counts the job, in one pipeline on one pooled connection.
///
/// The tally rides along with the marker delete rather than getting its own round trip, and is not
/// buffered the way request metrics are: jobs are orders of magnitude rarer than requests, and each
/// one has already done several redis operations by the time it lands here.
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
