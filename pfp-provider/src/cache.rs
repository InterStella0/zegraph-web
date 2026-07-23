use redis::AsyncCommands;
use redis::RedisError;
use std::time::Duration;
use deadpool_redis::{Config, Pool, PoolError, Runtime};
use moka::future::Cache;

const MEM_TTL: Duration = Duration::from_secs(2 * 24 * 60 * 60);
const MEM_MAX_KEYS: u64 = 2000;

pub struct PfpCache {
    memory: Cache<u64, String>,
    pool: Pool,
}

impl PfpCache {
    pub async fn new(redis_url: &str) -> Result<Self, RedisError> {
        let cfg = Config::from_url(redis_url);
        let redis_pool = cfg.create_pool(Some(Runtime::Tokio1))
            .expect("Failed to create pool redis");
        let memory = Cache::builder()
            .time_to_live(MEM_TTL)
            .max_capacity(MEM_MAX_KEYS)
            .build();
        Ok(Self { memory, pool: redis_pool })
    }

    pub async fn get(&self, uuid: u64) -> Result<Option<String>, PoolError> {
        if let Some(value) = self.memory.get(&uuid).await {
            return Ok(Some(value));
        }

        let mut con = self.pool.get().await?;
        let result: Option<String> = con.get(Self::key(uuid)).await?;
        if let Some(value) = &result {
            self.memory.insert(uuid, value.clone()).await;
        }
        Ok(result)
    }

    pub async fn set(&self, uuid: u64, value: &str, expiry: Duration) -> Result<(), PoolError> {
        self.memory.insert(uuid, value.to_string()).await;

        let mut con = self.pool.get().await?;
        let _: () = con.set_ex(Self::key(uuid), value, expiry.as_secs()).await?;
        Ok(())
    }

    fn key(uuid: u64) -> String {
        format!("steam_pfp:{}", uuid)
    }
}
