use poem::middleware::Cors;
use poem::{listener::TcpListener, EndpointExt, Route, Server};
use poem_openapi::OpenApiService;
mod routers;
mod global_serializer;
mod core;
mod workers;
mod models;
mod api_models;

use sqlx::postgres::PgPoolOptions;
use sqlx::{PgPool, Pool, Postgres};
use core::utils::get_env_default;
use crate::routers::graphs::{CountChunkCache, GraphApi};
use crate::routers::players::PlayerApi;
use core::utils::get_env;
use std::env;
use std::sync::Arc;
use std::time::Duration;
use deadpool_redis::{
    Config,
    Hook,
    HookError,
    Runtime,
};
use poem::session::{CookieConfig};
use poem::session::CookieSession;
use dotenv::dotenv;
use tracing::level_filters::LevelFilter;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};
use crate::routers::maps::MapApi;
use crate::routers::misc::MiscApi;
use crate::routers::radars::RadarApi;
use core::updater::*;
use moka::future::Cache;
use crate::api_models::common::{PatternLogger, UriPatternExt};
use crate::core::utils::*;
use crate::workers::*;
use crate::workers::consumer;
use crate::core::push_service::*;
use crate::core::storage::{MapStorage, CharacterStorage, CommunityStorage, StorageBackend};
use crate::routers::accounts::AccountsApi;
use crate::routers::characters::CharacterApi;
use crate::routers::servers::ServerApi;
use crate::routers::donations::DonationsApi;
use crate::routers::special_thanks::SpecialThanksApi;
use crate::routers::ze_community_links::ZeCommunityLinksApi;
use crate::routers::admin_maps::AdminMapsApi;
use crate::routers::admin_audit::AdminAuditApi;
use crate::routers::admin_servers::AdminServersApi;

#[derive(Clone)]
struct AppData{
    pool: Arc<Pool<Postgres>>,
    steam_provider: Option<String>,
    cache: Arc<FastCache>,
    player_worker: Arc<PlayerWorker>,
    map_worker: Arc<MapWorker>,
    push_service: Arc<PushNotificationService>,
    map_storage: Arc<MapStorage>,
    character_storage: Arc<CharacterStorage>,
    community_storage: Arc<CommunityStorage>,
    count_chunk_cache: Arc<CountChunkCache>,
}
#[derive(Clone)]
struct FastCache{
    redis_pool: deadpool_redis::Pool,
    memory: Arc<Cache<String, String>>
}


fn make_redis_pool() -> deadpool_redis::Pool {
    let cfg = Config::from_url(get_env("REDIS_URL"));
    cfg.create_pool(Some(Runtime::Tokio1))
        .expect("Failed to create pool")
}

/// A pool for blocking reads, kept apart from [`make_redis_pool`] so only the job consumer pays for
/// the longer `response_timeout`; request-path cache reads keep the short default and fail fast.
fn make_blocking_redis_pool() -> deadpool_redis::Pool {
    let cfg = Config::from_url(get_env("REDIS_URL"));
    cfg.builder()
        .expect("Failed to build pool")
        .post_create(Hook::sync_fn(|conn, _| {
            conn.set_response_timeout(consumer::BLOCKING_RESPONSE_TIMEOUT);
            Ok::<(), HookError>(())
        }))
        .runtime(Runtime::Tokio1)
        .build()
        .expect("Failed to create pool")
}

/// Which half of the app this process runs. `All` is the default and reproduces the original
/// single-process behavior, so splitting the containers is opt-in and rolling back is an env var.
#[derive(Clone, Copy, PartialEq)]
enum Role {
    Api,
    Worker,
    All,
}

impl Role {
    fn from_env() -> Self {
        match get_env_default("ROLE").unwrap_or_default().to_uppercase().as_str() {
            "API" => Role::Api,
            "WORKER" => Role::Worker,
            "" | "ALL" => Role::All,
            other => panic!("Unknown ROLE '{other}', expected one of: api, worker, all"),
        }
    }

    fn serves_api(&self) -> bool {
        matches!(self, Role::Api | Role::All)
    }

    fn runs_workers(&self) -> bool {
        matches!(self, Role::Worker | Role::All)
    }
}

async fn run_main() {
    let environment = get_env_default("ENVIRONMENT").unwrap_or(String::from("DEVELOPMENT"));
    let pre_calculate = get_env_bool("PRECALCULATE", false);
    let role = Role::from_env();
    let tracing_filter = EnvFilter::default()
        .add_directive(LevelFilter::INFO.into());

    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer())
        .with(tracing_filter)
        .init();
    tracing::info!("ENVIRONMENT: {environment}");
    tracing::info!("ROLE: {}", match role {
        Role::Api => "api (http only)",
        Role::Worker => "worker (background only)",
        Role::All => "all (http + background)",
    });
    let pg_conn = get_env("DATABASE_URL");
    let pool = PgPoolOptions::new()
        .max_connections(20)
        .min_connections(5)
        .acquire_timeout(Duration::from_secs(30))
        .idle_timeout(Duration::from_secs(300))
        .connect(&pg_conn).await
        .expect("Couldn't load postgresql connection!");

    let memory = Arc::new(Cache::builder()
        .time_to_live(Duration::from_secs(60))
        .max_capacity(10_000)
        .build());

    let redis_pool = make_redis_pool();
    let cache = Arc::new(FastCache { redis_pool, memory });
    let pool = Arc::new(pool);
    let player_worker = Arc::new(PlayerWorker::new(cache.clone(), pool.clone()));
    let map_worker = Arc::new(MapWorker::new(cache.clone(), pool.clone()));

    let push_service = Arc::new(
        PushNotificationService::new(pool.clone())
            .await
            .expect("Failed to initialize push notification service")
    );

    let worker_pool = pool.clone();
    let worker_cache = cache.clone();
    let worker_push_service = push_service.clone();

    let storage_backend = StorageBackend::from_env()
        .await
        .expect("Failed to initialize storage backend");

    let map_storage = Arc::new(MapStorage::new(storage_backend.clone()));

    let character_storage = Arc::new(CharacterStorage::new(storage_backend.clone()));

    let community_storage = Arc::new(CommunityStorage::new(storage_backend));

    // Hour-chunked player count cache for short-span graph queries (memory only).
    let count_chunk_cache = Arc::new(Cache::builder()
        .time_to_live(Duration::from_secs(2 * 24 * 60 * 60))
        .max_capacity(8192)
        .build());

    let data = AppData {
        pool,
        steam_provider: Some("http://pfp-provider:3000/api".to_string()),
        cache,
        player_worker,
        map_worker,
        push_service,
        map_storage,
        character_storage,
        community_storage,
        count_chunk_cache,
    };

    let apis = (
        ServerApi,
        PlayerApi,
        GraphApi,
        MapApi,
        RadarApi,
        MiscApi,
        AccountsApi,
        CharacterApi,
        DonationsApi,
        SpecialThanksApi,
        ZeCommunityLinksApi,
        AdminMapsApi,
        AdminAuditApi,
        AdminServersApi,
    );
    // For logging endpoints, because poem dev rly makes it hard for me
    let registered: Vec<Arc<dyn UriPatternExt + Send + Sync>> = vec![
        Arc::new(MapApi),
        Arc::new(ServerApi),
        Arc::new(PlayerApi),
        Arc::new(GraphApi),
        Arc::new(RadarApi),
        Arc::new(MiscApi),
        Arc::new(AccountsApi),
        Arc::new(CharacterApi),
        Arc::new(DonationsApi),
        Arc::new(SpecialThanksApi),
        Arc::new(ZeCommunityLinksApi),
        Arc::new(AdminMapsApi),
        Arc::new(AdminAuditApi),
        Arc::new(AdminServersApi),
    ];
    let port = "3000";
    let api_service = OpenApiService::new(apis, "ZE Watcher", "0.2")
        .server(format!("http://127.0.0.1:{port}/"));

    let mut route = Route::new();
    if &environment.to_uppercase() == "DEVELOPMENT"{
        let ui = api_service.swagger_ui();
        route = route.nest("/ui", ui);
    }
    let app = route.nest("/", api_service)
        .with(Cors::new()) // 600MB limit for large file uploads
        .with(PatternLogger::new(registered))
        .with(CookieSession::new(CookieConfig::default()))
        .data(data);

    if role.runs_workers() {
        consumer::spawn_consumers(
            worker_pool.clone(),
            worker_cache.clone(),
            make_blocking_redis_pool(),
        );

        init_map_change_listener(worker_pool.clone(), worker_push_service.clone()).await;

        if pre_calculate {
            init_precalculate(port).await;
        }

        if environment.to_uppercase() == "PRODUCTION" {
            tokio::spawn(async move {
                listen_new_update(&pg_conn, port).await;
            });
        }
    }

    if !role.serves_api() {
        // A worker-only process has no OpenAPI listener, so compose has nothing to probe. Serve
        // just /health on its own port to keep the existing healthcheck shape.
        return run_worker_health_server().await;
    }

    // Shares {STORE_UPLOAD}/.tmp with the upload handlers, so it belongs wherever they do.
    let store_upload_clone = get_env_default("STORE_UPLOAD")
        .unwrap_or_else(|| "./maps".to_string());
    tokio::spawn(async move {
        cleanup_stale_uploads(store_upload_clone).await;
    });

    Server::new(TcpListener::bind(format!("0.0.0.0:{port}")))
        .run(app)
        .await
        .expect("Couldn't run the server!");
}

const WORKER_HEALTH_PORT: &str = "3001";

async fn run_worker_health_server() {
    let route = Route::new().at("/health", poem::endpoint::make_sync(|_| "OK"));
    tracing::info!("Worker health endpoint on 0.0.0.0:{WORKER_HEALTH_PORT}/health");
    Server::new(TcpListener::bind(format!("0.0.0.0:{WORKER_HEALTH_PORT}")))
        .run(route)
        .await
        .expect("Couldn't run the worker health server!");
}

async fn init_map_change_listener(pool: Arc<PgPool>, push_service: Arc<PushNotificationService>) {
    let pg_conn = get_env("DATABASE_URL");
    tokio::spawn(async move {
        listen_map_change_notifications(&pg_conn, pool, push_service).await;
    });
}


async fn init_precalculate(port: &str){
    let port = String::from(port);
    let pg_conn = get_env("DATABASE_URL");
    let pre_calculate_player = get_env_bool("PRECALCULATE_PLAYER", false);
    let pre_calculate_player_full = get_env_bool("PRECALCULATE_PLAYER_FULL", false);
    let pre_calculate_map = get_env_bool("PRECALCULATE_MAP", false);
    let redis_pool = make_redis_pool();
    let memory = Arc::new(Cache::builder()
        .time_to_live(Duration::from_secs(60))
        .max_capacity(10_000)
        .build());
    let fast = FastCache { redis_pool, memory };
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&pg_conn).await
        .expect("Couldn't load postgresql connection!");
    let arc_pool = Arc::new(pool);
    if pre_calculate_map {
        let port1 = port.clone();
        let pool1 = arc_pool.clone();
        let redis1 = fast.clone();
        tokio::spawn(async move {
            maps_updater(pool1, &port1, redis1).await;
        });
    }
    if pre_calculate_player || pre_calculate_player_full {
        let port1 = port.clone();
        let pool2 = arc_pool.clone();
        let redis2 = fast.clone();
        tokio::spawn(async move {
            recent_players_updater(pool2, &port1, redis2, pre_calculate_player_full).await;
        });
    }
}
fn main(){
    dotenv().ok();
    if env::var_os("RUST_LOG").is_none() {
        unsafe{
            env::set_var("RUST_LOG", "poem=debug");
        }
    }
    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .unwrap()
        .block_on(async {
            run_main().await
        });
}
