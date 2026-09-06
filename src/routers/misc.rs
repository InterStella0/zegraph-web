use std::collections::HashMap;
use std::fmt::Display;
use std::io::Cursor;
use std::path::PathBuf;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use futures::stream::BoxStream;
use futures::{StreamExt, TryFutureExt};
use image::imageops::{FilterType};
use poem::web::{Data};
use poem_openapi::{ApiResponse, Object, OpenApi};
use poem_openapi::param::Path;
use poem_openapi::payload::{Binary, EventStream};
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::fs;
use tokio::net::TcpStream;
use tokio::sync::broadcast::{self, error::RecvError};
use tokio::sync::{OwnedSemaphorePermit, Semaphore};
use tokio::time::{interval, timeout};
use crate::{response, AppData, FastCache};
use crate::core::utils::*;
use crate::api_models::common::*;
use crate::api_models::misc::Announcement;
use crate::models::admins::DbAnnouncement;
use crate::models::admins::AnnouncementTypeState;
use crate::models::sitemaps::*;
use crate::workers::job::{QUEUE_HEAVY, QUEUE_LIGHT};
use crate::routers::ApiTags;

extern crate rust_fuzzy_search;

const HEALTH_CHECK_TIMEOUT: Duration = Duration::from_secs(2);

const TRAFFIC_TOP_N: usize = 10;

const QGIS_FASTCGI_PORT: u16 = 9993;
const QGIS_WMS_TIMEOUT: Duration = Duration::from_secs(3);

#[derive(Object, Serialize)]
struct SitemapServer {
    server_id: String,
    readable_link: Option<String>,
}

#[derive(Object, Serialize)]
struct SitemapMap {
    server_id: String,
    server_readable_link: Option<String>,
    map_name: String,
    last_played: Option<String>,
}

#[derive(Object, Serialize)]
struct SitemapPlayer {
    server_id: String,
    server_readable_link: Option<String>,
    player_id: String,
    recent_online: Option<String>,
}

#[derive(Object, Serialize)]
struct SitemapData {
    servers: Vec<SitemapServer>,
    maps: Vec<SitemapMap>,
    players: Vec<SitemapPlayer>,
}

#[derive(Object)]
struct DependencyHealth {
    /// "up" | "down"
    status: String,
    latency_ms: Option<u64>,
    error: Option<String>,
}

impl DependencyHealth {
    fn up(latency: Duration) -> Self {
        Self { status: "up".to_string(), latency_ms: Some(latency.as_millis() as u64), error: None }
    }
    fn down(error: impl Display) -> Self {
        Self { status: "down".to_string(), latency_ms: None, error: Some(error.to_string()) }
    }
    fn is_up(&self) -> bool {
        self.status == "up"
    }
}

#[derive(Object)]
struct QgisHealth {
    status: String,
    latency_ms: Option<u64>,
    error: Option<String>,
    wms: Option<DependencyHealth>,
}

impl QgisHealth {
    fn down(error: impl Display) -> Self {
        Self {
            status: "down".to_string(),
            latency_ms: None,
            error: Some(error.to_string()),
            wms: None,
        }
    }
}

#[derive(Object)]
struct QueueHealth {
    heavy: Option<i64>,
    light: Option<i64>,
    completed_heavy: Option<i64>,
    completed_light: Option<i64>,
}

#[derive(Object)]
struct EndpointStat {
    endpoint: String,
    served: i64,
    average_ms: f64,
}

#[derive(Object)]
struct TrafficHealth {
    served: i64,
    average_ms: f64,
    since: Option<i64>,
    busiest: Vec<EndpointStat>,
}

#[derive(Object)]
struct AvgGraphPoint {
    timestamp: i64,
    value: Option<f64>,
}

#[derive(Object)]
struct IAmOkie{
    response: String,
    postgres: DependencyHealth,
    redis: DependencyHealth,
    queues: QueueHealth,
    qgis: QgisHealth,
    traffic: Option<TrafficHealth>,
    avg_graph: Option<Vec<AvgGraphPoint>>,
}

#[derive(Object, Clone, Debug)]
pub struct NewRowEvent {
    pub channel: String,
    pub payload: String,
}

#[derive(Deserialize)]
struct PlayerActivityPayload {
    player_id: String,
    server_id: String,
}

pub(crate) const LIVE_EVENT_CHANNELS: [&str; 5] = [
    "player_activity", "map_changed", "map_update", "infraction_new", "infraction_update",
];

const LIVE_EVENT_BUFFER: usize = 256;

const MAX_SSE_CLIENTS: usize = 512;

pub(crate) struct LiveEventHub {
    events: broadcast::Sender<NewRowEvent>,
    clients: Arc<Semaphore>,
}

impl LiveEventHub {
    pub(crate) fn new() -> Self {
        let (events, _) = broadcast::channel(LIVE_EVENT_BUFFER);
        Self { events, clients: Arc::new(Semaphore::new(MAX_SSE_CLIENTS)) }
    }

    pub(crate) fn publisher(&self) -> broadcast::Sender<NewRowEvent> {
        self.events.clone()
    }
}

pub(crate) async fn should_forward_live_event(app: &AppData, event: &NewRowEvent) -> bool {
    if event.channel != "player_activity" {
        return true;
    }
    let Ok(activity) = serde_json::from_str::<PlayerActivityPayload>(&event.payload) else {
        return true;
    };
    !is_player_activity_anonymized(app, &activity.server_id, &activity.player_id).await
}

#[derive(ApiResponse)]
pub enum LiveEventResponse {
    #[oai(status = 200)]
    Stream(
        EventStream<BoxStream<'static, NewRowEvent>>,
        #[oai(header = "Cache-Control")] String,
        #[oai(header = "X-Accel-Buffering")] String,
    ),
    #[oai(status = 503)]
    TooManyClients,
}

#[derive(ApiResponse)]
pub enum JpegResponse {
    #[oai(status = 200, content_type = "image/jpeg")]
    Ok(Binary<Vec<u8>>),
    #[oai(status = 404)]
    NotFound,
}

enum ThumbnailError{
    FetchUrlError(String),
    ImageGeneratorError(String),
}

impl Display for ThumbnailError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ThumbnailError::FetchUrlError(err)
            | ThumbnailError::ImageGeneratorError(err) => write!(f, "{err}"),

        }
    }
}

fn merge_into(target: &mut HashMap<String, i64>, bucket: HashMap<String, i64>) {
    for (key, value) in bucket {
        *target.entry(key).or_insert(0) += value;
    }
}

async fn read_recent_window(
    conn: &mut impl redis::aio::ConnectionLike,
) -> redis::RedisResult<(HashMap<String, i64>, HashMap<String, i64>)> {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let minute = now / 60;

    let mut pipe = redis::pipe();
    for offset in 0..TRAFFIC_WINDOW_MINUTES {
        let (count_key, duration_key) = metrics_bucket_keys(minute.saturating_sub(offset));
        pipe.hgetall(count_key).hgetall(duration_key);
    }

    // Replies come back in the order queued: count, duration, count, duration, …
    let replies: Vec<HashMap<String, i64>> = pipe.query_async(conn).await?;
    let mut counts = HashMap::new();
    let mut durations = HashMap::new();
    for (index, bucket) in replies.into_iter().enumerate() {
        if index % 2 == 0 {
            merge_into(&mut counts, bucket);
        } else {
            merge_into(&mut durations, bucket);
        }
    }
    Ok((counts, durations))
}

fn mean_ms(counts: &HashMap<String, i64>, durations: &HashMap<String, i64>, key: &str) -> Option<f64> {
    let served = counts.get(key).copied().filter(|served| *served > 0)?;
    Some(durations.get(key).copied().unwrap_or(0) as f64 / served as f64 / 1000.0)
}

fn overall_mean_ms(counts: &HashMap<String, i64>, durations: &HashMap<String, i64>) -> Option<f64> {
    let counted = || counts.iter().filter(|(_, served)| **served > 0);

    let served: i64 = counted().map(|(_, served)| *served).sum();
    if served <= 0 {
        return None;
    }
    let total_micros: i64 = counted()
        .filter_map(|(key, _)| durations.get(key))
        .sum();
    Some(total_micros as f64 / served as f64 / 1000.0)
}

fn summarize_traffic(
    counts: HashMap<String, i64>,
    durations: HashMap<String, i64>,
    recent_counts: HashMap<String, i64>,
    recent_durations: HashMap<String, i64>,
    since: Option<i64>,
) -> TrafficHealth {
    let mut busiest: Vec<EndpointStat> = counts.iter()
        .filter(|(_, served)| **served > 0)
        .map(|(endpoint, served)| EndpointStat {
            endpoint: endpoint.clone(),
            served: *served,
            average_ms: mean_ms(&recent_counts, &recent_durations, endpoint)
                .or_else(|| mean_ms(&counts, &durations, endpoint))
                .unwrap_or(0.0),
        })
        .collect();
    busiest.sort_by(|a, b| b.served.cmp(&a.served).then_with(|| a.endpoint.cmp(&b.endpoint)));

    let served: i64 = busiest.iter().map(|e| e.served).sum();
    let average_ms = overall_mean_ms(&recent_counts, &recent_durations)
        .or_else(|| overall_mean_ms(&counts, &durations))
        .unwrap_or(0.0);
    busiest.truncate(TRAFFIC_TOP_N);

    TrafficHealth { served, average_ms, since, busiest }
}

const AVG_GRAPH_CACHE_KEY: &str = "health:avg_graph";

static AVG_GRAPH_CACHE: std::sync::LazyLock<moka::future::Cache<String, String>> =
    std::sync::LazyLock::new(|| {
        moka::future::Cache::builder()
            .time_to_live(Duration::from_secs(5 * 60))
            .max_capacity(1)
            .build()
    });

async fn read_avg_graph(
    cache: &FastCache,
) -> Result<(Vec<i64>, Vec<Option<i64>>, Vec<Option<i64>>), String> {
    if let Some(cached) = AVG_GRAPH_CACHE.get(AVG_GRAPH_CACHE_KEY).await {
        match serde_json::from_str(&cached) {
            Ok(graph) => return Ok(graph),
            Err(_) => tracing::warn!("Memory deserialize failed for {AVG_GRAPH_CACHE_KEY}"),
        }
    }

    let mut conn = cache.redis_pool.get().await.map_err(|e| e.to_string())?;
    let graph = fetch_avg_graph(&mut *conn).await.map_err(|e| e.to_string())?;

    if let Ok(json) = serde_json::to_string(&graph) {
        AVG_GRAPH_CACHE.insert(AVG_GRAPH_CACHE_KEY.to_string(), json).await;
    }
    Ok(graph)
}

fn avg_graph_bucket_window(bucket: u64) -> Vec<u64> {
    let start = bucket.saturating_sub(AVG_GRAPH_BUCKETS - 1);
    (start..=bucket).collect()
}

async fn fetch_avg_graph(
    conn: &mut impl redis::aio::ConnectionLike,
) -> redis::RedisResult<(Vec<i64>, Vec<Option<i64>>, Vec<Option<i64>>)> {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let bucket = now / AVG_GRAPH_BUCKET_SECS;
    let buckets = avg_graph_bucket_window(bucket);
    let timestamps: Vec<i64> = buckets.iter().map(|&b| (b * AVG_GRAPH_BUCKET_SECS) as i64).collect();
    let count_keys: Vec<String> = buckets.iter().map(|&b| overall_metric_keys(b).0).collect();
    let duration_keys: Vec<String> = buckets.iter().map(|&b| overall_metric_keys(b).1).collect();
    let counts = redis::cmd("MGET").arg(count_keys).query_async(conn).await?;
    let durations = redis::cmd("MGET").arg(duration_keys).query_async(conn).await?;
    Ok((timestamps, counts, durations))
}

fn build_avg_graph(
    timestamps: &[i64],
    counts: &[Option<i64>],
    durations: &[Option<i64>],
) -> Vec<AvgGraphPoint> {
    timestamps.iter().zip(counts.iter()).zip(durations.iter()).map(|((&timestamp, count), duration)| {
        AvgGraphPoint {
            timestamp,
            value: match count.filter(|c| *c > 0) {
                Some(count) => Some(duration.unwrap_or(0) as f64 / count as f64 / 1000.0),
                None => None,
            },
        }
    }).collect()
}

pub struct MiscApi;


#[OpenApi(tag = "ApiTags::Misc")]
impl MiscApi {
    /// All URLs needed to generate the site's XML sitemaps.
    #[oai(path = "/sitemap-data", method = "get")]
    async fn sitemap_data(&self, data: Data<&AppData>) -> Response<SitemapData> {
        let Ok(servers) = sqlx::query_as!(DbServerSitemap, "
            SELECT server_id, readable_link
            FROM server",
        ).fetch_all(&*data.pool.clone()).await else {
            return response!(internal_server_error)
        };
        let Ok(players) = sqlx::query_as!(DbPlayerSitemap, "
            SELECT server_id, server_readable_link, player_id, recent_online
            FROM (
                SELECT pss.server_id,
                       s.readable_link AS server_readable_link,
                       pss.player_id,
                       MAX(pss.started_at) AS recent_online,
                       ROW_NUMBER() OVER (PARTITION BY pss.server_id ORDER BY MAX(started_at) DESC) AS rn
                FROM player_server_session pss
                JOIN server s ON s.server_id=pss.server_id
                LEFT JOIN server_player_names spn
                    ON spn.server_id = pss.server_id AND spn.player_id = pss.player_id
                WHERE started_at >= CURRENT_TIMESTAMP - INTERVAL '1 days'
                  AND COALESCE(spn.is_anonymous, FALSE) = FALSE
                GROUP BY pss.server_id, s.readable_link, pss.player_id
            ) ranked
            WHERE rn <= 20",
        ).fetch_all(&*data.pool.clone()).await else {
            return response!(internal_server_error)
        };
        let Ok(maps) = sqlx::query_as!(DbMapSitemap, "
            SELECT s.server_id, s.readable_link AS server_readable_link, map AS map_name, MAX(started_at) last_played
            FROM server_map_played smp
            JOIN server s ON smp.server_id=s.server_id
            GROUP BY smp.map, s.server_id, s.readable_link",
        ).fetch_all(&*data.pool.clone()).await else {
            return response!(internal_server_error)
        };

        let servers: Vec<SitemapServer> = servers.into_iter().filter_map(|s| {
            Some(SitemapServer {
                server_id: s.server_id?,
                readable_link: s.readable_link,
            })
        }).collect();

        let maps: Vec<SitemapMap> = maps.into_iter().filter_map(|m| {
            Some(SitemapMap {
                server_id: m.server_id?,
                server_readable_link: m.server_readable_link,
                map_name: m.map_name?,
                last_played: m.last_played.map(|d| d.date().to_string()),
            })
        }).collect();

        let players: Vec<SitemapPlayer> = players.into_iter().filter_map(|p| {
            Some(SitemapPlayer {
                server_id: p.server_id?,
                server_readable_link: p.server_readable_link,
                player_id: p.player_id?,
                recent_online: p.recent_online.map(|d| d.date().to_string()),
            })
        }).collect();

        response!(ok SitemapData { servers, maps, players })
    }
    /// Always answers 200, even when a dependency is down.
    #[oai(path = "/health", method = "get")]
    async fn am_i_okie(&self, Data(app): Data<&AppData>) -> Response<IAmOkie>{
        let (postgres, (redis, queues, traffic, avg_graph), qgis) = tokio::join!(
            self.check_postgres(app),
            self.check_redis(app),
            self.check_qgis(),
        );

        let healthy = postgres.is_up() && redis.is_up();
        response!(ok IAmOkie{
            response: if healthy { "ok" } else { "degraded" }.to_string(),
            postgres,
            redis,
            queues,
            qgis,
            traffic,
            avg_graph,
        })
    }
    async fn check_qgis(&self) -> QgisHealth {
        let host = get_env_default("QGIS_HOST").unwrap_or_else(|| "qgis-server".to_string());
        let addr = format!("{host}:{QGIS_FASTCGI_PORT}");

        let started = Instant::now();
        match timeout(HEALTH_CHECK_TIMEOUT, TcpStream::connect(&addr)).await {
            Ok(Ok(_)) => {},
            Ok(Err(e)) => return QgisHealth::down(e),
            Err(_) => return QgisHealth::down("timed out"),
        }

        QgisHealth {
            status: "up".to_string(),
            latency_ms: Some(started.elapsed().as_millis() as u64),
            error: None,
            wms: self.check_qgis_wms().await,
        }
    }
    async fn check_qgis_wms(&self) -> Option<DependencyHealth> {
        let base = get_env_default("QGIS_WMS_URL").filter(|u| !u.trim().is_empty())?;
        let url = format!("{base}?SERVICE=WMS&REQUEST=GetCapabilities");

        let started = Instant::now();
        let probe = async {
            let resp = reqwest::get(&url).await.map_err(|e| e.to_string())?;
            let status = resp.status();
            if !status.is_success() {
                return Err(format!("HTTP {status}"));
            }
            let body = resp.text().await.map_err(|e| e.to_string())?;
            // QGIS answers a broken project with a 200 ServiceException, so the status alone is
            // not enough to call this up.
            if !body.contains("<WMS_Capabilities") {
                return Err("response was not a WMS capabilities document".to_string());
            }
            Ok(())
        };

        Some(match timeout(QGIS_WMS_TIMEOUT, probe).await {
            Ok(Ok(())) => DependencyHealth::up(started.elapsed()),
            Ok(Err(e)) => DependencyHealth::down(e),
            Err(_) => DependencyHealth::down("timed out"),
        })
    }
    async fn check_postgres(&self, app: &AppData) -> DependencyHealth {
        let started = Instant::now();
        match timeout(HEALTH_CHECK_TIMEOUT, sqlx::query("SELECT 1").execute(&*app.pool)).await {
            Ok(Ok(_)) => DependencyHealth::up(started.elapsed()),
            Ok(Err(e)) => DependencyHealth::down(e),
            Err(_) => DependencyHealth::down("timed out"),
        }
    }
    async fn check_redis(&self, app: &AppData) -> (DependencyHealth, QueueHealth, Option<TrafficHealth>, Option<Vec<AvgGraphPoint>>) {
        let unknown_queues = || QueueHealth {
            heavy: None,
            light: None,
            completed_heavy: None,
            completed_light: None,
        };
        let started = Instant::now();

        let probe = async {
            let mut conn = app.cache.redis_pool.get().await.map_err(|e| e.to_string())?;
            redis::cmd("PING").query_async::<String>(&mut *conn).await.map_err(|e| e.to_string())?;
            let latency = started.elapsed();

            let heavy: i64 = conn.llen(QUEUE_HEAVY).await.map_err(|e| e.to_string())?;
            let light: i64 = conn.llen(QUEUE_LIGHT).await.map_err(|e| e.to_string())?;
            let counts: HashMap<String, i64> = conn.hgetall(METRICS_COUNT_KEY)
                .await.map_err(|e| e.to_string())?;
            let durations: HashMap<String, i64> = conn.hgetall(METRICS_DURATION_KEY)
                .await.map_err(|e| e.to_string())?;

            let since: Option<i64> = conn.get(METRICS_SINCE_KEY)
                .await.map_err(|e| e.to_string())?;

            let jobs: HashMap<String, i64> = conn.hgetall(METRICS_JOBS_KEY)
                .await.map_err(|e| e.to_string())?;
            let (recent_counts, recent_durations) = read_recent_window(&mut *conn)
                .await.map_err(|e| e.to_string())?;
            let (overall_timestamps, overall_counts, overall_durations) = read_avg_graph(&app.cache).await?;

            Ok::<_, String>((latency, heavy, light, counts, durations, recent_counts, recent_durations, since, jobs, overall_timestamps, overall_counts, overall_durations))
        };

        match timeout(HEALTH_CHECK_TIMEOUT, probe).await {
            Ok(Ok((latency, heavy, light, counts, durations, recent_counts, recent_durations, since, jobs, overall_timestamps, overall_counts, overall_durations))) => (
                DependencyHealth::up(latency),
                QueueHealth {
                    heavy: Some(heavy),
                    light: Some(light),
                    completed_heavy: Some(jobs.get("heavy").copied().unwrap_or(0)),
                    completed_light: Some(jobs.get("light").copied().unwrap_or(0)),
                },
                Some(summarize_traffic(counts, durations, recent_counts, recent_durations, since)),
                Some(build_avg_graph(&overall_timestamps, &overall_counts, &overall_durations)),
            ),
            Ok(Err(e)) => (DependencyHealth::down(e), unknown_queues(), None, None),
            Err(_) => (DependencyHealth::down("timed out"), unknown_queues(), None, None),
        }
    }
    async fn generate_thumbnail(&self, thumbnail_type: &ThumbnailType, filename: &str) -> Result<Vec<u8>, ThumbnailError> {
        let mut filenames = filename.splitn(2, "--");
        let game_type = filenames.next().unwrap_or(GAME_TYPES[0]);
        let filename = filenames.next().unwrap_or(filename);
        let image_url = format!("{BASE_URL}/{game_type}/{filename}");

        tracing::debug!("Fetching {image_url}");
        let response = reqwest::get(&image_url).await
            .map_err(|_| ThumbnailError::FetchUrlError(image_url))?;
        let bytes = response.bytes()
            .await
            .map_err(
            |_e| ThumbnailError::FetchUrlError("Couldn't get image response bytes!".to_string())
        )?;
        let img = image::load_from_memory(&bytes)
            .map_err(|e| ThumbnailError::ImageGeneratorError(format!("Error loading image memory: {e}")))?;

        let ratio = img.width() / img.height() ;
        let width = match thumbnail_type {
            ThumbnailType::Small => 180,
            ThumbnailType::Medium => 500,
            ThumbnailType::Large => 1122,
            ThumbnailType::ExtraLarge => img.width(),
        };
        let height = ratio * width;
        let thumbnail = img.resize(width, height, FilterType::Lanczos3);

        let path = get_env_default("CACHE_THUMBNAIL").unwrap_or_default();
        let save_path = PathBuf::from(path).join(thumbnail_type.to_string());
        fs::create_dir_all(&save_path)
            .map_err(|e| ThumbnailError::ImageGeneratorError(format!("Error creating folder: {e}")))
            .await?;
        let save_path= save_path.join(filename);
        tracing::debug!("Saving {}", save_path.display());
        let mut buffer = Cursor::new(Vec::new());
        thumbnail.write_to(&mut buffer, image::ImageFormat::Jpeg)
            .map_err(|e| ThumbnailError::ImageGeneratorError(format!("Error writing buffer: {e}")))?;

        fs::write(&save_path, buffer.get_ref()).await
            .map_err(|e| ThumbnailError::ImageGeneratorError(format!("Error writing thumbnail: {e}")))?;

        Ok(buffer.into_inner())
    }
    async fn get_map_thumbnail(&self, thumbnail_type: &ThumbnailType, filename: &str) -> Result<Vec<u8>, ThumbnailError> {
        let path = get_env_default("CACHE_THUMBNAIL").unwrap_or_default();
        let file_path = PathBuf::from(path).join(thumbnail_type.to_string()).join(filename);

        if file_path.exists() {
            let reading = fs::read(file_path).await
                .map_err(|e| ThumbnailError::ImageGeneratorError(format!("Error writing thumbnail: {e}")))?;
            return Ok(reading);
        }

        self.generate_thumbnail(thumbnail_type, &filename).await
    }
    /// Fetch (or generate and cache) a resized map thumbnail.
    #[oai(path = "/thumbnails/:thumbnail_type/:filename", method = "get")]
    async fn get_thumbnail(&self, thumbnail_type: Path<ThumbnailType>, filename: Path<String>) -> JpegResponse {
        match self.get_map_thumbnail(&thumbnail_type.0, &filename).await {
            Ok(image_data) => JpegResponse::Ok(Binary(image_data)),
            Err(e) => {
                tracing::warn!("{e}");
                JpegResponse::NotFound
            },
        }
    }
    /// Currently-published, non-expired site announcements, newest first.
    #[oai(path="/announcements", method="get")]
    async fn get_annouce(&self, Data(app): Data<&AppData>) -> Response<Vec<Announcement>>{
        let pool = &*app.pool.clone();
        let func = || sqlx::query_as!(DbAnnouncement, "
            SELECT id, type AS \"type: AnnouncementTypeState\", title, text, created_at, published_at, expires_at, show
            FROM website.announce
            WHERE show = true
              AND COALESCE(published_at, created_at) <= CURRENT_TIMESTAMP
              AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
            ORDER BY created_at DESC
        ").fetch_all(pool);

        let Ok(value) = cached_response("announced", &app.cache, HOUR, func).await else {
            return response!(internal_server_error)
        } ;
        response!(ok value.result.iter_into())
    }
    /// Server-sent event stream of live database changes.
    #[oai(path = "/events/data-updates", method = "get")]
    async fn sse_new_rows(&self, Data(app): Data<&AppData>) -> LiveEventResponse {
        let Ok(permit) = app.live_events.clients.clone().try_acquire_owned() else {
            tracing::warn!("Refusing SSE client: {MAX_SSE_CLIENTS} streams already open");
            return LiveEventResponse::TooManyClients;
        };
        let mut receiver = app.live_events.events.subscribe();

        let stream = async_stream::stream! {
            let _permit: OwnedSemaphorePermit = permit;
            let mut heartbeat_interval = interval(Duration::from_secs(10));

            loop {
                tokio::select! {
                    result = receiver.recv() => {
                        match result {
                            Ok(event) => yield event,
                            Err(RecvError::Lagged(missed)) => {
                                tracing::warn!("SSE client lagged behind, skipped {missed} events");
                                continue;
                            },
                            Err(RecvError::Closed) => break,
                        }
                    },
                    _ = heartbeat_interval.tick() => {
                        yield NewRowEvent {
                            channel: "heartbeat".to_string(),
                            payload: "{}".to_string(),
                        };
                    },
                }
            }
        };

        LiveEventResponse::Stream(
            EventStream::new(stream.boxed()),
            "no-cache, no-transform".to_string(),
            "no".to_string(),
        )
    }
}

#[cfg(test)]
mod live_event_tests {
    use super::*;

    fn event(channel: &str) -> NewRowEvent {
        NewRowEvent { channel: channel.to_string(), payload: "{}".to_string() }
    }

    #[tokio::test]
    async fn one_publisher_reaches_every_subscriber() {
        let hub = LiveEventHub::new();
        let mut first = hub.events.subscribe();
        let mut second = hub.events.subscribe();

        hub.publisher().send(event("map_changed")).expect("subscribers are listening");

        assert_eq!(first.recv().await.unwrap().channel, "map_changed");
        assert_eq!(second.recv().await.unwrap().channel, "map_changed");
    }

    #[tokio::test]
    async fn publishing_with_nobody_connected_is_not_fatal() {
        let hub = LiveEventHub::new();
        assert!(hub.publisher().send(event("player_activity")).is_err());
        // The channel is still usable afterwards.
        let mut receiver = hub.events.subscribe();
        hub.publisher().send(event("player_activity")).expect("subscriber is listening");
        assert_eq!(receiver.recv().await.unwrap().channel, "player_activity");
    }

    #[tokio::test]
    async fn a_lagging_subscriber_is_told_what_it_missed_and_carries_on() {
        let hub = LiveEventHub::new();
        let mut slow = hub.events.subscribe();

        for _ in 0..LIVE_EVENT_BUFFER + 1 {
            let _ = hub.publisher().send(event("player_activity"));
        }

        assert!(matches!(slow.recv().await, Err(RecvError::Lagged(_))));
        assert_eq!(slow.recv().await.unwrap().channel, "player_activity");
    }

    #[tokio::test]
    async fn only_player_activity_is_filtered_and_it_fails_open() {
        let app = crate::workers::test_support::fake_app_data();

        assert!(should_forward_live_event(&app, &event("map_changed")).await);
        assert!(should_forward_live_event(&app, &event("heartbeat")).await);
        assert!(
            should_forward_live_event(
                &app,
                &NewRowEvent {
                    channel: "player_activity".to_string(),
                    payload: "not json".to_string(),
                },
            ).await
        );
    }

    #[tokio::test]
    async fn a_finished_stream_returns_its_client_slot() {
        let hub = LiveEventHub::new();
        let permits: Vec<_> = (0..MAX_SSE_CLIENTS)
            .map(|_| hub.clients.clone().try_acquire_owned().expect("under the cap"))
            .collect();

        assert!(hub.clients.clone().try_acquire_owned().is_err(), "cap should reject the next client");

        drop(permits);
        assert!(hub.clients.clone().try_acquire_owned().is_ok(), "a closed stream frees its slot");
    }
}

#[cfg(test)]
mod traffic_tests {
    use super::*;

    fn hash(entries: &[(&str, i64)]) -> HashMap<String, i64> {
        entries.iter().map(|(k, v)| (k.to_string(), *v)).collect()
    }

    fn lifetime_only(
        counts: HashMap<String, i64>,
        durations: HashMap<String, i64>,
        since: Option<i64>,
    ) -> TrafficHealth {
        summarize_traffic(counts, durations, HashMap::new(), HashMap::new(), since)
    }

    #[test]
    fn averages_are_microseconds_per_request_in_milliseconds() {
        let traffic = lifetime_only(
            hash(&[("GET /health", 4), ("GET /servers", 2)]),
            hash(&[("GET /health", 2_000), ("GET /servers", 10_000)]),
            Some(1_700_000_000),
        );

        assert_eq!(traffic.served, 6);
        assert_eq!(traffic.since, Some(1_700_000_000), "the period the total covers rides along");
        assert_eq!(traffic.average_ms, 2.0);
        assert_eq!(traffic.busiest[0].endpoint, "GET /health");
        assert_eq!(traffic.busiest[0].average_ms, 0.5);
        assert_eq!(traffic.busiest[1].average_ms, 5.0);
    }

    #[test]
    fn the_recent_window_wins_over_the_lifetime_figures() {
        let traffic = summarize_traffic(
            hash(&[("GET /health", 1_000_000)]),
            hash(&[("GET /health", 500_000_000)]),
            hash(&[("GET /health", 10)]),
            hash(&[("GET /health", 400_000)]),
            None,
        );

        assert_eq!(traffic.average_ms, 40.0);
        assert_eq!(traffic.busiest[0].average_ms, 40.0);
        assert_eq!(traffic.served, 1_000_000, "the volume figure stays cumulative");
    }

    #[test]
    fn an_endpoint_idle_through_the_window_falls_back_to_its_lifetime_average() {
        let traffic = summarize_traffic(
            hash(&[("GET /health", 100), ("GET /servers", 50)]),
            hash(&[("GET /health", 200_000), ("GET /servers", 500_000)]),
            hash(&[("GET /health", 4)]),
            hash(&[("GET /health", 40_000)]),
            None,
        );

        assert_eq!(traffic.busiest[0].endpoint, "GET /health");
        assert_eq!(traffic.busiest[0].average_ms, 10.0, "seen in the window");
        assert_eq!(traffic.busiest[1].endpoint, "GET /servers");
        assert_eq!(traffic.busiest[1].average_ms, 10.0, "not seen in the window, so 500_000us/50");

        assert_eq!(traffic.average_ms, 10.0);

        let idle = lifetime_only(
            hash(&[("GET /health", 100), ("GET /servers", 50)]),
            hash(&[("GET /health", 200_000), ("GET /servers", 500_000)]),
            None,
        );
        assert!((idle.average_ms - 700_000.0 / 150.0 / 1000.0).abs() < f64::EPSILON);
    }

    #[test]
    fn the_window_does_not_reorder_or_retotal_the_list() {
        let traffic = summarize_traffic(
            hash(&[("GET /busy-lifetime", 900), ("GET /busy-now", 10)]),
            hash(&[("GET /busy-lifetime", 900), ("GET /busy-now", 10)]),
            // Reversed in the window — the ranking must ignore this entirely.
            hash(&[("GET /busy-now", 500), ("GET /busy-lifetime", 1)]),
            hash(&[("GET /busy-now", 500), ("GET /busy-lifetime", 1)]),
            Some(1_700_000_000),
        );

        assert_eq!(traffic.busiest[0].endpoint, "GET /busy-lifetime");
        assert_eq!(traffic.busiest[0].served, 900);
        assert_eq!(traffic.served, 910, "cumulative, not the window's 501");
        assert_eq!(traffic.since, Some(1_700_000_000));
    }

    #[test]
    fn a_half_written_field_does_not_poison_the_averages() {
        let counted_only = lifetime_only(hash(&[("GET /health", 2)]), hash(&[]), None);
        assert_eq!(counted_only.busiest[0].average_ms, 0.0);
        assert_eq!(counted_only.served, 2);

        let timed_only = lifetime_only(hash(&[]), hash(&[("GET /health", 5_000)]), None);
        assert!(timed_only.busiest.is_empty());
        assert_eq!(timed_only.served, 0);
        assert_eq!(timed_only.average_ms, 0.0);

        let recent_timed_only = summarize_traffic(
            hash(&[("GET /health", 4)]),
            hash(&[("GET /health", 8_000)]),
            hash(&[]),
            hash(&[("GET /health", 999_000)]),
            None,
        );
        assert_eq!(recent_timed_only.busiest[0].average_ms, 2.0);
        assert_eq!(recent_timed_only.average_ms, 2.0);

        let recent_zero_count = summarize_traffic(
            hash(&[("GET /health", 4)]),
            hash(&[("GET /health", 8_000)]),
            hash(&[("GET /health", 0)]),
            hash(&[("GET /health", 999_000)]),
            None,
        );
        assert_eq!(recent_zero_count.busiest[0].average_ms, 2.0);
        assert_eq!(recent_zero_count.average_ms, 2.0);
    }

    /// `HGETALL` returns an unordered map, so equal counts have to be broken deterministically or
    /// the list reshuffles between two calls to a probe that runs every 10 seconds.
    #[test]
    fn the_list_is_capped_and_ordered_deterministically() {
        let entries: Vec<(String, i64)> = (0..TRAFFIC_TOP_N + 5)
            .map(|i| (format!("GET /route-{i:02}"), 7))
            .collect();
        let counts: HashMap<String, i64> = entries.into_iter().collect();

        let traffic = lifetime_only(counts.clone(), HashMap::new(), None);
        assert_eq!(traffic.busiest.len(), TRAFFIC_TOP_N);
        assert_eq!(traffic.served, 7 * (TRAFFIC_TOP_N as i64 + 5), "the total counts every endpoint, not just the listed ones");

        let names: Vec<&str> = traffic.busiest.iter().map(|e| e.endpoint.as_str()).collect();
        assert_eq!(names[0], "GET /route-00");
        assert_eq!(
            names,
            lifetime_only(counts, HashMap::new(), None).busiest.iter()
                .map(|e| e.endpoint.as_str()).collect::<Vec<_>>()
        );
    }

    #[test]
    fn bucket_keys_are_the_cumulative_keys_suffixed_with_the_minute() {
        let (counts, durations) = metrics_bucket_keys(28_333_333);
        assert_eq!(counts, format!("{METRICS_COUNT_KEY}:28333333"));
        assert_eq!(durations, format!("{METRICS_DURATION_KEY}:28333333"));
        assert_ne!(metrics_bucket_keys(28_333_334).0, counts);
    }

    /// The graph is a fixed 3-day window
    #[test]
    fn the_graph_is_864_points_oldest_first_with_nulls_for_silence() {
        let mut counts = vec![None; AVG_GRAPH_BUCKETS as usize];
        let mut durations = vec![None; AVG_GRAPH_BUCKETS as usize];

        counts[0] = Some(2);
        durations[0] = Some(3_000);
        // index 1 left None: a bucket with no traffic.
        let last = AVG_GRAPH_BUCKETS as usize - 1;
        counts[last] = Some(1); // duration missing → half-written → 0.0, not NaN

        let timestamps: Vec<i64> = (0..AVG_GRAPH_BUCKETS as i64)
            .map(|i| i * AVG_GRAPH_BUCKET_SECS as i64)
            .collect();
        let graph = build_avg_graph(&timestamps, &counts, &durations);
        assert_eq!(graph.len(), AVG_GRAPH_BUCKETS as usize);
        assert_eq!(graph[0].timestamp, 0);
        assert_eq!(graph[0].value, Some(1.5));
        assert_eq!(graph[1].value, None);
        assert_eq!(graph[last].value, Some(0.0));
    }

    #[test]
    fn overall_metric_keys_are_prefixed_and_distinct_per_bucket() {
        let (counts, durations) = overall_metric_keys(28_333_333);
        assert_eq!(counts, format!("{METRICS_OVERALL_COUNT_PREFIX}28333333"));
        assert_eq!(durations, format!("{METRICS_OVERALL_DURATION_PREFIX}28333333"));
        assert_ne!(overall_metric_keys(28_333_334).0, counts);
    }
}

impl UriPatternExt for MiscApi{
    fn get_all_patterns(&self) -> Vec<RoutePattern> {
        vec![
            "/thumbnails/{thumbnail_type}/{filename}",
            "/health",
            "/events/data-updates",
            "/sitemap-data",
            "/announcements",
        ].iter_into()
    }
}