use chrono::{DateTime, Duration, Utc};
use poem_openapi::{param::Query, Enum, OpenApi};
use std::collections::HashMap;
use std::fmt::Display;
use std::sync::Arc;

use moka::future::Cache;
use poem::web::Data;
use poem_openapi::param::Path;
use sqlx::{Pool, Postgres};
use time::OffsetDateTime;
use crate::core::utils::*;
use crate::{response, AppData};
use crate::api_models::common::*;
use crate::api_models::maps::Region;
use crate::api_models::players::{BriefPlayers, EventType, PlayerBrief};
use crate::api_models::servers::{ServerCountData, ServerMapPlayed};
use crate::models::admins::DbRegion;
use crate::models::maps::*;
use crate::models::players::*;
use crate::models::servers::*;
use crate::routers::ApiTags;

pub type CountChunkCache = Cache<String, Arc<Vec<DbServerCountData>>>;

const HOUR_SECS: i64 = 3600;


const CHUNK_COMPLETE_LAG_SECS: i64 = 10 * 60;

fn count_bucket_width_mins(span: Duration) -> i32 {
	const HOUR: i64 = 60;
	const DAY: i64 = 24 * HOUR;
	let mins = span.num_minutes();
	match mins {
		m if m <= 12 * HOUR => 5,
		m if m <= DAY => 10,
		m if m <= 3 * DAY => 30,
		m if m <= 7 * DAY => 60,
		m if m <= 14 * DAY => 120,
		m if m <= 31 * DAY => 240,
		m if m <= 92 * DAY => 720,
		m if m <= 183 * DAY => 1440,
		m if m <= 275 * DAY => 2160,
		_ => 2880,
	}
}

async fn get_counts_hour_chunked(
	pool: &Pool<Postgres>, cache: &CountChunkCache, server_id: &str,
	start: DateTime<Utc>, end: DateTime<Utc>,
) -> Result<Vec<DbServerCountData>, sqlx::Error> {
	let first_hour = start.timestamp().div_euclid(HOUR_SECS) * HOUR_SECS;
	let last_hour = end.timestamp().div_euclid(HOUR_SECS) * HOUR_SECS;
	let mut chunks = Vec::new();
	let mut hour = first_hour;
	while hour <= last_hour {
		let cached = cache.get(&format!("{server_id}:{hour}")).await;
		chunks.push((hour, cached));
		hour += HOUR_SECS;
	}

	let mut missing_ranges: Vec<(i64, i64)> = Vec::new();
	for (hour, cached) in &chunks {
		if cached.is_some() {
			continue;
		}
		match missing_ranges.last_mut() {
			Some((_, range_end)) if *range_end + HOUR_SECS == *hour => *range_end = *hour,
			_ => missing_ranges.push((*hour, *hour)),
		}
	}

	let mut fetched: HashMap<i64, Vec<DbServerCountData>> = HashMap::new();
	for (range_start, range_end) in missing_ranges {
		let range_start_time = OffsetDateTime::from_unix_timestamp(range_start)
			.map_err(|e| sqlx::Error::Decode(e.into()))?;
		let range_end_time = OffsetDateTime::from_unix_timestamp(range_end + HOUR_SECS)
			.map_err(|e| sqlx::Error::Decode(e.into()))?;
		let rows = sqlx::query_as!(DbServerCountData,
			"SELECT server_id, bucket_time, player_count::bigint player_count
			 FROM server_player_counts
			 WHERE server_id = $1 AND bucket_time >= $2 AND bucket_time < $3",
			server_id, range_start_time, range_end_time
		).fetch_all(pool).await?;
		let mut hour = range_start;
		while hour <= range_end {
			fetched.insert(hour, Vec::new());
			hour += HOUR_SECS;
		}
		for row in rows {
			let Some(bucket_time) = row.bucket_time else { continue };
			let hour = bucket_time.unix_timestamp().div_euclid(HOUR_SECS) * HOUR_SECS;
			fetched.entry(hour).or_default().push(row);
		}
	}

	let now = Utc::now().timestamp();
	let mut result = Vec::new();
	for (hour, cached) in chunks {
		match cached {
			Some(rows) => result.extend(rows.iter().cloned()),
			None => {
				let rows = fetched.remove(&hour).unwrap_or_default();
				if hour + HOUR_SECS <= now - CHUNK_COMPLETE_LAG_SECS {
					cache.insert(format!("{server_id}:{hour}"), Arc::new(rows.clone())).await;
				}
				result.extend(rows);
			}
		}
	}
	let (start_ts, end_ts) = (start.timestamp(), end.timestamp());
	result.retain(|r| r.bucket_time
		.map(|t| (start_ts..=end_ts).contains(&t.unix_timestamp()))
		.unwrap_or(false));
	result.sort_by(|a, b| b.bucket_time.cmp(&a.bucket_time));
	Ok(result)
}

/// Ranking window for the top-players leaderboard.
#[derive(Enum)]
#[oai(rename_all = "lowercase")]
enum TopPlayersTimeFrame{
	Today,
	Week1,
	Week2,
	Month1,
	Month6,
	Year1
}


impl Display for TopPlayersTimeFrame {
	fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
		match self {
			TopPlayersTimeFrame::Today => write!(f, "today"),
			TopPlayersTimeFrame::Week1 => write!(f, "week1"),
			TopPlayersTimeFrame::Week2 => write!(f, "week2"),
			TopPlayersTimeFrame::Month1 => write!(f, "month1"),
			TopPlayersTimeFrame::Month6 => write!(f, "month6"),
			TopPlayersTimeFrame::Year1 => write!(f, "year1"),
		}
	}
}

pub struct GraphApi;

#[OpenApi(tag = "ApiTags::Graphs")]
impl GraphApi {
	/// List map regions used for heat/region charts.
	///
	/// Returns up to 10 rows from the `region_time` view. `server_id` is validated but not
	/// otherwise used to filter the result.
	#[oai(path = "/graph/:server_id/get_regions", method="get")]
	async fn get_server_graph_region(
		&self, Data(app): Data<&AppData>, ServerExtractor(_server): ServerExtractor
	) -> Response<Vec<Region>>{
		let Ok(data) = sqlx::query_as!(DbRegion, "SELECT * FROM region_time LIMIT 10").fetch_all(&*app.pool.clone()).await else {
			return response!(internal_server_error)
		};
		response!(ok data.iter_into())
	}
	/// Player-count chart for a single map session.
	///
	/// Returns the player-count time series for the given map play (`session_id`) on that
	/// server, downsampled to at most 1500 peak-preserving points. Cached briefly while the map
	/// is still being played, for a long time once it has ended.
	#[oai(path = "/graph/:server_id/unique_players/maps/:map_name/sessions/:session_id", method = "get")]
	async fn get_server_graph_unique_map_session(
		&self, Data(app): Data<&AppData>,
		ServerExtractor(server): ServerExtractor,
		Path(map_name): Path<String>, Path(session_id): Path<i32>
	) -> Response<Vec<ServerCountData>> {
		let pool = &*app.pool.clone();
		let cache = &app.cache;
		let checker = || sqlx::query_as!(DbMapIsPlaying,
			"WITH session AS (SELECT time_id,
    			       server_id,
    			       map,
    			       player_count,
    			       started_at,
    			       ended_at
    			FROM server_map_played
    			WHERE server_id=$1 AND time_id=$3 AND map=$2)
    		 SELECT ended_at IS NULL AS result
    		 FROM session"
		, server.server_id, map_name, session_id
		).fetch_one(pool);
		let checker_key = format!("session-checker:{}:{}:{}", server.server_id, map_name, session_id);
		let mut is_playing = false;
		if let Ok(result) = cached_response(&checker_key, cache, 5 * 60, checker).await {
			is_playing = result.result.result.unwrap_or_default();
		}

		let func = || sqlx::query_as!(DbServerCountData,
			"WITH map_session AS (
    			SELECT time_id,
    			       server_id,
    			       map,
    			       player_count,
    			       started_at,
    			       COALESCE(ended_at, CURRENT_TIMESTAMP) AS ended
    			FROM server_map_played
    			WHERE server_id=$1 AND time_id=$3 AND map=$2
    			LIMIT 1
			)
			SELECT
			    server_id,
				bucket_time,
				player_count::bigint AS player_count
			FROM server_player_counts
			WHERE server_id=$1 AND
			  	bucket_time BETWEEN (SELECT started_at FROM map_session)
				AND (SELECT ended FROM map_session)
			ORDER BY bucket_time DESC
			",
			server.server_id, map_name, session_id
		).fetch_all(pool);
		let key = format!("graph-server-map-players:{}:{}:{}", server.server_id, map_name, session_id);
		let ttl = if is_playing{ 60 } else { 60 * DAY };
		let Ok(resp) = cached_response(&key, cache, ttl, func)
			.await else {
			return response!(internal_server_error);
		};
		let mut result = retain_peaks(resp.result, 1_500,
									  |left, maxed| left.player_count > maxed.player_count,
									  |left, min| left.player_count < min.player_count,
		);
		result.sort_by(|a, b| b.bucket_time.partial_cmp(&a.bucket_time).unwrap_or(std::cmp::Ordering::Equal));
		response!(ok result.iter_into())
	}
	/// Player-count chart for the duration of a single player's session.
	///
	/// Returns the server's player-count time series over the span of the given player session,
	/// downsampled to at most 1500 peak-preserving points. Cached briefly while the session is
	/// still active, for a long time once it has ended.
	#[oai(path = "/graph/:server_id/unique_players/players/:player_id/sessions/:session_id", method = "get")]
	async fn get_server_graph_unique_player_session(
		&self, Data(app): Data<&AppData>,
		ServerExtractor(server): ServerExtractor,
		Path(player_id): Path<String>, Path(session_id): Path<String>,
		OptionalAnonymousTokenBearer(_user_token): OptionalAnonymousTokenBearer,
	) -> Response<Vec<ServerCountData>> {
		let pool = &*app.pool.clone();
		let cache = &app.cache;
		let func = || sqlx::query_as!(DbPlayerSession, "
			WITH server_community AS (
			    SELECT community_id FROM server WHERE server_id=$1
			)
            SELECT session_id, server_id, player_id, started_at, ended_at, last_verified, COALESCE(ua.anonymized, NULL) as is_anonymous
            FROM player_server_session p
            CROSS JOIN server_community sc
            LEFT JOIN website.user_anonymization ua ON ua.user_id::TEXT = p.player_id AND ua.community_id = sc.community_id
            WHERE server_id=$1 AND player_id=$2
            ORDER BY started_at DESC
            LIMIT 1
        ", server.server_id, player_id).fetch_one(pool);
		let checker_key = format!("session-player-checker:{}:{}:{}", server.server_id, player_id, session_id);
		let mut is_playing = false;
		if let Ok(result) = cached_response(&checker_key, cache, 5 * 60, func).await {
			is_playing = result.result.ended_at.is_none();
		}

		let func = || sqlx::query_as!(DbServerCountData,
			"WITH player_session AS (
    			SELECT session_id, server_id, player_id, started_at,
    			       COALESCE(ended_at, CURRENT_TIMESTAMP) AS ended
    			FROM player_server_session
    			WHERE server_id=$1 AND session_id=$3::text::uuid AND player_id=$2
    			LIMIT 1
			)
			SELECT
			    server_id,
				bucket_time,
				player_count::bigint AS player_count
			FROM server_player_counts
			WHERE server_id=$1 AND
			  	bucket_time BETWEEN (SELECT started_at FROM player_session)
				AND (SELECT ended FROM player_session)
			ORDER BY bucket_time DESC
			",
			server.server_id, player_id, session_id
		).fetch_all(pool);
		let key = format!("graph-server-session-players:{}:{}:{}", server.server_id, player_id, session_id);
		let ttl = if is_playing{ 5 * 60 } else { 60 * DAY };
		let Ok(resp) = cached_response(&key, cache, ttl, func)
			.await else {
			return response!(internal_server_error);
		};
		let mut result = retain_peaks(resp.result, 1_500,
									  |left, maxed| left.player_count > maxed.player_count,
									  |left, min| left.player_count < min.player_count,
		);
		result.sort_by(|a, b| b.bucket_time.partial_cmp(&a.bucket_time).unwrap_or(std::cmp::Ordering::Equal));
		response!(ok result.iter_into())
	}
    /// Unique/concurrent player-count chart over an arbitrary date range.
    ///
    /// `start`/`end` must span at most 1 year. Bucket width is chosen automatically based on the
    /// range (from 5-minute buckets for half-day windows up to 2-day buckets for year-long
    /// ones); ranges of 6 hours or less are served from an in-memory hourly chunk cache instead.
    #[oai(path = "/graph/:server_id/unique_players", method = "get")]
    async fn get_server_graph_unique(
		&self, Data(data): Data<&AppData>, ServerExtractor(server): ServerExtractor,
		Query(start): Query<DateTime<Utc>>, Query(end): Query<DateTime<Utc>>
	) -> Response<Vec<ServerCountData>> {
		let pool = &*data.pool.clone();
		let span = end.signed_duration_since(start);
		if span > Duration::days(366) {
			return response!(err "You can only get data within 1 year", ErrorCode::BadRequest);
		};
		if span <= Duration::hours(6) {
			let Ok(result) = get_counts_hour_chunked(
				pool, &data.count_chunk_cache, &server.server_id, start, end
			).await else {
				return response!(internal_server_error);
			};
			return response!(ok result.iter_into());
		}
		let Ok(result) = sqlx::query_as!(DbServerCountData,
			"WITH agg AS (
			  SELECT
				date_bin(make_interval(mins => $4), bucket_time, 'epoch'::timestamptz) AS bucket,
				MIN((player_count::bigint << 32) | EXTRACT(EPOCH FROM bucket_time)::bigint) AS min_enc,
				MAX((player_count::bigint << 32) | EXTRACT(EPOCH FROM bucket_time)::bigint) AS max_enc
			  FROM server_player_counts
			  WHERE
				server_id = $1
				AND bucket_time BETWEEN $2 AND $3
			  GROUP BY 1
			)
			SELECT DISTINCT
			       $1 AS server_id,
			       to_timestamp((v.enc & ((1::bigint << 32) - 1))::double precision) AS bucket_time,
			       (v.enc >> 32) AS player_count
			FROM agg
			CROSS JOIN LATERAL (VALUES (min_enc), (max_enc)) AS v(enc)
			ORDER BY bucket_time DESC;
			",
			server.server_id, start.to_db_time(), end.to_db_time(),
			count_bucket_width_mins(span)
		)
		.fetch_all(pool)
		.await else {
			return response!(internal_server_error);
		};
		response!(ok result.iter_into())
    }
    /// Maps played on a server within a date range.
    ///
    /// `start`/`end` must span at most 2 days.
    #[oai(path = "/graph/:server_id/maps", method = "get")]
    async fn get_server_graph_map(
		&self, Data(app): Data<&AppData>, ServerExtractor(server): ServerExtractor, Query(start): Query<DateTime<Utc>>, Query(end): Query<DateTime<Utc>>
	) -> Response<Vec<ServerMapPlayed>> {
		let pool = &*app.pool.clone();
		if end.signed_duration_since(start) > Duration::days(2) {
			return response!(err "You can only get maps within 2 days", ErrorCode::BadRequest);
		};

		let Ok(rows) = sqlx::query_as!(DbServerMapPlayed, 
			"SELECT *, NULL::integer total_sessions
				FROM server_map_played
         		WHERE server_id=$1 AND started_at >= $2 AND started_at <= $3 ",
				server.server_id, start.to_db_time(), end.to_db_time())
			.fetch_all(pool)
			.await else {
				return response!(internal_server_error)
			};
		response!(ok rows.iter_into())
    }
	/// Time series of how often a given event type occurred.
	///
	/// Counts rows in `player_server_activity` matching `event_type`, bucketed to the minute and
	/// then downsampled to roughly 360 points. `start`/`end` must span at most 1 day.
	#[oai(path="/graph/:server_id/event_count", method="get")]
	async fn get_server_event_count(
		&self, Data(data): Data<&AppData>,
		ServerExtractor(server): ServerExtractor,
		Query(event_type): Query<EventType>, Query(start): Query<DateTime<Utc>>,
		Query(end): Query<DateTime<Utc>>
	) -> Response<Vec<ServerCountData>>{
		let pool = &*data.pool.clone();
		if end.signed_duration_since(start) > Duration::days(1) {
			return response!(err "You can only get data within 1 day", ErrorCode::BadRequest);
		};
		let Ok(result) = sqlx::query_as!(DbServerCountData, "
			WITH buckets AS (
				SELECT
					server_id,
					date_trunc('minute', created_at) AS bucket_time,
					COUNT(*) AS player_count
				FROM player_server_activity
				WHERE event_name=$1
					AND server_id=$2
					AND created_at BETWEEN $3 AND $4
				GROUP BY server_id, bucket_time
			),
			numbered AS (
			  SELECT
				*,
				ROW_NUMBER() OVER (ORDER BY bucket_time) AS rn,
				COUNT(*) OVER () AS total_rows
			  FROM buckets
			),
			sampled AS (
			  SELECT *,
					 GREATEST(FLOOR(total_rows / 360.0), 1) AS step
			  FROM numbered
			)
			SELECT server_id, bucket_time, player_count
			FROM sampled
			WHERE (rn - 1) % step = 0
			ORDER BY bucket_time;
		", event_type.to_string(), server.server_id, start.to_db_time(), end.to_db_time())
		.fetch_all(pool).await else {
			return response!(internal_server_error)
		};
		response!(ok result.iter_into())
	}
	/// Top 20 players on a server, ranked by playtime within a preset time frame.
	///
	/// `time_frame` selects a fixed window (`Today`, `Week1`, `Week2`, `Month1`, `Month6`,
	/// `Year1`); cache TTL scales with the window size. Player names are anonymized per the
	/// requester's identity.
	#[oai(path = "/graph/:server_id/top_players", method = "get")]
	async fn get_server_top_players(
		&self, data: Data<&AppData>, ServerExtractor(server): ServerExtractor, Query(time_frame): Query<TopPlayersTimeFrame>,
		OptionalTokenBearer(user_token): OptionalTokenBearer,
	) -> Response<BriefPlayers> {
		let pool = &*data.pool.clone();
		let key = format!("graph-top-players:{}:{}", server.server_id, time_frame);
		let ttl = match time_frame{
			TopPlayersTimeFrame::Today => 30 * 60,
			TopPlayersTimeFrame::Week1 => 6 * HOUR,
			TopPlayersTimeFrame::Week2 => 12 * HOUR,
			TopPlayersTimeFrame::Month1 => DAY,
			TopPlayersTimeFrame::Month6
			| TopPlayersTimeFrame::Year1 => 2 * DAY,
		};
		let resulted = match time_frame{
				TopPlayersTimeFrame::Today => {
					let sql = || sqlx::query_as!(DbPlayerBrief,
						"WITH pre_vars AS (
							SELECT
								$2 AS timeframe,
								$1 AS server_id
						),
						vars AS (
							SELECT
								CURRENT_TIMESTAMP AS right_now,
								CURRENT_TIMESTAMP - INTERVAL '24 hours' AS min_start
							FROM pre_vars pv
						),
						sessions_selection AS (
							SELECT *,
								GREATEST(
									LEAST(COALESCE(ended_at, CURRENT_TIMESTAMP), (SELECT right_now FROM vars))
									- GREATEST(started_at, (SELECT min_start FROM vars)),
									INTERVAL '0'
								) AS duration
							FROM player_server_session
							WHERE server_id = (SELECT server_id FROM pre_vars)
							  AND (
									(ended_at IS NOT NULL AND ended_at >= (SELECT min_start FROM vars))
									OR (ended_at IS NULL)
								  )
							  AND started_at <= (SELECT right_now FROM vars)
						),
						session_duration AS (
							SELECT
								player_id,
								SUM(duration) AS played_time,
								COUNT(*) OVER () AS total_players
							FROM sessions_selection
							GROUP BY player_id
						),
						top_players AS (
							SELECT *
							FROM session_duration
							ORDER BY played_time DESC
							LIMIT 20
						)
						SELECT
							p.player_id,
							p.player_name,
							p.created_at,
							sp.played_time AS total_playtime,
							ROW_NUMBER() OVER (ORDER BY sp.played_time DESC)::int AS rank,
							COALESCE(op.started_at, NULL) AS online_since,
							lp.started_at AS last_played,
							lp.ended_at AS last_played_ended,
							(lp.ended_at - lp.started_at) AS last_played_duration,
							sp.total_players,
							COALESCE((SELECT is_anonymous FROM server_player_names spn WHERE spn.server_id = $1 AND spn.player_id = p.player_id), FALSE) AS \"is_anonymous!\"
						FROM top_players sp
						JOIN player p
							ON p.player_id = sp.player_id
						LEFT JOIN LATERAL (
							SELECT s.started_at, s.ended_at
							FROM player_server_session s
							WHERE s.player_id = p.player_id
							  AND s.ended_at IS NOT NULL
							ORDER BY s.ended_at DESC
							LIMIT 1
						) lp ON TRUE
						LEFT JOIN LATERAL (
							SELECT s.started_at
							FROM player_server_session s
							WHERE s.player_id = p.player_id
							  AND s.ended_at IS NULL
							  AND CURRENT_TIMESTAMP - s.last_verified < INTERVAL '20 minutes'
							ORDER BY s.started_at ASC
							LIMIT 1
						) op ON TRUE
						ORDER BY sp.played_time DESC;
						", server.server_id, time_frame.to_string()
					).fetch_all(pool);

					cached_response(&key, &data.cache, ttl, sql).await
				}
				_ => {
					let sql = || sqlx::query_as!(DbPlayerBrief,
						"WITH pre_vars AS (
							SELECT
								$2 AS timeframe,
								$1 AS server_id
						),
						vars AS (
							SELECT
								CURRENT_TIMESTAMP AS right_now,
								CASE
									WHEN pv.timeframe = 'week1' THEN date_trunc('week', CURRENT_TIMESTAMP + INTERVAL '1 day') - INTERVAL '1 day'
									WHEN pv.timeframe = 'week2' THEN date_trunc('week', CURRENT_TIMESTAMP + INTERVAL '1 day') - INTERVAL '8 day'
									WHEN pv.timeframe = 'month1' THEN date_trunc('month', CURRENT_TIMESTAMP)
									WHEN pv.timeframe = 'month6' THEN
										CASE
											WHEN EXTRACT(MONTH FROM CURRENT_TIMESTAMP) <= 6
												THEN date_trunc('year', CURRENT_TIMESTAMP)
											ELSE date_trunc('year', CURRENT_TIMESTAMP) + INTERVAL '6 months'
										END
									WHEN pv.timeframe = 'year1' THEN date_trunc('year', CURRENT_TIMESTAMP)
									ELSE (
										SELECT MIN(started_at)
										FROM player_server_session
										WHERE server_id = pv.server_id
									)
								END AS min_start
							FROM pre_vars pv
						),
						sessions_selection AS (
							SELECT *,
								CASE
									WHEN ended_at IS NOT NULL THEN ended_at - started_at
									WHEN ended_at IS NULL AND CURRENT_TIMESTAMP - last_verified < INTERVAL '20 minutes'
										THEN CURRENT_TIMESTAMP - started_at
									WHEN ended_at IS NULL
										THEN last_verified - started_at
									ELSE INTERVAL '0'
								END AS duration
							FROM player_server_session
							WHERE server_id = (SELECT server_id FROM pre_vars)
							  AND (
									(ended_at IS NOT NULL AND ended_at >= (SELECT min_start FROM vars))
									OR (ended_at IS NULL)
								  )
							  AND started_at <= (SELECT right_now FROM vars)
						),
						session_duration AS (
							SELECT
								player_id,
								SUM(duration) AS played_time,
								COUNT(*) OVER () AS total_players
							FROM sessions_selection
							GROUP BY player_id
						),
						top_players AS (
							SELECT *
							FROM session_duration
							ORDER BY played_time DESC
							LIMIT 20
						)
						SELECT
							p.player_id,
							p.player_name,
							p.created_at,
							sp.played_time AS total_playtime,
							ROW_NUMBER() OVER (ORDER BY sp.played_time DESC)::int AS rank,
							COALESCE(op.started_at, NULL) AS online_since,
							lp.started_at AS last_played,
							lp.ended_at AS last_played_ended,
							(lp.ended_at - lp.started_at) AS last_played_duration,
							sp.total_players,
							COALESCE((SELECT is_anonymous FROM server_player_names spn WHERE spn.server_id = $1 AND spn.player_id = p.player_id), FALSE) AS \"is_anonymous!\"
						FROM top_players sp
						JOIN player p
							ON p.player_id = sp.player_id
						LEFT JOIN LATERAL (
							SELECT s.started_at, s.ended_at
							FROM player_server_session s
							WHERE s.player_id = p.player_id
							  AND s.ended_at IS NOT NULL
							ORDER BY s.ended_at DESC
							LIMIT 1
						) lp ON TRUE
						LEFT JOIN LATERAL (
							SELECT s.started_at
							FROM player_server_session s
							WHERE s.player_id = p.player_id
							  AND s.ended_at IS NULL
							  AND CURRENT_TIMESTAMP - s.last_verified < INTERVAL '20 minutes'
							ORDER BY s.started_at ASC
							LIMIT 1
						) op ON TRUE
						ORDER BY sp.played_time DESC;
					", server.server_id, time_frame.to_string()
					).fetch_all(pool);
					cached_response(&key, &data.cache, ttl, sql).await
				}
		};
		let Ok(result) = resulted else {
			return response!(internal_server_error)
		};

		let rows = result.result;
		let total_player_count = rows
			.first()
			.and_then(|e| e.total_players)
			.unwrap_or_default();

		let mut briefs = rows.iter_into();
		if !result.is_new{
			update_online_brief(&data.pool, &data.cache, &server.server_id, &mut briefs).await
		}

		let anonymizer = BriefAnonymizer::new(data.0, &server.server_id, user_token.as_ref().map(|t| t.id)).await;
		anonymizer.apply(&mut briefs);

		let value = BriefPlayers {
			total_players: total_player_count,
			players: briefs
		};
		response!(ok value)
	}
	/// Paginated player leaderboard for a server, ranked by playtime.
	///
	/// `start` (defaults to the server's earliest recorded session) and `end` bound the window;
	/// `page` paginates in pages of 70. Player names are anonymized per the requester's identity.
	#[oai(path = "/graph/:server_id/players", method = "get")]
	async fn get_server_players(
		&self, data: Data<&AppData>, ServerExtractor(server): ServerExtractor,
		start: Query<Option<DateTime<Utc>>>, end: Query<DateTime<Utc>>, page: Query<usize>,
		OptionalTokenBearer(user_token): OptionalTokenBearer,
	) -> Response<BriefPlayers>{
		let pool = &*data.pool.clone();
		let pagination_size = 70;
		let offset = pagination_size * page.0 as i64;
		let sql_func = || sqlx::query_as!(DbPlayerBrief,
			"WITH vars AS (
                SELECT
                	COALESCE($1, (
                		SELECT MIN(started_at) FROM player_server_session WHERE server_id=$3)
                	) AS min_start
            ),
            sessions_selection AS (
                SELECT *,
                    CASE
                        WHEN ended_at IS NOT NULL
                        THEN ended_at - started_at
                        WHEN ended_at IS NULL AND (CURRENT_TIMESTAMP - last_verified) < INTERVAL '20 minutes'
                        THEN CURRENT_TIMESTAMP - started_at
                        WHEN ended_at IS NULL
                        THEN last_verified - started_at
                        ELSE INTERVAL '0'
                    END as duration
                FROM player_server_session
                WHERE server_id = $3
                    AND((ended_at IS NOT NULL AND ended_at >= (
                        SELECT min_start FROM vars
                    ))
                    OR (
                        ended_at IS NULL
                    ))
                    AND started_at <= $2
            ),
			session_duration AS (
                SELECT * FROM (
                    SELECT player_id,
                        SUM(duration) AS played_time,
                        COUNT(player_id) OVER() AS total_players,
                        RANK() OVER(ORDER BY SUM(duration) DESC) AS rank
                    FROM sessions_selection sessions
                    GROUP BY player_id
                ) s
                ORDER BY played_time DESC
                LIMIT $4
                OFFSET $5
			),
            online_players AS (
                SELECT player_id, started_at
                FROM player_server_session
                WHERE server_id=$3
                	AND ended_at IS NULL
                	AND (CURRENT_TIMESTAMP - last_verified) < INTERVAL '20 minutes'
            ),
			last_played_players AS (
				SELECT s.*
				FROM player_server_session s
				JOIN (
					SELECT player_id, MAX(ended_at) AS ended_at
					FROM player_server_session
					WHERE ended_at IS NOT NULL
					GROUP BY player_id
				) latest ON s.player_id = latest.player_id AND s.ended_at = latest.ended_at
			)
            SELECT
                p.player_id,
                p.player_name,
                p.created_at,
                durr.played_time as total_playtime,
                durr.rank::int,
                COALESCE(op.started_at, NULL) as online_since,
                lp.started_at as last_played,
                lp.ended_at as last_played_ended,
                (lp.ended_at - lp.started_at) as last_played_duration,
                durr.total_players,
                COALESCE((SELECT is_anonymous FROM server_player_names spn WHERE spn.server_id = $3 AND spn.player_id = p.player_id), FALSE) AS \"is_anonymous!\"
            FROM player p
            JOIN session_duration durr
            	ON p.player_id=durr.player_id
            JOIN last_played_players lp
                ON lp.player_id=durr.player_id
            LEFT JOIN online_players op
            	ON op.player_id=durr.player_id
            ORDER BY durr.played_time DESC
			", start.0.map(|e| e.to_db_time()),
			end.0.to_db_time(), server.server_id, pagination_size, offset
		).fetch_all(pool);
		let key = format!("server-player:{}:{}:{}:{}",
			server.server_id, start.0.map(|s| s.to_string()).unwrap_or_default(),
			end.0.to_string(), page.0
		);
		let Ok(result) = cached_response(&key, &data.cache, 5 * 60, sql_func).await else {
			return response!(internal_server_error);
		};

		let rows = result.result;
		let total_player_count = rows
			.first()
			.and_then(|e| e.total_players)
			.unwrap_or_default();

		let mut players: Vec<PlayerBrief> = rows.iter_into();
		update_online_brief(&pool, &data.cache, &server.server_id, &mut players).await;
		let anonymizer = BriefAnonymizer::new(data.0, &server.server_id, user_token.as_ref().map(|t| t.id)).await;
		anonymizer.apply(&mut players);
		let value = BriefPlayers {
			total_players: total_player_count,
			players
		};
		response!(ok value)
	}
}
impl UriPatternExt for GraphApi{
	fn get_all_patterns(&self) -> Vec<RoutePattern> {
		vec![
			"/graph/{server_id}/get_regions",
			"/graph/{server_id}/unique_players",
			"/graph/{server_id}/maps",
			"/graph/{server_id}/event_count",
			"/graph/{server_id}/top_players",
			"/graph/{server_id}/players",
			"/graph/{server_id}/unique_players/maps/{map_name}/sessions/{session_id}",
			"/graph/{server_id}/unique_players/players/{player_id}/sessions/{session_id}",
		].iter_into()
	}
}