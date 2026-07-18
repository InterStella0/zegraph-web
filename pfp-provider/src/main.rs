use poem::{
    listener::TcpListener, middleware::Tracing, EndpointExt, Route, Server,
    Result as PoemResult, Error as PoemError
};
use poem_openapi::{
    OpenApi, OpenApiService, Object, ApiResponse, param::Path, payload::Json
};

use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};
use std::{sync::Arc, time::Duration};
use thiserror::Error;
use tokio::sync::Semaphore;
use tracing::level_filters::LevelFilter;

const MAX_CONCURRENT_LOOKUPS: usize = 5;
const MAX_RETRIES: u32 = 3;

mod providers;
mod cache;

use providers::{SteamIdPro, SteamIdXyz, TradeItProvider, Provider};
use cache::RedisCache;
use crate::providers::{PlayerDb, SteamOfficialApi};

#[derive(Debug, Error)]
enum AppError {
    #[error("No provider available")]
    NoProvider,

    #[error("Cache error: {0}")]
    CacheError(#[from] redis::RedisError),

    #[error("Request error: {0}")]
    RequestError(#[from] reqwest::Error),

    #[error("Regex error: {0}")]
    RegexError(#[from] regex::Error),
}

impl From<AppError> for PoemError {
    fn from(err: AppError) -> Self {
        match err {
            AppError::NoProvider => PoemError::from_string("No provider found", poem::http::StatusCode::NOT_FOUND),
            _ => PoemError::from_string(err.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR),
        }
    }
}

#[derive(Debug, Object, Clone)]
struct PfpResponse {
    provider: String,
    url: String,
}

#[derive(Debug, ApiResponse)]
#[allow(dead_code)]  // This is temporary
enum ApiPfpResponse {
    #[oai(status = 200)]
    Ok(Json<PfpResponse>),

    #[oai(status = 404)]
    NotFound,

    #[oai(status = 500)]
    InternalError,
}

struct AppState {
    providers: Vec<Box<dyn Provider>>,
    cache: RedisCache,
    lookup_limit: Semaphore,
}

struct Api {
    state: Arc<AppState>,
}

async fn get_pfp_with_retry(provider: &dyn Provider, uuid: u64) -> anyhow::Result<String> {
    let mut attempt = 1;
    loop {
        match provider.get_pfp(uuid).await {
            Ok(url) => return Ok(url),
            Err(e) if attempt < MAX_RETRIES => {
                let backoff = Duration::from_millis(2000 * 2u64.pow(attempt - 1));
                tracing::debug!(
                    "Provider {} attempt {}/{} failed: {}; retrying in {:?}",
                    provider.name(), attempt, MAX_RETRIES, e, backoff
                );
                tokio::time::sleep(backoff).await;
                attempt += 1;
            }
            Err(e) => return Err(e),
        }
    }
}

#[OpenApi]
impl Api {
    #[oai(path = "/steams/pfp/:uuid", method = "get")]
    async fn get_steam_profile(&self, Path(uuid): Path<u64>) -> PoemResult<ApiPfpResponse> {
        let cache_result = self.state.cache.get(&uuid.to_string()).await;
        if let Ok(Some(url)) = cache_result {
            let parts: Vec<&str> = url.split(':').collect();
            if parts.len() >= 2 {
                let provider = parts[0];
                let actual_url = parts[1];

                return Ok(ApiPfpResponse::Ok(Json(PfpResponse {
                    provider: provider.to_string(),
                    url: actual_url.to_string(),
                })));
            }
        } else if let Err(e) = cache_result {
            tracing::warn!("Redis cache error: {}", e);
        }

        let _permit = self.state.lookup_limit
            .acquire()
            .await
            .expect("lookup semaphore never closed");

        for provider in &self.state.providers {
            match get_pfp_with_retry(provider.as_ref(), uuid).await {
                Ok(url) if !url.is_empty() => {
                    let cache_value = format!("{}:{}", provider.name(), url);
                    if let Err(e) = self.state.cache.set(
                        &uuid.to_string(), &cache_value, Duration::from_hours(24 * 3)).await {
                        tracing::warn!("Failed to cache result: {}", e);
                    }

                    return Ok(ApiPfpResponse::Ok(Json(PfpResponse {
                        provider: provider.name(),
                        url,
                    })));
                }
                Ok(_) => continue,
                Err(e) => {
                    tracing::debug!("Provider {} failed: {}", provider.name(), e);
                    continue;
                }
            }
        }

        Err(AppError::NoProvider.into())
    }
}

#[tokio::main]
async fn main(){
    let tracing_filter = EnvFilter::default()
        .add_directive(LevelFilter::INFO.into());

    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer())
        .with(tracing_filter)
        .init();


    let redis_url = std::env::var("REDIS_URL").unwrap_or_else(|_| {
        tracing::warn!("REDIS_URL environment was not set. Defaulting to localhost.");
        "redis://127.0.0.1/".to_string()
    });
    let cache = RedisCache::new(&redis_url).await
        .expect("Failed to connect to redis");
    let http_client = reqwest::Client::builder()
        .user_agent("ZEGraph-Pfp-Provider/0.4 (+https://zegraph.xyz)")
        .timeout(Duration::from_secs(10))
        .build()
        .expect("Failed to create HTTP client");

    let mut providers: Vec<Box<dyn Provider>> = vec![
        Box::new(PlayerDb::new(http_client.clone())),
        Box::new(SteamIdPro::new(http_client.clone())),
        Box::new(SteamIdXyz::new(http_client.clone())),
        Box::new(TradeItProvider::new(http_client.clone())),
    ];

    if let Ok(steam_api_key) = std::env::var("STEAM_API_KEY"){
        providers.push(Box::new(SteamOfficialApi::new(http_client.clone(), steam_api_key)))
    }else {
        tracing::warn!("STEAM_API_KEY environment was not set. Final fallback for providing profile does not exist.");
    }

    let app_state = Arc::new(AppState {
        providers,
        cache,
        lookup_limit: Semaphore::new(MAX_CONCURRENT_LOOKUPS),
    });

    let api = Api { state: app_state };

    let api_service = OpenApiService::new(api, "Steam Profile Picture API", "1.0")
        .server("http://localhost:3000/api");

    let app = Route::new()
        .nest("/api", api_service)
        .with(Tracing);

    // Start the server
    let addr = std::env::var("LISTEN_ADDR").unwrap_or_else(|_| "0.0.0.0:3000".to_string());
    tracing::info!("Starting server at {}", addr);

    Server::new(TcpListener::bind(addr))
        .run(app)
        .await
        .expect("Couldn't run the server!");
}