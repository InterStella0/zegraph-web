use std::fmt::{Display, Formatter};
use poem::http::StatusCode;
use poem::web::{Data, Json};
use poem_openapi::{Enum, OpenApi};
use poem_openapi::param::{Path, Query};
use poem_openapi::types::{ParseFromJSON, ToJSON};
use serde::{Deserialize, Serialize};
use sqlx::{Pool, Postgres};
use crate::{response, AppData, FastCache};
use crate::core::model::*;
use crate::core::api_models::*;
use crate::core::utils::*;
use crate::workers::*;

#[derive(Enum)]
enum MapLastSessionMode{
    LastPlayed,
    HighestHour,
    FrequentlyPlayed,
    HighestCumHour,
    UniquePlayers,
}
#[derive(Enum)]
enum MapFilterMode{
    Casual,
    TryHard,
    Available,
    Favorite,
    HasLaser
}
#[derive(Enum)]
enum GuideSortType {
    TopRated,
    Newest,
    Oldest,
    MostDiscussed
}


impl Display for GuideSortType {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            GuideSortType::MostDiscussed => write!(f, "most_discussed"),
            GuideSortType::Newest => write!(f, "newest"),
            GuideSortType::Oldest => write!(f, "oldest"),
            GuideSortType::TopRated => write!(f, "top_rated"),
        }
    }
}
#[derive(Serialize, Deserialize)]
struct SetMapFavorite {
    pub map_name: String,
}


impl Display for MapFilterMode {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            MapFilterMode::Casual => write!(f, "casual"),
            MapFilterMode::TryHard => write!(f, "tryhard"),
            MapFilterMode::Available => write!(f, "available"),
            MapFilterMode::Favorite => write!(f, "favorite"),
            MapFilterMode::HasLaser => write!(f, "has_laser"),
        }
    }
}
impl Display for MapLastSessionMode{
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            MapLastSessionMode::LastPlayed => write!(f, "last_played"),
            MapLastSessionMode::HighestHour => write!(f, "highest_hour"),
            MapLastSessionMode::HighestCumHour => write!(f, "highest_cum_hour"),
            MapLastSessionMode::FrequentlyPlayed => write!(f, "frequently_played"),
            MapLastSessionMode::UniquePlayers => write!(f, "unique_players"),
        }
    }
}
async fn get_map(pool: &Pool<Postgres>, cache: &FastCache, server_id: &str, map_name: &str) -> Option<DbMap> {
    let func = || sqlx::query_as!(DbMap,
            "SELECT server_id, map
                FROM server_map_played
                WHERE server_id=$1
                  AND map=$2
                LIMIT 1",
            server_id,
            map_name
        )
        .fetch_one(pool);

    let key = format!("server-map-exist:{server_id}:{map_name}");
    cached_response(&key, cache, 60 * 60, func).await.and_then(|s| Ok(s.result)).ok()
}
async fn get_any_map(pool: &Pool<Postgres>, cache: &FastCache, map_name: &str) -> Option<DbAnyMap> {
    let func = || sqlx::query_as!(DbAnyMap,
            "SELECT map
                FROM server_map
                WHERE map=$1
                LIMIT 1",
            map_name
        )
        .fetch_one(pool);

    let key = format!("any-map-exist:{map_name}");
    cached_response(&key, cache, 60 * 60, func).await.and_then(|s| Ok(s.result)).ok()
}
async fn get_any_guide(pool: &Pool<Postgres>, cache: &FastCache, map_name: &str, guide_id: &str) -> Option<DbGuideBrief> {
    let func = || sqlx::query_as!(DbGuideBrief,
            "SELECT id,
                map_name,
                server_id,
                author_id
            FROM website.guides
            WHERE id=$1::TEXT::UUID AND map_name=$2
            LIMIT 1",
            guide_id, map_name
        )
        .fetch_one(pool);

    let key = format!("any-guide-exist:{map_name}:{guide_id}");
    cached_response(&key, cache, 60, func).await.and_then(|s| Ok(s.result)).ok()
}
async fn get_any_guide_slug(pool: &Pool<Postgres>, cache: &FastCache, map_name: &str, guide_slug: &str) -> Option<DbGuideBrief> {
    let func = || sqlx::query_as!(DbGuideBrief,
            "SELECT id,
                map_name,
                server_id,
                author_id
            FROM website.guides
            WHERE slug=$1 AND map_name=$2
            LIMIT 1",
            guide_slug, map_name
        )
        .fetch_one(pool);

    let key = format!("any-guide-slug-exist:{map_name}:{guide_slug}");
    cached_response(&key, cache, 60, func).await.and_then(|s| Ok(s.result)).ok()
}

async fn get_comment(pool: &Pool<Postgres>, cache: &FastCache, guide_id: &str, comment_id: &str) -> Option<DbGuideCommentBrief> {
    let func = || sqlx::query_as!(DbGuideCommentBrief,
            "SELECT id,
                guide_id,
                author_id
            FROM website.guide_comments
            WHERE id=$1::TEXT::UUID AND guide_id=$2::TEXT::UUID
            LIMIT 1",
            comment_id, guide_id
        )
        .fetch_one(pool);

    let key = format!("comment-exist:{guide_id}:{comment_id}");
    cached_response(&key, cache, 60, func).await.and_then(|s| Ok(s.result)).ok()
}
async fn get_map_cache_key(pool: &Pool<Postgres>, cache: &FastCache, server_id: &str, map_name: &str) -> CacheKey{
    let func = || sqlx::query_as!(DbMapLastPlayed,
            "SELECT started_at last_played
                FROM server_map_played
                WHERE server_id=$1
                    AND map=$2
                    AND ended_at IS NOT NULL
                ORDER BY started_at DESC
                LIMIT 2",
            server_id,
            map_name
        )
        .fetch_all(pool);

    let key = format!("last-played:{server_id}:{map_name}");
    let Ok(result) = cached_response(&key, cache, 60, func).await else {
        return CacheKey {
            current: "first-time".to_string(),
            previous: None
        }
    };

    let d = result.result;
    let current = d
        .first()
        .and_then(|e| e.last_played)
        .and_then(|e| Some(db_to_utc(e).to_rfc3339()))
        .unwrap_or_default();

    let previous = d
        .get(1)
        .and_then(|e| e.last_played)
        .and_then(|e| Some(db_to_utc(e).to_rfc3339()));
    CacheKey { current, previous }
}
struct MapExtractor{
    pub server: DbServer,
    pub map: DbMap,
    pub cache_key: CacheKey,
}
impl From<MapExtractor> for MapContext {
    fn from(extract: MapExtractor) -> Self {
        MapContext {
            map: extract.map,
            server: extract.server,
            cache_key: extract.cache_key,
        }
    }
}
impl MapExtractor{
    pub async fn new(app_data: &AppData, server: DbServer, map: DbMap) -> Self {
        let pool = &app_data.pool;
        let cache = &app_data.cache;
        let cache_key = get_map_cache_key(pool, cache, &server.server_id, &map.map).await;
        Self{ server, map, cache_key }
    }
}
impl<'a> poem::FromRequest<'a> for MapExtractor {
    async fn from_request(req: &'a poem::Request, _body: &mut poem::RequestBody) -> poem::Result<Self> {
        let server_id = req.raw_path_param("server_id")
            .ok_or_else(|| poem::Error::from_string("Invalid server_id", StatusCode::BAD_REQUEST))?;

        let map_name = req.raw_path_param("map_name")
            .ok_or_else(|| poem::Error::from_string("Invalid map_name", StatusCode::BAD_REQUEST))?;

        let data: &AppData = req.data()
            .ok_or_else(|| poem::Error::from_string("Invalid data", StatusCode::BAD_REQUEST))?;

        let Some(server) = get_server(&data.pool, &data.cache, &server_id).await else {
            return Err(poem::Error::from_string("Server not found", StatusCode::NOT_FOUND))
        };
        let Some(map) = get_map(&data.pool, &data.cache, &server.server_id, map_name).await else {
            return Err(poem::Error::from_string("Map not found", StatusCode::NOT_FOUND))
        };

        Ok(MapExtractor::new(data, server, map).await)
    }
}
struct BasicMapExtractor{
    pub map: DbAnyMap
}
impl<'a> poem::FromRequest<'a> for BasicMapExtractor {
    async fn from_request(req: &'a poem::Request, _body: &mut poem::RequestBody) -> poem::Result<Self> {
        let map_name = req.raw_path_param("map_name")
            .ok_or_else(|| poem::Error::from_string("Invalid map_name", StatusCode::BAD_REQUEST))?;

        let data: &AppData = req.data()
            .ok_or_else(|| poem::Error::from_string("Invalid data", StatusCode::BAD_REQUEST))?;

        let Some(map) = get_any_map(&data.pool, &data.cache, map_name).await else {
            return Err(poem::Error::from_string("Map not found", StatusCode::NOT_FOUND))
        };

        Ok(BasicMapExtractor{
            map
        })
    }
}
struct GuideExtractor{
    pub map: DbAnyMap,
    pub guide: DbGuideBrief,
}
impl<'a> poem::FromRequest<'a> for GuideExtractor {
    async fn from_request(req: &'a poem::Request, _body: &mut poem::RequestBody) -> poem::Result<Self> {
        let map_name = req.raw_path_param("map_name")
            .ok_or_else(|| poem::Error::from_string("Invalid map_name", StatusCode::BAD_REQUEST))?;
        let guide_id = req.raw_path_param("guide_id")
            .ok_or_else(|| poem::Error::from_string("Invalid guide_id", StatusCode::BAD_REQUEST))?;

        let data: &AppData = req.data()
            .ok_or_else(|| poem::Error::from_string("Invalid data", StatusCode::BAD_REQUEST))?;

        let Some(map) = get_any_map(&data.pool, &data.cache, map_name).await else {
            return Err(poem::Error::from_string("Map not found", StatusCode::NOT_FOUND))
        };
        let Some(guide) = get_any_guide(&data.pool, &data.cache, &map.map, guide_id).await else {
            return Err(poem::Error::from_string("Guide not found", StatusCode::NOT_FOUND))
        };

        Ok(GuideExtractor { map, guide })
    }
}
struct GuideSlugExtractor{
    pub map: DbAnyMap,
    pub guide: DbGuideBrief,
}
impl<'a> poem::FromRequest<'a> for GuideSlugExtractor {
    async fn from_request(req: &'a poem::Request, _body: &mut poem::RequestBody) -> poem::Result<Self> {
        let map_name = req.raw_path_param("map_name")
            .ok_or_else(|| poem::Error::from_string("Invalid map_name", StatusCode::BAD_REQUEST))?;
        let guide_slug = req.raw_path_param("guide_slug")
            .ok_or_else(|| poem::Error::from_string("Invalid guide_slug", StatusCode::BAD_REQUEST))?;

        let data: &AppData = req.data()
            .ok_or_else(|| poem::Error::from_string("Invalid data", StatusCode::BAD_REQUEST))?;

        let Some(map) = get_any_map(&data.pool, &data.cache, map_name).await else {
            return Err(poem::Error::from_string("Map not found", StatusCode::NOT_FOUND))
        };
        let Some(guide) = get_any_guide_slug(&data.pool, &data.cache, &map.map, guide_slug).await else {
            return Err(poem::Error::from_string("Guide not found", StatusCode::NOT_FOUND))
        };

        Ok(GuideSlugExtractor { map, guide })
    }
}

struct GuideCommentExtractor{
    #[allow(dead_code)]
    pub guide: DbGuideBrief,
    pub comment: DbGuideCommentBrief
}
impl<'a> poem::FromRequest<'a> for GuideCommentExtractor {
    async fn from_request(req: &'a poem::Request, _body: &mut poem::RequestBody) -> poem::Result<Self> {
        let map_name = req.raw_path_param("map_name")
            .ok_or_else(|| poem::Error::from_string("Invalid map_name", StatusCode::BAD_REQUEST))?;
        let guide_id = req.raw_path_param("guide_id")
            .ok_or_else(|| poem::Error::from_string("Invalid guide_id", StatusCode::BAD_REQUEST))?;
        let comment_id = req.raw_path_param("comment_id")
            .ok_or_else(|| poem::Error::from_string("Invalid comment_id", StatusCode::BAD_REQUEST))?;

        let data: &AppData = req.data()
            .ok_or_else(|| poem::Error::from_string("Invalid data", StatusCode::BAD_REQUEST))?;

        let Some(map) = get_any_map(&data.pool, &data.cache, map_name).await else {
            return Err(poem::Error::from_string("Map not found", StatusCode::NOT_FOUND))
        };
        let Some(guide) = get_any_guide(&data.pool, &data.cache, &map.map, guide_id).await else {
            return Err(poem::Error::from_string("Guide not found", StatusCode::NOT_FOUND))
        };
        let Some(comment) = get_comment(&data.pool, &data.cache, guide_id, comment_id).await else {
            return Err(poem::Error::from_string("Guide not found", StatusCode::NOT_FOUND))
        };

        Ok(GuideCommentExtractor { comment, guide })
    }
}
fn handle_worker_map_result<T>(result: WorkResult<T>) -> Response<T>
    where T: ParseFromJSON + ToJSON + Send + Sync{
    handle_worker_result(result, "No map found")
}

pub struct MapApi;

#[OpenApi]
impl MapApi{
    #[oai(path = "/servers/:server_id/maps", method = "get")]
    async fn get_all_maps(
        &self, Data(data): Data<&AppData>, ServerExtractor(server): ServerExtractor
    ) -> Response<Vec<ServerMap>>{
        let Ok(result) = sqlx::query_as!(DbMap, "
            SELECT server_id, map
            FROM server_map
            WHERE server_id = $1
        ", server.server_id
        ).fetch_all(&*data.pool.clone()).await else {
            return response!(ok vec![])
        };
        response!(ok result.iter_into())
    }
    #[oai(path = "/servers/:server_id/maps/autocomplete", method = "get")]
    async fn get_maps_autocomplete(
        &self, Data(data): Data<&AppData>, ServerExtractor(server): ServerExtractor, Query(map): Query<String>
    ) -> Response<Vec<ServerMap>>{
        let Ok(result) = sqlx::query_as!(DbMap, "
            SELECT server_id, map
            FROM server_map
            WHERE server_id = $2
              AND map ILIKE '%' || $1 || '%'
            ORDER BY NULLIF(STRPOS(LOWER(map), LOWER($1)), 0) ASC NULLS LAST
            LIMIT 20;
        ", map, server.server_id
        ).fetch_all(&*data.pool.clone()).await else {
            return response!(ok vec![])
        };
        response!(ok result.iter_into())
    }
    #[oai(path="/servers/:server_id/maps/set-favorite", method="post")]
    async fn set_user_map_favorite(
        &self, Data(data): Data<&AppData>,
        Json(payload): Json<SetMapFavorite>, ServerExtractor(server): ServerExtractor,
        TokenBearer(user_token): TokenBearer
    ) -> Response<ServerMap>{
        let user_id = user_token.id;
        let Ok(_) = sqlx::query!("
            INSERT INTO website.user_favorite_maps(server_id, user_id, map)
            VALUES ($1, $2, $3)
            ON CONFLICT(server_id, user_id, map) DO NOTHING
        ", server.server_id, user_id, payload.map_name)
            .execute(&*data.pool).await else {
            return response!(err "Something went wrong :/", ErrorCode::InternalServerError)
        };

        response!(ok ServerMap{
            server_id: server.server_id,
            map: payload.map_name
        })
    }
    #[oai(path="/servers/:server_id/maps/:map_name/unset-favorite", method="post")]
    async fn unset_user_map_favorite(
        &self, Data(data): Data<&AppData>, extract: MapExtractor,
        TokenBearer(user_token): TokenBearer
    ) -> Response<ServerMap>{
        let user_id = user_token.id;
        let Ok(_) = sqlx::query!("
            DELETE FROM website.user_favorite_maps
            WHERE user_id=$2 AND server_id=$1 AND map=$3
        ", extract.server.server_id, user_id, extract.map.map)
            .execute(&*data.pool).await else {
            return response!(err "Something went wrong :/", ErrorCode::InternalServerError)
        };

        response!(ok extract.map.into())
    }
    #[oai(path = "/servers/:server_id/maps/last/sessions", method = "get")]
    async fn get_maps_last_session(
        &self, Data(data): Data<&AppData>, ServerExtractor(server): ServerExtractor, Query(page): Query<usize>,
        Query(sorted_by): Query<MapLastSessionMode>, Query(search_map): Query<Option<String>>, Query(filter): Query<Option<MapFilterMode>>,
        OptionalTokenBearer(user): OptionalTokenBearer,
    ) -> Response<MapPlayedPaginated>{
        let pool = &*data.pool.clone();
        let pagination = 25;
        let offset = pagination * page as i64;
        let map_target = search_map.unwrap_or_default();
        let filtering = filter.map(|e| e.to_string()).unwrap_or("all".into());
        let user_id = user.map(|e| e.id);
        let rows = match sqlx::query_as!(DbServerMap,
			"SELECT
                COUNT(*) OVER() total_maps,
                sm.server_id,
                sm.map,
                sm.first_occurrence,
                sm.pending_cooldown,
                sm.map_left,
                sm.map_left_last_update,
                sm.enabled,
                sm.current_cooldown AS cooldown,
                COALESCE(sm.is_tryhard, mam.is_tryhard) AS is_tryhard,
                COALESCE(sm.is_casual, mam.is_casual) AS is_casual,
                mam.has_lasers,
                (ufm.user_id IS NOT NULL) AS is_favorite,
                sm.cleared_at,
                COALESCE(mp.total_playtime, '0 seconds'::interval) AS total_time,
                COALESCE(mp.total_sessions, 0) AS total_sessions,
                COALESCE(mp.unique_players, 0) AS unique_players,
                COALESCE(mp.cum_player_hours, '0 seconds'::interval) AS cum_player_hours,
                sm.removed,
                sm.no_noms,
                sm.min_players,
                sm.max_players,
                smp.started_at as last_played,
                smp.ended_at as last_played_ended,
                smp.time_id as last_session_id
            FROM server_map sm
            LEFT JOIN website.map_analyze mp
                ON sm.server_id=mp.server_id AND sm.map=mp.map
            LEFT JOIN (
                SELECT DISTINCT ON (server_id, map) *
                FROM server_map_played
                ORDER BY server_id, map, started_at DESC
            ) smp
                ON smp.server_id=sm.server_id AND smp.map=sm.map
            LEFT JOIN website.user_favorite_maps ufm
              ON ufm.server_id = sm.server_id
             AND ufm.map = sm.map
             AND ufm.user_id = $8
            LEFT JOIN map_metadata mam ON mam.name = sm.map
            WHERE sm.server_id=$1 AND ($6 OR sm.map ILIKE '%' || $5 || '%') AND smp.time_id IS NOT NULL
                AND CASE
                        WHEN $7 = 'all' THEN TRUE
                        WHEN $7 = 'casual' THEN COALESCE(sm.is_casual, mam.is_casual)
                        WHEN $7 = 'tryhard' THEN COALESCE(sm.is_tryhard, mam.is_tryhard)
                        WHEN $7 = 'available' THEN (sm.current_cooldown IS NULL OR CURRENT_TIMESTAMP > sm.current_cooldown)
                                                   AND (sm.map_left IS NULL OR sm.map_left <= 0)
                                                   AND sm.enabled AND NOT sm.removed
                        WHEN $7 = 'favorite' AND $8 IS NOT NULL THEN ufm.map IS NOT NULL
                        WHEN $7 = 'has_laser' THEN mam.has_lasers
                        ELSE FALSE
                    END
            ORDER BY
               CASE
                   WHEN $4 = 'last_played' THEN smp.started_at
               END DESC,
               CASE
                   WHEN $4 = 'highest_hour' THEN mp.total_playtime
               END DESC,
               CASE
                   WHEN $4 = 'frequently_played' THEN mp.total_sessions
               END DESC,
               CASE
                   WHEN $4 = 'highest_cum_hour' THEN mp.cum_player_hours
               END DESC,
               CASE
                   WHEN $4 = 'unique_players' THEN mp.unique_players
               END DESC,
               smp.started_at DESC
            LIMIT $3
            OFFSET $2",
				server.server_id, offset, pagination, sorted_by.to_string(),
                map_target, map_target.trim() == "", filtering, user_id
        )
            .fetch_all(pool)
            .await {
            Ok(r) => r,
            Err(e) => {
                tracing::error!("Error last session map: {e}");
                return response!(internal_server_error)
            }
        };

        let total_maps = rows
            .first()
            .and_then(|e| Some(e.total_maps))
            .unwrap_or_default();
        let resp = MapPlayedPaginated{
            total_maps: total_maps.unwrap_or_default() as i32,
            maps: rows.iter_into()
        };
        response!(ok resp)
    }
    #[oai(path = "/servers/:server_id/maps/all/sessions", method = "get")]
    async fn get_maps_all_sessions(
        &self, data: Data<&AppData>, ServerExtractor(server): ServerExtractor, page: Query<usize>
    ) -> Response<ServerMapPlayedPaginated>{
        let pool = &*data.pool.clone();
        let pagination = 10;
        let offset = pagination * page.0 as i64;
        let Ok(rows) = sqlx::query_as!(DbServerMapPlayed,
			"SELECT *, COUNT(*) OVER()::integer total_sessions
             FROM server_map_played
             WHERE server_id=$1
             ORDER BY started_at DESC
             LIMIT $3
             OFFSET $2",
				server.server_id, offset, pagination)
            .fetch_all(pool)
            .await else {
            return response!(internal_server_error)
        };

        let total_sessions = rows
            .first()
            .and_then(|e| e.total_sessions)
            .unwrap_or_default();

        let resp = ServerMapPlayedPaginated{
            total_sessions,
            maps: rows.iter_into()
        };
        response!(ok resp)
    }
    #[oai(path = "/servers/:server_id/maps/:map_name/musics", method = "get")]
    async fn get_maps_all_musics(
        &self, data: Data<&AppData>, extract: MapExtractor) -> Response<Vec<ServerMapMusic>>{
        let pool = &*data.pool.clone();
        let Ok(rows) = sqlx::query_as!(DbAssociatedMapMusic,
                "WITH form_associated_maps AS (
                    SELECT
                        amm.map_name AS current_map,
                        mm.*,
                        COALESCE(
                            ARRAY_AGG(amm2.map_name ORDER BY amm2.map_name)
                                FILTER (WHERE amm2.map_name IS NOT NULL),
                            ARRAY[]::text[]
                        ) AS other_maps
                    FROM associated_map_music amm
                    JOIN map_music mm
                        ON mm.id = amm.map_music_id
                    LEFT JOIN associated_map_music amm2
                        ON amm.map_music_id = amm2.map_music_id
                       AND amm.map_name <> amm2.map_name
                    WHERE amm.map_name = $1
                    GROUP BY amm.map_name, mm.id
                )
                SELECT amm.map_music_id AS id,
                    music_name,
                    duration,
                    youtube_music,
                    source,
                    map_name,
                    other_maps,
                    tags,
                    yt_source,
                    COALESCE(su.persona_name, NULL) AS yt_source_name
                FROM associated_map_music amm
                LEFT JOIN form_associated_maps fam ON fam.id=amm.map_music_id
                LEFT JOIN website.steam_user su ON su.user_id=yt_source
                WHERE amm.map_name = $1 AND music_name <> ''
                ",
				extract.map.map)
            .fetch_all(pool)
            .await else {
            return response!(internal_server_error)
        };

        response!(ok rows.iter_into())
    }

    #[oai(path = "/servers/:server_id/maps/:map_name/info", method = "get")]
    async fn get_maps_info(
        &self, Data(app): Data<&AppData>, extract: MapExtractor
    ) -> Response<MapInfo>{
        let context = MapContext::from(extract);

        handle_worker_map_result(app.map_worker.get_detail(&context).await)
    }

    #[oai(path = "/servers/:server_id/maps/:map_name/player_types", method = "get")]
    async fn get_map_player_type(
        &self, Data(app): Data<&AppData>, extract: MapExtractor
    ) -> Response<Vec<MapPlayerTypeTime>>{
        let context = MapContext::from(extract);

        handle_worker_map_result(app.map_worker.get_player_types(&context).await)
    }

    #[oai(path = "/servers/:server_id/maps/:map_name/analyze", method = "get")]
    async fn get_maps_highlight(
        &self, Data(app): Data<&AppData>, extract: MapExtractor
    ) -> Response<MapAnalyze>{
        let context = MapContext::from(extract);
        handle_worker_map_result(app.map_worker.get_statistics(&context).await)
    }
    #[oai(path = "/servers/:server_id/maps/:map_name/sessions", method="get")]
    async fn get_maps_sessions(
        &self, Data(app): Data<&AppData>, extract: MapExtractor, Query(page): Query<usize>
    ) -> Response<ServerMapPlayedPaginated>{
        let pagination = 5;
        let offset = pagination * page as i64;

        let Ok(result) = sqlx::query_as!(DbServerMapPlayed,
            "SELECT *, COUNT(time_id) OVER()::integer AS total_sessions
                FROM server_map_played
                WHERE server_id=$1 AND map=$2
                ORDER BY started_at DESC
                LIMIT $3
                OFFSET $4",
            extract.server.server_id, extract.map.map, pagination, offset
        ).fetch_all(&*app.pool).await else {
            return response!(err "Could not fetch this map's page", ErrorCode::NotFound)
        };
        let total_sessions = result
            .first()
            .and_then(|e| e.total_sessions)
            .unwrap_or_default();

        let resp = ServerMapPlayedPaginated{
            total_sessions,
            maps: result.iter_into()
        };
        response!(ok resp)
    }
    #[oai(path="/servers/:server_id/sessions/:session_id/info", method="get")]
    async fn get_map_session_info(
        &self, Data(data): Data<&AppData>, ServerExtractor(server): ServerExtractor, Path(session_id): Path<i64>
    ) -> Response<ServerMapPlayed>{
        let time_id =  session_id as i32;
        let func = || sqlx::query_as!(DbServerMapPlayed, "
            SELECT 0 total_sessions, time_id, server_id, map, player_count, started_at, ended_at
            FROM server_map_played
            WHERE time_id=$1 AND server_id=$2
            LIMIT 1
        ", time_id, server.server_id).fetch_one(&*data.pool);
        let key = format!("map_player_session_info:{}:{}", server.server_id, session_id);
        let Ok(row) = cached_response(&key, &data.cache, 60, func).await else {
            return response!(err "No session found with this id.", ErrorCode::NotFound)
        };
        response!(ok row.result.into())
    }
    #[oai(path="/servers/:server_id/sessions/:session_id/players", method="get")]
    async fn get_map_player_session(
        &self, Data(app): Data<&AppData>, ServerExtractor(server): ServerExtractor, Path(session_id): Path<i64>
    ) -> Response<Vec<PlayerBrief>>{
        let pool = &*app.pool.clone();
        let cache = &app.cache;
        let time_id =  session_id as i32;
        let checker = || sqlx::query_as!(DbMapIsPlaying,
			"WITH session AS (SELECT time_id,
    			       server_id,
    			       map,
    			       player_count,
    			       started_at,
    			       ended_at
    			FROM server_map_played
    			WHERE server_id=$1 AND time_id=$2)
    		 SELECT ended_at IS NULL AS result
    		 FROM session"
		, server.server_id, time_id
		).fetch_one(pool);
        let checker_key = format!("session-checker-players:{}:{}", server.server_id, session_id);
        let mut is_playing = false;
        if let Ok(result) = cached_response(&checker_key, cache, 5 * 60, checker).await {
            is_playing = result.result.result.unwrap_or_default();
        }

        let func = async || {
            sqlx::query_as!(DbPlayerBrief, "
				WITH params AS (
                    SELECT $2::INTEGER AS time_id,
                    $1 AS target_server,
                    CURRENT_TIMESTAMP AS right_now
                ), timespent AS (
                    SELECT
                        pss.player_id, SUM(
                        COALESCE(LEAST(pss.ended_at, smp.ended_at), p.right_now) - GREATEST(pss.started_at, smp.started_at)
                    ) AS total
                    FROM public.server_map_played smp
					CROSS JOIN params p
                    INNER JOIN player_server_session pss
                    ON pss.server_id=smp.server_id
						AND smp.time_id = p.time_id
						AND tstzrange(pss.started_at, pss.ended_at) && tstzrange(smp.started_at, smp.ended_at)
                    GROUP BY pss.player_id
                ),
                online_players AS (
                    SELECT player_id, started_at
                    FROM player_server_session
					CROSS JOIN params p
                    WHERE server_id=p.target_server
                        AND ended_at IS NULL
                        AND (p.right_now - started_at) < INTERVAL '12 hours'
                ),
                last_player_sessions AS (
                    SELECT DISTINCT ON (player_id) player_id, started_at, ended_at
                    FROM player_server_session
                    WHERE ended_at IS NOT NULL
                )
                SELECT
                    COUNT(p.player_id) OVER() total_players,
                    p.player_id,
                    p.player_name,
                    p.created_at,
                    ts.total AS total_playtime,
                    COALESCE(op.started_at, NULL) as online_since,
                    lps.started_at AS last_played,
                    (lps.ended_at - lps.started_at) AS last_played_duration,
                    0::int AS rank
                FROM player p
                JOIN timespent ts
                ON ts.player_id = p.player_id
                LEFT JOIN online_players op
                ON op.player_id=p.player_id
                JOIN last_player_sessions lps
                ON lps.player_id=p.player_id
                ORDER BY total_playtime DESC
            ", server.server_id, time_id).fetch_all(pool).await
        };
        let key = format!("map_player_session:{}:{}", server.server_id, session_id);
        let duration_cache = if is_playing { 60 } else { DAY };
        let Ok(rows) = cached_response(&key, cache, duration_cache, func).await else {
            tracing::warn!("Couldn't get player session");
            return  response!(ok vec![])
        };

        let mut players: Vec<PlayerBrief> = rows.result.iter_into();
        if !rows.is_new{
            update_online_brief(&pool, cache, &server.server_id, &mut players).await;
        }
        response!(ok players)
    }
    #[oai(path="/servers/:server_id/sessions/:session_id/continents", method="get")]
    async fn radar_statistic_session_continents(
        &self, Data(app): Data<&AppData>, ServerExtractor(server): ServerExtractor, Path(session_id): Path<i64>
    ) -> Response<ContinentStatistics> {
        let pool = &*app.pool.clone();
        let time_id =  session_id as i32;
        let server_id = server.server_id;
        let func = || sqlx::query_as!(DbContinentStatistic, "
            WITH  map_played AS (
                SELECT * FROM server_map_played
                WHERE server_id=$1
			    	AND time_id =$2
            ),
            all_players AS (
              SELECT pss.*, p.location_code->>'country' AS location_country
              FROM player_server_session pss
              CROSS JOIN map_played smp
              JOIN player p ON p.player_id=pss.player_id
              WHERE pss.server_id = $1
                AND tstzrange(pss.started_at, pss.ended_at) && tstzrange(smp.started_at, smp.ended_at)
				AND p.location_code->>'country' IS NOT NULL
            ),
            deduplicated_countries AS (
              SELECT
                \"ISO_A2_EH\" AS country_code,
                MIN(\"NAME\") AS country_name,
				MIN(\"CONTINENT\") as continent
              FROM layers.countries_fixed
              GROUP BY \"ISO_A2_EH\"
            ),
            country_players AS (
			    SELECT
			        dc.continent,
			        dc.country_code,
			        COUNT(DISTINCT fps.player_id) AS players_per_country
			    FROM all_players fps
			    LEFT JOIN deduplicated_countries dc
			      ON dc.country_code = fps.location_country
			    GROUP BY dc.continent, dc.country_code
			)
			SELECT
			    continent,
			    SUM(players_per_country)::BIGINT AS players_per_continent,
			    0::BIGINT AS total_players
			FROM country_players
			GROUP BY continent
			ORDER BY players_per_continent DESC;
        ", server_id, time_id)
            .fetch_all(pool);
        let key = format!("statistics-map-session-continents:{server_id}:{time_id}");
        let Ok(result) = cached_response(&key, &app.cache, 60, func).await else {
            tracing::warn!("Unable to cache statistics-map-session-continents");
            return response!(internal_server_error)
        };
        let data = result.result;
        let total = data.first().and_then(|m| m.total_players).unwrap_or(0);
        let available = data.iter().filter_map(|m| m.players_per_continent).sum();

        let stats = ContinentStatistics{
            contain_countries: available,
            total_count: total.max(available),
            continents: data.iter_into()
        };
        response!(ok stats)
    }

    #[oai(path="/servers/:server_id/match-now", method="get")]
    async fn get_map_now_match(
        &self, Data(app): Data<&AppData>, ServerExtractor(server): ServerExtractor
    ) -> Response<ServerMapMatch>{
        let pool = &*app.pool.clone();
        let func = ||
            sqlx::query_as!(DbServerMatch, "
                SELECT
                    smp.time_id,
                    smp.server_id,
                    smp.map,
                    smp.started_at,
                    COALESCE(md.zombie_score, NULL) zombie_score,
                    COALESCE(md.human_score, NULL) human_score,
                    COALESCE(md.occurred_at, NULL) occurred_at,
                    COALESCE(md.estimated_time_end, NULL) estimated_time_end,
                    COALESCE(md.server_time_end, NULL) server_time_end,
                    COALESCE(md.extend_count, NULL) extend_count,
                    LEAST((SELECT COUNT(DISTINCT player_id) FROM player_server_session p
                        WHERE p.server_id = smp.server_id
                        AND p.ended_at IS NULL
                        AND CURRENT_TIMESTAMP - p.started_at < INTERVAL '24 hours'),
                        COALESCE(s.max_players, 64)
                    ) AS player_count
                FROM server_map_played smp
                JOIN server s ON s.server_id = smp.server_id
                LEFT JOIN match_data md ON md.time_id = smp.time_id
                WHERE smp.server_id = $1 AND ended_at IS NULL
                ORDER BY md.occurred_at DESC
                LIMIT 1
            ", server.server_id).fetch_one(pool);
        let key = format!("map_session_current_match:{}", server.server_id);
        let Ok(rows) = cached_response(&key, &app.cache, 60, func).await else {
            return response!(err "No session and match found with this id.", ErrorCode::NotFound)
        };

        response!(ok rows.result.into())
    }
    #[oai(path="/servers/:server_id/sessions/:session_id/all-match", method="get")]
    async fn get_map_session_all_match(
        &self, Data(app): Data<&AppData>, ServerExtractor(server): ServerExtractor, Path(session_id): Path<i64>
    ) -> Response<Vec<MapSessionMatch>>{
        let pool = &*app.pool.clone();
        let time_id =  session_id as i32;
        let func = ||
            sqlx::query_as!(DbServerSessionMatch, "
                SELECT
                    time_id,
                    server_id,
                    zombie_score,
                    human_score,
                    occurred_at
                FROM match_data
                WHERE time_id = $2 AND server_id=$1
                ORDER BY occurred_at
            ", server.server_id, time_id).fetch_all(pool);
        let key = format!("map_player_session_all_match:{}:{}", server.server_id, session_id);
        let Ok(rows) = cached_response(&key, &app.cache, 2 * 60, func).await else {
            return response!(err "No session and match found with this id.", ErrorCode::NotFound)
        };

        response!(ok rows.result.iter_into())
    }
    #[oai(path="/servers/:server_id/sessions/:session_id/match", method="get")]
    async fn get_map_session_match(
        &self, Data(app): Data<&AppData>, ServerExtractor(server): ServerExtractor, Path(session_id): Path<i64>
    ) -> Response<Option<MapSessionMatch>>{
        let pool = &*app.pool.clone();
        let time_id =  session_id as i32;
        let func = async || {
            sqlx::query_as!(DbServerSessionMatch, "
                SELECT
                    time_id,
                    server_id,
                    zombie_score,
                    human_score,
                    occurred_at
                FROM match_data
                WHERE time_id = $2 AND server_id=$1
                ORDER BY occurred_at DESC
                LIMIT 1
            ", server.server_id, time_id).fetch_one(pool).await
        };
        let key = format!("map_player_session_match:{}:{}", server.server_id, session_id);
        let Ok(rows) = cached_response(&key, &app.cache, 12 * 60, func).await else {
            return response!(ok None)
        };

        response!(ok Some(rows.result.into()))
    }
    #[oai(path="/servers/:server_id/maps/:map_name/images", method="get")]
    async fn get_server_map_images(
        &self, Data(app): Data<&AppData>, extract: MapExtractor
    ) -> Response<MapImage>{
        let game = extract.server.game.unwrap_or(String::from(GAME_TYPES[0]));
        let maps: Vec<MapImage> = get_map_images(&app.cache)
            .await
            .into_iter()
            .filter(|e| e.game_type == game)
            .collect();
        let map_names: Vec<String> = maps
            .iter()
            .map(|e| e.map_name.clone())
            .collect();
        let map_name = extract.map.map;
        let Some(map_image) = get_map_image(&map_name, &map_names) else {
            return response!(err "No map image", ErrorCode::NotFound)
        };

        let Some(d) = maps.into_iter().find(|e| e.map_name == map_image) else {
            return response!(internal_server_error)
        };
        response!(ok d)
    }
    #[oai(path="/servers/:server_id/maps/:map_name/events", method="get")]
    async fn get_event_counts(
        &self, Data(app): Data<&AppData>, extract: MapExtractor
    ) -> Response<Vec<MapEventAverage>>{
        let context = MapContext::from(extract);
        handle_worker_map_result(app.map_worker.get_events(&context).await)
    }
    #[oai(path="/servers/:server_id/maps/:map_name/heat-regions", method="get")]
    async fn get_heat_regions(
        &self, Data(app): Data<&AppData>, extract: MapExtractor
    ) -> Response<Vec<DailyMapRegion>> {
        let context = MapContext::from(extract);
        handle_worker_map_result(app.map_worker.get_heat_regions(&context).await)
    }
    #[oai(path="/servers/:server_id/maps/:map_name/regions", method="get")]
    async fn get_map_regions(
        &self, Data(app): Data<&AppData>, extract: MapExtractor
    ) -> Response<Vec<MapRegion>>{
        let context = MapContext::from(extract);
        handle_worker_map_result(app.map_worker.get_regions(&context).await)
    }
    #[oai(path="/servers/:server_id/maps/:map_name/sessions_distribution", method="get")]
    async fn get_map_sessions_distribution(
        &self, Data(app): Data<&AppData>, extract: MapExtractor
    ) -> Response<Vec<MapSessionDistribution>>{
        let context = MapContext::from(extract);
        handle_worker_map_result(app.map_worker.get_session_distributions(&context).await)
    }
    #[oai(path="/servers/:server_id/maps/:map_name/top_players", method="get")]
    async fn get_map_players(
        &self, Data(app): Data<&AppData>, extract: MapExtractor,
        Query(page): Query<Option<usize>>, Query(player_name): Query<Option<String>>
    ) -> Response<BriefPlayers>{
        let pool = &*app.pool.clone();
        let pagination_size = 10i64;
        let page = page.unwrap_or(0);
        let offset = pagination_size * page as i64;
        let server_id = extract.server.server_id.clone();
        let map_name = extract.map.map.clone();
        let player_name = player_name
            .map(|n| n.trim().to_string())
            .filter(|n| n.len() >= 2);

        let (rows, is_new) = match &player_name {
            Some(player_name) => {
                let name_pattern = format!("%{player_name}%");
                let rows = match sqlx::query_as!(DbPlayerBrief, "
                    WITH pages AS (
                        SELECT pmt.player_id, pmt.total_playtime, pmr.map_rank::int AS rank,
                               COUNT(*) OVER() AS total_players
                        FROM website.player_map_time pmt
                        JOIN website.player_map_rank pmr
                            ON pmr.server_id = pmt.server_id AND pmr.map = pmt.map AND pmr.player_id = pmt.player_id
                        JOIN player p ON p.player_id = pmt.player_id
                        WHERE pmt.server_id = $1 AND pmt.map = $2 AND p.player_name ILIKE $5
                        ORDER BY pmr.map_rank
                        LIMIT $3 OFFSET $4
                    )
                    SELECT
                        pg.total_players,
                        p.player_id,
                        p.player_name,
                        p.created_at,
                        pg.total_playtime,
                        pg.rank,
                        op.started_at AS \"online_since?\",
                        lp.started_at AS \"last_played?\",
                        (lp.ended_at - lp.started_at) AS \"last_played_duration?\"
                    FROM pages pg
                    JOIN player p ON p.player_id = pg.player_id
                    LEFT JOIN LATERAL (
                        SELECT s.started_at, s.ended_at
                        FROM player_server_session s
                        WHERE s.player_id = p.player_id
                          AND s.server_id = $1
                          AND s.ended_at IS NOT NULL
                        ORDER BY s.started_at DESC
                        LIMIT 1
                    ) lp ON TRUE
                    LEFT JOIN LATERAL (
                        SELECT s.started_at
                        FROM player_server_session s
                        WHERE s.player_id = p.player_id
                          AND s.server_id = $1
                          AND s.ended_at IS NULL
                          AND CURRENT_TIMESTAMP - s.started_at < INTERVAL '12 hours'
                        ORDER BY s.started_at
                        LIMIT 1
                    ) op ON TRUE
                    ORDER BY pg.rank
                ", server_id, map_name, pagination_size, offset, name_pattern).fetch_all(pool).await {
                    Ok(rows) => rows,
                    Err(e) => {
                        tracing::error!("Failed to search map players for {server_id}:{map_name}:{player_name}: {e}");
                        return response!(internal_server_error);
                    }
                };
                (rows, true)
            },
            None => {
                let sql_func = || sqlx::query_as!(DbPlayerBrief, "
                    WITH pages AS (
                        SELECT pmt.player_id, pmt.total_playtime, pmr.map_rank::int AS rank,
                               COUNT(*) OVER() AS total_players
                        FROM website.player_map_time pmt
                        JOIN website.player_map_rank pmr
                            ON pmr.server_id = pmt.server_id AND pmr.map = pmt.map AND pmr.player_id = pmt.player_id
                        WHERE pmt.server_id = $1 AND pmt.map = $2
                        ORDER BY pmr.map_rank
                        LIMIT $3 OFFSET $4
                    )
                    SELECT
                        pg.total_players,
                        p.player_id,
                        p.player_name,
                        p.created_at,
                        pg.total_playtime,
                        pg.rank,
                        op.started_at AS \"online_since?\",
                        lp.started_at AS \"last_played?\",
                        (lp.ended_at - lp.started_at) AS \"last_played_duration?\"
                    FROM pages pg
                    JOIN player p ON p.player_id = pg.player_id
                    LEFT JOIN LATERAL (
                        SELECT s.started_at, s.ended_at
                        FROM player_server_session s
                        WHERE s.player_id = p.player_id
                          AND s.server_id = $1
                          AND s.ended_at IS NOT NULL
                        ORDER BY s.started_at DESC
                        LIMIT 1
                    ) lp ON TRUE
                    LEFT JOIN LATERAL (
                        SELECT s.started_at
                        FROM player_server_session s
                        WHERE s.player_id = p.player_id
                          AND s.server_id = $1
                          AND s.ended_at IS NULL
                          AND CURRENT_TIMESTAMP - s.started_at < INTERVAL '12 hours'
                        ORDER BY s.started_at
                        LIMIT 1
                    ) op ON TRUE
                    ORDER BY pg.rank
                ", server_id, map_name, pagination_size, offset).fetch_all(pool);
                let key = format!("map-players:{server_id}:{map_name}:{page}");
                let result = match cached_response(&key, &app.cache, 10 * 60, sql_func).await {
                    Ok(result) => result,
                    Err(e) => {
                        tracing::error!("Failed to fetch map players for {key}: {e}");
                        return response!(internal_server_error);
                    }
                };
                (result.result, result.is_new)
            }
        };

        let total_player_count = rows
            .first()
            .and_then(|e| e.total_players)
            .unwrap_or_default();

        let mut players: Vec<PlayerBrief> = rows.iter_into();
        if !is_new {
            update_online_brief(pool, &app.cache, &server_id, &mut players).await;
        }
        let value = BriefPlayers {
            total_players: total_player_count,
            players
        };
        response!(ok value)
    }
    #[oai(path="/servers/:server_id/guides", method="get")]
    async fn get_all_map_guides(
        &self, Data(app): Data<&AppData>, ServerExtractor(server): ServerExtractor, OptionalTokenBearer(user): OptionalTokenBearer,
        Query(page): Query<usize>
    ) -> Response<GuidesPaginated> {
        let pool = &*app.pool.clone();
        let pagination = 10;
        let offset = pagination * page as i64;
        let optional_user_id = user.map(|u| u.id);
        let data = match sqlx::query_as!(DbGuide, "
              WITH ranked_guides AS (
                  SELECT g.id,
                      g.map_name,
                      g.server_id,
                      g.title,
                      g.content,
                      g.category,
                      g.created_at,
                      g.updated_at,
                      g.upvotes,
                      g.downvotes,
                      g.comment_count,
                      gv.vote_type,
                      g.author_id,
                      g.slug,
                      su.persona_name AS author_name,
                      su.avatar AS author_avatar,
                      ROW_NUMBER() OVER (PARTITION BY g.map_name ORDER BY g.upvotes DESC) AS rn
                  FROM website.guides g
                  JOIN server_map sm ON sm.server_id = $1 AND sm.map = g.map_name
                  LEFT JOIN website.steam_user su ON su.user_id = g.author_id
                  LEFT JOIN website.guide_votes gv ON gv.user_id = $2 AND gv.guide_id = g.id
                  WHERE g.server_id=$1 OR g.server_id IS NULL
              )
              SELECT id,
                  map_name,
                  server_id,
                  title,
                  content,
                  category,
                  created_at,
                  updated_at,
                  upvotes,
                  slug,
                  downvotes,
                  comment_count,
                  vote_type AS \"user_vote: Option<DataVoteType>\",
                  author_id,
                  author_name,
                  author_avatar,
                  COUNT(*) OVER()::integer AS total_guides
              FROM ranked_guides
              WHERE rn = 1
              ORDER BY upvotes DESC
              LIMIT 10
              OFFSET $3
            ", server.server_id, optional_user_id, offset).fetch_all(pool).await {
            Ok(r) => r,
            Err(_) => {
                return response!(internal_server_error)
            }
        };

        let total_guides = data
            .first()
            .and_then(|e| e.total_guides)
            .unwrap_or_default();
        let guides = data.iter_into();
        let paginated = GuidesPaginated{ total_guides, guides };
        response!(ok paginated)
    }

    #[oai(path="/maps/:map_name/guides", method="get")]
    async fn get_map_guides(
        &self, Data(app): Data<&AppData>, extract: BasicMapExtractor, OptionalTokenBearer(user): OptionalTokenBearer,
        Query(page): Query<usize>, Query(category): Query<Option<String>>, Query(sort): Query<GuideSortType>,
        Query(server_id): Query<Option<String>>
    ) -> Response<GuidesPaginated>{
        let pool = &*app.pool.clone();
        let pagination = 10;
        let offset = pagination * page as i64;
        let optional_user_id = user.map(|u| u.id);
        let sort_by = sort.to_string();
        let data = match sqlx::query_as!(DbGuide, "
            SELECT g.id,
                g.map_name,
                g.server_id,
                g.title,
                g.content,
                g.category,
                g.created_at,
                g.updated_at,
                g.upvotes,
                g.downvotes,
                g.comment_count,
                g.slug,
                gv.vote_type AS \"user_vote: Option<DataVoteType>\",
                g.author_id,
                su.persona_name AS author_name,
                su.avatar AS author_avatar,
                COUNT(*) OVER()::integer total_guides
            FROM website.guides g
            LEFT JOIN website.steam_user su ON su.user_id=g.author_id
            LEFT JOIN website.guide_votes gv ON gv.user_id=$2 AND gv.guide_id=g.id
            WHERE map_name = $1
              AND ($5::TEXT IS NULL OR g.category = $5::TEXT)
              AND (g.server_id IS NULL OR ($6::TEXT IS NULL OR g.server_id = $6::TEXT))
            ORDER BY
               CASE
                   WHEN $4 = 'most_discussed' THEN g.comment_count
               END DESC,
               CASE
                   WHEN $4 = 'newest' THEN g.created_at
               END DESC,
               CASE
                   WHEN $4 = 'oldest' THEN g.created_at
               END,
               CASE
                   WHEN $4 = 'top_rated' THEN g.upvotes
               END DESC
            LIMIT 10
            OFFSET $3
            ", extract.map.map, optional_user_id, offset, sort_by, category, server_id).fetch_all(pool).await {
            Ok(r) => r,
            Err(_) => {
                return response!(internal_server_error)
            }
        };

        let total_guides = data
            .first()
            .and_then(|e| e.total_guides)
            .unwrap_or_default();
        let guides = data.iter_into();
        let paginated = GuidesPaginated{ total_guides, guides };
        response!(ok paginated)
    }
    #[oai(path="/maps/:map_name/guides", method="post")]
    async fn create_map_guide(
        &self, Data(app): Data<&AppData>, extract: BasicMapExtractor, TokenBearer(user_token): TokenBearer,
        Json(payload): Json<CreateGuideDto>
    ) -> Response<Guide>{
        let pool = &*app.pool.clone();
        let user_id = user_token.id;
        let map_name = extract.map.map;

        if let Ok(Some(reason)) = check_user_guide_ban(pool, user_id).await {
            let reason = format!("You are banned from creating guides. Reason: {}", reason);
            return response!(err &reason, ErrorCode::Forbidden);
        }

        let title_len = payload.title.trim().len();
        if title_len <= 5 || title_len >= 200 {
            return response!(err "Title must be between 5 and 200 characters", ErrorCode::BadRequest);
        }

        let content_len = payload.content.trim().len();
        if content_len <= 50 {
            return response!(err "Content must be bigger than 50 characters", ErrorCode::BadRequest);
        }

        if payload.category.trim().is_empty() {
            return response!(err "Category cannot be empty", ErrorCode::BadRequest);
        }

        let server_id = match payload.server_id {
            Some(s_id) => {
                let Some(s) = get_server(&app.pool, &app.cache, &s_id).await else {
                    return response!(err "Server not found", ErrorCode::BadRequest);
                };
                Some(s.server_id)
            },
            None => None,
        };

        // Generate unique slug from title
        let slug = match generate_unique_guide_slug(pool, &map_name, &payload.title).await {
            Ok(s) => s,
            Err(e) => {
                tracing::error!("Failed to generate slug: {}", e);
                return response!(err "Failed to generate slug", ErrorCode::InternalServerError);
            }
        };

        let Ok(guide_brief) = sqlx::query_as!(DbGuideBrief,
            "INSERT INTO website.guides (map_name, title, content, category, author_id, server_id, slug)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id, map_name, server_id, author_id",
            map_name, payload.title, payload.content, payload.category, user_id, server_id, slug
        )
        .fetch_one(pool)
        .await else {
            return response!(err "Failed to create guide", ErrorCode::InternalServerError)
        };

        let Ok(guide) = sqlx::query_as!(DbGuide, "
            SELECT g.id,
                g.map_name,
                g.server_id,
                g.title,
                g.content,
                g.category,
                g.created_at,
                g.updated_at,
                g.upvotes,
                g.slug,
                g.downvotes,
                g.comment_count,
                NULL AS \"user_vote: DataVoteType\",
                g.author_id AS author_id,
                su.persona_name AS author_name,
                su.avatar AS author_avatar,
                COALESCE(0, null) AS total_guides
            FROM website.guides g
            LEFT JOIN website.steam_user su ON su.user_id=g.author_id
            WHERE g.id=$1
            LIMIT 1
        ", guide_brief.id).fetch_one(pool).await else {
            return response!(err "Failed to fetch created guide", ErrorCode::InternalServerError)
        };

        response!(ok guide.into())
    }

    #[oai(path="/maps/:map_name/guides/slugs/:guide_slug", method="get")]
    async fn get_map_guide_slug(&self, Data(app): Data<&AppData>, extract: GuideSlugExtractor, OptionalTokenBearer(user): OptionalTokenBearer) -> Response<Guide>{
        let pool = &*app.pool.clone();
        let optional_user_id = user.map(|u| u.id);
        let data = match sqlx::query_as!(DbGuide, "
            SELECT g.id,
                g.map_name,
                g.server_id,
                g.title,
                g.content,
                g.category,
                g.created_at,
                g.updated_at,
                g.upvotes,
                g.downvotes,
                g.comment_count,
                gv.vote_type AS \"user_vote: Option<DataVoteType>\",
                g.author_id AS author_id,
                su.persona_name AS author_name,
                su.avatar AS author_avatar,
                g.slug,
                COALESCE(0, null) AS total_guides
            FROM website.guides g
            LEFT JOIN website.steam_user su ON su.user_id=g.author_id
            LEFT JOIN website.guide_votes gv ON gv.user_id=$3 AND gv.guide_id=g.id
            WHERE g.id=$1 AND map_name=$2
            LIMIT 1
        ", extract.guide.id, extract.map.map, optional_user_id).fetch_one(pool).await {
            Ok(data) => data,
            Err(e) => {
                println!("ERROR DbGuide {e}");
                return response!(internal_server_error)
            }
        };
        response!(ok data.into())
    }
    #[oai(path="/maps/:map_name/guides/:guide_id", method="get")]
    async fn get_map_guide(&self, Data(app): Data<&AppData>, extract: GuideExtractor, OptionalTokenBearer(user): OptionalTokenBearer) -> Response<Guide>{
        let pool = &*app.pool.clone();
        let optional_user_id = user.map(|u| u.id);
        let data = match sqlx::query_as!(DbGuide, "
            SELECT g.id,
                g.map_name,
                g.server_id,
                g.title,
                g.content,
                g.category,
                g.created_at,
                g.updated_at,
                g.upvotes,
                g.downvotes,
                g.comment_count,
                gv.vote_type AS \"user_vote: Option<DataVoteType>\",
                g.author_id AS author_id,
                su.persona_name AS author_name,
                su.avatar AS author_avatar,
                g.slug,
                COALESCE(0, null) AS total_guides
            FROM website.guides g
            LEFT JOIN website.steam_user su ON su.user_id=g.author_id
            LEFT JOIN website.guide_votes gv ON gv.user_id=$3 AND gv.guide_id=g.id
            WHERE g.id=$1 AND map_name=$2
            LIMIT 1
        ", extract.guide.id, extract.map.map, optional_user_id).fetch_one(pool).await {
            Ok(data) => data,
            Err(e) => {
                println!("ERROR DbGuide {e}");
                return response!(internal_server_error)
            }
        };
        response!(ok data.into())
    }

    #[oai(path="/maps/:map_name/guides/:guide_id", method="put")]
    async fn edit_map_guide(
        &self, Data(app): Data<&AppData>, extract: GuideExtractor, TokenBearer(user_token): TokenBearer,
        Json(payload): Json<UpdateGuideDto>
    ) -> Response<Guide>{
        let pool = &*app.pool.clone();
        let user_id = user_token.id;
        let guide_id = extract.guide.id;

        // Check if user is banned
        if let Ok(Some(reason)) = check_user_guide_ban(pool, user_id).await {
            let msg = format!("You are banned from editing guides. Reason: {}", reason);
            return response!(err &msg, ErrorCode::Forbidden);
        }

        if extract.guide.author_id != user_id {
            return response!(err "You are not authorized to edit this guide", ErrorCode::Forbidden)
        }

        if payload.title.is_none() && payload.content.is_none() && payload.category.is_none() {
            return response!(err "No fields to update", ErrorCode::BadRequest)
        }
        if let Some(title) = payload.title.as_deref(){
            let title_len = title.trim().len();
            if title_len <= 5 || title_len >= 200 {
                return response!(err "Title must be between 5 and 200 characters", ErrorCode::BadRequest);
            }
        }

        if let Some(content) = payload.content.as_deref(){
            let content_len = content.trim().len();
            if content_len <= 50 {
                return response!(err "Content must be bigger than 50 characters", ErrorCode::BadRequest);
            }
        }

        if let Some(category) = payload.category.as_deref(){
            if category.trim().is_empty()  {
                return response!(err "Category cannot be empty", ErrorCode::BadRequest);
            }
        }
        if let Some(s_id) = payload.server_id.clone().flatten() {
            if let None = get_server(&app.pool, &app.cache, &s_id).await {
                return response!(err "Server not found", ErrorCode::BadRequest);
            }
        }
        let _r = match sqlx::query!(
            "UPDATE website.guides
             SET title = COALESCE($2, title),
                 content = COALESCE($3, content),
                 category = COALESCE($4, category),
                 server_id = CASE WHEN $5::boolean THEN $6 ELSE server_id END,
                 updated_at = NOW()
             WHERE id = $1",
            guide_id,
            payload.title,
            payload.content,
            payload.category,
            payload.server_id.is_some(),  // Flag if server_id was provided
            payload.server_id.flatten()   // The actual value (None means global)
        )
        .execute(pool)
        .await {
            Ok(s) => s,
            Err(e) => {
                println!("FAILED TO UPDATE GUIDE {e}");
                return response!(err "Failed to update guide", ErrorCode::InternalServerError)
            }
        };

        let Ok(updated_guide) = sqlx::query_as!(DbGuide, "
            SELECT g.id,
                g.map_name,
                g.server_id,
                g.title,
                g.content,
                g.category,
                g.created_at,
                g.updated_at,
                g.upvotes,
                g.downvotes,
                g.comment_count,
                NULL AS \"user_vote: DataVoteType\",
                g.author_id AS author_id,
                su.persona_name AS author_name,
                su.avatar AS author_avatar,
                g.slug,
                COALESCE(0, null) AS total_guides
            FROM website.guides g
            LEFT JOIN website.steam_user su ON su.user_id=g.author_id
            WHERE g.id=$1
            LIMIT 1
        ", guide_id).fetch_one(pool).await else {
            return response!(err "Failed to fetch updated guide", ErrorCode::InternalServerError)
        };

        response!(ok updated_guide.into())
    }

    #[oai(path="/maps/:map_name/guides/:guide_id", method="delete")]
    async fn delete_map_guide(&self, Data(app): Data<&AppData>, extract: GuideExtractor, TokenBearer(user_token): TokenBearer) -> Response<Guide>{
        let guide = extract.guide;
        if guide.author_id != user_token.id {
            if !check_superuser(app, user_token.id).await{
                return response!(err "You're not authorized!", ErrorCode::Forbidden)
            }
        }
        let Ok(updated_guide) = sqlx::query_as!(DbGuide, "
            SELECT g.id,
                g.map_name,
                g.server_id,
                g.title,
                g.content,
                g.category,
                g.created_at,
                g.updated_at,
                g.upvotes,
                g.downvotes,
                g.comment_count,
                NULL AS \"user_vote: DataVoteType\",
                g.author_id AS author_id,
                su.persona_name AS author_name,
                su.avatar AS author_avatar,
                g.slug,
                COALESCE(0, null) AS total_guides
            FROM website.guides g
            LEFT JOIN website.steam_user su ON su.user_id=g.author_id
            WHERE g.id=$1
            LIMIT 1
        ", guide.id).fetch_one(&*app.pool).await else {
            return response!(err "Failed to fetch delete guide", ErrorCode::InternalServerError)
        };
        let Ok(_) = sqlx::query!("
            DELETE FROM website.guides g
            WHERE g.id=$1
        ", guide.id).execute(&*app.pool).await else {
            return response!(err "Failed to fetch delete guide", ErrorCode::InternalServerError)
        };
        response!(ok updated_guide.into())
    }

    #[oai(path="/maps/:map_name/guides/:guide_id/report", method="post")]
    async fn report_map_guide(
        &self, Data(app): Data<&AppData>, extract: GuideExtractor, TokenBearer(user_token): TokenBearer,
        Json(payload): Json<ReportGuideDto>
    ) -> Response<String>{
        let pool = &*app.pool.clone();
        let user_id = user_token.id;
        let guide_id = extract.guide.id;

        let Ok(_) = sqlx::query!(
            "INSERT INTO website.report_guide(guide_id, user_id, reason, details)
             VALUES ($1, $2, $3, $4)",
            guide_id,
            user_id,
            payload.reason,
            payload.details
        )
        .execute(pool)
        .await else {
            return response!(err "Failed to submit report", ErrorCode::InternalServerError)
        };

        response!(ok "OK".into())
    }

    #[oai(path="/maps/:map_name/guides/:guide_id/comments/:comment_id/report", method="post")]
    async fn report_map_guide_comment(
        &self, Data(app): Data<&AppData>, extract: GuideCommentExtractor, TokenBearer(user_token): TokenBearer,
        Json(payload): Json<ReportGuideDto>
    ) -> Response<String>{
        let pool = &*app.pool.clone();
        let user_id = user_token.id;
        let comment_id = extract.comment.id;

        let Ok(_) = sqlx::query!(
            "INSERT INTO website.report_guide_comment(comment_id, user_id, reason, details)
             VALUES ($1, $2, $3, $4)",
            comment_id,
            user_id,
            payload.reason,
            payload.details
        )
        .execute(pool)
        .await else {
            return response!(err "Failed to submit report", ErrorCode::InternalServerError)
        };

        response!(ok "OK".into())
    }

    #[oai(path="/music/:music_id/report", method="post")]
    async fn report_map_music(
        &self,
        Data(app): Data<&AppData>,
        Path(music_id): Path<String>,
        TokenBearer(user_token): TokenBearer,
        Json(payload): Json<ReportMapMusicDto>
    ) -> Response<String> {
        let pool = &*app.pool.clone();
        let user_id = user_token.id;

        // Validate music_id is valid UUID
        let Ok(music_uuid) = uuid::Uuid::parse_str(&music_id) else {
            return response!(err "Invalid music ID", ErrorCode::BadRequest);
        };

        // Validate reason
        if !["video_unavailable", "wrong_video"].contains(&payload.reason.as_str()) {
            return response!(err "Invalid reason. Must be 'video_unavailable' or 'wrong_video'", ErrorCode::BadRequest);
        }

        // Optional: Validate YouTube URL format if provided
        if let Some(ref url) = payload.suggested_youtube_url {
            if !url.is_empty() && !url.contains("youtube.com") && !url.contains("youtu.be") {
                return response!(err "Invalid YouTube URL format", ErrorCode::BadRequest);
            }
        }

        // Get current youtube_music value for snapshot
        let current_youtube_music = match sqlx::query_scalar!(
            "SELECT youtube_music FROM map_music WHERE id = $1",
            music_uuid
        )
        .fetch_optional(pool)
        .await
        {
            Ok(Some(yt)) => yt,
            Ok(None) => return response!(err "Music track not found", ErrorCode::NotFound),
            Err(e) => {
                tracing::error!("Failed to fetch music: {}", e);
                return response!(internal_server_error);
            }
        };

        // Insert report
        let result = sqlx::query!(
            "INSERT INTO website.report_map_music(music_id, user_id, reason, details, suggested_youtube_url, current_youtube_music)
             VALUES ($1, $2, $3, $4, $5, $6)",
            music_uuid,
            user_id,
            payload.reason,
            payload.details,
            payload.suggested_youtube_url,
            current_youtube_music
        )
        .execute(pool)
        .await;

        match result {
            Ok(_) => response!(ok "OK".into()),
            Err(e) => {
                // Check for duplicate constraint violation
                if e.to_string().contains("unique_pending_music_report") {
                    return response!(err "You already have a pending report for this music track", ErrorCode::BadRequest);
                }
                tracing::error!("Failed to submit music report: {}", e);
                response!(internal_server_error)
            }
        }
    }

    #[oai(path="/maps/:map_name/guides/:guide_id/vote", method="post")]
    async fn vote_map_guide(
        &self, Data(app): Data<&AppData>, extract: GuideExtractor,
        TokenBearer(user_token): TokenBearer, Json(payload): Json<VoteDto>
    ) -> Response<Guide>{
        let pool = &*app.pool.clone();
        let user_id = user_token.id;
        let guide_id = extract.guide.id;

        // Check if user is banned
        if let Ok(Some(reason)) = check_user_guide_ban(pool, user_id).await {
            let msg = format!("You are banned from voting. Reason: {}", reason);
            return response!(err &msg, ErrorCode::Forbidden);
        }

        let Ok(author_id) = sqlx::query_scalar!(
            "SELECT author_id FROM website.guides WHERE id=$1",
            guide_id
        )
        .fetch_one(pool)
        .await else {
            return response!(err "Guide not found", ErrorCode::NotFound)
        };

        if author_id == user_id {
            return response!(err "You cannot vote on your own guide", ErrorCode::Forbidden)
        }

        let vote_type: DataVoteType = payload.vote_type.into();

        let _ = match sqlx::query!(
            "INSERT INTO website.guide_votes (guide_id, user_id, vote_type)
             VALUES ($1, $2, $3)
             ON CONFLICT (guide_id, user_id)
             DO UPDATE SET vote_type = EXCLUDED.vote_type, created_at = NOW()",
            guide_id,
            user_id,
            vote_type as DataVoteType
        )
        .execute(pool)
        .await {
            Ok(a) => a,
            Err(e) => {
                println!("ERROR VOTING {e}");
                return response!(err "Failed to record vote", ErrorCode::InternalServerError)
            }
        };
        let Ok(updated_guide) = sqlx::query_as!(DbGuide, "
            SELECT g.id,
                g.map_name,
                g.server_id,
                g.title,
                g.content,
                g.category,
                g.created_at,
                g.updated_at,
                g.upvotes,
                g.downvotes,
                g.comment_count,
                gv.vote_type AS \"user_vote: Option<DataVoteType>\",
                g.author_id AS author_id,
                su.persona_name AS author_name,
                su.avatar AS author_avatar,
                g.slug,
                COALESCE(0, null) AS total_guides
            FROM website.guides g
            LEFT JOIN website.steam_user su ON su.user_id=g.author_id
            LEFT JOIN website.guide_votes gv ON gv.user_id=$2 AND gv.guide_id=g.id
            WHERE g.id=$1
            LIMIT 1
        ", guide_id, user_id).fetch_one(&*app.pool).await else {
            return response!(err "Failed to fetch delete guide", ErrorCode::InternalServerError)
        };
        response!(ok updated_guide.into())
    }

    #[oai(path="/maps/:map_name/guides/:guide_id/vote", method="delete")]
    async fn delete_vote_map_guide(
        &self, Data(app): Data<&AppData>, extract: GuideExtractor,
        TokenBearer(user_token): TokenBearer
    ) -> Response<Guide>{
        let pool = &*app.pool.clone();
        let user_id = user_token.id;
        let guide_id = extract.guide.id;

        // Check if user is banned
        if let Ok(Some(reason)) = check_user_guide_ban(pool, user_id).await {
            let msg = format!("You are banned from voting. Reason: {}", reason);
            return response!(err &msg, ErrorCode::Forbidden);
        }

        // Delete the user's vote
        let Ok(result) = sqlx::query!(
            "DELETE FROM website.guide_votes
             WHERE guide_id = $1 AND user_id = $2",
            guide_id,
            user_id
        )
        .execute(pool)
        .await else {
            return response!(err "Failed to delete vote", ErrorCode::InternalServerError)
        };

        if result.rows_affected() == 0 {
            return response!(err "No vote found to delete", ErrorCode::NotFound)
        }
        let Ok(updated_guide) = sqlx::query_as!(DbGuide, "
            SELECT g.id,
                g.map_name,
                g.server_id,
                g.title,
                g.content,
                g.category,
                g.created_at,
                g.updated_at,
                g.upvotes,
                g.downvotes,
                g.comment_count,
                NULL AS \"user_vote: DataVoteType\",
                g.author_id AS author_id,
                su.persona_name AS author_name,
                su.avatar AS author_avatar,
                g.slug,
                COALESCE(0, null) AS total_guides
            FROM website.guides g
            LEFT JOIN website.steam_user su ON su.user_id=g.author_id
            WHERE g.id=$1
            LIMIT 1
        ", guide_id).fetch_one(&*app.pool).await else {
            return response!(err "Failed to fetch delete guide", ErrorCode::InternalServerError)
        };
        response!(ok updated_guide.into())
    }

    #[oai(path="/maps/:map_name/guides/:guide_id/comments", method="get")]
    async fn get_map_guide_comments(
        &self, Data(app): Data<&AppData>, extract: GuideExtractor, OptionalTokenBearer(user): OptionalTokenBearer,
        Query(page): Query<usize>
    ) -> Response<GuideCommentPaginated>{
        let pool = &*app.pool.clone();
        let pagination = 10;
        let offset = pagination * page as i64;
        let optional_user_id = user.map(|u| u.id);
        let guide_id = extract.guide.id;

        let data = match sqlx::query_as!(DbGuideComment, "
            SELECT gc.id,
                gc.guide_id,
                gc.author_id,
                su.persona_name AS author_name,
                su.avatar AS author_avatar,
                gc.content,
                gc.created_at,
                gc.updated_at,
                gc.upvotes,
                gc.downvotes,
                gcv.vote_type AS \"user_vote: Option<DataVoteType>\",
                COUNT(*) OVER()::Integer total_comments
            FROM website.guide_comments gc
            LEFT JOIN website.steam_user su ON su.user_id=gc.author_id
            LEFT JOIN website.guide_comment_votes gcv ON gcv.user_id=$2 AND gcv.comment_id=gc.id
            WHERE gc.guide_id=$1
            ORDER BY gc.created_at ASC
            LIMIT $3
            OFFSET $4
        ", guide_id, optional_user_id, pagination, offset).fetch_all(pool).await {
            Ok(d) => d,
            Err(e) => {
                println!("ERROR DbGuideComment {e}");
                return response!(internal_server_error)
            }
        };

        let total_comments = data.first()
            .and_then(|m| m.total_comments)
            .unwrap_or_default();
        let comments: Vec<GuideComment> = data.iter_into();

        let paginated = GuideCommentPaginated {
            total_comments,
            comments
        };
        response!(ok paginated)
    }
    #[oai(path="/maps/:map_name/guides/:guide_id/comments", method="post")]
    async fn create_map_guide_comment(
        &self, Data(app): Data<&AppData>, extract: GuideExtractor, TokenBearer(user_token): TokenBearer,
        Json(payload): Json<CreateUpdateCommentDto>
    ) -> Response<GuideComment>{
        let pool = &*app.pool.clone();
        let user_id = user_token.id;
        let guide_id = extract.guide.id;

        if let Ok(Some(reason)) = check_user_guide_ban(pool, user_id).await {
            let reason = format!("You are banned from commenting. Reason: {}", reason);
            return response!(err &reason, ErrorCode::Forbidden);
        }

        if payload.content.trim().is_empty() {
            return response!(err "Content cannot be empty.", ErrorCode::BadRequest);
        }

        let Ok(comment_id) = sqlx::query_scalar!(
            "INSERT INTO website.guide_comments (guide_id, author_id, content)
             VALUES ($1, $2, $3)
             RETURNING id",
            guide_id, user_id, payload.content
        )
        .fetch_one(pool)
        .await else {
            return response!(err "Failed to create comment", ErrorCode::InternalServerError)
        };

        let Ok(comment) = sqlx::query_as!(DbGuideComment, "
            SELECT gc.id,
                gc.guide_id,
                gc.author_id,
                su.persona_name AS author_name,
                su.avatar AS author_avatar,
                gc.content,
                gc.created_at,
                gc.updated_at,
                gc.upvotes,
                gc.downvotes,
                NULL AS \"user_vote: DataVoteType\",
                COALESCE(0, NULL) AS total_comments
            FROM website.guide_comments gc
            LEFT JOIN website.steam_user su ON su.user_id=gc.author_id
            WHERE gc.id=$1
            LIMIT 1
        ", comment_id).fetch_one(pool).await else {
            return response!(err "Failed to fetch created comment", ErrorCode::InternalServerError)
        };

        response!(ok comment.into())
    }
    #[oai(path="/maps/:map_name/guides/:guide_id/comments/:comment_id", method="delete")]
    async fn delete_map_guide_comment(
        &self, Data(app): Data<&AppData>, extract: GuideCommentExtractor, TokenBearer(user_token): TokenBearer
    ) -> Response<GuideComment>{
        let pool = &*app.pool.clone();
        let comment = extract.comment;

        if comment.author_id != user_token.id {
            if !check_superuser(app, user_token.id).await {
                return response!(err "You're not authorized to delete this comment", ErrorCode::Forbidden)
            }
        }

        let Ok(deleted_comment) = sqlx::query_as!(DbGuideComment, "
            SELECT gc.id,
                gc.guide_id,
                gc.author_id,
                su.persona_name AS author_name,
                su.avatar AS author_avatar,
                gc.content,
                gc.created_at,
                gc.updated_at,
                gc.upvotes,
                gc.downvotes,
                NULL AS \"user_vote: DataVoteType\",
                COALESCE(0, NULL) AS total_comments
            FROM website.guide_comments gc
            LEFT JOIN website.steam_user su ON su.user_id=gc.author_id
            WHERE gc.id=$1
            LIMIT 1
        ", comment.id).fetch_one(pool).await else {
            return response!(err "Failed to fetch comment", ErrorCode::InternalServerError)
        };

        let Ok(_) = sqlx::query!(
            "DELETE FROM website.guide_comments WHERE id=$1",
            comment.id
        ).execute(pool).await else {
            return response!(err "Failed to delete comment", ErrorCode::InternalServerError)
        };

        response!(ok deleted_comment.into())
    }
    #[oai(path="/maps/:map_name/guides/:guide_id/comments/:comment_id", method="put")]
    async fn update_map_guide_comment(
        &self, Data(app): Data<&AppData>, extract: GuideCommentExtractor, TokenBearer(user_token): TokenBearer, Json(payload): Json<CreateUpdateCommentDto>
    ) -> Response<GuideComment>{
        let pool = &*app.pool.clone();
        let comment = extract.comment;

        // Check if user is banned
        if let Ok(Some(reason)) = check_user_guide_ban(pool, user_token.id).await {
            let msg = format!("You are banned from editing comments. Reason: {}", reason);
            return response!(err &msg, ErrorCode::Forbidden);
        }

        if comment.author_id != user_token.id {
            return response!(err "You are not authorized to edit this comment", ErrorCode::Forbidden)
        }

        if payload.content.trim().is_empty() {
            return response!(err "Content cannot be empty.", ErrorCode::BadRequest);
        }

        let Ok(_) = sqlx::query!(
            "UPDATE website.guide_comments
             SET content = $2,
                 updated_at = NOW()
             WHERE id = $1",
            comment.id,
            payload.content
        )
        .execute(pool)
        .await else {
            return response!(err "Failed to update comment", ErrorCode::InternalServerError)
        };

        let Ok(updated_comment) = sqlx::query_as!(DbGuideComment, "
            SELECT gc.id,
                gc.guide_id,
                gc.author_id,
                su.persona_name AS author_name,
                su.avatar AS author_avatar,
                gc.content,
                gc.created_at,
                gc.updated_at,
                gc.upvotes,
                gc.downvotes,
                NULL AS \"user_vote: DataVoteType\",
                COALESCE(0, NULL) AS total_comments
            FROM website.guide_comments gc
            LEFT JOIN website.steam_user su ON su.user_id=gc.author_id
            WHERE gc.id=$1
            LIMIT 1
        ", comment.id).fetch_one(pool).await else {
            return response!(err "Failed to fetch updated comment", ErrorCode::InternalServerError)
        };

        response!(ok updated_comment.into())
    }
    #[oai(path="/maps/:map_name/guides/:guide_id/comments/:comment_id/vote", method="post")]
    async fn vote_map_guide_comment(
        &self, Data(app): Data<&AppData>, extract: GuideCommentExtractor,
        TokenBearer(user_token): TokenBearer, Json(payload): Json<VoteDto>
    ) -> Response<GuideComment>{
        let pool = &*app.pool.clone();
        let user_id = user_token.id;
        let comment_id = extract.comment.id;

        // Check if user is banned
        if let Ok(Some(reason)) = check_user_guide_ban(pool, user_id).await {
            let msg = format!("You are banned from voting. Reason: {}", reason);
            return response!(err &msg, ErrorCode::Forbidden);
        }

        // Prevent users from voting on their own comments
        if extract.comment.author_id == user_id {
            return response!(err "You cannot vote on your own comment", ErrorCode::Forbidden)
        }

        let vote_type: DataVoteType = payload.vote_type.into();

        let Ok(_) = sqlx::query!(
            "INSERT INTO website.guide_comment_votes (comment_id, user_id, vote_type)
             VALUES ($1, $2, $3)
             ON CONFLICT (comment_id, user_id)
             DO UPDATE SET vote_type = EXCLUDED.vote_type, created_at = NOW()",
            comment_id,
            user_id,
            vote_type as DataVoteType
        )
        .execute(pool)
        .await else {
            return response!(err "Failed to record vote", ErrorCode::InternalServerError)
        };

        // Fetch the updated comment with new vote counts
        let Ok(updated_comment) = sqlx::query_as!(DbGuideComment, "
            SELECT gc.id,
                gc.guide_id,
                gc.author_id,
                su.persona_name AS author_name,
                su.avatar AS author_avatar,
                gc.content,
                gc.created_at,
                gc.updated_at,
                gc.upvotes,
                gc.downvotes,
                gcv.vote_type AS \"user_vote: Option<DataVoteType>\",
                COALESCE(0, NULL) AS total_comments
            FROM website.guide_comments gc
            LEFT JOIN website.steam_user su ON su.user_id=gc.author_id
            LEFT JOIN website.guide_comment_votes gcv ON gcv.user_id=$2 AND gcv.comment_id=gc.id
            WHERE gc.id=$1
            LIMIT 1
        ", comment_id, user_id).fetch_one(pool).await else {
            return response!(err "Failed to fetch updated comment", ErrorCode::InternalServerError)
        };

        response!(ok updated_comment.into())
    }
    #[oai(path="/maps/:map_name/guides/:guide_id/comments/:comment_id/vote", method="delete")]
    async fn remove_vote_map_guide_comment(
        &self, Data(app): Data<&AppData>, extract: GuideCommentExtractor, TokenBearer(user_token): TokenBearer
    ) -> Response<GuideComment>{
        let pool = &*app.pool.clone();
        let user_id = user_token.id;
        let comment_id = extract.comment.id;

        // Check if user is banned
        if let Ok(Some(reason)) = check_user_guide_ban(pool, user_id).await {
            let msg = format!("You are banned from voting. Reason: {}", reason);
            return response!(err &msg, ErrorCode::Forbidden);
        }

        let Ok(result) = sqlx::query!(
            "DELETE FROM website.guide_comment_votes
             WHERE comment_id = $1 AND user_id = $2",
            comment_id,
            user_id
        )
        .execute(pool)
        .await else {
            return response!(err "Failed to delete vote", ErrorCode::InternalServerError)
        };

        if result.rows_affected() == 0 {
            return response!(err "No vote found to delete", ErrorCode::NotFound)
        }

        let Ok(updated_comment) = sqlx::query_as!(DbGuideComment, "
            SELECT gc.id,
                gc.guide_id,
                gc.author_id,
                su.persona_name AS author_name,
                su.avatar AS author_avatar,
                gc.content,
                gc.created_at,
                gc.updated_at,
                gc.upvotes,
                gc.downvotes,
                NULL AS \"user_vote: DataVoteType\",
                COALESCE(0, NULL) AS total_comments
            FROM website.guide_comments gc
            LEFT JOIN website.steam_user su ON su.user_id=gc.author_id
            WHERE gc.id=$1
            LIMIT 1
        ", comment_id).fetch_one(pool).await else {
            return response!(err "Failed to fetch updated comment", ErrorCode::InternalServerError)
        };

        response!(ok updated_comment.into())
    }

    /// Get all maps with 3D models for a specific server
    #[oai(path = "/servers/:server_id/maps/3d", method = "get")]
    async fn get_server_maps_with_models(
        &self,
        Data(app): Data<&AppData>,
        Path(server_id): Path<String>,
    ) -> Response<Vec<MapWithModels>> {
        let models_result = sqlx::query_as!(
            DbMap3DModel,
            r#"
            SELECT m.id, m.map_name, m.res_type, m.credit, m.link_path,
                   m.uploaded_by, m.file_size, m.created_at, m.updated_at
            FROM website.map_3d_model m
            WHERE m.map_name IN (
                SELECT DISTINCT map FROM server_map_played WHERE server_id = $1
            )
            ORDER BY m.map_name, m.res_type
            "#,
            server_id
        )
        .fetch_all(&*app.pool)
        .await;

        let models = models_result.unwrap_or_default();

        let mut models_map: std::collections::HashMap<String, (Option<Map3DModel>, Option<Map3DModel>)> = std::collections::HashMap::new();

        for model in models {
            let uploader_name = if let Some(uploader_id) = model.uploaded_by {
                sqlx::query_scalar!(
                    "SELECT persona_name FROM website.steam_user WHERE user_id = $1",
                    uploader_id
                )
                .fetch_optional(&*app.pool)
                .await
                .ok()
                .flatten()
            } else {
                None
            };

            let mut api_model: Map3DModel = model.into();
            api_model.link_path = app.map_storage.normalize_link_path(
                &api_model.link_path,
                &api_model.map_name,
                &api_model.res_type,
            );
            api_model.uploader_name = uploader_name;

            let entry = models_map.entry(api_model.map_name.clone()).or_insert((None, None));
            if api_model.res_type == "low" {
                entry.0 = Some(api_model);
            } else if api_model.res_type == "high" {
                entry.1 = Some(api_model);
            }
        }

        let mut map_names: Vec<String> = models_map.keys().cloned().collect();
        map_names.sort();

        let result: Vec<MapWithModels> = map_names
            .into_iter()
            .filter_map(|name| {
                let (low_res, high_res) = models_map.remove(&name)?;
                if low_res.is_none() && high_res.is_none() {
                    return None;
                }
                Some(MapWithModels {
                    map_name: name,
                    low_res_model: low_res,
                    high_res_model: high_res,
                })
            })
            .collect();

        response!(ok result)
    }

    /// Get all maps with their 3D models
    #[oai(path = "/maps/all/3d", method = "get")]
    async fn get_all_maps_with_models(
        &self,
        Data(app): Data<&AppData>,
    ) -> Response<Vec<MapWithModels>> {
        // Get all unique maps
        let maps_result = sqlx::query_as!(
            DbMapName,
            "SELECT DISTINCT map as map_name FROM server_map_played ORDER BY map"
        )
        .fetch_all(&*app.pool)
        .await;

        let Ok(maps) = maps_result else {
            return response!(internal_server_error);
        };

        // Get all 3D models
        let models_result = sqlx::query_as!(
            DbMap3DModel,
            "SELECT * FROM website.map_3d_model ORDER BY map_name, res_type"
        )
        .fetch_all(&*app.pool)
        .await;

        let models = models_result.unwrap_or_default();

        // Build a map of map_name -> (low_res, high_res)
        let mut models_map: std::collections::HashMap<String, (Option<Map3DModel>, Option<Map3DModel>)> = std::collections::HashMap::new();

        for model in models {
            let uploader_name = if let Some(uploader_id) = model.uploaded_by {
                sqlx::query_scalar!(
                    "SELECT persona_name FROM website.steam_user WHERE user_id = $1",
                    uploader_id
                )
                .fetch_optional(&*app.pool)
                .await
                .ok()
                .flatten()
            } else {
                None
            };

            let mut api_model: Map3DModel = model.into();
            api_model.link_path = app.map_storage.normalize_link_path(
                &api_model.link_path,
                &api_model.map_name,
                &api_model.res_type,
            );
            api_model.uploader_name = uploader_name;

            let entry = models_map.entry(api_model.map_name.clone()).or_insert((None, None));
            if api_model.res_type == "low" {
                entry.0 = Some(api_model);
            } else if api_model.res_type == "high" {
                entry.1 = Some(api_model);
            }
        }

        // Build response
        let result: Vec<MapWithModels> = maps
            .into_iter()
            .map(|map| {
                let (low_res, high_res) = models_map.remove(&map.map_name).unwrap_or((None, None));
                MapWithModels {
                    map_name: map.map_name,
                    low_res_model: low_res,
                    high_res_model: high_res,
                }
            })
            .collect();

        response!(ok result)
    }

    /// Get 3D model info for a map
    #[oai(path = "/maps/:map_name/3d", method = "get")]
    async fn get_map_3d_models(
        &self,
        Data(app): Data<&AppData>,
        Path(map_name): Path<String>,
    ) -> Response<MapWithModels> {
        let models = sqlx::query_as!(
            DbMap3DModel,
            r#"
            SELECT id, map_name, res_type, credit, link_path,
                   uploaded_by, file_size, created_at, updated_at
            FROM website.map_3d_model
            WHERE map_name = $1
            ORDER BY res_type
            "#,
            map_name
        )
        .fetch_all(&*app.pool)
        .await;

        match models {
            Ok(models) => {
                let mut low_res = None;
                let mut high_res = None;

                for model in models {
                    let uploader_name = if let Some(uploader_id) = model.uploaded_by {
                        sqlx::query_scalar!(
                            "SELECT persona_name FROM website.steam_user WHERE user_id = $1",
                            uploader_id
                        )
                        .fetch_optional(&*app.pool)
                        .await
                        .ok()
                        .flatten()
                    } else {
                        None
                    };


                    let mut api_model: Map3DModel = model.into();
                    api_model.link_path = app.map_storage.normalize_link_path(
                        &api_model.link_path,
                        &api_model.map_name,
                        &api_model.res_type,
                    );
                    api_model.uploader_name = uploader_name;

                    if api_model.res_type == "low" {
                        low_res = Some(api_model);
                    } else if api_model.res_type == "high" {
                        high_res = Some(api_model);
                    }
                }

                response!(ok MapWithModels {
                    map_name,
                    low_res_model: low_res,
                    high_res_model: high_res,
                })
            }
            Err(_) => response!(internal_server_error),
        }
    }

    #[oai(path = "/maps/:map_name/3d/upload", method = "post")]
    async fn upload_map_3d_model(
        &self,
        Data(app): Data<&AppData>,
        Path(map_name): Path<String>,
        TokenBearer(user_token): TokenBearer,
        multipart: poem::web::Multipart,
    ) -> Response<Map3DModel> {
        if !check_superuser_or_map_manager(&app, user_token.id).await {
            return response!(err "Forbidden", ErrorCode::Forbidden);
        }

        let mut multipart = multipart;
        let mut file_data: Option<Vec<u8>> = None;
        let mut res_type: Option<String> = None;
        let mut credit: Option<String> = None;

        while let Ok(Some(field)) = multipart.next_field().await {
            let name = field.name().map(|s| s.to_string());

            match name.as_deref() {
                Some("file") => {
                    if let Ok(bytes) = field.bytes().await {
                        file_data = Some(bytes.to_vec());
                    }
                }
                Some("res_type") => {
                    if let Ok(text) = field.text().await {
                        if text == "low" || text == "high" {
                            res_type = Some(text);
                        }
                    }
                }
                Some("credit") => {
                    if let Ok(text) = field.text().await {
                        if !text.trim().is_empty() {
                            credit = Some(text);
                        }
                    }
                }
                _ => {}
            }
        }

        let Some(file_bytes) = file_data else {
            return response!(err "Missing file", ErrorCode::BadRequest);
        };
        let Some(res_type_val) = res_type else {
            return response!(err "Missing res_type (must be 'low' or 'high')", ErrorCode::BadRequest);
        };

        const MAX_FILE_SIZE: usize = 500 * 1024 * 1024;
        if file_bytes.len() > MAX_FILE_SIZE {
            return response!(err "File too large (max 500MB)", ErrorCode::BadRequest);
        }

        let link_path = match app.map_storage
            .store_bytes(&map_name, &res_type_val, &file_bytes)
            .await
        {
            Ok(path) => path,
            Err(e) => {
                tracing::error!("Failed to store 3D model: {}", e);
                return response!(internal_server_error);
            }
        };

        let result = sqlx::query_as!(
            DbMap3DModel,
            r#"
            INSERT INTO website.map_3d_model
            (map_name, res_type, credit, link_path, uploaded_by, file_size)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (map_name, res_type)
            DO UPDATE SET
                credit = EXCLUDED.credit,
                link_path = EXCLUDED.link_path,
                uploaded_by = EXCLUDED.uploaded_by,
                file_size = EXCLUDED.file_size,
                updated_at = NOW()
            RETURNING *
            "#,
            map_name,
            res_type_val,
            credit,
            link_path,
            user_token.id,
            file_bytes.len() as i64,
        )
        .fetch_one(&*app.pool)
        .await;

        match result {
            Ok(model) => {
                let uploader_name = sqlx::query_scalar!(
                    "SELECT persona_name FROM website.steam_user WHERE user_id = $1",
                    user_token.id
                )
                .fetch_optional(&*app.pool)
                .await
                .ok()
                .flatten();

                let mut api_model: Map3DModel = model.into();
                api_model.link_path = app.map_storage.normalize_link_path(
                    &api_model.link_path,
                    &api_model.map_name,
                    &api_model.res_type,
                );
                api_model.uploader_name = uploader_name;
                response!(ok api_model)
            }
            Err(e) => {
                tracing::error!("Database error: {}", e);
                response!(internal_server_error)
            }
        }
    }

    /// Initiate chunked upload session for large 3D models
    #[oai(path = "/maps/:map_name/3d/upload/initiate", method = "post")]
    async fn initiate_chunked_upload(
        &self,
        Data(app): Data<&AppData>,
        Path(map_name): Path<String>,
        TokenBearer(user_token): TokenBearer,
        Json(req): Json<serde_json::Value>,
    ) -> Response<InitiateUploadResponse> {
        // Check superuser permission
        if !check_superuser_or_map_manager(&app, user_token.id).await {
            return response!(err "Forbidden", ErrorCode::Forbidden);
        }

        // Parse request
        let res_type = match req.get("res_type").and_then(|v| v.as_str()) {
            Some(rt) if rt == "low" || rt == "high" => rt.to_string(),
            _ => return response!(err "Invalid res_type. Must be 'low' or 'high'", ErrorCode::BadRequest),
        };

        let credit = req.get("credit").and_then(|v| v.as_str()).map(|s| s.to_string());

        let file_size = match req.get("file_size").and_then(|v| v.as_u64()) {
            Some(size) => size,
            None => return response!(err "file_size is required", ErrorCode::BadRequest),
        };

        // Generate session ID
        let session_id = uuid::Uuid::new_v4().to_string();

        // Calculate chunks
        const CHUNK_SIZE: usize = 10_485_760; // 10MB
        let total_chunks = ((file_size as f64) / (CHUNK_SIZE as f64)).ceil() as u32;

        // Create upload session
        let session = UploadSession {
            session_id: session_id.clone(),
            map_name: map_name.clone(),
            res_type: res_type.clone(),
            credit,
            total_chunks,
            chunk_size: CHUNK_SIZE,
            total_size: file_size,
            uploaded_by: user_token.id,
            created_at: chrono::Utc::now().to_rfc3339(),
            chunks_received: Vec::new(),
        };

        // Store session in Redis with 24h TTL
        let session_key = format!("upload_session:{}", session_id);
        match serde_json::to_string(&session) {
            Ok(session_json) => {
                if let Ok(mut conn) = app.cache.redis_pool.get().await {
                    use redis::AsyncCommands;
                    let _: redis::RedisResult<()> = conn.set_ex(&session_key, &session_json, 86400).await;
                } else {
                    tracing::error!("Failed to get Redis connection");
                    return response!(err "Failed to create upload session", ErrorCode::InternalServerError);
                }
            }
            Err(e) => {
                tracing::error!("Failed to serialize upload session: {}", e);
                return response!(err "Failed to create upload session", ErrorCode::InternalServerError);
            }
        }

        // Create temp directory
        let store_upload = std::env::var("STORE_UPLOAD").unwrap_or_else(|_| "./maps".to_string());
        let temp_dir = format!("{}/.tmp/{}", store_upload, session_id);
        if let Err(e) = tokio::fs::create_dir_all(&temp_dir).await {
            tracing::error!("Failed to create temp directory: {}", e);
            return response!(err "Failed to create upload session", ErrorCode::InternalServerError);
        }

        tracing::info!("Upload session initiated: {}, map: {}, size: {}", session_id, map_name, file_size);

        response!(ok InitiateUploadResponse {
            session_id,
            chunk_size: CHUNK_SIZE,
            total_chunks,
        })
    }

    /// Upload individual chunk
    #[oai(path = "/maps/:map_name/3d/upload/chunk/:session_id", method = "post")]
    async fn upload_chunk(
        &self,
        Data(app): Data<&AppData>,
        Path(map_name): Path<String>,
        Path(session_id): Path<String>,
        TokenBearer(user_token): TokenBearer,
        upload: poem::web::Multipart,
    ) -> Response<ChunkUploadResponse> {
        // Check superuser permission
        if !check_superuser_or_map_manager(&app, user_token.id).await {
            return response!(err "Forbidden", ErrorCode::Forbidden);
        }

        // Retrieve session from Redis
        let session = match Self::get_upload_session(&app.cache, &session_id).await {
            Ok(s) => s,
            Err(e) => return response!(err e, ErrorCode::NotFound),
        };

        // Verify user owns session
        if session.uploaded_by != user_token.id {
            return response!(err "Forbidden", ErrorCode::Forbidden);
        }

        // Verify map name matches
        if session.map_name != map_name {
            return response!(err "Map name mismatch", ErrorCode::BadRequest);
        }

        // Parse multipart form
        let mut chunk_index: Option<u32> = None;
        let mut chunk_data: Option<Vec<u8>> = None;

        let mut upload = upload;
        while let Ok(Some(field)) = upload.next_field().await {
            let name = field.name().map(|s| s.to_string());
            match name.as_deref() {
                Some("chunk_index") => {
                    if let Ok(text) = field.text().await {
                        chunk_index = text.parse::<u32>().ok();
                    }
                }
                Some("chunk_data") => {
                    if let Ok(bytes) = field.bytes().await {
                        chunk_data = Some(bytes.to_vec());
                    }
                }
                _ => {}
            }
        }

        let chunk_index = match chunk_index {
            Some(idx) => idx,
            None => return response!(err "chunk_index is required", ErrorCode::BadRequest),
        };

        let chunk_data = match chunk_data {
            Some(data) => data,
            None => return response!(err "chunk_data is required", ErrorCode::BadRequest),
        };

        // Validate chunk index
        if chunk_index >= session.total_chunks {
            return response!(err "Invalid chunk_index", ErrorCode::BadRequest);
        }

        // Check if chunk already received (idempotent)
        let already_received = session.chunks_received.contains(&chunk_index);

        // Write chunk to disk
        let store_upload = std::env::var("STORE_UPLOAD").unwrap_or_else(|_| "./maps".to_string());
        let chunk_path = format!("{}/.tmp/{}/chunk_{}", store_upload, session_id, chunk_index);

        if !already_received {
            if let Err(e) = tokio::fs::write(&chunk_path, &chunk_data).await {
                tracing::error!("Failed to write chunk {}: {}", chunk_index, e);
                return response!(err "Failed to write chunk", ErrorCode::InternalServerError);
            }

            // Update session with new chunk
            let mut updated_session = session.clone();
            updated_session.chunks_received.push(chunk_index);
            updated_session.chunks_received.sort_unstable();

            if let Err(e) = Self::update_upload_session(&app.cache, &updated_session).await {
                tracing::error!("Failed to update upload session: {}", e);
                return response!(err "Failed to update session", ErrorCode::InternalServerError);
            }

            tracing::debug!("Chunk {}/{} received for session {}", chunk_index, session.total_chunks, session_id);
        }

        let chunks_remaining = session.total_chunks - (session.chunks_received.len() as u32) - if already_received { 0 } else { 1 };

        response!(ok ChunkUploadResponse {
            chunk_index,
            received: true,
            chunks_remaining,
        })
    }

    /// Complete chunked upload and assemble file
    #[oai(path = "/maps/:map_name/3d/upload/complete/:session_id", method = "post")]
    async fn complete_chunked_upload(
        &self,
        Data(app): Data<&AppData>,
        Path(map_name): Path<String>,
        Path(session_id): Path<String>,
        TokenBearer(user_token): TokenBearer,
    ) -> Response<Map3DModel> {
        // Check superuser permission
        if !check_superuser_or_map_manager(&app, user_token.id).await {
            return response!(err "Forbidden", ErrorCode::Forbidden);
        }

        // Retrieve session from Redis
        let session = match Self::get_upload_session(&app.cache, &session_id).await {
            Ok(s) => s,
            Err(e) => return response!(err e, ErrorCode::NotFound),
        };

        // Verify user owns session
        if session.uploaded_by != user_token.id {
            return response!(err "Forbidden", ErrorCode::Forbidden);
        }

        // Verify map name matches
        if session.map_name != map_name {
            return response!(err "Map name mismatch", ErrorCode::BadRequest);
        }

        // Verify all chunks received
        if session.chunks_received.len() != session.total_chunks as usize {
            let msg = format!("Missing chunks: {}/{}", session.chunks_received.len(), session.total_chunks);
            return response!(err &msg, ErrorCode::BadRequest);
        }

        // Assemble chunks into final file
        let store_upload = std::env::var("STORE_UPLOAD").unwrap_or_else(|_| "./maps".to_string());
        let target_path = if app.map_storage.is_local() {
            match app.map_storage.local_path(&session.map_name, &session.res_type) {
                Some(path) => path.to_string_lossy().to_string(),
                None => {
                    tracing::error!("Local storage path is not configured");
                    return response!(err "Storage misconfigured", ErrorCode::InternalServerError);
                }
            }
        } else {
            format!("{}/.tmp/{}/assembled.glb", store_upload, session_id)
        };

        let final_path = match Self::assemble_chunks(&session, &store_upload, &target_path).await {
            Ok(path) => path,
            Err(e) => {
                tracing::error!("Chunk assembly failed: {}, error: {}", session_id, e);
                let _ = Self::cleanup_temp_directory(&session_id, &store_upload).await;
                return response!(err "Failed to assemble chunks", ErrorCode::InternalServerError);
            }
        };

        // Verify final file size
        match tokio::fs::metadata(&final_path).await {
            Ok(metadata) => {
                if metadata.len() != session.total_size {
                    tracing::error!("File size mismatch: expected {}, got {}", session.total_size, metadata.len());
                    let _ = tokio::fs::remove_file(&final_path).await;
                    let _ = Self::cleanup_temp_directory(&session_id, &store_upload).await;
                    return response!(err "File size mismatch", ErrorCode::InternalServerError);
                }
            }
            Err(e) => {
                tracing::error!("Failed to verify file: {}", e);
                let _ = Self::cleanup_temp_directory(&session_id, &store_upload).await;
                return response!(err "Failed to verify file", ErrorCode::InternalServerError);
            }
        }

        let file_size = session.total_size as i64;
        let link_path = match app.map_storage
            .store_file(&session.map_name, &session.res_type, std::path::Path::new(&final_path))
            .await
        {
            Ok(path) => path,
            Err(e) => {
                tracing::error!("Failed to store assembled file: {}", e);
                let _ = Self::cleanup_temp_directory(&session_id, &store_upload).await;
                return response!(err "Failed to store file", ErrorCode::InternalServerError);
            }
        };

        // Insert/update database
        let result = sqlx::query_as!(
            DbMap3DModel,
            r#"
            INSERT INTO website.map_3d_model (map_name, res_type, credit, link_path, uploaded_by, file_size)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (map_name, res_type)
            DO UPDATE SET
                credit = EXCLUDED.credit,
                link_path = EXCLUDED.link_path,
                uploaded_by = EXCLUDED.uploaded_by,
                file_size = EXCLUDED.file_size,
                updated_at = NOW()
            RETURNING *
            "#,
            session.map_name,
            session.res_type,
            session.credit,
            link_path,
            session.uploaded_by,
            file_size,
        )
        .fetch_one(&*app.pool)
        .await;

        // Cleanup temp directory
        let _ = Self::cleanup_temp_directory(&session_id, &store_upload).await;

        // Delete Redis session
        let _ = Self::delete_upload_session(&app.cache, &session_id).await;

        match result {
            Ok(model) => {
                tracing::info!("Upload completed: {}, final size: {}", session_id, file_size);

                // Get uploader name
                let uploader_name = sqlx::query_scalar!(
                    "SELECT persona_name FROM website.steam_user WHERE user_id = $1",
                    model.uploaded_by
                )
                .fetch_optional(&*app.pool)
                .await
                .ok()
                .flatten();

                let mut api_model: Map3DModel = model.into();
                api_model.link_path = app.map_storage.normalize_link_path(
                    &api_model.link_path,
                    &api_model.map_name,
                    &api_model.res_type,
                );
                api_model.uploader_name = uploader_name;
                response!(ok api_model)
            }
            Err(e) => {
                tracing::error!("Database error: {}", e);
                response!(err "Database error", ErrorCode::InternalServerError)
            }
        }
    }

    /// Cancel chunked upload
    #[oai(path = "/maps/:map_name/3d/upload/cancel/:session_id", method = "delete")]
    async fn cancel_chunked_upload(
        &self,
        Data(app): Data<&AppData>,
        Path(map_name): Path<String>,
        Path(session_id): Path<String>,
        TokenBearer(user_token): TokenBearer,
    ) -> Response<String> {
        // Check superuser permission
        if !check_superuser_or_map_manager(&app, user_token.id).await {
            return response!(err "Forbidden", ErrorCode::Forbidden);
        }

        // Retrieve session from Redis
        let session = match Self::get_upload_session(&app.cache, &session_id).await {
            Ok(s) => s,
            Err(_) => {
                // Session not found, try to cleanup anyway
                let store_upload = std::env::var("STORE_UPLOAD").unwrap_or_else(|_| "./maps".to_string());
                let _ = Self::cleanup_temp_directory(&session_id, &store_upload).await;
                return response!(ok "Upload cancelled".to_string());
            }
        };

        // Verify user owns session
        if session.uploaded_by != user_token.id {
            return response!(err "Forbidden", ErrorCode::Forbidden);
        }

        // Verify map name matches
        if session.map_name != map_name {
            return response!(err "Map name mismatch", ErrorCode::BadRequest);
        }

        tracing::warn!("Upload cancelled: {}, chunks: {}/{}", session_id, session.chunks_received.len(), session.total_chunks);

        // Cleanup temp directory
        let store_upload = std::env::var("STORE_UPLOAD").unwrap_or_else(|_| "./maps".to_string());
        let _ = Self::cleanup_temp_directory(&session_id, &store_upload).await;

        // Delete Redis session
        let _ = Self::delete_upload_session(&app.cache, &session_id).await;

        response!(ok "Upload cancelled".to_string())
    }

    // Helper functions for chunked upload

    async fn get_upload_session(
        cache: &FastCache,
        session_id: &str,
    ) -> Result<UploadSession, &'static str> {
        use redis::AsyncCommands;

        let session_key = format!("upload_session:{}", session_id);

        let mut conn = cache.redis_pool.get().await
            .map_err(|_| "Failed to get Redis connection")?;

        let session_json: String = conn.get(&session_key).await
            .map_err(|_| "Session not found or expired")?;

        serde_json::from_str(&session_json)
            .map_err(|_| "Failed to parse session")
    }

    async fn update_upload_session(
        cache: &FastCache,
        session: &UploadSession,
    ) -> Result<(), &'static str> {
        use redis::AsyncCommands;

        let session_key = format!("upload_session:{}", session.session_id);
        let session_json = serde_json::to_string(session)
            .map_err(|_| "Failed to serialize session")?;

        let mut conn = cache.redis_pool.get().await
            .map_err(|_| "Failed to get Redis connection")?;

        let _: redis::RedisResult<()> = conn.set_ex(&session_key, &session_json, 86400).await;
        Ok(())
    }

    async fn delete_upload_session(
        cache: &FastCache,
        session_id: &str,
    ) -> Result<(), ()> {
        use redis::AsyncCommands;

        let session_key = format!("upload_session:{}", session_id);

        if let Ok(mut conn) = cache.redis_pool.get().await {
            let _: redis::RedisResult<()> = conn.del(&session_key).await;
        }

        Ok(())
    }

    async fn assemble_chunks(
        session: &UploadSession,
        store_upload: &str,
        target_path: &str,
    ) -> Result<String, std::io::Error> {
        if let Some(parent) = std::path::Path::new(target_path).parent() {
            tokio::fs::create_dir_all(parent).await?;
        }

        let mut target_file = tokio::fs::File::create(&target_path).await?;

        // Assemble chunks sequentially
        for chunk_index in 0..session.total_chunks {
            let chunk_path = format!("{}/.tmp/{}/chunk_{}", store_upload, session.session_id, chunk_index);
            let mut chunk_file = tokio::fs::File::open(&chunk_path).await?;
            tokio::io::copy(&mut chunk_file, &mut target_file).await?;
        }

        Ok(target_path.to_string())
    }

    async fn cleanup_temp_directory(
        session_id: &str,
        store_upload: &str,
    ) -> Result<(), std::io::Error> {
        let temp_dir = format!("{}/.tmp/{}", store_upload, session_id);
        tokio::fs::remove_dir_all(&temp_dir).await
    }

    /// Delete a 3D model (superuser only)
    #[oai(path = "/maps/:map_name/3d/:res_type", method = "delete")]
    async fn delete_map_3d_model(
        &self,
        Data(app): Data<&AppData>,
        Path(map_name): Path<String>,
        Path(res_type): Path<String>,
        TokenBearer(user_token): TokenBearer,
    ) -> Response<String> {
        // Check superuser permission
        if !check_superuser_or_map_manager(&app, user_token.id).await {
            return response!(err "Forbidden", ErrorCode::Forbidden);
        }

        // Validate res_type
        if res_type != "low" && res_type != "high" {
            return response!(err "Invalid res_type", ErrorCode::BadRequest);
        }

        // Get model from database to find file path
        let model = sqlx::query_as!(
            DbMap3DModel,
            "SELECT * FROM website.map_3d_model WHERE map_name = $1 AND res_type = $2 ",
            map_name,
            res_type
        )
        .fetch_optional(&*app.pool)
        .await;

        let Ok(Some(_model)) = model else {
            return response!(err "Model not found", ErrorCode::NotFound);
        };

        // Delete file from storage
        if let Err(e) = app.map_storage.delete(&map_name, &res_type).await {
            tracing::warn!("Failed to delete model from storage: {}", e);
            // Continue with database deletion even if file deletion fails
        }

        // Delete from database
        let result = sqlx::query!(
            "DELETE FROM website.map_3d_model WHERE map_name = $1 AND res_type = $2",
            map_name,
            res_type
        )
        .execute(&*app.pool)
        .await;

        match result {
            Ok(_) => response!(ok "3D model deleted successfully".to_string()),
            Err(e) => {
                tracing::error!("Database error: {}", e);
                response!(internal_server_error)
            }
        }
    }
}

impl UriPatternExt for MapApi{
    fn get_all_patterns(&self) -> Vec<RoutePattern<'_>> {
        vec![
            "/servers/{server_id}/maps/{map_name}/images",
            "/servers/{server_id}/maps/autocomplete",
            "/servers/{server_id}/match-now",
            "/servers/{server_id}/maps/last/sessions",
            "/servers/{server_id}/maps/all/sessions",
            "/servers/{server_id}/maps/{map_name}/analyze",
            "/servers/{server_id}/maps/{map_name}/info",
            "/servers/{server_id}/maps/{map_name}/sessions",
            "/servers/{server_id}/maps/{map_name}/events",
            "/servers/{server_id}/maps/{map_name}/heat-regions",
            "/servers/{server_id}/maps/{map_name}/regions",
            "/servers/{server_id}/maps/{map_name}/sessions_distribution",
            "/servers/{server_id}/maps/{map_name}/top_players",
            "/servers/{server_id}/maps/{map_name}/player_types",
            "/servers/{server_id}/maps/{map_name}/musics",
            "/servers/{server_id}/sessions/{session_id}/players",
            "/servers/{server_id}/sessions/{session_id}/info",
            "/servers/{server_id}/sessions/{session_id}/match",
            "/servers/{server_id}/sessions/{session_id}/all-match",
            "/servers/{server_id}/sessions/{session_id}/continents",
            "/maps/{map_name}/guides",
            "/maps/{map_name}/guides/slugs/{guide_slug}",
            "/maps/{map_name}/guides/{guide_id}",
            "/maps/{map_name}/guides/{guide_id}/vote",
            "/maps/{map_name}/guides/{guide_id}/report",
            "/maps/{map_name}/guides/{guide_id}/comments",
            "/maps/{map_name}/guides/{guide_id}/comments/{comment_id}",
            "/maps/{map_name}/guides/{guide_id}/comments/{comment_id}/vote",
            "/music/{music_id}/report",
            "/servers/{server_id}/maps",
            "/maps/all/3d",
            "/maps/{map_name}/3d",
            "/maps/{map_name}/3d/upload",
            "/maps/{map_name}/3d/{res_type}",
            "/servers/{server_id}/maps/3d",
        ].iter_into()
    }
}
