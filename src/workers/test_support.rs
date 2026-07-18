//! Fixtures for the worker tests.
//!
//! Neither a `PgPool` nor a deadpool redis pool dials out when it is constructed, so a `FastCache`
//! and a `Pool<Postgres>` can be built pointing at an address nothing is listening on. That is
//! enough to construct any query object and call the pure parts of `WorkerQuery`
//! (`cache_key_pattern`, `ttl`, `priority`, `job_kind`) plus the memory tier of the cache, with no
//! postgres and no redis running.
//!
//! The addresses below are deliberately dead. A test that reaches real I/O should fail or hang
//! rather than quietly pass against whatever happens to be running on the developer's machine — so
//! if one of these fixtures starts producing connection errors, that means the test under it grew a
//! dependency on a live service. Fix the test, do not point the fixture at a real server.
//!
//! [`fake_app_data`] extends the same rule to the HTTP layer. It builds a complete [`AppData`] out
//! of these dead handles so `poem::test::TestClient` can drive the real route tree; every route
//! behind a database-touching extractor will therefore fail, and the route tests assert only on
//! what resolves *before* that point — routing, path-param binding, auth rejection, validation.

use std::sync::Arc;
use std::time::Duration;

use deadpool_redis::{Config, Runtime};
use moka::future::Cache;
use sqlx::postgres::PgPoolOptions;
use sqlx::{Pool, Postgres};

use crate::core::push_service::PushNotificationService;
use crate::core::storage::{CharacterStorage, CommunityStorage, MapStorage, StorageBackend};
use crate::{AppData, FastCache};
use super::map::{MapBasicQuery, MapWorker};
use super::player::{PlayerBasicQuery, PlayerSessionQuery, PlayerWorker};
use super::{MapData, PlayerData, PlayerSessionData, Query};

/// Port 1 is reserved and never listened on, so `connect_lazy` yields a pool that can be held but
/// not used.
const DEAD_POSTGRES: &str = "postgres://test:test@127.0.0.1:1/test";
const DEAD_REDIS: &str = "redis://127.0.0.1:1/";

pub fn fake_pool() -> Arc<Pool<Postgres>> {
    Arc::new(
        PgPoolOptions::new()
            .max_connections(1)
            .acquire_timeout(Duration::from_millis(1))
            .connect_lazy(DEAD_POSTGRES)
            .expect("lazy pool should not need a server"),
    )
}

/// The moka tier is a real, working in-process cache; only the redis tier is dead. Every cache path
/// in `BackgroundWorker` checks memory first and treats a redis failure as a miss, so this is
/// sufficient to drive them.
pub fn fake_cache() -> Arc<FastCache> {
    let redis_pool = Config::from_url(DEAD_REDIS)
        .create_pool(Some(Runtime::Tokio1))
        .expect("pool creation should not need a server");

    Arc::new(FastCache {
        redis_pool,
        memory: Arc::new(
            Cache::builder()
                .time_to_live(Duration::from_secs(60))
                .max_capacity(10_000)
                .build(),
        ),
    })
}

/// A complete [`AppData`] with no live dependencies, for driving [`crate::build_app`] under
/// `poem::test::TestClient`.
///
/// Storage is built as [`StorageBackend::Local`] directly rather than through
/// `StorageBackend::from_env`, so the fixture does not depend on the developer's environment. The
/// root points inside the temp dir but is never written to by these tests.
pub fn fake_app_data() -> AppData {
    let pool = fake_pool();
    let cache = fake_cache();
    let storage = Arc::new(StorageBackend::Local {
        root: std::env::temp_dir()
            .join("gfl-route-test-storage")
            .to_string_lossy()
            .into_owned(),
    });

    AppData {
        pool: pool.clone(),
        steam_provider: None,
        cache: cache.clone(),
        player_worker: Arc::new(PlayerWorker::new(cache.clone(), pool.clone())),
        map_worker: Arc::new(MapWorker::new(cache, pool.clone())),
        push_service: Arc::new(PushNotificationService::stub(pool)),
        map_storage: Arc::new(MapStorage::new(storage.clone())),
        character_storage: Arc::new(CharacterStorage::new(storage.clone())),
        community_storage: Arc::new(CommunityStorage::new(storage)),
        count_chunk_cache: Arc::new(
            Cache::builder()
                .time_to_live(Duration::from_secs(2 * 24 * 60 * 60))
                .max_capacity(8192)
                .build(),
        ),
    }
}

pub const TEST_SERVER: &str = "server-1";
pub const TEST_PLAYER: &str = "76561198000000001";
pub const TEST_MAP: &str = "ze_test_map_v1";
pub const TEST_SESSION: &str = "session-abc";

pub fn player_data() -> PlayerData {
    PlayerData {
        player_id: TEST_PLAYER.to_string(),
        server_id: TEST_SERVER.to_string(),
        current_session: TEST_SESSION.to_string(),
    }
}

pub fn player_session_data() -> PlayerSessionData {
    PlayerSessionData {
        player_id: TEST_PLAYER.to_string(),
        server_id: TEST_SERVER.to_string(),
        session_id: TEST_SESSION.to_string(),
    }
}

pub fn map_data() -> MapData {
    MapData {
        map_name: TEST_MAP.to_string(),
        server_id: TEST_SERVER.to_string(),
    }
}

/// The three constructors below go through the existing `raw` entry points — the same ones the
/// worker process uses after deserializing a job — rather than adding test-only constructors.
pub fn player_query<T>() -> PlayerBasicQuery<T> {
    PlayerBasicQuery::raw(Query { pool: fake_pool(), cache: fake_cache(), data: player_data() })
}

pub fn player_session_query<T>() -> PlayerSessionQuery<T> {
    PlayerSessionQuery::raw(Query {
        pool: fake_pool(),
        cache: fake_cache(),
        data: player_session_data(),
    })
}

pub fn map_query<T>() -> MapBasicQuery<T> {
    MapBasicQuery::raw(Query { pool: fake_pool(), cache: fake_cache(), data: map_data() })
}
