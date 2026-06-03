use std::fmt::Display;
use std::io::Cursor;
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use futures::stream::{empty, BoxStream};
use futures::{StreamExt, TryFutureExt};
use image::imageops::{FilterType};
use poem::{Request};
use poem::web::{Data};
use poem_openapi::{ApiResponse, Object, OpenApi};
use poem_openapi::param::{Path, Query};
use poem_openapi::payload::{Binary, EventStream, Json, PlainText};
use serde::Serialize;
use sqlx::postgres::PgListener;
use tokio::fs;
use tokio::time::interval;
use crate::core::model::*;
use crate::core::model;  // for sqlx! macros
use crate::{response, AppData};
use crate::core::utils::*;
use url;
extern crate rust_fuzzy_search;
use crate::core::api_models::*;
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

#[derive(Object)]
struct IAmOkie{
    response: String
}
#[derive(Object)]
struct NewRowEvent {
    channel: String,
    payload: String,
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


#[derive(Object)]
struct OEmbedMapResponse {
    r#type: String,
    version: String,
    title: String,
    description: String,
    author_name: String,
    author_url: String,
    url: String,
    width: i32,
    height: i32,
}

#[derive(Object)]
struct OEmbedPlayerResponse {
    r#type: String,
    version: String,
    title: String,
    description: String,
    author_name: String,
    author_url: String,
    url: String,
}

#[derive(ApiResponse)]
enum OEmbedResponseType{
    #[oai(status = 200, content_type = "application/json+oembed")]
    Player(Json<OEmbedPlayerResponse>),
    #[oai(status = 200, content_type = "application/json+oembed")]
    Map(Json<OEmbedMapResponse>),
    #[oai(status = 400)]
    Err(PlainText<String>)
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
                       readable_link AS server_readable_link,
                       player_id,
                       MAX(started_at) AS recent_online,
                       ROW_NUMBER() OVER (PARTITION BY pss.server_id ORDER BY MAX(started_at) DESC) AS rn
                FROM player_server_session pss
                JOIN server s ON s.server_id=pss.server_id
                WHERE started_at >= CURRENT_TIMESTAMP - INTERVAL '1 days'
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
    #[oai(path = "/health", method = "get")]
    async fn am_i_okie(&self) -> Response<IAmOkie>{
        response!(ok IAmOkie{
            response: "ok".to_string()
        })
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
    #[oai(path = "/thumbnails/characters/:filename", method = "get")]
    async fn get_character_thumbnail(&self, filename: Path<String>) -> Binary<Vec<u8>> {
        let path = get_env_default("CACHE_THUMBNAIL").unwrap_or_default();
        let file_path = PathBuf::from(path).join("characters").join(&filename.0);
        match fs::read(file_path).await {
            Ok(data) => Binary(data),
            Err(_) => Binary(vec![]),
        }
    }

    #[oai(path="/meta_thumbnails", method="get")]
    async fn get_meta_thumbnails(
        &self, req: &Request, Data(app): Data<&AppData>, Query(url): Query<String>
    ) -> Binary<Vec<u8>> {
        let rand = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
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
            SELECT id, type AS \"type: model::AnnouncementTypeState\", title, text, created_at, published_at, expires_at, show
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
    #[oai(path="/oembed/", method="get")]
    async fn get_oembed(&self, req: &Request, Data(app): Data<&AppData>, Query(url): Query<String>) -> OEmbedResponseType {
        let rand = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos().to_string();
        let raw_host = req.header("Host").unwrap_or_else(|| &rand);
        let host = format!("{}://{raw_host}", req.uri().scheme_str().unwrap_or("http"));
        let Ok(parsed) = url::Url::parse(&url) else {
            return OEmbedResponseType::Err(PlainText("Error".to_string()));
        };

        let domain = parsed.host_str().unwrap_or("");
        if !host.contains(&domain) {
            return OEmbedResponseType::Err(PlainText("Error".to_string()));
        }

        let path_segments = parsed.path_segments().map(|c| c.collect::<Vec<_>>()).unwrap_or_default();

        match path_segments.as_slice() {
            [server_id, "maps", map_name] => {
                let response = OEmbedMapResponse {
                    r#type: "photo".to_string(),
                    version: "1.0".to_string(),
                    title: map_name.to_string(),
                    description: format!("{} activity and its performance in ZE Server.", map_name),
                    author_name:  map_name.to_string(),
                    author_url: format!("{host}/{server_id}/maps/{map_name}"),
                    url: format!("{host}/thumbnails/large/{map_name}.jpg"),
                    width: 240,
                    height: 160,
                };
                OEmbedResponseType::Map(Json(response))
            },
            [server_id, "players", player_id] => {
                let pool = &*app.pool.clone();
                let func = || sqlx::query_as!(
                    DbPlayer, "SELECT  player_id, player_name, created_at, associated_player_id
                                FROM player WHERE player_id=$1 LIMIT 1", player_id
                ).fetch_one(pool);
                let key = format!("info:{player_id}");

                let Ok(result) = cached_response(&key, &app.cache, 7 * DAY, func).await else {
                    return OEmbedResponseType::Err(PlainText("Invalid player id".to_string()))
                };
                let player = result.result;
                let base_path = req.uri().path().replacen("/oembed/", "", 1);
                let response = OEmbedPlayerResponse {
                    r#type: "link".to_string(),
                    version: "1.0".to_string(),
                    description: format!("{}'s activity on ZE Server", &player.player_name),
                    title: player.player_name.clone(),
                    author_name: player.player_name,
                    author_url: format!("{host}/{server_id}/players/{player_id}"),
                    url: format!("{base_path}/meta_thumbnails?url={host}/players/{player_id}"),
                };
                OEmbedResponseType::Player(Json(response))
            },
            _ => OEmbedResponseType::Err(PlainText("Invalid URL".to_string()))
        }
    }
    #[oai(path = "/events/data-updates", method = "get")]
    async fn sse_new_rows(&self) -> EventStream<BoxStream<'static, NewRowEvent>> {
        let Some(db_url) = get_env_default("DATABASE_URL") else {
            let empty_stream: BoxStream<'static, NewRowEvent> = empty().boxed();
            return EventStream::new(empty_stream);
        };

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
impl UriPatternExt for MiscApi{
    fn get_all_patterns(&self) -> Vec<RoutePattern<'_>> {
        vec![
            "/oembed/",
            "/meta_thumbnails",
            "/thumbnails/{thumbnail_type}/{filename}",
            "/thumbnails/characters/{filename}",
            "/health",
            "/events/data-updates",
            "/sitemap-data",
            "/announcements",
        ].iter_into()
    }
}