use std::collections::HashMap;
use std::fmt::{Display, Formatter};
use poem::http::StatusCode;
use poem::web::{Data, Json};
use poem_openapi::{Enum, OpenApi};
use poem_openapi::param::{Path, Query};
use poem_openapi::types::{ParseFromJSON, ToJSON};
use serde::{Deserialize, Serialize};
use sqlx::{Pool, Postgres};
use crate::{or_ise, require, response, AppData, FastCache};
use crate::api_models::admins::*;
use crate::api_models::common::*;
use crate::api_models::maps::*;
use crate::api_models::misc::*;
use crate::api_models::players::*;
use crate::api_models::radars::*;
use crate::api_models::servers::*;
use crate::core::period::{flatten_period, group_periods, DbPeriodMonth, PeriodParam, PeriodYear};
use crate::core::chunked_upload;
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
/// Filter applied when listing maps across every server.
#[derive(Enum)]
enum GlobalMapFilterMode{
    Casual,
    TryHard,
    HasLaser,
    /// Currently being played on at least one server.
    Playing,
    Favorite,
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
impl Display for GlobalMapFilterMode {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            GlobalMapFilterMode::Casual => write!(f, "casual"),
            GlobalMapFilterMode::TryHard => write!(f, "tryhard"),
            GlobalMapFilterMode::HasLaser => write!(f, "has_laser"),
            GlobalMapFilterMode::Playing => write!(f, "playing"),
            GlobalMapFilterMode::Favorite => write!(f, "favorite"),
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
    cached_response(&key, cache, 6 * HOUR, func).await.and_then(|s| Ok(s.result)).ok()
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

fn handle_worker_map_result<T>(result: WorkResult<T>) -> Response<T>
    where T: ParseFromJSON + ToJSON + Send + Sync{
    handle_worker_result(result, "No map found")
}

const GLOBAL_MAPS_PAGE_SIZE: i64 = 25;
/// Highest `page` served. About 1.5k maps is roughly 60 pages, so this only rejects nonsense.
const GLOBAL_MAPS_MAX_PAGE: usize = 1_000;
/// Pages past this are computed live instead of cached, so arbitrary `page` values can't flood the
/// cache with keys.
const GLOBAL_MAPS_CACHED_PAGES: usize = 100;
/// Shortest search the global autocomplete answers; shorter ones would scan every map name.
const GLOBAL_MAPS_MIN_AUTOCOMPLETE: usize = 2;

/// Escapes `\`, `%` and `_` so a user's term matches literally inside `ILIKE '%' || $n || '%'`.
fn escape_like(term: &str) -> String {
    term.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_")
}

async fn global_map_exists(pool: &Pool<Postgres>, map_name: &str) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT EXISTS(SELECT 1 FROM server_map WHERE map = $1) AS "exists!""#, map_name
    ).fetch_one(pool).await
}

/// One page of maps grouped by name across servers, plus the per-server rows of those maps.
/// `user_id` is only read by the `favorite` filter, so pages without it are viewer-independent.
/// `exact` limits the page to that one map name, for the global map detail.
pub(crate) async fn global_map_page(
    pool: &Pool<Postgres>, game: Option<&str>, search: &str, filter: &str, sorted_by: &str,
    user_id: Option<i64>, offset: i64, exact: Option<&str>,
) -> Result<DbGlobalMapPage, sqlx::Error> {
    let maps = sqlx::query_as!(DbGlobalMapRow, r#"
        WITH open_sessions AS (
            SELECT s.server_id, cur.map
            FROM server s
            CROSS JOIN LATERAL (
                SELECT map
                FROM server_map_played
                WHERE server_id = s.server_id
                  AND ended_at IS NULL
                ORDER BY started_at DESC
                LIMIT 1
            ) cur
        ),
        per_server AS (
            SELECT
                sm.map,
                COALESCE(sm.is_tryhard, mam.is_tryhard, false) AS is_tryhard,
                COALESCE(sm.is_casual, mam.is_casual, false) AS is_casual,
                COALESCE(mam.has_lasers, false) AS has_lasers,
                sm.no_noms,
                mp.total_playtime,
                mp.total_sessions,
                mp.cum_player_hours,
                mp.last_played,
                (os.server_id IS NOT NULL) AS is_playing
            FROM server_map sm
            JOIN website.map_analyze mp
                ON mp.server_id = sm.server_id AND mp.map = sm.map
            LEFT JOIN server_metadata smd ON smd.server_id = sm.server_id
            LEFT JOIN map_metadata mam ON mam.name = sm.map
            LEFT JOIN open_sessions os
                ON os.server_id = sm.server_id AND os.map = sm.map
            WHERE ($1::TEXT IS NULL OR COALESCE(smd.game, '730_cs2') = $1)
              AND ($8::TEXT IS NULL OR sm.map = $8)
        ),
        maps AS (
            SELECT
                map,
                BOOL_OR(is_tryhard) AS is_tryhard,
                BOOL_OR(is_casual) AS is_casual,
                BOOL_OR(has_lasers) AS has_lasers,
                BOOL_AND(no_noms) AS no_noms,
                SUM(total_playtime) AS total_playtime,
                SUM(total_sessions)::INT AS total_sessions,
                SUM(cum_player_hours) AS cum_player_hours,
                MAX(last_played) AS last_played,
                BOOL_OR(is_playing) AS is_playing
            FROM per_server
            GROUP BY map
        )
        SELECT
            COUNT(*) OVER() AS "total_maps?",
            m.map AS "map!",
            m.is_tryhard AS "is_tryhard?",
            m.is_casual AS "is_casual?",
            m.has_lasers AS "has_lasers?",
            m.no_noms AS "no_noms?",
            m.total_playtime AS "total_time?",
            m.total_sessions AS "total_sessions?",
            m.cum_player_hours AS "cum_player_hours?",
            COALESCE(gma.unique_players, 0) AS "unique_players?",
            m.last_played AS "last_played?",
            m.is_playing AS "is_playing?"
        FROM maps m
        LEFT JOIN website.global_map_analyze gma ON gma.map = m.map
        WHERE ($2 = '' OR m.map ILIKE '%' || $2 || '%')
            AND CASE
                    WHEN $3 = 'all' THEN TRUE
                    WHEN $3 = 'casual' THEN m.is_casual
                    WHEN $3 = 'tryhard' THEN m.is_tryhard
                    WHEN $3 = 'has_laser' THEN m.has_lasers
                    WHEN $3 = 'playing' THEN m.is_playing
                    WHEN $3 = 'favorite' AND $4::BIGINT IS NOT NULL THEN EXISTS (
                        SELECT 1
                        FROM website.user_favorite_global_maps ufg
                        WHERE ufg.user_id = $4 AND ufg.map = m.map
                    )
                    ELSE FALSE
                END
        ORDER BY
            CASE WHEN $5 = 'last_played' THEN m.is_playing END DESC NULLS LAST,
            CASE WHEN $5 = 'last_played' THEN m.last_played END DESC NULLS LAST,
            CASE WHEN $5 = 'highest_hour' THEN m.total_playtime END DESC NULLS LAST,
            CASE WHEN $5 = 'frequently_played' THEN m.total_sessions END DESC NULLS LAST,
            CASE WHEN $5 = 'highest_cum_hour' THEN m.cum_player_hours END DESC NULLS LAST,
            CASE WHEN $5 = 'unique_players' THEN COALESCE(gma.unique_players, 0) END DESC NULLS LAST,
            m.last_played DESC NULLS LAST,
            m.map
        LIMIT $6
        OFFSET $7
    "#, game, search, filter, user_id, sorted_by, GLOBAL_MAPS_PAGE_SIZE, offset, exact)
        .fetch_all(pool)
        .await?;

    let total_maps = maps.first().and_then(|m| m.total_maps).unwrap_or_default();
    if maps.is_empty() {
        return Ok(DbGlobalMapPage { total_maps, maps, servers: vec![] });
    }

    let names: Vec<String> = maps.iter().map(|m| m.map.clone()).collect();
    let servers = sqlx::query_as!(DbGlobalMapServerRow, r#"
        WITH open_sessions AS (
            SELECT s.server_id, cur.map
            FROM server s
            CROSS JOIN LATERAL (
                SELECT map
                FROM server_map_played
                WHERE server_id = s.server_id
                  AND ended_at IS NULL
                ORDER BY started_at DESC
                LIMIT 1
            ) cur
        )
        SELECT
            sm.map AS "map!",
            sm.server_id AS "server_id!",
            COALESCE(smd.game, '730_cs2') AS "game!",
            sm.enabled AS "enabled!",
            sm.removed AS "removed!",
            sm.current_cooldown AS "cooldown?",
            sm.map_left AS "map_left?",
            sm.min_players AS "min_players?",
            (os.server_id IS NOT NULL) AS "is_playing!",
            mp.last_played AS "last_played!",
            mp.total_playtime AS "total_playtime!",
            mp.total_sessions AS "total_sessions!",
            mp.cum_player_hours AS "cum_player_hours!"
        FROM server_map sm
        JOIN website.map_analyze mp
            ON mp.server_id = sm.server_id AND mp.map = sm.map
        LEFT JOIN server_metadata smd ON smd.server_id = sm.server_id
        LEFT JOIN open_sessions os
            ON os.server_id = sm.server_id AND os.map = sm.map
        WHERE sm.map = ANY($1)
          AND ($2::TEXT IS NULL OR COALESCE(smd.game, '730_cs2') = $2)
        ORDER BY sm.map, mp.cum_player_hours DESC
    "#, &names[..], game)
        .fetch_all(pool)
        .await?;

    Ok(DbGlobalMapPage { total_maps, maps, servers })
}

/// Turns grouped map rows and their per-server rows into API maps: per-server state, games in
/// order of player-hours, a thumbnail and, for a signed-in viewer, whether they favorited it.
pub(crate) async fn assemble_global_maps(
    data: &AppData, maps: Vec<DbGlobalMapRow>, servers: Vec<DbGlobalMapServerRow>, user_id: Option<i64>,
) -> Vec<GlobalMapPlayed> {
    let names: Vec<String> = maps.iter().map(|m| m.map.clone()).collect();
    // A failed favorites lookup leaves `is_favorite` unknown rather than failing the whole page.
    let favorites: Option<Vec<String>> = match user_id {
        Some(_) if names.is_empty() => Some(vec![]),
        Some(user_id) => sqlx::query_scalar!("
            SELECT map
            FROM website.user_favorite_global_maps
            WHERE user_id = $1 AND map = ANY($2)
        ", user_id, &names[..]).fetch_all(&*data.pool).await
            .inspect_err(|e| tracing::warn!("Couldn't load global map favorites: {e}"))
            .ok(),
        None => None,
    };

    let mut servers_by_map: HashMap<String, Vec<DbGlobalMapServerRow>> = HashMap::new();
    for server in servers {
        servers_by_map.entry(server.map.clone()).or_default().push(server);
    }

    let images = get_map_images(&data.cache).await;
    let mut names_by_game: HashMap<String, Vec<String>> = HashMap::new();
    for image in &images {
        names_by_game.entry(image.game_type.clone()).or_default().push(image.map_name.clone());
    }

    let mut result = Vec::with_capacity(maps.len());
    for row in maps {
        let map_servers = servers_by_map.remove(&row.map).unwrap_or_default();
        let mut games: Vec<String> = vec![];
        for server in &map_servers {
            if !games.contains(&server.game) {
                games.push(server.game.clone());
            }
        }
        let image = global_map_image(&row.map, &games, &images, &names_by_game);
        let mut map: GlobalMapPlayed = row.into();
        map.is_favorite = favorites.as_ref().map(|favorites| favorites.contains(&map.map));
        map.games = games;
        map.servers = map_servers.iter_into();
        map.image = image;
        result.push(map);
    }
    result
}

/// Music tracks associated with a map, including which other maps share each track. Tracks are
/// tied to the map name, so this is the same on every server.
pub(crate) async fn map_musics(pool: &Pool<Postgres>, map_name: &str) -> Result<Vec<DbAssociatedMapMusic>, sqlx::Error> {
    sqlx::query_as!(DbAssociatedMapMusic,
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
        map_name)
        .fetch_all(pool)
        .await
}

/// Thumbnail for a map name, trying each game in order (most played first).
fn global_map_image(
    map: &str, games: &[String], images: &[MapImage], names_by_game: &HashMap<String, Vec<String>>,
) -> Option<MapImage> {
    games.iter().find_map(|game| {
        let names = names_by_game.get(game)?;
        let image_name = get_map_image(map, names)?;
        images.iter().find(|e| e.game_type == *game && e.map_name == image_name).cloned()
    })
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
    #[oai(path = "/servers/:server_id/maps/autocomplete", method = "get", operation_id = "search_maps", tag = "ApiTags::Mcp")]
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
    #[oai(path = "/servers/:server_id/maps/last/sessions", method = "get", operation_id = "list_maps", tag = "ApiTags::Mcp")]
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
        let rows = or_ise!(sqlx::query_as!(DbServerMap,
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
                smp.started_at as \"last_played?\",
                smp.ended_at as last_played_ended,
                smp.time_id as \"last_session_id?\"
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
            .await, e => "Error last session map: {e}");

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
    /// Paginated, filterable, sortable list of played maps across every community.
    ///
    /// Maps are grouped by name. `sorted_by` picks the ranking metric; `filter` narrows to
    /// `Casual`/`TryHard`/`HasLaser`/`Playing`/`Favorite`; `game` limits to servers of one game
    /// (`730_cs2`, `240`, `730_csgo`); `search_map` filters by name substring. Each map lists the
    /// servers that have it. Pages are 25 maps each, `page` at most 1000; the first 100 pages are
    /// cached for 60 seconds unless searching or filtering by favorites.
    #[oai(path = "/maps", method = "get", operation_id = "list_maps_global", tag = "ApiTags::Mcp")]
    async fn get_global_maps(
        &self, Data(data): Data<&AppData>, Query(page): Query<usize>,
        Query(sorted_by): Query<MapLastSessionMode>, Query(search_map): Query<Option<String>>,
        Query(filter): Query<Option<GlobalMapFilterMode>>, Query(game): Query<Option<String>>,
        OptionalTokenBearer(user): OptionalTokenBearer,
    ) -> Response<GlobalMapPaginated> {
        let pool = &*data.pool;
        let game = game.filter(|g| !g.is_empty());
        require!(
            game.as_deref().is_none_or(|g| GAME_TYPES.contains(&g)),
            "Unknown game", ErrorCode::BadRequest
        );
        require!(page <= GLOBAL_MAPS_MAX_PAGE, "page is out of range", ErrorCode::BadRequest);
        let search = search_map.map(|s| escape_like(s.trim())).unwrap_or_default();
        let filtering = filter.map(|e| e.to_string()).unwrap_or("all".into());
        let sorting = sorted_by.to_string();
        let user_id = user.map(|e| e.id);
        let offset = page as i64 * GLOBAL_MAPS_PAGE_SIZE;

        let cacheable = search.is_empty() && filtering != "favorite" && page < GLOBAL_MAPS_CACHED_PAGES;
        let DbGlobalMapPage { total_maps, maps, servers } = if cacheable {
            let key = format!("global-maps-v2:{sorting}:{filtering}:{}:{page}", game.as_deref().unwrap_or("all"));
            let func = || global_map_page(pool, game.as_deref(), &search, &filtering, &sorting, None, offset, None);
            or_ise!(cached_response(&key, &data.cache, 60, func).await, e => "Error global maps: {e}").result
        } else {
            or_ise!(
                global_map_page(pool, game.as_deref(), &search, &filtering, &sorting, user_id, offset, None).await,
                e => "Error global maps: {e}"
            )
        };

        let result = assemble_global_maps(data, maps, servers, user_id).await;
        response!(ok GlobalMapPaginated { total_maps: total_maps as i32, maps: result })
    }
    /// Search played maps across every server by name, for autocomplete. Up to 20 substring matches;
    /// terms shorter than 2 characters return nothing.
    #[oai(path = "/maps/autocomplete", method = "get")]
    async fn get_global_maps_autocomplete(
        &self, Data(data): Data<&AppData>, Query(map): Query<String>
    ) -> Response<Vec<GlobalMapName>>{
        let map = map.trim();
        if map.chars().count() < GLOBAL_MAPS_MIN_AUTOCOMPLETE {
            return response!(ok vec![])
        }
        let pattern = escape_like(map);
        let Ok(result) = sqlx::query_scalar!(r#"
            SELECT m.map AS "map!"
            FROM (SELECT DISTINCT map FROM website.map_analyze) m
            WHERE m.map ILIKE '%' || $1 || '%'
            ORDER BY NULLIF(STRPOS(LOWER(m.map), LOWER($2)), 0) ASC NULLS LAST, m.map
            LIMIT 20
        "#, pattern, map).fetch_all(&*data.pool).await else {
            return response!(ok vec![])
        };
        response!(ok result.into_iter().map(|map| GlobalMapName { map }).collect())
    }
    /// Mark a map as a favorite for the signed-in user, across every server.
    #[oai(path = "/maps/:map_name/set-favorite", method = "post")]
    async fn set_user_global_map_favorite(
        &self, Data(data): Data<&AppData>, Path(map_name): Path<String>,
        TokenBearer(user_token): TokenBearer
    ) -> Response<GlobalMapName>{
        let pool = &*data.pool;
        require!(or_ise!(global_map_exists(pool, &map_name).await), "Map not found", ErrorCode::NotFound);

        let Ok(_) = sqlx::query!("
            INSERT INTO website.user_favorite_global_maps(user_id, map)
            VALUES ($1, $2)
            ON CONFLICT(user_id, map) DO NOTHING
        ", user_token.id, map_name)
            .execute(pool).await else {
            return response!(err "Something went wrong :/", ErrorCode::InternalServerError)
        };

        response!(ok GlobalMapName { map: map_name })
    }
    /// Remove a map from the signed-in user's global favorites.
    #[oai(path = "/maps/:map_name/unset-favorite", method = "post")]
    async fn unset_user_global_map_favorite(
        &self, Data(data): Data<&AppData>, Path(map_name): Path<String>,
        TokenBearer(user_token): TokenBearer
    ) -> Response<GlobalMapName>{
        let pool = &*data.pool;
        require!(or_ise!(global_map_exists(pool, &map_name).await), "Map not found", ErrorCode::NotFound);

        let Ok(_) = sqlx::query!("
            DELETE FROM website.user_favorite_global_maps
            WHERE user_id = $1 AND map = $2
        ", user_token.id, map_name)
            .execute(pool).await else {
            return response!(err "Something went wrong :/", ErrorCode::InternalServerError)
        };

        response!(ok GlobalMapName { map: map_name })
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
        let rows = or_ise!(sqlx::query_as!(DbServerMapPlayed,
			"SELECT *, COUNT(*) OVER()::integer total_sessions
             FROM server_map_played
             WHERE server_id=$1
             ORDER BY started_at DESC
             LIMIT $3
             OFFSET $2",
				server.server_id, offset, pagination)
            .fetch_all(pool)
            .await);

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
        let rows = or_ise!(map_musics(&data.pool, &extract.map.map).await);
        response!(ok rows.iter_into())
    }

    /// Detailed metadata for a single map on a server. Backed by `MapWorker`'s cache.
    #[oai(path = "/servers/:server_id/maps/:map_name/info", method = "get", operation_id = "get_map_info", tag = "ApiTags::Mcp")]
    async fn get_maps_info(
        &self, Data(app): Data<&AppData>, extract: MapExtractor
    ) -> Response<MapInfo>{
        let context = MapContext::from(extract);

        handle_worker_map_result(app.map_worker.get_detail(&context).await)
    }

    /// Time breakdown by player type (e.g. casual vs tryhard) for a map. Backed by
    /// `MapWorker`'s cache.
    ///
    /// `period` narrows the figures to the map sessions that started in one UTC calendar year
    /// (`YYYY`), month (`YYYY-MM`) or inclusive range of days (`YYYY-MM-DD..YYYY-MM-DD`); `all` or
    /// no value is all-time. A period is calculated on request and only cached, so its first
    /// request may report that it is still calculating.
    #[oai(path = "/servers/:server_id/maps/:map_name/player_types", method = "get", operation_id = "get_map_player_types", tag = "ApiTags::Mcp")]
    async fn get_map_player_type(
        &self, Data(app): Data<&AppData>, Query(period): Query<Option<PeriodParam>>, extract: MapExtractor
    ) -> Response<Vec<MapPlayerTypeTime>>{
        let context = MapContext::from(extract);

        handle_worker_map_result(app.map_worker.get_player_types(&context, flatten_period(period)).await)
    }

    /// Performance metrics for a map: dropoff rate, average session length and similar. Backed
    /// by `MapWorker`'s cache.
    ///
    /// With a `period` (`YYYY`, `YYYY-MM` or an inclusive `YYYY-MM-DD..YYYY-MM-DD` range, UTC)
    /// every figure covers only the completed map sessions that started in that year, month or
    /// range. A period is calculated on request and only cached, with no stored fallback, so its
    /// first request reports still calculating.
    #[oai(path = "/servers/:server_id/maps/:map_name/analyze", method = "get", operation_id = "get_map_analysis", tag = "ApiTags::Mcp")]
    async fn get_maps_highlight(
        &self, Data(app): Data<&AppData>, Query(period): Query<Option<PeriodParam>>, extract: MapExtractor
    ) -> Response<MapAnalyze>{
        let context = MapContext::from(extract);
        handle_worker_map_result(app.map_worker.get_statistics(&context, flatten_period(period)).await)
    }
    /// Paginated list of a single map's play sessions on a server, newest first.
    ///
    /// With a `period` (`YYYY`, `YYYY-MM` or an inclusive `YYYY-MM-DD..YYYY-MM-DD` range, UTC) only
    /// the sessions that started in that year, month or range are listed. Pages are 5 sessions
    /// each.
    #[oai(path = "/servers/:server_id/maps/:map_name/sessions", method = "get", operation_id = "get_map_sessions", tag = "ApiTags::Mcp")]
    async fn get_maps_sessions(
        &self, Data(app): Data<&AppData>, Query(period): Query<Option<PeriodParam>>,
        extract: MapExtractor, Query(page): Query<usize>
    ) -> Response<ServerMapPlayedPaginated>{
        let pagination = 5;
        let offset = pagination * page as i64;
        let period = flatten_period(period);
        let start = period.map(|p| p.start().to_db_time());
        let end = period.map(|p| p.end().to_db_time());

        let Ok(result) = sqlx::query_as!(DbServerMapPlayed,
            "SELECT *, COUNT(time_id) OVER()::integer AS total_sessions
                FROM server_map_played
                WHERE server_id=$1 AND map=$2
                  AND ($5::timestamptz IS NULL OR started_at >= $5)
                  AND ($6::timestamptz IS NULL OR started_at < $6)
                ORDER BY started_at DESC
                LIMIT $3
                OFFSET $4",
            extract.server.server_id, extract.map.map, pagination, offset, start, end
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
    /// map is still being played, for a day once it has ended. Bots are left out.
    #[oai(path = "/servers/:server_id/sessions/:session_id/players", method = "get", operation_id = "get_map_session_players", tag = "ApiTags::Mcp")]
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
                    WHERE NOT EXISTS (SELECT 1 FROM bot_player b WHERE b.player_id = pss.player_id)
                    GROUP BY pss.player_id
                ),
                online_players AS (
                    SELECT player_id, started_at
                    FROM player_server_session
					CROSS JOIN params p
                    WHERE server_id=p.target_server
                        AND ended_at IS NULL
                        AND (p.right_now - last_verified) < INTERVAL '20 minutes'
                )
                SELECT
                    COUNT(p.player_id) OVER() total_players,
                    p.player_id,
                    p.player_name,
                    p.created_at,
                    ts.total AS total_playtime,
                    COALESCE(op.started_at, NULL) as online_since,
                    lps.started_at AS \"last_played?\",
                    lps.ended_at AS last_played_ended,
                    (lps.ended_at - lps.started_at) AS last_played_duration,
                    0::int AS rank,
                    COALESCE((SELECT is_anonymous FROM server_player_names spn WHERE spn.server_id = $1 AND spn.player_id = p.player_id), FALSE) AS \"is_anonymous!\"
                FROM player p
                JOIN timespent ts
                ON ts.player_id = p.player_id
                LEFT JOIN online_players op
                ON op.player_id=p.player_id
                LEFT JOIN LATERAL (
                    SELECT s.started_at, s.ended_at
                    FROM player_server_session s
                    WHERE s.player_id = p.player_id
                      AND s.ended_at IS NOT NULL
                    ORDER BY s.ended_at DESC
                    LIMIT 1
                ) lps ON TRUE
                ORDER BY total_playtime DESC
            ", server.server_id, time_id).fetch_all(pool).await
        };
        let key = format!("map_player_session-v2:{}:{}", server.server_id, session_id);
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
    #[oai(path = "/servers/:server_id/match-now", method = "get", operation_id = "get_server_current_match", tag = "ApiTags::Mcp")]
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
    /// The best matching map image for each of up to 100 comma-separated map names, keyed by the
    /// requested name. Names with no match are left out.
    #[oai(path="/servers/:server_id/maps/images", method="get")]
    async fn get_server_maps_images(
        &self, Data(app): Data<&AppData>, Query(maps): Query<KeyList>, ServerExtractor(server): ServerExtractor
    ) -> Response<HashMap<String, MapImage>>{
        let game = server.game.unwrap_or(String::from(GAME_TYPES[0]));
        let images: Vec<MapImage> = get_map_images(&app.cache)
            .await
            .into_iter()
            .filter(|e| e.game_type == game)
            .collect();
        let map_names: Vec<String> = images
            .iter()
            .map(|e| e.map_name.clone())
            .collect();
        let mut result = HashMap::new();
        for map_name in maps.0 {
            let Some(map_image) = get_map_image(&map_name, &map_names) else {
                continue
            };
            if let Some(image) = images.iter().find(|e| e.map_name == map_image) {
                result.insert(map_name, image.clone());
            }
        }
        response!(ok result)
    }
    /// Average counts of tracked in-game events for a map. Backed by `MapWorker`'s cache.
    #[oai(path="/servers/:server_id/maps/:map_name/events", method="get")]
    async fn get_event_counts(
        &self, Data(app): Data<&AppData>, extract: MapExtractor
    ) -> Response<Vec<MapEventAverage>>{
        let context = MapContext::from(extract);
        handle_worker_map_result(app.map_worker.get_events(&context).await)
    }
    /// Per-day geographic heat map data for a map's player activity, over the last year. Backed by
    /// `MapWorker`'s cache.
    ///
    /// With a `period` (`YYYY`, `YYYY-MM` or an inclusive `YYYY-MM-DD..YYYY-MM-DD` range, UTC) the
    /// days cover that year, month or range instead, from the map sessions that started in it. A
    /// period is calculated on request and only cached, so its first request may report that it is
    /// still calculating.
    #[oai(path="/servers/:server_id/maps/:map_name/heat-regions", method="get", operation_id = "get_map_heat_regions", tag = "ApiTags::Mcp")]
    async fn get_heat_regions(
        &self, Data(app): Data<&AppData>, Query(period): Query<Option<PeriodParam>>, extract: MapExtractor
    ) -> Response<Vec<DailyMapRegion>> {
        let context = MapContext::from(extract);
        handle_worker_map_result(app.map_worker.get_heat_regions(&context, flatten_period(period)).await)
    }
    /// Geographic region breakdown for a map's players, over the last year. Backed by `MapWorker`'s
    /// cache.
    ///
    /// `period` narrows the figures to the map sessions that started in one UTC calendar year
    /// (`YYYY`), month (`YYYY-MM`) or inclusive range of days (`YYYY-MM-DD..YYYY-MM-DD`); `all` or
    /// no value is all-time. A period is calculated on request and only cached, so its first
    /// request may report that it is still calculating.
    #[oai(path="/servers/:server_id/maps/:map_name/regions", method="get", operation_id = "get_map_regions", tag = "ApiTags::Mcp")]
    async fn get_map_regions(
        &self, Data(app): Data<&AppData>, Query(period): Query<Option<PeriodParam>>, extract: MapExtractor
    ) -> Response<Vec<MapRegion>>{
        let context = MapContext::from(extract);
        handle_worker_map_result(app.map_worker.get_regions(&context, flatten_period(period)).await)
    }
    /// Distribution of session lengths for a map (how long players typically stay). Backed by
    /// `MapWorker`'s cache.
    ///
    /// `period` narrows the figures to the map sessions that started in one UTC calendar year
    /// (`YYYY`), month (`YYYY-MM`) or inclusive range of days (`YYYY-MM-DD..YYYY-MM-DD`); `all` or
    /// no value is all-time. A period is calculated on request and only cached, so its first
    /// request may report that it is still calculating.
    #[oai(path="/servers/:server_id/maps/:map_name/sessions_distribution", method="get", operation_id = "get_map_session_distribution", tag = "ApiTags::Mcp")]
    async fn get_map_sessions_distribution(
        &self, Data(app): Data<&AppData>, Query(period): Query<Option<PeriodParam>>, extract: MapExtractor
    ) -> Response<Vec<MapSessionDistribution>>{
        let context = MapContext::from(extract);
        handle_worker_map_result(app.map_worker.get_session_distributions(&context, flatten_period(period)).await)
    }
    /// The UTC years and months in which a map has completed sessions on a server, newest year
    /// first, for choosing a `period` on the other map routes.
    #[oai(path = "/servers/:server_id/maps/:map_name/periods", method = "get", operation_id = "get_map_periods", tag = "ApiTags::Mcp")]
    async fn get_map_periods(
        &self, Data(app): Data<&AppData>, extract: MapExtractor
    ) -> Response<Vec<PeriodYear>>{
        let server_id = &extract.server.server_id;
        let map_name = &extract.map.map;
        let pool = &*app.pool;
        let func = || sqlx::query_as!(DbPeriodMonth, "
            SELECT DISTINCT
                EXTRACT(YEAR FROM started_at AT TIME ZONE 'UTC')::int AS \"year!\",
                EXTRACT(MONTH FROM started_at AT TIME ZONE 'UTC')::int AS \"month!\"
            FROM server_map_played
            WHERE server_id = $1 AND map = $2 AND ended_at IS NOT NULL
            ORDER BY 1 DESC, 2
        ", server_id, map_name).fetch_all(pool);

        let key = format!("map-periods:{server_id}:{map_name}:{}", extract.cache_key.current);
        let result = or_ise!(cached_response(&key, &app.cache, DAY, func).await);
        response!(ok group_periods(result.result))
    }
    /// Top players on a map, ranked by playtime, with optional name search.
    ///
    /// `player_name` (minimum 2 characters) filters to matching players; pages are 10 players
    /// each. Bots are left out, even from a name search.
    ///
    /// With a `period` (`YYYY`, `YYYY-MM` or an inclusive `YYYY-MM-DD..YYYY-MM-DD` range, UTC) the
    /// list is instead the top 100 by time in the map sessions that started in that year, month or
    /// range, calculated on request and only cached, so its first request may report that it is
    /// still calculating. In a period, `player_name` only filters whatever is already cached and
    /// never starts the calculation.
    #[oai(path = "/servers/:server_id/maps/:map_name/top_players", method = "get", operation_id = "get_map_top_players", tag = "ApiTags::Mcp")]
    async fn get_map_players(
        &self, Data(app): Data<&AppData>, Query(period): Query<Option<PeriodParam>>, extract: MapExtractor,
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

        if let Some(period) = flatten_period(period) {
            let context = MapContext::from(extract);
            let rows = match app.map_worker.get_period_top_players(&context, period, player_name.as_deref()).await {
                Ok(rows) => rows,
                Err(e) => return handle_worker_map_result(Err(e)),
            };
            let mut players: Vec<PlayerBrief> = rows.iter_into();
            let anonymizer = BriefAnonymizer::new(app, &server_id, user_token.as_ref().map(|t| t.id)).await;
            if player_name.is_some() {
                anonymizer.retain_visible(&mut players);
            } else {
                anonymizer.apply(&mut players);
            }
            let total_players = players.len() as i64;
            let players = players.into_iter()
                .skip(offset as usize)
                .take(pagination_size as usize)
                .collect();
            return response!(ok BriefPlayers { total_players, players })
        }

        let (rows, is_new) = match &player_name {
            Some(player_name) => {
                let name_pattern = format!("%{player_name}%");
                let rows = or_ise!(sqlx::query_as!(DbPlayerBrief, "
                    WITH bot_map_ranks AS MATERIALIZED (
                        SELECT bmr.map_rank
                        FROM website.player_map_rank bmr
                        JOIN bot_player b ON b.player_id = bmr.player_id
                        WHERE bmr.server_id = $1 AND bmr.map = $2
                    ),
                    pages AS (
                        SELECT pmt.player_id, pmt.total_playtime,
                               (pmr.map_rank - (SELECT COUNT(*) FROM bot_map_ranks b WHERE b.map_rank < pmr.map_rank))::int AS rank,
                               COUNT(*) OVER() AS total_players
                        FROM website.player_map_time pmt
                        JOIN website.player_map_rank pmr
                            ON pmr.server_id = pmt.server_id AND pmr.map = pmt.map AND pmr.player_id = pmt.player_id
                        JOIN player p ON p.player_id = pmt.player_id
                        WHERE pmt.server_id = $1 AND pmt.map = $2 AND p.player_name ILIKE $5
                          AND NOT EXISTS (SELECT 1 FROM bot_player b WHERE b.player_id = pmt.player_id)
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
                        lp.ended_at AS \"last_played_ended?\",
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
                ", server_id, map_name, pagination_size, offset, name_pattern).fetch_all(pool).await, e => "Failed to search map players for {server_id}:{map_name}:{player_name}: {e}");
                (rows, true)
            },
            None => {
                let sql_func = || sqlx::query_as!(DbPlayerBrief, "
                    WITH bot_map_ranks AS MATERIALIZED (
                        SELECT bmr.map_rank
                        FROM website.player_map_rank bmr
                        JOIN bot_player b ON b.player_id = bmr.player_id
                        WHERE bmr.server_id = $1 AND bmr.map = $2
                    ),
                    pages AS (
                        SELECT pmt.player_id, pmt.total_playtime,
                               (pmr.map_rank - (SELECT COUNT(*) FROM bot_map_ranks b WHERE b.map_rank < pmr.map_rank))::int AS rank,
                               COUNT(*) OVER() AS total_players
                        FROM website.player_map_time pmt
                        JOIN website.player_map_rank pmr
                            ON pmr.server_id = pmt.server_id AND pmr.map = pmt.map AND pmr.player_id = pmt.player_id
                        WHERE pmt.server_id = $1 AND pmt.map = $2
                          AND NOT EXISTS (SELECT 1 FROM bot_player b WHERE b.player_id = pmt.player_id)
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
                        lp.ended_at AS \"last_played_ended?\",
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
                let result = or_ise!(cached_response(&key, &app.cache, 10 * 60, sql_func).await, e => "Failed to fetch map players for {key}: {e}");
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
        let Some(current_youtube_music) = or_ise!(sqlx::query_scalar!(
            "SELECT youtube_music FROM map_music WHERE id = $1",
            music_uuid
        )
        .fetch_optional(pool)
        .await, e => "Failed to fetch music: {}", e) else {
            return response!(err "Music track not found", ErrorCode::NotFound);
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
            let api_model = chunked_upload::map_model_api(app, model).await;

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

        let maps = or_ise!(maps_result);

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
            let api_model = chunked_upload::map_model_api(app, model).await;

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

        let models = or_ise!(models);
        let mut low_res = None;
        let mut high_res = None;

        for model in models {
            let api_model = chunked_upload::map_model_api(app, model).await;

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
        require!(check_superuser_or_map_manager(&app, user_token.id).await, "Forbidden", ErrorCode::Forbidden);

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

        let link_path = or_ise!(app.map_storage
            .store_bytes(&map_name, res_type_val.as_str(), &file_bytes)
            .await, e => "Failed to store 3D model: {}", e);

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

        let model = or_ise!(result, e => "Database error: {}", e);
        response!(ok chunked_upload::map_model_api(app, model).await)
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
        require!(check_superuser_or_map_manager(&app, user_token.id).await, "Forbidden", ErrorCode::Forbidden);

        // Parse request
        let res_type = match req.get("res_type").and_then(|v| v.as_str()).and_then(ResType::parse) {
            Some(rt) => rt,
            None => return response!(err "Invalid res_type. Must be 'low' or 'high'", ErrorCode::BadRequest),
        };

        let credit = req.get("credit").and_then(|v| v.as_str()).map(|s| s.to_string());

        chunked_upload::initiate(&app.cache, &req, |session_id, total_chunks, file_size| UploadSession {
            session_id,
            map_name,
            res_type: res_type.as_str().to_string(),
            credit,
            total_chunks,
            chunk_size: chunked_upload::CHUNK_SIZE,
            total_size: file_size,
            uploaded_by: user_token.id,
            created_at: chrono::Utc::now().to_rfc3339(),
            chunks_received: Vec::new(),
        }).await
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
        require!(check_superuser_or_map_manager(&app, user_token.id).await, "Forbidden", ErrorCode::Forbidden);

        chunked_upload::upload_chunk(&app.cache, &session_id, user_token.id, map_mismatch(&map_name), upload).await
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
        require!(check_superuser_or_map_manager(&app, user_token.id).await, "Forbidden", ErrorCode::Forbidden);

        let (session, link_path) = match chunked_upload::assemble_and_store::<UploadSession, _>(
            app, &session_id, user_token.id, map_mismatch(&map_name),
        ).await {
            Ok(stored) => stored,
            Err(resp) => return resp,
        };
        let file_size = session.total_size as i64;

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

        chunked_upload::discard::<UploadSession>(&app.cache, &session_id).await;

        match result {
            Ok(model) => {
                tracing::info!("Upload completed: {}, final size: {}", session_id, file_size);
                response!(ok chunked_upload::map_model_api(app, model).await)
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
        require!(check_superuser_or_map_manager(&app, user_token.id).await, "Forbidden", ErrorCode::Forbidden);

        chunked_upload::cancel(&app.cache, &session_id, user_token.id, map_mismatch(&map_name)).await
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
        require!(check_superuser_or_map_manager(&app, user_token.id).await, "Forbidden", ErrorCode::Forbidden);

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

        or_ise!(result, e => "Database error: {}", e);
        response!(ok "3D model deleted successfully".to_string())
    }
}

fn map_mismatch(map_name: &str) -> impl Fn(&UploadSession) -> Option<&'static str> + '_ {
    move |s| (s.map_name != map_name).then_some("Map name mismatch")
}

#[cfg(test)]
mod global_map_search_tests {
    use super::*;

    #[test]
    fn like_wildcards_match_literally() {
        assert_eq!(escape_like("ze_santa"), r"ze\_santa");
        assert_eq!(escape_like("100%"), r"100\%");
        assert_eq!(escape_like(r"a\b"), r"a\\b");
    }

    #[test]
    fn plain_terms_are_untouched() {
        assert_eq!(escape_like("santassination"), "santassination");
    }
}
