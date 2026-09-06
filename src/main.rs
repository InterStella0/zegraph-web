use poem::middleware::Cors;
use poem::{listener::TcpListener, EndpointExt, Route, Server};
use poem_openapi::{ContactObject, OpenApiService};
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
use crate::routers::misc::{LiveEventHub, MiscApi};
use crate::routers::radars::RadarApi;
use core::updater::*;
use moka::future::Cache;
use crate::api_models::common::{endpoint_metrics, EndpointMetrics, PatternLogger, UriPatternExt};
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
    live_events: Arc<LiveEventHub>,
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

const DEFAULT_PORT: &str = "3000";

fn build_api_service() -> OpenApiService<impl poem_openapi::OpenApi, ()> {
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
    OpenApiService::new(apis, "ZE Graph API", "1.0.2")
        .description(
            "Read-only API behind zegraph.xyz, tracking CS Zombie Escape servers across the \
            western community (GFL and others) plus player playtime, map statistics and \
            geographic distribution. Player data comes from a separate, unpublished scraper; \
            this API only ever reads what the scraper already wrote. Endpoints under Admin* \
            require an authenticated user holding the corresponding role.",
        )
        .contact(ContactObject::new().url("https://github.com/InterStella0/zegraph-web"))
        .server("https://zegraph.xyz/data/api")
}

/// For logging endpoints, because poem dev rly makes it hard for me.
fn registered_patterns() -> Vec<Arc<dyn UriPatternExt + Send + Sync>> {
    vec![
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
    ]
}

fn build_app(data: AppData, environment: &str, swagger_ui_enabled: bool) -> impl poem::Endpoint + use<> {
    let api_service = build_api_service();

    let mut route = Route::new();
    if swagger_ui_enabled || environment.to_uppercase() == "DEVELOPMENT" {
        let html = api_service.swagger_ui_html()
            .replacen("<title>Swagger UI</title>", "<title>ZE Graph API — Swagger UI</title>", 1);
        let ui = poem::endpoint::make_sync(move |_| poem::web::Html(html.clone()));
        route = route.nest("/ui", ui);
    }
    route.nest("/", api_service)
        .with(Cors::new()) // 600MB limit for large file uploads
        .with(PatternLogger::new(registered_patterns()))
        .with(CookieSession::new(CookieConfig::default()))
        .data(data)
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
    const POOL_SIZE: u32 = 20;
    let job_concurrency = role.runs_workers().then(|| {
        let concurrency = consumer::JobConcurrency::from_env();
        concurrency.assert_fits_pool(POOL_SIZE);
        tracing::info!(
            "Worker concurrency: heavy={}, light={}",
            concurrency.heavy,
            concurrency.light,
        );
        concurrency
    });
    let pool = PgPoolOptions::new()
        .max_connections(POOL_SIZE)
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
    let metrics_cache = cache.clone();
    let worker_push_service = push_service.clone();

    let storage_backend = StorageBackend::from_env()
        .await
        .expect("Failed to initialize storage backend");

    let map_storage = Arc::new(MapStorage::new(storage_backend.clone()));

    let character_storage = Arc::new(CharacterStorage::new(storage_backend.clone()));

    let community_storage = Arc::new(CommunityStorage::new(storage_backend));

    let live_events = Arc::new(LiveEventHub::new());

    // Hour-chunked player count cache for short-span graph queries (memory only).
    let count_chunk_cache = Arc::new(Cache::builder()
        .time_to_live(Duration::from_secs(2 * DAY))
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
        live_events: live_events.clone(),
    };

    let listener_data = data.clone();
    let port = DEFAULT_PORT;
    let swagger_ui_enabled = get_env_bool("ENABLE_SWAGGER_UI", false);
    let app = build_app(data, &environment, swagger_ui_enabled);

    if role.runs_workers() {
        consumer::spawn_consumers(
            worker_pool.clone(),
            worker_cache.clone(),
            make_blocking_redis_pool(),
            job_concurrency.expect("worker role must configure its consumers"),
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

    if role.serves_api() {
        init_live_events_listener(live_events, listener_data);
    }

    if !role.serves_api() {
        return run_worker_health_server().await;
    }

    EndpointMetrics::spawn_flusher(endpoint_metrics(), metrics_cache);

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

fn init_live_events_listener(hub: Arc<LiveEventHub>, app: AppData) {
    let pg_conn = get_env("DATABASE_URL");
    let events = hub.publisher();
    tokio::spawn(async move {
        live_events_listener(&pg_conn, app, events).await;
    });
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
/// HTTP-level tests for the assembled app.
#[cfg(test)]
mod route_tests {
    use super::*;
    use crate::api_models::common::Claims;
    use crate::api_models::uri_pattern::{PatternTable, RoutePattern};
    use crate::workers::test_support::fake_app_data;
    use poem::test::TestClient;
    use std::collections::BTreeSet;
    use std::sync::Once;

    const TEST_SECRET: &str = "route-tests-secret";

    /// `parse_user_from_token` reads `NEXTAUTH_SECRET` through `get_env`, which panics when unset,
    /// and it does so on every call rather than once at startup. Tests share one process and run on
    /// multiple threads, so the variable is set exactly once here instead of per test.
    fn init_env() {
        static ONCE: Once = Once::new();
        ONCE.call_once(|| unsafe {
            env::set_var("NEXTAUTH_SECRET", TEST_SECRET);
        });
    }

    fn client() -> TestClient<impl poem::Endpoint> {
        init_env();
        // "PRODUCTION" + swagger disabled so the swagger UI is not mounted; these tests assert
        // on the API surface.
        TestClient::new(build_app(fake_app_data(), "PRODUCTION", false))
    }

    fn spec_paths() -> BTreeSet<String> {
        let spec: serde_json::Value = serde_json::from_str(&build_api_service().spec())
            .expect("spec should be valid JSON");
        spec["paths"]
            .as_object()
            .expect("spec should have a paths object")
            .keys()
            .cloned()
            .collect()
    }

    fn mint_token() -> String {
        init_env();
        let claims = Claims {
            sub: "76561198000000001".to_string(),
            name: "route-test-user".to_string(),
            // Far enough out that the suite cannot fail by sitting on a slow machine.
            exp: (chrono::Utc::now().timestamp() + 3600) as usize,
            iss: "ze-graph".to_string(),
        };
        jsonwebtoken::encode(
            &jsonwebtoken::Header::new(jsonwebtoken::Algorithm::HS256),
            &claims,
            &jsonwebtoken::EncodingKey::from_secret(TEST_SECRET.as_ref()),
        )
        .expect("minting a test token should not fail")
    }

    /// Routes that require a bearer token and reject before touching the database.
    const PROTECTED: &[(&str, &str)] = &[
        ("GET", "/accounts/me"),
        ("GET", "/accounts/me/communities"),
        ("POST", "/accounts/create"),
        ("POST", "/accounts/server-requests"),
        ("GET", "/accounts/me/push/subscriptions"),
        ("GET", "/admin/audit-logs"),
    ];

    async fn send(cli: &TestClient<impl poem::Endpoint>, method: &str, path: &str, token: Option<&str>) -> poem::http::StatusCode {
        let builder = match method {
            "GET" => cli.get(path),
            "POST" => cli.post(path),
            "PUT" => cli.put(path),
            "DELETE" => cli.delete(path),
            other => panic!("unhandled method {other}"),
        };
        let builder = match token {
            Some(t) => builder.header("Authorization", format!("Bearer {t}")),
            None => builder,
        };
        builder.send().await.0.status()
    }

    /// Guards the `poem-openapi = "=5.1.8"` pin in Cargo.toml, which exists because 5.1.9+
    /// registers path parameters positionally (`:param0`). Every custom `FromRequest` extractor
    /// here reads them by name via `raw_path_param`, so under a newer version they all get `None`.
    #[tokio::test]
    async fn path_param_extractors_receive_named_params() {
        let cli = client();
        for path in [
            "/servers/1/maps/autocomplete",
            "/servers/1/maps/ze_test_map_v1/info",
            "/graph/1/get_regions",
        ] {
            let status = send(&cli, "GET", path, None).await;
            assert_ne!(
                status,
                poem::http::StatusCode::BAD_REQUEST,
                "GET {path} returned 400, which means the path-param extractor got None rather \
                 than a value. That is the poem-openapi positional-parameter regression — check \
                 whether the `=5.1.8` pin in Cargo.toml was relaxed."
            );
            assert_eq!(
                status,
                poem::http::StatusCode::NOT_FOUND,
                "GET {path} should reach the database lookup and 404 against the dead test pool"
            );
        }
    }

    /// Documents the shape of the public route surface. Unlike the test above this cannot detect
    /// the poem-openapi regression, but it does catch a route being renamed or dropped outright.
    #[test]
    fn spec_exposes_expected_routes() {
        let paths = spec_paths();
        for expected in [
            "/servers/{server_id}/maps/{map_name}/info",
            "/graph/{server_id}/unique_players/players/{player_id}/sessions/{session_id}",
            "/players/{player_id}/profile",
            "/players/{player_id}/sessions",
            "/communities/{community_id}/unique_players",
        ] {
            assert!(paths.contains(expected), "expected {expected} in the spec, got {paths:#?}");
        }
    }

    /// `registered_patterns()` is maintained by hand and feeds `PatternLogger`; a path missing from
    /// it is logged as `unknown_pattern` and loses its tracing identity, while a stale entry matches
    /// nothing. Neither shows up at runtime, so the two lists are compared here.
    #[test]
    fn registered_patterns_match_spec() {
        let patterns = registered_patterns();
        let declared: BTreeSet<String> = patterns
            .iter()
            .flat_map(|api| api.get_all_patterns())
            .map(|p| p.uri().to_string())
            .collect();
        let spec = spec_paths();

        let unregistered: Vec<_> = spec.difference(&declared).collect();
        assert!(
            unregistered.is_empty(),
            "these routes exist but are not in any get_all_patterns(), so PatternLogger will log \
             them as `unknown_pattern`: {unregistered:#?}"
        );

        let stale: Vec<_> = declared.difference(&spec).collect();
        assert!(
            stale.is_empty(),
            "these patterns are declared but match no route; they are leftovers from deleted or \
             renamed endpoints: {stale:#?}"
        );
    }

    /// The unit tests in `uri_pattern` cover the matcher itself; this one runs the *real* set of
    /// ~150 patterns through it, which is where overlaps between routers show up. The long path is
    /// the case that used to panic: `uri-pattern-matcher` indexed its parts vector by the
    /// candidate's segment number, so any path longer than a pattern went out of bounds.
    #[test]
    fn pattern_table_resolves_real_routes() {
        let table = PatternTable::new(&registered_patterns());

        for (path, expected) in [
            ("/servers/1/maps/autocomplete", "/servers/{server_id}/maps/autocomplete"),
            ("/servers/1/maps/ze_test_map_v1/info", "/servers/{server_id}/maps/{map_name}/info"),
            ("/maps/all/3d", "/maps/all/3d"),
            ("/maps/ze_test_map_v1/3d", "/maps/{map_name}/3d"),
            ("/graph/1/get_regions", "/graph/{server_id}/get_regions"),
        ] {
            assert_eq!(
                table.find(path).map(RoutePattern::uri),
                Some(expected),
                "{path} should resolve to the most specific registered pattern"
            );
        }

        for path in ["/servers/1/maps/a/b/c/d/e/f/g/h", "/not/a/route", "/"] {
            assert!(
                table.find(path).is_none(),
                "{path} matches no route and must resolve to None rather than panic"
            );
        }
    }

    /// The two rejection codes differ by design of the layering, not by intent: a *missing*
    /// `Authorization` header is rejected by poem-openapi's security-scheme check before the
    /// extractor runs (401), while a header that is present but does not yield a valid token is
    /// rejected by `BearerAuthorization::from_request` itself (403). Both are pinned so a change to
    /// either layer is visible rather than silent.
    const MISSING_TOKEN: poem::http::StatusCode = poem::http::StatusCode::UNAUTHORIZED;
    const INVALID_TOKEN: poem::http::StatusCode = poem::http::StatusCode::FORBIDDEN;

    #[tokio::test]
    async fn protected_routes_reject_missing_token() {
        let cli = client();
        for (method, path) in PROTECTED {
            let status = send(&cli, method, path, None).await;
            assert_eq!(
                status, MISSING_TOKEN,
                "{method} {path} should reject an unauthenticated request"
            );
        }
    }

    #[tokio::test]
    async fn protected_routes_reject_malformed_token() {
        let cli = client();
        for (method, path) in PROTECTED {
            let status = send(&cli, method, path, Some("not-a-real-jwt")).await;
            assert_eq!(
                status, INVALID_TOKEN,
                "{method} {path} should reject a malformed token"
            );
        }
    }

    #[tokio::test]
    async fn protected_routes_reject_token_signed_with_wrong_secret() {
        let cli = client();
        let claims = Claims {
            sub: "76561198000000001".to_string(),
            name: "impostor".to_string(),
            exp: (chrono::Utc::now().timestamp() + 3600) as usize,
            iss: "ze-graph".to_string(),
        };
        let forged = jsonwebtoken::encode(
            &jsonwebtoken::Header::new(jsonwebtoken::Algorithm::HS256),
            &claims,
            &jsonwebtoken::EncodingKey::from_secret(b"a-different-secret"),
        )
        .expect("minting should not fail");

        for (method, path) in PROTECTED {
            let status = send(&cli, method, path, Some(&forged)).await;
            assert_eq!(
                status, INVALID_TOKEN,
                "{method} {path} accepted a token signed with the wrong secret"
            );
        }
    }

    const PROTECTED_DB_BACKED: &[(&str, &str)] = &[
        ("GET", "/accounts/me"),
        ("GET", "/accounts/me/communities"),
        ("GET", "/accounts/me/push/subscriptions"),
        ("GET", "/admin/communities"),
        ("GET", "/admin/audit-logs"),
    ];

    #[tokio::test]
    async fn valid_token_passes_the_auth_layer() {
        let cli = client();
        let token = mint_token();
        for (method, path) in PROTECTED_DB_BACKED {
            let status = send(&cli, method, path, Some(&token)).await;
            assert!(
                status != MISSING_TOKEN && status != INVALID_TOKEN,
                "{method} {path} rejected a validly signed token with {status}"
            );
        }
    }

    #[tokio::test]
    async fn unknown_route_is_not_found() {
        let cli = client();
        assert_eq!(
            send(&cli, "GET", "/definitely/not/a/route", None).await,
            poem::http::StatusCode::NOT_FOUND
        );
    }

    #[tokio::test]
    async fn wrong_method_on_known_route_is_method_not_allowed() {
        let cli = client();
        assert_eq!(
            send(&cli, "POST", "/communities", None).await,
            poem::http::StatusCode::METHOD_NOT_ALLOWED
        );
    }

    #[tokio::test]
    async fn invalid_path_param_value_is_bad_request() {
        let cli = client();
        assert_eq!(
            send(&cli, "GET", "/thumbnails/not_a_real_type/x.jpg", None).await,
            poem::http::StatusCode::BAD_REQUEST,
            "a value outside the ThumbnailType enum should fail validation"
        );
        assert_eq!(
            send(&cli, "GET", "/thumbnails/small/x.jpg", None).await,
            poem::http::StatusCode::NOT_FOUND,
            "a well-formed request for a missing thumbnail is a 404, not an empty 200"
        );
    }

    #[tokio::test]
    async fn health_reports_degraded_without_failing_the_probe() {
        let cli = client();
        let resp = cli.get("/health").send().await.0;
        assert_eq!(
            resp.status(),
            poem::http::StatusCode::OK,
            "/health must stay 200 with its dependencies down"
        );

        let raw = resp.into_body().into_string().await.expect("a health body");
        let body: serde_json::Value = serde_json::from_str(&raw).expect("health should be JSON");
        let data = &body["data"];

        assert_eq!(data["response"], "degraded", "got {data:#}");
        assert_eq!(data["postgres"]["status"], "down");
        assert_eq!(data["redis"]["status"], "down");
        assert!(data["queues"]["heavy"].is_null(), "an unreachable redis is not an empty queue");
        assert!(data["queues"]["light"].is_null());
        assert!(
            data["queues"]["completed_heavy"].is_null() && data["queues"]["completed_light"].is_null(),
            "the job tally lives in redis too, so it is unknown rather than zero"
        );
        assert!(data["traffic"].is_null(), "the traffic counters live in redis, which is down");
        assert!(data["avg_graph"].is_null(), "the response-time graph lives in redis, which is down");
        assert!(data["qgis"]["wms"].is_null(), "second layer must not have been attempted");
        assert!(data["qgis"]["status"].is_string(), "qgis is always reported, never omitted");
    }

    #[tokio::test]
    async fn database_free_route_succeeds() {
        let cli = client();
        assert_eq!(
            send(&cli, "GET", "/accounts/me/push/vapid-public-key", None).await,
            poem::http::StatusCode::OK
        );
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
