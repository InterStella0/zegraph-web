use chrono::Utc;
use indexmap::IndexMap;
use poem::web::Data;
use poem_openapi::OpenApi;
use crate::{response, AppData};
use crate::core::model::*;
use crate::core::api_models::*;
use crate::core::utils::*;

fn truncate_error(error: &str) -> String {
    let truncated = match error.find(", ") {
        Some(pos) => &error[..pos],
        None => error,
    };
    truncated.chars().take(80).collect()
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
        let mut comm_map: IndexMap<String, (String, IndexMap<String, (String, IndexMap<String, Vec<(chrono::DateTime<Utc>, bool, Option<String>)>>)>)> = IndexMap::new();

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
            "/fetch-status",
            "/fetch-status-truncated",
        ].iter_into()
    }
}