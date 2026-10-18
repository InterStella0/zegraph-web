use std::collections::HashMap;
use std::fmt::Display;
use chrono::{DateTime, Utc};
use indexmap::IndexMap;
use poem::http::StatusCode;
use poem::web::Data;
use poem_openapi::{Enum, OpenApi};
use poem_openapi::param::Query;
use sqlx::Postgres;
use crate::{or_ise, require, response, AppData, FastCache};
use crate::api_models::common::*;
use crate::api_models::misc::*;
use crate::api_models::players::{GlobalBriefPlayers, GlobalPlayerBrief, PlayerCommunityPlaytime, PlayerDetailSession, PlayerDetailSessionCommunity, PlayerProfilePicture};
use crate::api_models::servers::*;
use crate::core::utils::*;
use crate::models::admins::DbFetchStatus;
use crate::models::players::{DbGlobalCommunityPlaytime, DbGlobalPlayerBrief, DbGlobalPlayerPage, DbPlayerDetailSession};
use crate::models::servers::*;
use crate::routers::ApiTags;

fn truncate_error(error: &str) -> String {
    let truncated = match error.find(", ") {
        Some(pos) => &error[..pos],
        None => error,
    };
    truncated.chars().take(80).collect()
}

#[derive(Enum)]
enum CommunityGraphTime{
    TenMinutes,
    OneHour,
    OneDay,
}
impl Display for CommunityGraphTime{
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CommunityGraphTime::TenMinutes => write!(f, "10min"),
            CommunityGraphTime::OneHour => write!(f, "1hr"),
            CommunityGraphTime::OneDay => write!(f, "1day"),
        }
    }
}
pub async fn get_community(pool: &sqlx::Pool<Postgres>, cache: &FastCache, community_id: &str) -> Option<DbServerCommunity>{
    let key = format!("find_community_detail:{}", community_id);
    let func = || sqlx::query_as!(DbServerCommunity, "
            SELECT
                c.community_id,
                c.community_name,
                c.community_shorten_name,
                c.community_icon_url,
                s.server_id,
                s.server_name,
                s.server_port,
                s.server_ip,
                s.max_players,
                s.server_fullname,
                s.online,
                s.readable_link,
                s.tracking_since,
                LEAST((SELECT COUNT(DISTINCT player_id) FROM player_server_session p
                    WHERE p.server_id = s.server_id
                    AND p.ended_at IS NULL
                    AND CURRENT_TIMESTAMP - p.started_at < INTERVAL '24 hours'),
                    COALESCE(s.max_players, 64)
                ) AS player_count,
                sm.server_website,
                sm.server_discord_link,
                sm.server_source,
                sm.game,
                COALESCE(sm.source_by_id, false) source_by_id,
                COALESCE(smp.map, NULL) AS map
            FROM server s
            INNER JOIN community c
                ON c.community_id = s.community_id
            LEFT JOIN LATERAL (
                SELECT map
                FROM server_map_played
                WHERE server_id = s.server_id
                  AND ended_at IS NULL
                ORDER BY started_at DESC
                LIMIT 1
            ) smp ON true
            LEFT JOIN server_metadata sm
                ON sm.server_id=s.server_id
            WHERE c.community_id = $1::TEXT::uuid
            ORDER BY player_count DESC, online DESC, c.community_name
        ", community_id).fetch_one(pool);

    let data = cached_response(&key, cache, HOUR, func).await.ok();
    data.map(|e| e.result)
}
struct CommunityWithAllExtractor(pub Option<DbServerCommunity>);


impl<'a> poem::FromRequest<'a> for CommunityWithAllExtractor {
    async fn from_request(req: &'a poem::Request, _body: &mut poem::RequestBody) -> poem::Result<Self> {
        let community_id = req.raw_path_param("community_id")
            .ok_or_else(|| poem::Error::from_string("Invalid community_id", StatusCode::BAD_REQUEST))?;

        let data: &AppData = req.data()
            .ok_or_else(|| poem::Error::from_string("Invalid data", StatusCode::BAD_REQUEST))?;

        if community_id.to_lowercase() == "all"{
            return Ok(CommunityWithAllExtractor(None))
        }
        let Some(community) = get_community(&data.pool, &data.cache, &community_id).await else {
            return Err(poem::Error::from_string("Community not found", StatusCode::NOT_FOUND))
        };

        Ok(CommunityWithAllExtractor(Some(community)))
    }
}
const GLOBAL_PLAYERS_PAGE_SIZE: i64 = 10;

async fn global_player_counts(pool: &sqlx::Pool<Postgres>, cache: &FastCache) -> Result<(i64, i64), sqlx::Error> {
    let func = || async {
        let counts = sqlx::query!(r#"
            SELECT
                COUNT(*) FILTER (WHERE gp.total_playtime > INTERVAL '0') AS "ranked!",
                COUNT(*) AS "total!"
            FROM player p
            LEFT JOIN website.player_global_playtime gp ON gp.player_id = p.player_id
            WHERE p.associated_player_id IS NULL
              AND p.player_id ~ '^[0-9]+$'
        "#).fetch_one(pool).await?;
        Ok::<_, sqlx::Error>((counts.ranked, counts.total))
    };
    Ok(cached_response("global-players-counts", cache, 10 * 60, func).await?.result)
}

async fn browse_global_players(
    pool: &sqlx::Pool<Postgres>, cache: &FastCache, offset: i64,
) -> Result<DbGlobalPlayerPage, sqlx::Error> {
    let (ranked, total) = global_player_counts(pool, cache).await?;

    let mut ids = vec![];
    if offset < ranked {
        ids = sqlx::query_scalar!(r#"
            SELECT gp.player_id
            FROM website.player_global_playtime gp
            JOIN player p ON p.player_id = gp.player_id
            WHERE gp.total_playtime > INTERVAL '0'
              AND p.associated_player_id IS NULL
              AND p.player_id ~ '^[0-9]+$'
            ORDER BY gp.total_playtime DESC, gp.player_id
            LIMIT $2 OFFSET $1
        "#, offset, GLOBAL_PLAYERS_PAGE_SIZE).fetch_all(pool).await?;
    }

    let remaining = GLOBAL_PLAYERS_PAGE_SIZE - ids.len() as i64;
    if remaining > 0 {
        let unranked = sqlx::query_scalar!(r#"
            SELECT p.player_id
            FROM player p
            LEFT JOIN website.player_global_playtime gp ON gp.player_id = p.player_id
            WHERE p.associated_player_id IS NULL
              AND p.player_id ~ '^[0-9]+$'
              AND COALESCE(gp.total_playtime, INTERVAL '0') <= INTERVAL '0'
            ORDER BY COALESCE(gp.total_playtime, INTERVAL '0') DESC, p.player_id
            LIMIT $2 OFFSET $1
        "#, (offset - ranked).max(0), remaining).fetch_all(pool).await?;
        ids.extend(unranked);
    }

    global_player_page(pool, ids, total).await
}

async fn search_global_players(
    pool: &sqlx::Pool<Postgres>, pattern: &str, offset: i64,
) -> Result<DbGlobalPlayerPage, sqlx::Error> {
    let matches = sqlx::query!(r#"
        SELECT p.player_id, COUNT(*) OVER() AS "total!"
        FROM player p
        LEFT JOIN website.player_global_playtime gp ON gp.player_id = p.player_id
        WHERE p.associated_player_id IS NULL
          AND p.player_id ~ '^[0-9]+$'
          AND LOWER(p.player_name) LIKE $1
        ORDER BY COALESCE(gp.total_playtime, INTERVAL '0') DESC, p.player_id
        LIMIT $3 OFFSET $2
    "#, pattern, offset, GLOBAL_PLAYERS_PAGE_SIZE).fetch_all(pool).await?;

    let total = matches.first().map(|m| m.total).unwrap_or_default();
    let ids = matches.into_iter().map(|m| m.player_id).collect();
    global_player_page(pool, ids, total).await
}

async fn global_player_page(
    pool: &sqlx::Pool<Postgres>, ids: Vec<String>, total_players: i64,
) -> Result<DbGlobalPlayerPage, sqlx::Error> {
    if ids.is_empty() {
        return Ok(DbGlobalPlayerPage { total_players, players: vec![], communities: vec![] });
    }

    let players = sqlx::query_as!(DbGlobalPlayerBrief, r#"
        SELECT
            p.player_id AS "player_id!",
            p.player_name AS "player_name!",
            COALESCE(gp.total_playtime, INTERVAL '0') AS "total_playtime?",
            COALESCE(gp.global_rank, -1) AS "rank!",
            online.online_since,
            COALESCE(last.last_played, p.created_at) AS "last_played!",
            last.community_id::TEXT AS last_community_id,
            COALESCE(gp.server_count, 0)::BIGINT AS "server_count!",
            last.game,
            $2::BIGINT AS "total_players!"
        FROM UNNEST($1::TEXT[]) WITH ORDINALITY AS ids(player_id, ord)
        JOIN player p ON p.player_id = ids.player_id
        LEFT JOIN website.player_global_playtime gp ON gp.player_id = p.player_id
        LEFT JOIN LATERAL (
            SELECT MIN(pss.started_at) AS online_since
            FROM player_server_session pss
            JOIN player lp ON lp.player_id = pss.player_id
            WHERE (lp.player_id = p.player_id OR lp.associated_player_id = p.player_id)
              AND pss.ended_at IS NULL
              AND CURRENT_TIMESTAMP - pss.started_at < INTERVAL '24 hours'
        ) online ON true
        LEFT JOIN LATERAL (
            SELECT recent.last_played, s.community_id, sm.game
            FROM player lp
            CROSS JOIN LATERAL (
                (SELECT pss.server_id, pss.ended_at AS last_played
                 FROM player_server_session pss
                 WHERE pss.player_id = lp.player_id AND pss.ended_at IS NOT NULL
                 ORDER BY pss.ended_at DESC
                 LIMIT 1)
                UNION ALL
                (SELECT pss.server_id, pss.started_at
                 FROM player_server_session pss
                 WHERE pss.player_id = lp.player_id AND pss.ended_at IS NULL
                 ORDER BY pss.started_at DESC
                 LIMIT 1)
            ) recent
            JOIN server s ON s.server_id = recent.server_id
            LEFT JOIN server_metadata sm ON sm.server_id = s.server_id
            WHERE lp.player_id = p.player_id OR lp.associated_player_id = p.player_id
            ORDER BY recent.last_played DESC
            LIMIT 1
        ) last ON true
        ORDER BY ids.ord
    "#, &ids[..], total_players).fetch_all(pool).await?;

    let communities = sqlx::query_as!(DbGlobalCommunityPlaytime, r#"
        WITH members AS (
            SELECT player_id, player_id AS canonical_id
            FROM player
            WHERE player_id = ANY($1)
            UNION
            SELECT player_id, associated_player_id
            FROM player
            WHERE associated_player_id = ANY($1)
        )
        SELECT
            m.canonical_id AS "player_id!",
            c.community_id,
            COALESCE(c.community_name, '') AS "community_name!",
            c.community_icon_url AS icon_url,
            SUM(pp.total_playtime) AS total_playtime
        FROM members m
        JOIN website.player_playtime pp ON pp.player_id = m.player_id
        JOIN server s ON s.server_id = pp.server_id
        JOIN community c ON c.community_id = s.community_id
        GROUP BY m.canonical_id, c.community_id, c.community_name, c.community_icon_url
        ORDER BY m.canonical_id, SUM(pp.total_playtime) DESC
    "#, &ids[..]).fetch_all(pool).await?;

    Ok(DbGlobalPlayerPage { total_players, players, communities })
}

async fn anonymized_communities(
    pool: &sqlx::Pool<Postgres>, players: &[DbGlobalPlayerBrief],
) -> Result<Vec<(String, uuid::Uuid)>, sqlx::Error> {
    let ids: Vec<i64> = players.iter().filter_map(|player| player.player_id.parse().ok()).collect();
    if ids.is_empty() {
        return Ok(vec![]);
    }

    let rows = sqlx::query!(r#"
        SELECT ua.user_id::TEXT AS "player_id!", ua.community_id AS "community_id!"
        FROM website.user_anonymization ua
        WHERE ua.user_id = ANY($1)
          AND ua.anonymized
    "#, &ids[..]).fetch_all(pool).await?;
    Ok(rows.into_iter().map(|row| (row.player_id, row.community_id)).collect())
}

pub struct ServerApi;
#[OpenApi(tag = "ApiTags::Servers")]
impl ServerApi {
    /// List all communities and their servers.
    ///
    /// Returns every tracked community together with its servers, each server's current
    /// player count (capped at `max_players`) and currently-played map. Cached for 60 seconds.
    #[oai(path = "/communities", method = "get", operation_id = "list_servers", tag = "ApiTags::Mcp")]
    async fn get_communities(&self, Data(data): Data<&AppData>) -> Response<Vec<Community>> {
        let pool = &*data.pool.clone();
        let func = || sqlx::query_as!(DbServerCommunity, "
            SELECT
                c.community_id,
                c.community_name,
                c.community_shorten_name,
                c.community_icon_url,
                s.server_id,
                s.server_name,
                s.server_port,
                s.server_ip,
                s.max_players,
                s.server_fullname,
                s.online,
                s.readable_link,
                s.tracking_since,
                LEAST((SELECT COUNT(DISTINCT player_id) FROM player_server_session p
                    WHERE p.server_id = s.server_id
                    AND p.ended_at IS NULL
                    AND CURRENT_TIMESTAMP - p.started_at < INTERVAL '24 hours'),
                    COALESCE(s.max_players, 64)
                ) AS player_count,
                sm.server_website,
                sm.server_discord_link,
                sm.server_source,
                sm.game,
                COALESCE(sm.source_by_id, false) source_by_id,
                COALESCE(smp.map, NULL) AS map
            FROM server s
            INNER JOIN community c
                ON c.community_id = s.community_id
            LEFT JOIN LATERAL (
                SELECT map
                FROM server_map_played
                WHERE server_id = s.server_id
                  AND ended_at IS NULL
                ORDER BY started_at DESC
                LIMIT 1
            ) smp ON true
            LEFT JOIN server_metadata sm
                ON sm.server_id=s.server_id
            ORDER BY player_count DESC, online DESC, c.community_name
        ").fetch_all(pool);

        let response = or_ise!(cached_response("communities", &data.cache, 60, func).await);
        let mut results: IndexMap<String, Community> = IndexMap::new();
        let data = response.result;

        for d in data {
            let id = &d.community_id;
            let com = results.entry(id.clone()).or_insert(Community {
                id: id.clone(),
                name: d.community_name.clone().unwrap_or_default(),
                shorten_name: d.community_shorten_name.clone(),
                icon_url: d.community_icon_url.clone(),
                servers: vec![]
            });
            com.servers.push(d.into())
        }

        response!(ok results.into_values().collect())
    }

    /// Search and paginate players across every community.
    ///
    /// `page` is a 0-indexed page of 10 players, ranked by total playtime. `search` filters by
    /// player name (case-insensitive substring, minimum 2 characters); results are cached for 10
    /// minutes to 2 days when unfiltered, depending on the page, and computed live when searching.
    #[oai(path = "/communities/all/players", method = "get", operation_id = "search_players_global", tag = "ApiTags::Mcp")]
    async fn get_global_players(
        &self, Data(data): Data<&AppData>,
        Query(page): Query<usize>, Query(search): Query<Option<String>>,
        OptionalTokenBearer(user_token): OptionalTokenBearer,
    ) -> Response<GlobalBriefPlayers> {
        let pool = &*data.pool;
        let offset = page as i64 * GLOBAL_PLAYERS_PAGE_SIZE;

        let search = search
            .map(|s| s.trim().to_string())
            .filter(|s| s.len() >= 2)
            .map(|s| {
                let escaped = s.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_");
                format!("%{}%", escaped.to_lowercase())
            });

        let DbGlobalPlayerPage { total_players, players, communities } = match search {
            Some(pattern) => or_ise!(search_global_players(pool, &pattern, offset).await),
            None => {
                let caching_time = match page {
                    1..=3 => 2 * DAY,
                    4..=5 => DAY,
                    6..=9 => 12 * HOUR,
                    10..=14 => 6 * HOUR,
                    15..=20 => 3 * HOUR,
                    21..=30 => HOUR,
                    _ => 10 * 60,
                };
                let func = || browse_global_players(pool, &data.cache, offset);
                or_ise!(cached_response(&format!("global-players-v3:{page}"), &data.cache, caching_time, func).await).result
            }
        };

        let anonymized = or_ise!(anonymized_communities(pool, &players).await);
        let viewer_id = user_token.as_ref().map(|token| token.id);
        let mut communities_by_player: HashMap<String, Vec<PlayerCommunityPlaytime>> = HashMap::new();
        for community in communities {
            let is_anonymized = anonymized.iter().any(|(player_id, community_id)|
                *player_id == community.player_id && *community_id == community.community_id
            );
            if is_anonymized && !or_ise!(can_view_player_in_community(
                data, &community.player_id, community.community_id, viewer_id,
            ).await) {
                continue;
            }
            communities_by_player.entry(community.player_id.clone()).or_default().push(community.into());
        }

        let mut result = Vec::with_capacity(players.len());
        for row in players {
            let id = row.player_id.clone();
            let pfp = match id.parse::<i64>() {
                Ok(steam_id) => get_cached_profile(&data.cache, &steam_id).await
                    .map(|profile| PlayerProfilePicture::from_full_url(id.clone(), profile.url)),
                Err(_) => None,
            };
            let mut player: GlobalPlayerBrief = row.into();
            player.communities = communities_by_player.remove(&id).unwrap_or_default();
            player.pfp = pfp;
            result.push(player);
        }

        response!(ok GlobalBriefPlayers { total_players, players: result })
    }

    /// List players currently online across all tracked servers. Bots are left out.
    ///
    /// A player's name is replaced with "Anonymous" if they opted into anonymization for that
    /// community, unless the requester is that player, a superuser, or an admin of that community.
    #[oai(path="/communities/all/players/playing", method="get")]
    async fn get_players_playing(&self, Data(app): Data<&AppData>, OptionalTokenBearer(user_token): OptionalTokenBearer) -> Response<Vec<PlayerDetailSessionCommunity>>{
        let pool = &*app.pool.clone();
        let user_id = user_token.as_ref().map(|t| t.id);

        let func = || sqlx::query_as!(DbPlayerDetailSession, r#"
            WITH user_perms AS (
                SELECT
                    COALESCE(website.is_superuser($1), FALSE) AS is_superuser
                WHERE $1 IS NOT NULL
            )
            SELECT
                pss.session_id AS "session_id!",
                pss.server_id AS "server_id!",
                CASE
                    WHEN ua.anonymized = TRUE
                         AND $1::TEXT IS DISTINCT FROM COALESCE(p.associated_player_id, p.player_id)
                         AND NOT COALESCE((SELECT is_superuser FROM user_perms), FALSE)
                         AND NOT COALESCE(website.is_community_admin($1, sc.community_id), FALSE)
                    THEN 'Anonymous'
                    ELSE p.player_name
                END AS "player_name",
                pss.player_id AS "player_id!",
                pss.started_at,
                pss.ended_at,
                CASE
                    WHEN ua.anonymized = TRUE
                         AND $1::TEXT IS DISTINCT FROM COALESCE(p.associated_player_id, p.player_id)
                         AND NOT COALESCE((SELECT is_superuser FROM user_perms), FALSE)
                         AND NOT COALESCE(website.is_community_admin($1, sc.community_id), FALSE)
                    THEN TRUE
                    ELSE FALSE
                END AS "is_anonymous!",
                COALESCE(ua.anonymized, FALSE) AS "hidden_from_others!"
            FROM player_server_session pss
            JOIN player p ON p.player_id = pss.player_id
            JOIN server sc ON sc.server_id = pss.server_id
            LEFT JOIN website.user_anonymization ua
                   ON ua.user_id::TEXT = COALESCE(p.associated_player_id, p.player_id)
                  AND ua.community_id = sc.community_id
            WHERE pss.ended_at IS NULL AND CURRENT_TIMESTAMP - pss.last_verified < INTERVAL '20 minutes'
              AND NOT EXISTS (SELECT 1 FROM bot_player b WHERE b.player_id = pss.player_id)
            ORDER BY pss.started_at
        "#, user_id).fetch_all(pool);

        let viewer_cache_key = user_id
            .map(|id| format!("global-players-playing:{id}"))
            .unwrap_or_else(|| "global-players-playing:anonymous".to_string());
        let result = or_ise!(cached_response(&viewer_cache_key, &app.cache, 2 * 60, func).await).result;
        let converted = result.into_iter().map(|e| {
            let server_id = e.server_id.clone();
            let player_detail: PlayerDetailSession = e.into();
            PlayerDetailSessionCommunity{ player_detail, server_id }
        }).collect::<Vec<_>>();

        response!(ok converted)
    }

    /// Unique player count over time for a community, or globally.
    ///
    /// Use `community_id = "all"` for the combined graph across every community. `time_type`
    /// picks the bucket width (`TenMinutes`, `OneHour`, `OneDay`) and `time` anchors the most
    /// recent bucket; up to 31 buckets before it are returned.
    #[oai(path = "/communities/:community_id/unique_players", method="get", operation_id = "get_community_player_count_graph", tag = "ApiTags::Mcp")]
    async fn get_communities_players_graph(
        &self, Data(data): Data<&AppData>,
        CommunityWithAllExtractor(community): CommunityWithAllExtractor,
        Query(time_type): Query<CommunityGraphTime>,
        Query(time): Query<DateTime<Utc>>
    ) -> Response<Vec<ServerCountData>> {
        let pool = &*data.pool.clone();

        let interval_str: &str = match time_type {
            CommunityGraphTime::TenMinutes => "10 minutes",
            CommunityGraphTime::OneHour => "1 hour",
            CommunityGraphTime::OneDay => "1 day",
        };
        let width_seconds: i64 = match time_type {
            CommunityGraphTime::TenMinutes => 600,
            CommunityGraphTime::OneHour => HOUR as i64,
            CommunityGraphTime::OneDay => DAY as i64,
        };
        let rounded_secs = time.timestamp() / width_seconds * width_seconds;
        let truncated_time = DateTime::from_timestamp(rounded_secs, 0).unwrap_or(time);
        let key = format!(
            "community_players_graph:{}:{}:{}",
            community.as_ref().map(|c| c.community_id.clone()).unwrap_or("all".into()), time_type, rounded_secs
        );

        let cache_ttl: u64 = match time_type {
            CommunityGraphTime::TenMinutes => 3 * 60,
            CommunityGraphTime::OneHour => 30 * 60,
            CommunityGraphTime::OneDay => 2 * HOUR,
        };

        let bound_time = truncated_time.to_db_time();
        let time_type_str = time_type.to_string();
        let response = if let Some(c) = community{
            let community_id = c.community_id.clone();
            let func = || sqlx::query_as!(
                DbServerCountData,
                "WITH buckets AS (
                    SELECT
                        gs AS bucket_time,
                        gs + $3::TEXT::interval AS bucket_end
                    FROM generate_series(
                        $2::timestamptz - ($3::TEXT::interval * 31),
                        $2::timestamptz,
                        $3::TEXT::interval
                    ) AS gs
                ),
                stored AS (
                    SELECT b.bucket_time, c.player_count
                    FROM buckets b
                    JOIN community_player_counts c
                        ON c.community_id = $1::TEXT::uuid
                       AND c.time_type = $4
                       AND c.bucket_time = b.bucket_time
                ),
                live AS (
                    SELECT
                        b.bucket_time,
                        COUNT(DISTINCT pss.player_id)::bigint AS player_count
                    FROM buckets b
                    LEFT JOIN player_server_session pss
                        ON pss.server_id IN (SELECT server_id FROM server WHERE community_id = $1::TEXT::uuid)
                       AND tstzrange(pss.started_at, pss.ended_at)
                           && tstzrange(b.bucket_time, b.bucket_end)
                    WHERE NOT EXISTS (SELECT 1 FROM stored s WHERE s.bucket_time = b.bucket_time)
                    GROUP BY b.bucket_time
                )
                SELECT NULL::VARCHAR(100) AS server_id, bucket_time, player_count FROM stored
                UNION ALL
                SELECT NULL::VARCHAR(100), bucket_time, player_count FROM live
                ORDER BY bucket_time DESC",
                community_id,
                bound_time,
                interval_str,
                time_type_str
            ).fetch_all(pool);

            let response = or_ise!(cached_response(&key, &data.cache, cache_ttl, func).await);
            response
        } else {
            let func = || sqlx::query_as!(
                DbServerCountData,
                "WITH buckets AS (
                    SELECT
                        gs AS bucket_time,
                        gs + $2::TEXT::interval AS bucket_end
                    FROM generate_series(
                        $1::timestamptz - ($2::TEXT::interval * 31),
                        $1::timestamptz,
                        $2::TEXT::interval
                    ) AS gs
                ),
                stored AS (
                    SELECT b.bucket_time, SUM(c.player_count)::bigint player_count
                    FROM buckets b
                    JOIN community_player_counts c
                       ON c.time_type = $3
                       AND c.bucket_time = b.bucket_time
                    GROUP BY b.bucket_time
                ),
                live AS (
                    SELECT
                        b.bucket_time,
                        COUNT(DISTINCT pss.player_id)::bigint AS player_count
                    FROM buckets b
                    LEFT JOIN player_server_session pss
                        ON tstzrange(pss.started_at, pss.ended_at)
                           && tstzrange(b.bucket_time, b.bucket_end)
                    WHERE NOT EXISTS (SELECT 1 FROM stored s WHERE s.bucket_time = b.bucket_time)
                    GROUP BY b.bucket_time
                )
                SELECT NULL::VARCHAR(100) AS server_id, bucket_time, player_count FROM stored
                UNION ALL
                SELECT NULL::VARCHAR(100), bucket_time, player_count FROM live
                ORDER BY bucket_time DESC",
                bound_time,
                interval_str,
                time_type_str
            ).fetch_all(pool);

            let response = or_ise!(cached_response(&key, &data.cache, cache_ttl, func).await);
            response
        };
        response!(ok response.result.iter_into())
    }
    /// Raw scraper fetch attempts from the last 24 hours.
    ///
    /// Requires the `superuser` role. Lists each individual fetch (per server, per data source)
    /// with its success flag and error message, newest first.
    #[oai(path = "/fetch-status", method="get")]
    async fn get_fetch_status(&self, Data(data): Data<&AppData>, TokenBearer(user_token): TokenBearer) -> Response<Vec<FetchStatusEntry>> {
        require!(check_superuser(data, user_token.id).await, "Unauthorized", ErrorCode::Forbidden);
        let pool = &*data.pool.clone();
        let func = || async {
            sqlx::query_as!(DbFetchStatus, "
                SELECT
                    fs.fetch_id,
                    fs.server_id,
                    s.server_fullname AS server_name,
                    c.community_id::TEXT AS community_id,
                    c.community_name,
                    fs.op_name,
                    fs.source_name,
                    fs.fetched_at,
                    fs.ok,
                    fs.error
                FROM server_fetch_status fs
                LEFT JOIN server s ON s.server_id = fs.server_id
                LEFT JOIN community c ON c.community_id = s.community_id
                WHERE fs.fetched_at >= CURRENT_TIMESTAMP - INTERVAL '1 day'
                ORDER BY fs.fetched_at DESC
            ")
            .fetch_all(pool)
            .await
        };

        let response = or_ise!(cached_response("fetch_status", &data.cache, 60, func).await);

        response!(ok response.result.iter_into())
    }

    /// Scraper health, grouped and bucketed for a status dashboard.
    #[oai(path = "/fetch-status-truncated", method="get")]
    async fn get_fetch_status_truncated(&self, Data(data): Data<&AppData>) -> Response<Vec<FetchStatusCommunityGroupTruncated>> {
        let pool = &*data.pool.clone();
        // TODO: get all tracking servers instead
        let func = || async {
            sqlx::query_as!(DbFetchStatus, "
                SELECT
                    fs.fetch_id,
                    fs.server_id,
                    s.server_fullname AS server_name,
                    c.community_id::TEXT AS community_id,
                    c.community_name,
                    fs.op_name,
                    fs.source_name,
                    fs.fetched_at,
                    fs.ok,
                    fs.error
                FROM server_fetch_status fs
                LEFT JOIN server s ON s.server_id = fs.server_id
                LEFT JOIN community c ON c.community_id = s.community_id
                WHERE fs.fetched_at >= CURRENT_TIMESTAMP - INTERVAL '1 day'
                ORDER BY fs.fetched_at DESC
            ")
            .fetch_all(pool)
            .await
        };

        let response = or_ise!(cached_response("fetch_status_truncated", &data.cache, 60, func).await);

        const BUCKET_COUNT: usize = 90;
        const BUCKET_MINUTES: i64 = (24 * 60) / BUCKET_COUNT as i64;

        let now = Utc::now();
        let entries: Vec<FetchStatusEntry> = response.result.iter_into();

        let mut comm_map: IndexMap<String, (String, IndexMap<String, (String, IndexMap<String, Vec<(DateTime<Utc>, bool, Option<String>)>>)>)> = IndexMap::new();

        for e in &entries {
            let comm = comm_map
                .entry(e.community_id.clone())
                .or_insert_with(|| (e.community_name.clone(), IndexMap::new()));
            let srv = comm.1
                .entry(e.server_id.clone())
                .or_insert_with(|| (e.server_name.clone(), IndexMap::new()));
            let label = format!("{} \u{00b7} {}", e.op_name, e.source_name);
            srv.1
                .entry(label)
                .or_default()
                .push((e.fetched_at, e.ok, e.error.clone()));
        }

        let mut communities: Vec<FetchStatusCommunityGroupTruncated> = Vec::new();

        for (community_id, (community_name, servers_map)) in comm_map {
            let mut servers: Vec<FetchStatusServerGroupTruncated> = Vec::new();

            for (server_id, (server_name, tracks_map)) in servers_map {
                let mut tracks: Vec<FetchStatusTrack> = Vec::new();

                for (label, raw_entries) in tracks_map {
                    let mut buckets: Vec<FetchStatusBucket> = (0..BUCKET_COUNT)
                        .map(|i| FetchStatusBucket { ok: 0, error: 0, first_error: None, bucket_index: i as u8 })
                        .collect();

                    let mut total_ok: i64 = 0;
                    let total_fetches = raw_entries.len() as i64;

                    for (fetched_at, ok, error) in &raw_entries {
                        let minutes_ago = now.signed_duration_since(*fetched_at).num_minutes();
                        let idx = (BUCKET_COUNT as i64 - 1) - (minutes_ago / BUCKET_MINUTES);
                        if idx >= 0 && idx < BUCKET_COUNT as i64 {
                            let b = &mut buckets[idx as usize];
                            if *ok {
                                b.ok += 1;
                            } else {
                                b.error += 1;
                                if b.first_error.is_none() {
                                    b.first_error = error.as_deref().map(truncate_error);
                                }
                            }
                        }
                        if *ok { total_ok += 1; }
                    }

                    tracks.push(FetchStatusTrack { label, total_ok, total_fetches, buckets });
                }

                servers.push(FetchStatusServerGroupTruncated { server_id, server_name, tracks });
            }

            communities.push(FetchStatusCommunityGroupTruncated { community_id, community_name, servers });
        }

        response!(ok communities)
    }
}
