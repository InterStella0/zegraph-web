use std::collections::HashMap;
use std::fmt::Display;
use std::io::Cursor;
use std::path::PathBuf;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use futures::stream::{empty, BoxStream};
use futures::{StreamExt, TryFutureExt};
use image::imageops::{FilterType};
use poem::{Request};
use poem::web::{Data};
use poem_openapi::{Object, OpenApi};
use poem_openapi::param::{Path, Query};
use poem_openapi::payload::{Binary, EventStream};
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use sqlx::postgres::PgListener;
use tokio::fs;
use tokio::net::TcpStream;
use tokio::time::{interval, timeout};
use crate::{response, AppData};
use crate::core::utils::*;
use url;
use crate::api_models::common::*;
use crate::api_models::misc::Announcement;
use crate::models::admins::DbAnnouncement;
use crate::models::players::DbPlayer;
use crate::models::admins::AnnouncementTypeState;
use crate::models::sitemaps::*;
use crate::workers::job::{QUEUE_HEAVY, QUEUE_LIGHT};

extern crate rust_fuzzy_search;

const HEALTH_CHECK_TIMEOUT: Duration = Duration::from_secs(2);

const TRAFFIC_TOP_N: usize = 10;

/// QGIS speaks FastCGI, not HTTP. Same port nginx's `/qgis-server` location passes to.
const QGIS_FASTCGI_PORT: u16 = 9993;

/// A warm GetCapabilities answers in ~20ms, but the first one after QGIS starts makes it read the
/// project off disk and takes seconds. Bounded so that cold case costs one reported timeout rather
/// than the healthcheck's 5s budget.
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
struct SitemapGuide {
    map_name: String,
    server_id: Option<String>,
    server_readable_link: Option<String>,
    slug: String,
    updated_at: String,
}

#[derive(Object, Serialize)]
struct SitemapData {
    servers: Vec<SitemapServer>,
    maps: Vec<SitemapMap>,
    players: Vec<SitemapPlayer>,
    guides: Vec<SitemapGuide>,
}

/// A dependency's reachability at the moment `/health` was called.
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
    /// "up" when the FastCGI port accepts a connection, "down" otherwise.
    status: String,
    latency_ms: Option<u64>,
    error: Option<String>,
    /// Attempted only once the port is known to accept connections, and null when QGIS_WMS_URL is
    /// unset. Never affects `status` or the top-level `response`.
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
}

#[derive(Object)]
struct EndpointStat {
    endpoint: String,
    served: i64,
    average_ms: f64,
}

/// Traffic served since the redis counters were created, as accumulated by `PatternLogger`.
#[derive(Object)]
struct TrafficHealth {
    served: i64,
    average_ms: f64,
    busiest: Vec<EndpointStat>,
}

#[derive(Object)]
struct IAmOkie{
    response: String,
    postgres: DependencyHealth,
    redis: DependencyHealth,
    queues: QueueHealth,
    /// Reported but deliberately excluded from `response`: nothing in this API calls QGIS, the
    /// browser reaches it through nginx, so the backend serves every endpoint fine without it.
    qgis: QgisHealth,
    /// None when redis is unreachable — the counters live there.
    traffic: Option<TrafficHealth>,
}
#[derive(Object)]
struct NewRowEvent {
    channel: String,
    payload: String,
}

#[derive(Deserialize)]
struct PlayerActivityPayload {
    player_id: String,
    server_id: String,
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

/// Joins the two metrics hashes on their shared `"{METHOD} {pattern}"` field.
///
/// Endpoints with a zero count are dropped: the two hashes are written by a pipeline, so a read
/// landing mid-flush can see a field in one and not the other, and dividing by that count would
/// yield an infinity. Ties are broken by name so the list does not reshuffle between calls —
/// `HGETALL` hands back an unordered map.
fn summarize_traffic(counts: HashMap<String, i64>, durations: HashMap<String, i64>) -> TrafficHealth {
    let mut busiest: Vec<EndpointStat> = counts.iter()
        .filter(|(_, served)| **served > 0)
        .map(|(endpoint, served)| EndpointStat {
            endpoint: endpoint.clone(),
            served: *served,
            average_ms: durations.get(endpoint).copied().unwrap_or(0) as f64 / *served as f64 / 1000.0,
        })
        .collect();
    busiest.sort_by(|a, b| b.served.cmp(&a.served).then_with(|| a.endpoint.cmp(&b.endpoint)));

    let served: i64 = busiest.iter().map(|e| e.served).sum();
    let total_micros: i64 = counts.keys().filter_map(|key| durations.get(key)).sum();
    busiest.truncate(TRAFFIC_TOP_N);

    TrafficHealth {
        served,
        average_ms: if served > 0 { total_micros as f64 / served as f64 / 1000.0 } else { 0.0 },
        busiest,
    }
}

pub struct MiscApi;


#[OpenApi]
impl MiscApi {
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
        let Ok(guides) = sqlx::query_as!(DbGuideSitemap, r#"
            SELECT g.map_name as "map_name!", g.server_id, s.readable_link AS server_readable_link, g.slug as "slug!", g.updated_at as "updated_at!"
            FROM website.guides g
            LEFT JOIN server s ON g.server_id = s.server_id"#,
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

        let guides: Vec<SitemapGuide> = guides.into_iter().map(|g| {
            SitemapGuide {
                map_name: g.map_name,
                server_id: g.server_id,
                server_readable_link: g.server_readable_link,
                slug: g.slug,
                updated_at: g.updated_at.date().to_string(),
            }
        }).collect();

        response!(ok SitemapData { servers, maps, players, guides })
    }
    /// Always answers 200, even when a dependency is down.
    ///
    /// The compose healthchecks probe this with `curl -f`, and under Swarm an unhealthy container
    /// is restarted while `reverse` and `frontend` both gate on `backend: service_healthy`. Failing
    /// the probe during a database blip would therefore restart-loop the whole API tier at its
    /// worst moment, so the state lives in `response` rather than in the status line.
    #[oai(path = "/health", method = "get")]
    async fn am_i_okie(&self, Data(app): Data<&AppData>) -> Response<IAmOkie>{
        let (postgres, (redis, queues, traffic), qgis) = tokio::join!(
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
        })
    }
    /// Two layers: the FastCGI port has to accept a connection before a WMS request is worth
    /// making. A WMS failure is reported and goes no further — see [`IAmOkie::qgis`].
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
    /// Goes through nginx because that is what translates HTTP to FastCGI; QGIS' own port 80 serves
    /// a default nginx page with no WMS behind it.
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
    /// `sqlx::query` rather than `query!`: the macro is checked at compile time and would put this
    /// trivial probe in the `.sqlx` cache, forcing a `--prepare` against a live database for it.
    async fn check_postgres(&self, app: &AppData) -> DependencyHealth {
        let started = Instant::now();
        match timeout(HEALTH_CHECK_TIMEOUT, sqlx::query("SELECT 1").execute(&*app.pool)).await {
            Ok(Ok(_)) => DependencyHealth::up(started.elapsed()),
            Ok(Err(e)) => DependencyHealth::down(e),
            Err(_) => DependencyHealth::down("timed out"),
        }
    }
    /// One connection covers the ping, both queue depths and both metrics hashes. A failure
    /// anywhere leaves the queue depths and traffic *unknown* rather than zero — an unreachable
    /// redis says nothing about how much work is queued.
    async fn check_redis(&self, app: &AppData) -> (DependencyHealth, QueueHealth, Option<TrafficHealth>) {
        let unknown_queues = || QueueHealth { heavy: None, light: None };
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

            Ok::<_, String>((latency, heavy, light, counts, durations))
        };

        match timeout(HEALTH_CHECK_TIMEOUT, probe).await {
            Ok(Ok((latency, heavy, light, counts, durations))) => (
                DependencyHealth::up(latency),
                QueueHealth { heavy: Some(heavy), light: Some(light) },
                Some(summarize_traffic(counts, durations)),
            ),
            Ok(Err(e)) => (DependencyHealth::down(e), unknown_queues(), None),
            Err(_) => (DependencyHealth::down("timed out"), unknown_queues(), None),
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
    #[oai(path = "/thumbnails/:thumbnail_type/:filename", method = "get")]
    async fn get_thumbnail(&self, thumbnail_type: Path<ThumbnailType>, filename: Path<String>) -> Binary<Vec<u8>> {
        match self.get_map_thumbnail(&thumbnail_type.0, &filename).await {
            Ok(image_data) => Binary(image_data),
            Err(e) => {
                tracing::warn!("{e}");
                Binary(vec![])
            },
        }
    }
    #[oai(path="/meta_thumbnails", method="get")]
    async fn get_meta_thumbnails(
        &self, req: &Request, Data(app): Data<&AppData>, Query(url): Query<String>
    ) -> Binary<Vec<u8>> {
        let rand = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
            .to_string();
        let raw_host = req.header("Host").unwrap_or_else(|| &rand);
        let host = format!("{}://{raw_host}", req.uri().scheme_str().unwrap_or("http"));
        let Ok(parsed) = url::Url::parse(&url) else {
            return Binary(vec![])
        };

        let domain = parsed.host_str().unwrap_or("");
        if !host.contains(&domain) {
            return Binary(vec![])
        }

        let path_segments = parsed.path_segments()
            .map(|c| c.collect::<Vec<_>>())
            .unwrap_or_default();

        let default_game = String::from(GAME_TYPES[0]);
        match path_segments.as_slice() {
            [server_id, "maps", map_name] => {
                let game = match get_server(&app.pool, &app.cache, &server_id).await {
                    Some(server) => server.game.unwrap_or(default_game),
                    None => default_game
                };
                let maps = get_map_images(&app.cache).await;
                let map_names: Vec<String> = maps.iter()
                    .filter(|e| e.game_type == game)
                    .map(|e| e.map_name.clone())
                    .collect();
                let Some(map_image) = get_map_image(map_name, &map_names) else {
                    return Binary(vec![])
                };

                match self.get_map_thumbnail(&ThumbnailType::Large, &format!("{map_image}.jpg")).await {
                    Ok(image_data) => Binary(image_data),
                    Err(e) => {
                        tracing::warn!("{e}");
                        Binary(vec![])
                    },
                }
            },
            [server_id, "players", player_id] => {
                let _ = server_id;
                let Some(provider) = &app.steam_provider else {
                    tracing::warn!("No pfp provider! This feature is disabled.");
                    return Binary(vec![])
                };
                let pool = &*app.pool.clone();
                let func = || sqlx::query_as!(
                    DbPlayer, "SELECT  player_id, player_name, created_at, associated_player_id
                                FROM player WHERE player_id=$1 LIMIT 1", player_id
                ).fetch_one(pool);
                let key = format!("info:{player_id}");

                let Ok(result) = cached_response(&key, &app.cache, 7 * DAY, func).await else {
                    return Binary(vec![])
                };
                let player_id = match player_id.parse::<i64>() {
                    Ok(p) => p,
                    Err(_) => {
                        if let Some(p_id) = result.result.associated_player_id{
                            let Ok(converted) = p_id.parse::<i64>() else {
                                tracing::warn!("Found invalid player_id from associated_player_id.");
                                return Binary(vec![])
                            };
                            converted
                        }else{
                            return Binary(vec![])
                        }
                    }
                };

                let Ok(profile) = get_profile(&app.cache, provider, &player_id).await else {
                    tracing::warn!("Provider is broken");
                    return Binary(vec![])
                };
                let Ok(resp) = reqwest::get(profile.url).await else {
                    return Binary(vec![])
                };
                Binary(resp.bytes().await.unwrap_or_default().into())
            },
            _ => Binary(vec![])
        }
    }
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

        let Ok(value) = cached_response("announced", &app.cache, 60 * 60, func).await else {
            return response!(internal_server_error)
        } ;
        response!(ok value.result.iter_into())
    }
    #[oai(path = "/events/data-updates", method = "get")]
    async fn sse_new_rows(&self, Data(app): Data<&AppData>) -> EventStream<BoxStream<'static, NewRowEvent>> {
        let Some(db_url) = get_env_default("DATABASE_URL") else {
            let empty_stream: BoxStream<'static, NewRowEvent> = empty().boxed();
            return EventStream::new(empty_stream);
        };
        let app = app.clone();

        let valid_listeners = vec![
            "player_activity", "map_changed", "map_update", "infraction_new", "infraction_update"
        ];
        let stream = async_stream::stream! {
            let mut heartbeat_interval = interval(Duration::from_secs(10));

            match PgListener::connect(&db_url).await {
                Ok(mut listener) => {
                    for listener_name in valid_listeners {
                        if let Err(e) = listener.listen(listener_name).await {
                            tracing::warn!("Failed to LISTEN on {listener_name}: {e}");
                        }
                    }

                    loop {
                        tokio::select! {
                            result = listener.recv() => {
                                match result {
                                    Ok(notification) => {
                                        if notification.channel() == "player_activity" {
                                            if let Ok(activity) = serde_json::from_str::<PlayerActivityPayload>(notification.payload()) {
                                                if is_player_activity_anonymized(&app, &activity.server_id, &activity.player_id).await {
                                                    continue;
                                                }
                                            }
                                        }
                                        yield NewRowEvent {
                                            channel: notification.channel().to_string(),
                                            payload: notification.payload().to_string(),
                                        };
                                    },
                                    Err(e) => {
                                        tracing::error!("Error receiving notification: {}", e);
                                        break;
                                    },
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
                },
                Err(e) => {
                    tracing::error!("PgListener connect error: {e}");
                }
            }
        };

        EventStream::new(stream.boxed())
    }
}
#[cfg(test)]
mod traffic_tests {
    use super::*;

    fn hash(entries: &[(&str, i64)]) -> HashMap<String, i64> {
        entries.iter().map(|(k, v)| (k.to_string(), *v)).collect()
    }

    #[test]
    fn averages_are_microseconds_per_request_in_milliseconds() {
        let traffic = summarize_traffic(
            hash(&[("GET /health", 4), ("GET /servers", 2)]),
            hash(&[("GET /health", 2_000), ("GET /servers", 10_000)]),
        );

        assert_eq!(traffic.served, 6);
        // 12_000us over 6 requests.
        assert_eq!(traffic.average_ms, 2.0);
        assert_eq!(traffic.busiest[0].endpoint, "GET /health");
        assert_eq!(traffic.busiest[0].average_ms, 0.5);
        assert_eq!(traffic.busiest[1].average_ms, 5.0);
    }

    /// A read landing between the two `HINCRBY`s of a flush sees a field in one hash and not the
    /// other. Neither half may produce a NaN or an infinity in the response.
    #[test]
    fn a_half_written_field_does_not_poison_the_averages() {
        let counted_only = summarize_traffic(hash(&[("GET /health", 2)]), hash(&[]));
        assert_eq!(counted_only.busiest[0].average_ms, 0.0);
        assert_eq!(counted_only.served, 2);

        let timed_only = summarize_traffic(hash(&[]), hash(&[("GET /health", 5_000)]));
        assert!(timed_only.busiest.is_empty());
        assert_eq!(timed_only.served, 0);
        assert_eq!(timed_only.average_ms, 0.0);
    }

    /// `HGETALL` returns an unordered map, so equal counts have to be broken deterministically or
    /// the list reshuffles between two calls to a probe that runs every 10 seconds.
    #[test]
    fn the_list_is_capped_and_ordered_deterministically() {
        let entries: Vec<(String, i64)> = (0..TRAFFIC_TOP_N + 5)
            .map(|i| (format!("GET /route-{i:02}"), 7))
            .collect();
        let counts: HashMap<String, i64> = entries.into_iter().collect();

        let traffic = summarize_traffic(counts.clone(), HashMap::new());
        assert_eq!(traffic.busiest.len(), TRAFFIC_TOP_N);
        assert_eq!(traffic.served, 7 * (TRAFFIC_TOP_N as i64 + 5), "the total counts every endpoint, not just the listed ones");

        let names: Vec<&str> = traffic.busiest.iter().map(|e| e.endpoint.as_str()).collect();
        assert_eq!(names[0], "GET /route-00");
        assert_eq!(
            names,
            summarize_traffic(counts, HashMap::new()).busiest.iter()
                .map(|e| e.endpoint.as_str()).collect::<Vec<_>>()
        );
    }
}

impl UriPatternExt for MiscApi{
    fn get_all_patterns(&self) -> Vec<RoutePattern> {
        vec![
            "/meta_thumbnails",
            "/thumbnails/{thumbnail_type}/{filename}",
            "/health",
            "/events/data-updates",
            "/sitemap-data",
            "/announcements",
        ].iter_into()
    }
}