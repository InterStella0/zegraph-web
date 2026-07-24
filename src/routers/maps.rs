use std::fmt::{Display, Formatter};
use poem::http::StatusCode;
use poem::web::{Data, Json};
use poem_openapi::{Enum, OpenApi};
use poem_openapi::param::{Path, Query};
use poem_openapi::types::{ParseFromJSON, ToJSON};
use serde::{Deserialize, Serialize};
use sqlx::{Pool, Postgres};
use crate::{response, AppData, FastCache};
use crate::api_models::admins::*;
use crate::api_models::common::*;
use crate::api_models::maps::*;
use crate::api_models::misc::*;
use crate::api_models::players::*;
use crate::api_models::radars::*;
use crate::api_models::servers::*;
use crate::core::utils::*;
use crate::models::admins::*;
use crate::models::maps::*;
use crate::models::servers::*;
use crate::models::players::*;
use crate::models::radars::*;
use crate::workers::*;
use crate::routers::ApiTags;

/// Ranking metric for `last/sessions` map listings.
#[derive(Enum)]
enum MapLastSessionMode{
    LastPlayed,
    HighestHour,
    FrequentlyPlayed,
    HighestCumHour,
    UniquePlayers,
}
/// Filter applied when listing a server's maps.
#[derive(Enum)]
enum MapFilterMode{
    Casual,
    TryHard,
    Available,
    Favorite,
    HasLaser
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

fn handle_worker_map_result<T>(result: WorkResult<T>) -> Response<T>
    where T: ParseFromJSON + ToJSON + Send + Sync{
    handle_worker_result(result, "No map found")
}

pub struct MapApi;

#[OpenApi(tag = "ApiTags::Maps")]
impl MapApi{
    /// List every map ever played on a server.
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
    /// Search a server's maps by name, for autocomplete. Up to 20 substring matches.
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
    /// Mark a map as a favorite for the signed-in user, on a server.
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
    /// Remove a map from the signed-in user's favorites, on a server.
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
    /// Paginated, filterable, sortable list of a server's played maps.
    ///
    /// `sorted_by` picks the ranking metric (last played, total/cumulative hours, session
    /// count, or unique players); `filter` narrows to `Casual`/`TryHard`/`Available`/
    /// `Favorite`/`HasLaser`; `search_map` filters by name substring. Pages are 25 maps each.
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
    /// Paginated list of every individual map-play session on a server, newest first.
    ///
    /// Pages are 10 sessions each.
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
    /// Music tracks associated with a map, including which other maps share each track.
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

    /// Detailed metadata for a single map on a server. Backed by `MapWorker`'s cache.
    #[oai(path = "/servers/:server_id/maps/:map_name/info", method = "get")]
    async fn get_maps_info(
        &self, Data(app): Data<&AppData>, extract: MapExtractor
    ) -> Response<MapInfo>{
        let context = MapContext::from(extract);

        handle_worker_map_result(app.map_worker.get_detail(&context).await)
    }

    /// Time breakdown by player type (e.g. casual vs tryhard) for a map. Backed by
    /// `MapWorker`'s cache.
    #[oai(path = "/servers/:server_id/maps/:map_name/player_types", method = "get")]
    async fn get_map_player_type(
        &self, Data(app): Data<&AppData>, extract: MapExtractor
    ) -> Response<Vec<MapPlayerTypeTime>>{
        let context = MapContext::from(extract);

        handle_worker_map_result(app.map_worker.get_player_types(&context).await)
    }

    /// Performance metrics for a map: dropoff rate, average session length and similar. Backed
    /// by `MapWorker`'s cache.
    #[oai(path = "/servers/:server_id/maps/:map_name/analyze", method = "get")]
    async fn get_maps_highlight(
        &self, Data(app): Data<&AppData>, extract: MapExtractor
    ) -> Response<MapAnalyze>{
        let context = MapContext::from(extract);
        handle_worker_map_result(app.map_worker.get_statistics(&context).await)
    }
    /// Paginated list of a single map's play sessions on a server, newest first.
    ///
    /// Pages are 5 sessions each.
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
    /// Details of a single map-play session by its ID. Cached for 60 seconds.
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
    /// Players (and their playtime during it) for a single map-play session, ranked by time.
    ///
    /// Anonymized players are handled per the requester's identity. Cached briefly while the
    /// map is still being played, for a day once it has ended.
    #[oai(path="/servers/:server_id/sessions/:session_id/players", method="get")]
    async fn get_map_player_session(
        &self, Data(app): Data<&AppData>, ServerExtractor(server): ServerExtractor, Path(session_id): Path<i64>,
        OptionalTokenBearer(user_token): OptionalTokenBearer,
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
                        AND (p.right_now - last_verified) < INTERVAL '20 minutes'
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
                    0::int AS rank,
                    COALESCE((SELECT is_anonymous FROM server_player_names spn WHERE spn.server_id = $1 AND spn.player_id = p.player_id), FALSE) AS \"is_anonymous!\"
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
        let anonymizer = BriefAnonymizer::new(app, &server.server_id, user_token.as_ref().map(|t| t.id)).await;
        anonymizer.apply(&mut players);
        response!(ok players)
    }
    /// Geographic (continent-level) player distribution during a single map-play session.
    /// Cached for 60 seconds.
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

    /// The server's currently active map session and its live match (round) state, if any.
    /// Cached for 60 seconds.
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
    /// Every match (round) that occurred during a single map-play session, in order. Cached for
    /// 2 minutes.
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
    /// The most recent match (round) result during a single map-play session, if any. Cached
    /// for 12 minutes.
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
    /// The map image best matching this map's name, for the server's game type.
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
    /// Average counts of tracked in-game events for a map. Backed by `MapWorker`'s cache.
    #[oai(path="/servers/:server_id/maps/:map_name/events", method="get")]
    async fn get_event_counts(
        &self, Data(app): Data<&AppData>, extract: MapExtractor
    ) -> Response<Vec<MapEventAverage>>{
        let context = MapContext::from(extract);
        handle_worker_map_result(app.map_worker.get_events(&context).await)
    }
    /// Per-day geographic heat map data for a map's player activity. Backed by `MapWorker`'s
    /// cache.
    #[oai(path="/servers/:server_id/maps/:map_name/heat-regions", method="get")]
    async fn get_heat_regions(
        &self, Data(app): Data<&AppData>, extract: MapExtractor
    ) -> Response<Vec<DailyMapRegion>> {
        let context = MapContext::from(extract);
        handle_worker_map_result(app.map_worker.get_heat_regions(&context).await)
    }
    /// Geographic region breakdown for a map's players. Backed by `MapWorker`'s cache.
    #[oai(path="/servers/:server_id/maps/:map_name/regions", method="get")]
    async fn get_map_regions(
        &self, Data(app): Data<&AppData>, extract: MapExtractor
    ) -> Response<Vec<MapRegion>>{
        let context = MapContext::from(extract);
        handle_worker_map_result(app.map_worker.get_regions(&context).await)
    }
    /// Distribution of session lengths for a map (how long players typically stay). Backed by
    /// `MapWorker`'s cache.
    #[oai(path="/servers/:server_id/maps/:map_name/sessions_distribution", method="get")]
    async fn get_map_sessions_distribution(
        &self, Data(app): Data<&AppData>, extract: MapExtractor
    ) -> Response<Vec<MapSessionDistribution>>{
        let context = MapContext::from(extract);
        handle_worker_map_result(app.map_worker.get_session_distributions(&context).await)
    }
    /// Top players on a map, ranked by playtime, with optional name search.
    ///
    /// `player_name` (minimum 2 characters) filters to matching players; pages are 10 players
    /// each.
    #[oai(path="/servers/:server_id/maps/:map_name/top_players", method="get")]
    async fn get_map_players(
        &self, Data(app): Data<&AppData>, extract: MapExtractor,
        Query(page): Query<Option<usize>>, Query(player_name): Query<Option<String>>,
        OptionalTokenBearer(user_token): OptionalTokenBearer,
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
                        (lp.ended_at - lp.started_at) AS \"last_played_duration?\",
                        COALESCE((SELECT is_anonymous FROM server_player_names spn WHERE spn.server_id = $1 AND spn.player_id = p.player_id), FALSE) AS \"is_anonymous!\"
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
                          AND CURRENT_TIMESTAMP - s.last_verified < INTERVAL '20 minutes'
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
                        (lp.ended_at - lp.started_at) AS \"last_played_duration?\",
                        COALESCE((SELECT is_anonymous FROM server_player_names spn WHERE spn.server_id = $1 AND spn.player_id = p.player_id), FALSE) AS \"is_anonymous!\"
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
                          AND (CURRENT_TIMESTAMP - s.last_verified) < INTERVAL '20 minutes'
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
        let anonymizer = BriefAnonymizer::new(app, &server_id, user_token.as_ref().map(|t| t.id)).await;
        if player_name.is_some() {
            // Name search: an anonymized player must not be discoverable by typing their name.
            anonymizer.retain_visible(&mut players);
        } else {
            anonymizer.apply(&mut players);
        }
        let value = BriefPlayers {
            total_players: total_player_count,
            players
        };
        response!(ok value)
    }

    /// Report a map music track as unavailable or mismatched, optionally suggesting a
    /// replacement YouTube URL.
    ///
    /// `reason` must be `video_unavailable` or `wrong_video`. Only one pending report per track
    /// is allowed at a time.
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

    /// List maps played on a server that have a low-res and/or high-res 3D model uploaded.
    #[oai(path = "/servers/:server_id/maps/3d", method = "get", tag = "ApiTags::Models3D")]
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

    /// List every map with a low-res and/or high-res 3D model uploaded, across all servers.
    #[oai(path = "/maps/all/3d", method = "get", tag = "ApiTags::Models3D")]
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

    /// Get a map's low-res and/or high-res 3D model, if uploaded.
    #[oai(path = "/maps/:map_name/3d", method = "get", tag = "ApiTags::Models3D")]
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

    /// Upload a map 3D model in one request (max 500MB).
    ///
    /// Requires the `superuser` or `map_manager` role. Multipart form with `file`, `res_type`
    /// (`low`/`high`) and optional `credit`. Replaces any existing model of the same resolution
    /// for that map. For larger files, use the chunked upload endpoints instead.
    #[oai(path = "/maps/:map_name/3d/upload", method = "post", tag = "ApiTags::Models3D")]
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
        let mut res_type: Option<ResType> = None;
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
                        res_type = ResType::parse(&text);
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
            .store_bytes(&map_name, res_type_val.as_str(), &file_bytes)
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
            res_type_val.as_str(),
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

    /// Start a chunked upload session for a large map 3D model.
    ///
    /// Requires the `superuser` or `map_manager` role. Body must include `res_type`
    /// (`low`/`high`) and `file_size`; returns a `session_id` to upload chunks against, then
    /// finish with `upload/complete`.
    #[oai(path = "/maps/:map_name/3d/upload/initiate", method = "post", tag = "ApiTags::Models3D")]
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
        let res_type = match req.get("res_type").and_then(|v| v.as_str()).and_then(ResType::parse) {
            Some(rt) => rt,
            None => return response!(err "Invalid res_type. Must be 'low' or 'high'", ErrorCode::BadRequest),
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
            res_type: res_type.as_str().to_string(),
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

    /// Upload a single chunk of a chunked map 3D model upload.
    ///
    /// Requires the `superuser` or `map_manager` role and ownership of the upload session.
    /// Multipart form with `chunk_index` and `chunk_data`. Re-uploading an already-received
    /// chunk is a no-op.
    #[oai(path = "/maps/:map_name/3d/upload/chunk/:session_id", method = "post", tag = "ApiTags::Models3D")]
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

    /// Finish a chunked map 3D model upload once every chunk has arrived.
    ///
    /// Requires the `superuser` or `map_manager` role and ownership of the upload session.
    /// Assembles the chunks, verifies the resulting file size, stores it, and upserts the model
    /// row (replacing any existing model of the same resolution for that map). Cleans up the
    /// session and temp files either way.
    #[oai(path = "/maps/:map_name/3d/upload/complete/:session_id", method = "post", tag = "ApiTags::Models3D")]
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

    /// Cancel an in-progress chunked map 3D model upload.
    ///
    /// Requires the `superuser` or `map_manager` role and ownership of the upload session.
    /// Deletes any received chunks and the session; safe to call even if the session already
    /// expired.
    #[oai(path = "/maps/:map_name/3d/upload/cancel/:session_id", method = "delete", tag = "ApiTags::Models3D")]
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

    /// Delete a map's 3D model (and its stored file) for one resolution.
    ///
    /// Requires the `superuser` or `map_manager` role. `res_type` must be `low` or `high`.
    #[oai(path = "/maps/:map_name/3d/:res_type", method = "delete", tag = "ApiTags::Models3D")]
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
    fn get_all_patterns(&self) -> Vec<RoutePattern> {
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
            "/music/{music_id}/report",
            "/servers/{server_id}/maps",
            "/servers/{server_id}/maps/set-favorite",
            "/servers/{server_id}/maps/{map_name}/unset-favorite",
            "/maps/all/3d",
            "/maps/{map_name}/3d",
            "/maps/{map_name}/3d/upload",
            "/maps/{map_name}/3d/upload/initiate",
            "/maps/{map_name}/3d/upload/chunk/{session_id}",
            "/maps/{map_name}/3d/upload/complete/{session_id}",
            "/maps/{map_name}/3d/upload/cancel/{session_id}",
            "/maps/{map_name}/3d/{res_type}",
            "/servers/{server_id}/maps/3d",
        ].iter_into()
    }
}
