use std::fmt::Display;
use chrono::{DateTime, Utc};
use indexmap::IndexMap;
use poem::http::StatusCode;
use poem::web::Data;
use poem_openapi::{Enum, OpenApi};
use poem_openapi::param::Query;
use sqlx::Postgres;
use crate::{response, AppData, FastCache};
use crate::api_models::common::*;
use crate::api_models::misc::*;
use crate::api_models::servers::*;
use crate::core::utils::*;
use crate::models::admins::DbFetchStatus;
use crate::models::servers::*;

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

    let data = cached_response(&key, cache, 60 * 60, func).await.ok();
    data.map(|e| e.result)
}
struct CommunityExtractor(pub DbServerCommunity);


impl<'a> poem::FromRequest<'a> for CommunityExtractor {
    async fn from_request(req: &'a poem::Request, _body: &mut poem::RequestBody) -> poem::Result<Self> {
        let community_id = req.raw_path_param("community_id")
            .ok_or_else(|| poem::Error::from_string("Invalid community_id", StatusCode::BAD_REQUEST))?;

        let data: &AppData = req.data()
            .ok_or_else(|| poem::Error::from_string("Invalid data", StatusCode::BAD_REQUEST))?;

        let Some(community) = get_community(&data.pool, &data.cache, &community_id).await else {
            return Err(poem::Error::from_string("Community not found", StatusCode::NOT_FOUND))
        };

        Ok(CommunityExtractor(community))
    }
}
pub struct ServerApi;
#[OpenApi]
impl ServerApi {
    #[oai(path = "/communities", method="get")]
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

        let Ok(response) = cached_response("communities", &data.cache, 60, func).await else {
            return response!(internal_server_error)
        };
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

    #[oai(path = "/communities/:community_id/unique_players", method="get")]
    async fn get_communities_players_graph(
        &self, Data(data): Data<&AppData>,
        CommunityExtractor(community): CommunityExtractor,
        Query(time_type): Query<CommunityGraphTime>,
        Query(time): Query<DateTime<Utc>>
    ) -> Response<Vec<ServerCountData>> {
        let pool = &*data.pool.clone();

        let interval_str: &str = match time_type {
            CommunityGraphTime::TenMinutes => "10 minutes",
            CommunityGraphTime::OneHour   => "1 hour",
            CommunityGraphTime::OneDay    => "1 day",
        };
        let width_seconds: i64 = match time_type {
            CommunityGraphTime::TenMinutes => 600,
            CommunityGraphTime::OneHour   => 3600,
            CommunityGraphTime::OneDay    => 86400,
        };
        let rounded_secs = time.timestamp() / width_seconds * width_seconds;
        let truncated_time = DateTime::from_timestamp(rounded_secs, 0).unwrap_or(time);
        let key = format!(
            "community_players_graph:{}:{}:{}",
            community.community_id, time_type, rounded_secs
        );

        let cache_ttl: u64 = match time_type {
            CommunityGraphTime::TenMinutes => 3 * 60,
            CommunityGraphTime::OneHour   => 30 * 60,
            CommunityGraphTime::OneDay    => 2 * 60 * 60,
        };
        let community_id = community.community_id.clone();
        let bound_time = truncated_time.to_db_time();
        let time_type_str = time_type.to_string();
        // Closed buckets come precomputed from community_player_counts (pg_cron,
        // get_community_player_counts); only buckets missing from it (the open
        // tail, or gaps the cron hasn't covered yet) are computed live.
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

        let Ok(response) = cached_response(&key, &data.cache, cache_ttl, func).await else {
            return response!(internal_server_error)
        };

        response!(ok response.result.iter_into())
    }
    #[oai(path = "/fetch-status", method="get")]
    async fn get_fetch_status(&self, Data(data): Data<&AppData>, TokenBearer(user_token): TokenBearer) -> Response<Vec<FetchStatusEntry>> {
        if !check_superuser(data, user_token.id).await {
            return response!(err "Unauthorized", ErrorCode::Forbidden);
        }
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

        let Ok(response) = cached_response("fetch_status", &data.cache, 60, func).await else {
            return response!(internal_server_error)
        };

        response!(ok response.result.iter_into())
    }

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

        let Ok(response) = cached_response("fetch_status_truncated", &data.cache, 60, func).await else {
            return response!(internal_server_error)
        };

        const BUCKET_COUNT: usize = 90;
        const BUCKET_MINUTES: i64 = (24 * 60) / BUCKET_COUNT as i64;

        let now = Utc::now();
        let entries: Vec<FetchStatusEntry> = response.result.iter_into();

        // community_id -> (name, server_id -> (name, track_label -> [(fetched_at, ok, error)]))
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
impl UriPatternExt for ServerApi {
    fn get_all_patterns(&self) -> Vec<RoutePattern<'_>> {
        vec![
            "/communities",
            "/communities/{community_id}/unique_players",
            "/fetch-status",
            "/fetch-status-truncated",
        ].iter_into()
    }
}