use std::collections::HashMap;
use chrono::{DateTime, Utc};
use poem::http::StatusCode;
use poem::web::Data;
use poem_openapi::OpenApi;
use poem_openapi::param::Query;
use sqlx::{Pool, Postgres};
use crate::{or_ise, response, AppData, FastCache};
use crate::api_models::common::*;
use crate::api_models::maps::*;
use crate::api_models::players::*;
use crate::api_models::servers::*;
use crate::core::utils::*;
use crate::models::maps::*;
use crate::models::players::*;
use crate::models::servers::*;
use crate::routers::ApiTags;
use crate::routers::maps::{assemble_global_maps, global_map_page, map_musics};

const GLOBAL_MAP_SESSIONS_PAGE_SIZE: i64 = 5;
const GLOBAL_MAP_PLAYERS_PAGE_SIZE: i64 = 10;

/// The map name, as long as some server has played it.
async fn get_global_map(pool: &Pool<Postgres>, cache: &FastCache, map_name: &str) -> Option<String> {
    let func = || sqlx::query_scalar!("
        SELECT map
        FROM server_map_played
        WHERE server_id = ANY(SELECT server_id FROM server_map WHERE map = $1)
          AND map = $1
        LIMIT 1
    ", map_name).fetch_one(pool);

    let key = format!("global-map-exist:{map_name}");
    cached_response(&key, cache, 6 * HOUR, func).await.map(|s| s.result).ok()
}

/// Like the per-server key, but from the last two completed sessions on any server.
async fn get_global_map_cache_key(pool: &Pool<Postgres>, cache: &FastCache, map_name: &str) -> CacheKey {
    let func = || sqlx::query_as!(DbMapLastPlayed, "
        SELECT started_at last_played
        FROM server_map_played
        WHERE server_id = ANY(SELECT server_id FROM server_map WHERE map = $1)
          AND map = $1
          AND ended_at IS NOT NULL
        ORDER BY started_at DESC
        LIMIT 2
    ", map_name).fetch_all(pool);

    let key = format!("global-last-played:{map_name}");
    let Ok(result) = cached_response(&key, cache, 60, func).await else {
        return CacheKey { current: "first-time".to_string(), previous: None }
    };

    let d = result.result;
    let current = d
        .first()
        .and_then(|e| e.last_played)
        .map(|e| db_to_utc(e).to_rfc3339())
        .unwrap_or_default();
    let previous = d
        .get(1)
        .and_then(|e| e.last_played)
        .map(|e| db_to_utc(e).to_rfc3339());
    CacheKey { current, previous }
}

/// A map played on at least one server, resolved from the `map_name` path parameter.
struct GlobalMapExtractor {
    pub map: String,
    pub cache_key: CacheKey,
}
impl<'a> poem::FromRequest<'a> for GlobalMapExtractor {
    async fn from_request(req: &'a poem::Request, _body: &mut poem::RequestBody) -> poem::Result<Self> {
        let map_name = req.raw_path_param("map_name")
            .ok_or_else(|| poem::Error::from_string("Invalid map_name", StatusCode::BAD_REQUEST))?;

        let data: &AppData = req.data()
            .ok_or_else(|| poem::Error::from_string("Invalid data", StatusCode::BAD_REQUEST))?;

        let Some(map) = get_global_map(&data.pool, &data.cache, map_name).await else {
            return Err(poem::Error::from_string("Map not found", StatusCode::NOT_FOUND))
        };
        let cache_key = get_global_map_cache_key(&data.pool, &data.cache, &map).await;
        Ok(Self { map, cache_key })
    }
}

async fn global_map_detail(
    pool: &Pool<Postgres>, map_name: &str,
) -> Result<(DbGlobalMapPage, Option<DbGlobalMapMeta>), sqlx::Error> {
    let page = global_map_page(pool, None, "", "all", "last_played", None, 0, Some(map_name)).await?;
    let meta = sqlx::query_as!(DbGlobalMapMeta, r#"
        SELECT workshop_id AS "workshop_id?", creators, file_bytes
        FROM map_metadata
        WHERE name = $1
        LIMIT 1
    "#, map_name).fetch_optional(pool).await?;
    Ok((page, meta))
}

pub struct GlobalMapApi;

#[OpenApi(tag = "ApiTags::Maps")]
impl GlobalMapApi {
    /// Detail of a map across every server that has played it.
    ///
    /// Totals summed across servers, distinct players with alt accounts merged, live status, the
    /// per-server state (rotation, cooldown, playtime) and Workshop metadata. Cached for 60
    /// seconds. Reports still calculating until at least one server's figures exist.
    #[oai(path = "/maps/:map_name/info", method = "get", operation_id = "get_global_map_info", tag = "ApiTags::Mcp")]
    async fn get_global_map_info(
        &self, Data(app): Data<&AppData>, extract: GlobalMapExtractor,
        OptionalTokenBearer(user): OptionalTokenBearer,
    ) -> Response<GlobalMapDetail> {
        let pool = &*app.pool;
        let key = format!("global-map-info-v1:{}", extract.map);
        let func = || global_map_detail(pool, &extract.map);
        let (page, meta) = or_ise!(
            cached_response(&key, &app.cache, 60, func).await, e => "Error global map info {key}: {e}"
        ).result;

        let user_id = user.map(|e| e.id);
        let Some(map) = assemble_global_maps(app, page.maps, page.servers, user_id).await.into_iter().next() else {
            return response!(calculating)
        };
        let meta = meta.unwrap_or(DbGlobalMapMeta { workshop_id: None, creators: None, file_bytes: None });
        response!(ok GlobalMapDetail {
            map,
            workshop_id: meta.workshop_id,
            creators: meta.creators,
            file_bytes: meta.file_bytes,
        })
    }

    /// Performance metrics for a map across every server: dropoff rate, average session length and
    /// similar.
    ///
    /// Combined from each server's all-time figures, weighted by how much each server contributes;
    /// distinct players are counted once across servers with alt accounts merged. Cached for 60
    /// seconds. Reports still calculating until at least one server's figures exist.
    #[oai(path = "/maps/:map_name/analyze", method = "get", operation_id = "get_global_map_analysis", tag = "ApiTags::Mcp")]
    async fn get_global_map_analyze(
        &self, Data(app): Data<&AppData>, extract: GlobalMapExtractor,
    ) -> Response<MapAnalyze> {
        let pool = &*app.pool;
        let map_name = &extract.map;
        // Each server row averages over its own player-session pairs, so `cum / avg` recovers that
        // pair count and the combined average and dropoff rate come out exact. Player counts are
        // sampled in time buckets, so they are weighted by wall-clock time instead.
        let func = || sqlx::query_as!(DbMapAnalyze, r#"
            WITH rows AS (
                SELECT
                    ma.*,
                    (EXTRACT(EPOCH FROM ma.cum_player_hours)
                        / NULLIF(EXTRACT(EPOCH FROM ma.avg_playtime_before_quitting), 0))::FLOAT8 AS player_sessions
                FROM website.map_analyze ma
                WHERE ma.server_id = ANY(SELECT server_id FROM server_map WHERE map = $1)
                  AND ma.map = $1
            )
            SELECT
                $1::TEXT AS "map!",
                COALESCE(MAX(gma.unique_players), MAX(r.unique_players), 0)::BIGINT AS "unique_players!",
                SUM(r.cum_player_hours) AS cum_player_hours,
                SUM(r.total_playtime) AS total_playtime,
                COALESCE(SUM(r.total_sessions), 0)::INT AS "total_sessions!",
                MAX(r.last_played) AS last_played,
                MAX(r.last_played_ended) AS last_played_ended,
                make_interval(secs => SUM(EXTRACT(EPOCH FROM r.cum_player_hours))::FLOAT8
                    / NULLIF(SUM(r.player_sessions), 0)) AS avg_playtime_before_quitting,
                SUM(r.dropoff_rate * r.player_sessions) / NULLIF(SUM(r.player_sessions), 0) AS dropoff_rate,
                ROUND((SUM(r.avg_players_per_session * EXTRACT(EPOCH FROM r.total_playtime)::FLOAT8)
                    / NULLIF(SUM(EXTRACT(EPOCH FROM r.total_playtime)::FLOAT8), 0))::NUMERIC, 3)::FLOAT8 AS avg_players_per_session
            FROM rows r
            LEFT JOIN website.global_map_analyze gma ON gma.map = r.map
            HAVING COUNT(*) > 0
        "#, map_name).fetch_optional(pool);

        let key = format!("global-map-analyze-v1:{map_name}");
        let result = or_ise!(
            cached_response(&key, &app.cache, 60, func).await, e => "Error global map analyze {key}: {e}"
        ).result;
        match result {
            Some(row) => response!(ok row.into()),
            None => response!(calculating),
        }
    }

    /// Per-day, per-server playtime for a map over the last year.
    ///
    /// For each UTC day and server, `map_duration` is how long the map was running and
    /// `player_duration` is every player's time on it summed (player-hours), both in seconds.
    /// Sessions crossing midnight are split between the days. Only completed map sessions count.
    #[oai(path = "/maps/:map_name/heat-servers", method = "get", operation_id = "get_global_map_heat_servers", tag = "ApiTags::Mcp")]
    async fn get_global_map_heat_servers(
        &self, Data(app): Data<&AppData>, extract: GlobalMapExtractor,
    ) -> Response<Vec<DailyMapServer>> {
        let pool = &*app.pool;
        let map_name = &extract.map;
        let func = || sqlx::query_as!(DbMapServerDate, r#"
            WITH map_sessions AS (
                SELECT smp.server_id, smp.started_at, smp.ended_at
                FROM server_map_played smp
                WHERE smp.server_id = ANY(SELECT server_id FROM server_map WHERE map = $1)
                  AND smp.map = $1
                  AND smp.ended_at IS NOT NULL
                  AND smp.started_at >= CURRENT_TIMESTAMP - INTERVAL '1 year'
            ),
            intervals AS (
                SELECT server_id, started_at, ended_at, TRUE AS is_map
                FROM map_sessions
                UNION ALL
                SELECT
                    ms.server_id,
                    GREATEST(pss.started_at, ms.started_at),
                    LEAST(pss.ended_at, ms.ended_at),
                    FALSE
                FROM map_sessions ms
                JOIN player_server_session pss
                    ON pss.server_id = ms.server_id
                   AND tstzrange(pss.started_at, pss.ended_at) && tstzrange(ms.started_at, ms.ended_at)
            ),
            daily AS (
                SELECT
                    i.server_id,
                    d.day,
                    SUM(LEAST(i.ended_at, d.day + INTERVAL '1 day') - GREATEST(i.started_at, d.day))
                        FILTER (WHERE i.is_map) AS map_duration,
                    SUM(LEAST(i.ended_at, d.day + INTERVAL '1 day') - GREATEST(i.started_at, d.day))
                        FILTER (WHERE NOT i.is_map) AS player_duration
                FROM intervals i
                CROSS JOIN LATERAL generate_series(
                    date_trunc('day', i.started_at AT TIME ZONE 'UTC'),
                    date_trunc('day', i.ended_at AT TIME ZONE 'UTC'),
                    INTERVAL '1 day'
                ) AS g(utc_day)
                CROSS JOIN LATERAL (SELECT g.utc_day AT TIME ZONE 'UTC' AS day) d
                WHERE i.ended_at > i.started_at
                GROUP BY i.server_id, d.day
            )
            SELECT
                day AS date,
                server_id AS "server_id!",
                map_duration,
                player_duration
            FROM daily
            ORDER BY day
        "#, map_name).fetch_all(pool);

        let key = format!("global-map-heat-servers-v1:{map_name}:{}", extract.cache_key.current);
        let rows = or_ise!(
            cached_response(&key, &app.cache, DAY, func).await, e => "Error global map heat servers {key}: {e}"
        ).result;

        let mut grouped: HashMap<DateTime<Utc>, Vec<MapServerTime>> = HashMap::new();
        for row in rows {
            let Some(date) = row.date else { continue };
            let time: MapServerTime = row.into();
            if time.map_duration > 0. || time.player_duration > 0. {
                grouped.entry(db_to_utc(date)).or_default().push(time);
            }
        }
        let mut days: Vec<DailyMapServer> = grouped
            .into_iter()
            .map(|(date, mut servers)| {
                servers.sort_by(|a, b| b.map_duration.total_cmp(&a.map_duration));
                DailyMapServer { date, servers }
            })
            .collect();
        days.sort_by(|a, b| a.date.cmp(&b.date));
        response!(ok days)
    }

    /// Paginated list of a map's play sessions across every server, newest first.
    ///
    /// Each session carries the `server_id` it was played on. Pages are 5 sessions each.
    #[oai(path = "/maps/:map_name/sessions", method = "get", operation_id = "get_global_map_sessions", tag = "ApiTags::Mcp")]
    async fn get_global_map_sessions(
        &self, Data(app): Data<&AppData>, extract: GlobalMapExtractor, Query(page): Query<usize>,
    ) -> Response<ServerMapPlayedPaginated> {
        let offset = GLOBAL_MAP_SESSIONS_PAGE_SIZE * page as i64;
        let Ok(result) = sqlx::query_as!(DbServerMapPlayed, "
            SELECT *, COUNT(time_id) OVER()::integer AS total_sessions
            FROM server_map_played
            WHERE server_id = ANY(SELECT server_id FROM server_map WHERE map = $1)
              AND map = $1
            ORDER BY started_at DESC
            LIMIT $2
            OFFSET $3
        ", extract.map, GLOBAL_MAP_SESSIONS_PAGE_SIZE, offset).fetch_all(&*app.pool).await else {
            return response!(err "Could not fetch this map's page", ErrorCode::NotFound)
        };
        let total_sessions = result
            .first()
            .and_then(|e| e.total_sessions)
            .unwrap_or_default();

        response!(ok ServerMapPlayedPaginated { total_sessions, maps: result.iter_into() })
    }

    /// Top players on a map across every server, ranked by playtime summed over servers, with
    /// optional name search.
    ///
    /// Alt accounts are merged into their main account. `player_name` (minimum 2 characters)
    /// filters to matching players; pages are 10 players each. Bots are left out. A player who
    /// anonymized themselves in any community is shown as anonymous, and left out of a name
    /// search, unless the request carries their own or a superuser's bearer token. Unfiltered
    /// pages are cached for 10 minutes.
    #[oai(path = "/maps/:map_name/top_players", method = "get", operation_id = "get_global_map_top_players", tag = "ApiTags::Mcp")]
    async fn get_global_map_players(
        &self, Data(app): Data<&AppData>, extract: GlobalMapExtractor,
        Query(page): Query<Option<usize>>, Query(player_name): Query<Option<String>>,
        OptionalTokenBearer(user_token): OptionalTokenBearer,
    ) -> Response<BriefPlayers> {
        let pool = &*app.pool;
        let page = page.unwrap_or(0);
        let offset = GLOBAL_MAP_PLAYERS_PAGE_SIZE * page as i64;
        let map_name = &extract.map;
        let player_name = player_name
            .map(|n| n.trim().to_string())
            .filter(|n| n.len() >= 2);
        let name_pattern = player_name.as_ref()
            .map(|n| format!("%{}%", n.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_")));

        // `player_map_rank` already leaves bots out and is indexed by (server, map); time on every
        // server is then summed per main account. Online and last-played cover the alts too.
        let sql_func = || sqlx::query_as!(DbPlayerBrief, r#"
            WITH totals AS (
                SELECT COALESCE(p.associated_player_id, p.player_id) AS player_id,
                       SUM(pmt.total_playtime) AS total_playtime
                FROM website.player_map_rank pmr
                JOIN website.player_map_time pmt
                    ON pmt.player_id = pmr.player_id AND pmt.server_id = pmr.server_id AND pmt.map = pmr.map
                JOIN player p ON p.player_id = pmr.player_id
                WHERE pmr.server_id = ANY(SELECT server_id FROM server_map WHERE map = $1)
                  AND pmr.map = $1
                GROUP BY 1
            ),
            ranked AS (
                SELECT player_id, total_playtime,
                       ROW_NUMBER() OVER (ORDER BY total_playtime DESC, player_id)::INT AS rank
                FROM totals
            ),
            matched AS (
                SELECT r.*, COUNT(*) OVER() AS total_players
                FROM ranked r
                JOIN player cp ON cp.player_id = r.player_id
                WHERE $4::TEXT IS NULL OR cp.player_name ILIKE $4
            ),
            pages AS (
                SELECT *
                FROM matched
                ORDER BY rank
                LIMIT $2 OFFSET $3
            )
            SELECT
                pg.total_players,
                p.player_id,
                p.player_name,
                p.created_at,
                pg.total_playtime,
                pg.rank,
                online.online_since AS "online_since?",
                last.started_at AS "last_played?",
                last.ended_at AS "last_played_ended?",
                (last.ended_at - last.started_at) AS "last_played_duration?",
                EXISTS (
                    SELECT 1
                    FROM website.user_anonymization ua
                    WHERE ua.user_id::TEXT = p.player_id AND ua.anonymized
                ) AS "is_anonymous!"
            FROM pages pg
            JOIN player p ON p.player_id = pg.player_id
            LEFT JOIN LATERAL (
                SELECT MIN(pss.started_at) AS online_since
                FROM player_server_session pss
                JOIN player lp ON lp.player_id = pss.player_id
                WHERE (lp.player_id = p.player_id OR lp.associated_player_id = p.player_id)
                  AND pss.ended_at IS NULL
                  AND CURRENT_TIMESTAMP - pss.last_verified < INTERVAL '20 minutes'
            ) online ON TRUE
            LEFT JOIN LATERAL (
                SELECT recent.started_at, recent.ended_at
                FROM player lp
                CROSS JOIN LATERAL (
                    SELECT pss.started_at, pss.ended_at
                    FROM player_server_session pss
                    WHERE pss.player_id = lp.player_id
                      AND pss.ended_at IS NOT NULL
                    ORDER BY pss.ended_at DESC
                    LIMIT 1
                ) recent
                WHERE lp.player_id = p.player_id OR lp.associated_player_id = p.player_id
                ORDER BY recent.ended_at DESC
                LIMIT 1
            ) last ON TRUE
            ORDER BY pg.rank
        "#, map_name, GLOBAL_MAP_PLAYERS_PAGE_SIZE, offset, name_pattern.as_deref()).fetch_all(pool);

        let rows = match &player_name {
            Some(player_name) => or_ise!(
                sql_func().await, e => "Failed to search global map players for {map_name}:{player_name}: {e}"
            ),
            None => {
                let key = format!("global-map-players-v1:{map_name}:{page}");
                or_ise!(
                    cached_response(&key, &app.cache, 10 * 60, sql_func).await,
                    e => "Failed to fetch global map players for {key}: {e}"
                ).result
            }
        };

        let total_players = rows
            .first()
            .and_then(|e| e.total_players)
            .unwrap_or_default();

        let mut players: Vec<PlayerBrief> = rows.iter_into();
        let anonymizer = BriefAnonymizer::global(app, user_token.as_ref().map(|t| t.id)).await;
        if player_name.is_some() {
            // Name search: an anonymized player must not be discoverable by typing their name.
            anonymizer.retain_visible(&mut players);
        } else {
            anonymizer.apply(&mut players);
        }
        response!(ok BriefPlayers { total_players, players })
    }

    /// Distribution of session lengths for a map across every server (how long players typically
    /// stay).
    ///
    /// Summed from each server's all-time distribution. Cached for 10 minutes.
    #[oai(path = "/maps/:map_name/sessions_distribution", method = "get", operation_id = "get_global_map_session_distribution", tag = "ApiTags::Mcp")]
    async fn get_global_map_sessions_distribution(
        &self, Data(app): Data<&AppData>, extract: GlobalMapExtractor,
    ) -> Response<Vec<MapSessionDistribution>> {
        let pool = &*app.pool;
        let map_name = &extract.map;
        let func = || sqlx::query_as!(DbMapSessionDistribution, r#"
            SELECT session_range AS "session_range!", SUM(session_count)::INT AS "session_count!"
            FROM website.map_session_distribution
            WHERE server_id = ANY(SELECT server_id FROM server_map WHERE map = $1)
              AND map = $1
            GROUP BY session_range
        "#, map_name).fetch_all(pool);

        let key = format!("global-map-session-distribution-v1:{map_name}");
        let rows = or_ise!(
            cached_response(&key, &app.cache, 10 * 60, func).await,
            e => "Error global map session distribution {key}: {e}"
        ).result;
        response!(ok rows.iter_into())
    }

    /// Time breakdown by player type (e.g. casual vs tryhard) for a map across every server.
    ///
    /// Each player's time on a server is classified by their type on that server. Bots are left
    /// out. Cached for an hour.
    #[oai(path = "/maps/:map_name/player_types", method = "get", operation_id = "get_global_map_player_types", tag = "ApiTags::Mcp")]
    async fn get_global_map_player_types(
        &self, Data(app): Data<&AppData>, extract: GlobalMapExtractor,
    ) -> Response<Vec<MapPlayerTypeTime>> {
        let pool = &*app.pool;
        let map_name = &extract.map;
        let func = || sqlx::query_as!(DbMapPlayerTypeTime, "
            SELECT pp.category, SUM(pmt.total_playtime) AS time_spent
            FROM website.player_map_rank pmr
            JOIN website.player_map_time pmt
                ON pmt.player_id = pmr.player_id AND pmt.server_id = pmr.server_id AND pmt.map = pmr.map
            JOIN website.player_playtime pp
                ON pp.player_id = pmr.player_id AND pp.server_id = pmr.server_id
            WHERE pp.category IS NOT NULL
              AND pmr.server_id = ANY(SELECT server_id FROM server_map WHERE map = $1)
              AND pmr.map = $1
            GROUP BY pp.category
        ", map_name).fetch_all(pool);

        let key = format!("global-map-player-types-v1:{map_name}");
        let rows = or_ise!(
            cached_response(&key, &app.cache, HOUR, func).await, e => "Error global map player types {key}: {e}"
        ).result;
        response!(ok rows.iter_into())
    }

    /// Music tracks associated with a map, including which other maps share each track.
    #[oai(path = "/maps/:map_name/musics", method = "get")]
    async fn get_global_map_musics(
        &self, Data(app): Data<&AppData>, extract: GlobalMapExtractor,
    ) -> Response<Vec<ServerMapMusic>> {
        let rows = or_ise!(map_musics(&app.pool, &extract.map).await);
        response!(ok rows.iter_into())
    }
}
