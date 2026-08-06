use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use async_trait::async_trait;
use sqlx::{Pool, Postgres};
use sqlx::postgres::PgQueryResult;
use sqlx::postgres::types::PgInterval;
use sqlx::types::time::OffsetDateTime;
use crate::api_models::players::*;
use crate::api_models::maps::*;
use crate::core::utils::*;
use crate::routers::players::{get_player, get_player_cache_key};
use crate::FastCache;
use crate::models::admins::{DbGlobalRefreshTarget, DbGlobalSums, DbPlayerGlobalPlaytime};
use crate::models::maps::*;
use crate::models::players::*;
use super::{BackgroundWorker, JobKind, PlayerContext, PlayerData, PlayerGlobalData, PlayerSessionData, Query, QueryPriority, RefreshJob, WorkError, WorkResult, WorkerQuery};

#[allow(dead_code)]
struct DbWorkerLastCalculated{
    player_id: String,
    server_id: String,
    worker_type: String,
    last_calculated: String,
}

#[derive(Clone)]
pub struct PlayerSessionQuery<T> {
    pub context: Query<PlayerSessionData>,
    _phantom: std::marker::PhantomData<T>,
}
impl<T> PlayerSessionQuery<T> {
    fn new(ctx: &PlayerContext, pool: Arc<Pool<Postgres>>, cache: Arc<FastCache>, session_id: &str) -> Self {
        Self::raw(Query {
            pool,
            cache,
            data: PlayerSessionData{
                player_id: ctx.player.player_id.clone(),
                server_id: ctx.server.server_id.clone(),
                session_id: session_id.to_string(),
            },
        })
    }

    /// Rebuilds the query straight from its data, with no `PlayerContext` to hand — the path a
    /// worker process takes after deserializing a job.
    pub(crate) fn raw(context: Query<PlayerSessionData>) -> Self {
        Self { context, _phantom: std::marker::PhantomData }
    }
}
#[derive(Clone)]
pub struct PlayerBasicQuery<T> {
    pub context: Query<PlayerData>,
    _phantom: std::marker::PhantomData<T>,
}
impl<T> PlayerBasicQuery<T> {
    fn new(ctx: &PlayerContext, pool: Arc<Pool<Postgres>>, cache: Arc<FastCache>) -> Self {
        Self::raw(Query {
            pool,
            cache,
            data: PlayerData{
                player_id: ctx.player.player_id.clone(),
                server_id: ctx.server.server_id.clone(),
                current_session: ctx.cache_key.current.clone()
            },
        })
    }
    pub(crate) fn raw(context: Query<PlayerData>) -> Self {
        Self {
            context, _phantom: std::marker::PhantomData,
        }
    }
}

/// Queries scoped to a canonical player id rather than a (server, session) pair. Their cache keys
/// carry no `{session}` placeholder; the global refresh job invalidates them instead (see
/// `run_global_refresh`).
#[derive(Clone)]
pub struct PlayerGlobalQuery<T> {
    pub context: Query<PlayerGlobalData>,
    _phantom: std::marker::PhantomData<T>,
}
impl<T> PlayerGlobalQuery<T> {
    fn new(canonical_id: &str, pool: Arc<Pool<Postgres>>, cache: Arc<FastCache>) -> Self {
        Self::raw(Query {
            pool,
            cache,
            data: PlayerGlobalData { canonical_id: canonical_id.to_string() },
        })
    }
    pub(crate) fn raw(context: Query<PlayerGlobalData>) -> Self {
        Self { context, _phantom: std::marker::PhantomData }
    }
}

#[async_trait]
impl WorkerQuery<Vec<DbPlayerSessionTime>> for PlayerBasicQuery<Vec<DbPlayerSessionTime>> {
    type Error = sqlx::Error;

    async fn execute(&self) -> Result<Vec<DbPlayerSessionTime>, Self::Error> {
        let ctx = &self.context;
        sqlx::query_as!(DbPlayerSessionTime, "
            SELECT
                DATE_TRUNC('day', started_at) AS bucket_time,
                ROUND((
                    SUM(EXTRACT(EPOCH FROM (ended_at - started_at))) / 3600
                )::numeric, 2)::double precision AS hour_duration
            FROM public.player_server_session
            WHERE player_id = $1 AND server_id = $2
            GROUP BY bucket_time
            ORDER BY bucket_time;
        ", ctx.data.player_id, ctx.data.server_id).fetch_all(&*ctx.pool).await
    }

    fn cache_key_pattern(&self) -> String {
        format!("player-session:{}:{}:{{session}}", self.context.data.server_id, self.context.data.player_id)
    }

    fn ttl(&self) -> u64 { 60 * DAY }
    fn priority(&self) -> QueryPriority { QueryPriority::Light }

    fn job_kind(&self) -> JobKind {
        JobKind::PlayerSessionTime(self.context.data.clone())
    }
}

async fn calculate_db_player_map(ctx: &Query<PlayerData>, worker_type: &str) -> Result<(), sqlx::Error> {
    let worker_data = get_worker_player_key(ctx, worker_type).await?;
    let has_no_completed_session = worker_data.start.is_none();
    let save_result;
    let mut plays = vec![];
    if let Some(start_session) = worker_data.start {
        if worker_data.no_data || start_session != worker_data.end{
            plays = sqlx::query_as!(DbPlayerMapPlayed, "
                 WITH vars AS (
                    SELECT $3::text::uuid AS session_target_id,
                           $4::text::uuid AS session_end_id
                ),
                time_bounds AS (
                    SELECT
                        (SELECT CASE WHEN $5 THEN started_at ELSE ended_at END FROM player_server_session
                         WHERE server_id = $2
                           AND player_id = $1
                           AND session_id = v.session_target_id) AS start_time,
                        (SELECT started_at FROM player_server_session
                         WHERE server_id = $2
                           AND player_id = $1
                           AND session_id = v.session_end_id) AS end_time
                    FROM vars v
                )
                SELECT
                    sm.server_id,
                    sm.map,
                    SUM(LEAST(pss.ended_at, sm.ended_at) - GREATEST(pss.started_at, sm.started_at)) AS played
                FROM server_map_played sm
                LEFT JOIN server_map mp ON sm.map = mp.map AND sm.server_id = mp.server_id
                JOIN player_server_session pss ON pss.server_id = sm.server_id
                    AND pss.player_id = $1
                    AND pss.ended_at IS NOT NULL
                    AND tstzrange(sm.started_at, sm.ended_at) && tstzrange(pss.started_at, pss.ended_at)
                    AND pss.started_at BETWEEN (SELECT start_time FROM time_bounds)
                                           AND (SELECT end_time FROM time_bounds)
                WHERE sm.server_id = $2
                GROUP BY sm.server_id, sm.map
                ORDER BY played DESC;
            ", ctx.data.player_id, ctx.data.server_id, start_session, worker_data.end, worker_data.no_data).fetch_all(&*ctx.pool).await?;
        }
        save_result = true;
    }else{
        // when start session is None, it means the user hasnt completed a single session.
        plays = sqlx::query_as!(DbPlayerMapPlayed, "
                 WITH time_bounds AS (
                    SELECT
                        (SELECT started_at FROM player_server_session
                         WHERE server_id = $2
                           AND player_id = $1
                         LIMIT 1) AS start_time,
                        CURRENT_TIMESTAMP AS end_time
                )
                SELECT
                    sm.server_id,
                    sm.map,
                    SUM(LEAST((SELECT end_time FROM time_bounds), sm.ended_at) - GREATEST(pss.started_at, sm.started_at)) AS played
                FROM server_map_played sm
                LEFT JOIN server_map mp ON sm.map = mp.map AND sm.server_id = mp.server_id
                JOIN player_server_session pss ON pss.server_id = sm.server_id
                    AND pss.player_id = $1
                    AND tstzrange(sm.started_at, sm.ended_at) && tstzrange((SELECT start_time FROM time_bounds), (SELECT end_time FROM time_bounds))
                WHERE sm.server_id = $2
                GROUP BY sm.server_id, sm.map
                ORDER BY played DESC;
            ", ctx.data.player_id, ctx.data.server_id).fetch_all(&*ctx.pool).await?;
        save_result = false;
    }
    let mut server_ids = vec![];
    let mut player_ids = vec![];
    let mut maps = vec![];
    let mut played = vec![];
    for row in plays{
        server_ids.push(ctx.data.server_id.clone());
        player_ids.push(ctx.data.player_id.clone());
        maps.push(row.map.unwrap_or_default());
        played.push(row.played.unwrap_or_default());
    }

    if worker_data.no_data || has_no_completed_session {
        // Full recalc from scratch: replace existing totals to avoid double-counting
        let _ = sqlx::query!("
                    INSERT INTO website.player_map_time(player_id, server_id, map, total_playtime)
                    SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::INTERVAL[])
                    ON CONFLICT(player_id, server_id, map)
                    DO UPDATE SET
                        total_playtime = EXCLUDED.total_playtime
                ", &player_ids[..],
                    &server_ids[..],
                    &maps[..],
                    &played[..])
            .execute(&*ctx.pool).await?;
    } else {
        // Incremental delta: add new sessions to existing cumulative total
        let _ = sqlx::query!("
                    INSERT INTO website.player_map_time(player_id, server_id, map, total_playtime)
                    SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::INTERVAL[])
                    ON CONFLICT(player_id, server_id, map)
                    DO UPDATE SET
                        total_playtime = website.player_map_time.total_playtime + EXCLUDED.total_playtime
                ", &player_ids[..],
                    &server_ids[..],
                    &maps[..],
                    &played[..])
            .execute(&*ctx.pool).await?;
    }

    if save_result{
        let _ = update_worker_time(ctx, worker_type, &worker_data.end).await?;
    }
    Ok(())
}


#[async_trait]
impl WorkerQuery<Vec<DbPlayerMapPlayed>> for PlayerBasicQuery<Vec<DbPlayerMapPlayed>>{
    type Error = sqlx::Error;
    async fn execute(&self) -> Result<Vec<DbPlayerMapPlayed>, Self::Error> {
        let ctx = &self.context;
        let redis_pool = ctx.cache.redis_pool.clone();
        let worker_type = "playermap";
        let lock_key = format!("lock:player_map_time:{}:{}", ctx.data.server_id, ctx.data.player_id);

        if let Some(lock_id) = acquire_redis_lock(&redis_pool, &lock_key, 60 * 5, 60).await {
            tracing::info!("LOCK ACQUIRED {}", &lock_key);

            let result = calculate_db_player_map(ctx, worker_type).await;

            release_redis_lock(&redis_pool, &lock_key, &lock_id).await;
            tracing::info!("LOCK RELEASED {}", &lock_key);

            result?; // propagate error if any
        } else {
            tracing::warn!("FAILED TO ACQUIRE LOCK {}", &lock_key);
            return Ok(vec![]);
        }
        sqlx::query_as!(DbPlayerMapPlayed, "
            SELECT server_id, map, total_playtime AS played
            FROM website.player_map_time
            WHERE player_id = $1 AND server_id = $2
            ORDER BY total_playtime DESC
        ", ctx.data.player_id, ctx.data.server_id).fetch_all(&*ctx.pool).await
    }

    fn cache_key_pattern(&self) -> String {
        format!("player-map-played:{}:{}:{{session}}", self.context.data.server_id, self.context.data.player_id)
    }

    fn ttl(&self) -> u64 {
        60
    }

    fn priority(&self) -> QueryPriority {
        QueryPriority::Heavy
    }

    fn job_kind(&self) -> JobKind {
        JobKind::PlayerMapPlayed(self.context.data.clone())
    }
}
#[async_trait]
impl WorkerQuery<Option<DbPlayerRank>> for PlayerBasicQuery<Option<DbPlayerRank>> {
    type Error = sqlx::Error;
    async fn execute(&self) -> Result<Option<DbPlayerRank>, Self::Error> {
        sqlx::query_as!(DbPlayerRank, "
            SELECT global_playtime_rank AS global_playtime ,
                playtime_rank AS total_playtime,
                casual_rank AS casual_playtime,
                tryhard_rank AS tryhard_playtime,
                mixed_rank AS mixed_playtime
            FROM website.player_playtime_ranks
            WHERE server_id=$1 AND player_id=$2
        ", self.context.data.server_id, self.context.data.player_id)
            .fetch_optional(&*self.context.pool.clone()).await
    }

    fn cache_key_pattern(&self) -> String {
        format!("player-play-ranks:{}:{}:{{session}}", self.context.data.server_id, self.context.data.player_id)
    }

    fn ttl(&self) -> u64 {
        2 * 60
    }

    fn priority(&self) -> QueryPriority {
        QueryPriority::Light
    }

    fn job_kind(&self) -> JobKind {
        JobKind::PlayerPlaytimeRanks(self.context.data.clone())
    }
}
#[async_trait]
impl WorkerQuery<Vec<DbMapRank>> for PlayerBasicQuery<Vec<DbMapRank>> {
    type Error = sqlx::Error;
    async fn execute(&self) -> Result<Vec<DbMapRank>, Self::Error> {
        sqlx::query_as!(DbMapRank, "
            SELECT pmr.map, pmr.map_rank AS rank, pmt.total_playtime
            FROM website.player_map_rank pmr
            JOIN website.player_map_time pmt
                ON pmt.player_id = pmr.player_id
                    AND pmt.map = pmr.map
                    AND pmt.server_id = pmr.server_id
            WHERE pmr.server_id=$1 AND pmr.player_id=$2
            ORDER BY pmr.map_rank, pmt.total_playtime DESC
        ", self.context.data.server_id, self.context.data.player_id)
            .fetch_all(&*self.context.pool.clone()).await
    }

    fn cache_key_pattern(&self) -> String {
        format!("player-map-ranks:{}:{}:{{session}}", self.context.data.server_id, self.context.data.player_id)
    }

    fn ttl(&self) -> u64 {
        2 * 60
    }

    fn priority(&self) -> QueryPriority {
        QueryPriority::Light
    }

    fn job_kind(&self) -> JobKind {
        JobKind::PlayerMapRanks(self.context.data.clone())
    }
}
#[async_trait]
impl WorkerQuery<Vec<DbPlayerAlias>> for PlayerBasicQuery<Vec<DbPlayerAlias>>{
    type Error = sqlx::Error;

    async fn execute(&self) -> Result<Vec<DbPlayerAlias>, Self::Error> {
        let ctx = &self.context;
        sqlx::query_as!(DbPlayerAlias, "
            SELECT event_value as name, created_at FROM player_activity
            WHERE event_name='name' AND player_id=$1
            ORDER BY created_at
        ", ctx.data.player_id).fetch_all(&*ctx.pool).await
    }

    fn cache_key_pattern(&self) -> String {
        let ctx = &self.context;
        format!("player-aliases:{}:{{session}}", ctx.data.player_id)
    }

    fn ttl(&self) -> u64 {
        60 * DAY
    }

    fn priority(&self) -> QueryPriority {
        QueryPriority::Light
    }

    fn job_kind(&self) -> JobKind {
        JobKind::PlayerAliases(self.context.data.clone())
    }
}
struct DbServerMapState{
    #[allow(dead_code)]
    server_id: String,
    sum_key: Option<String>,
}


async fn update_worker_time(context: &Query<PlayerData>, worker_type: &str, end_calculation: &str) -> Result<PgQueryResult, sqlx::Error>{
    sqlx::query!("
            INSERT INTO website.player_server_worker(player_id, server_id, type, last_calculated)
            VALUES ($1, $2, $3, $4::text::uuid)
            ON CONFLICT(player_id, server_id, type)
            DO UPDATE SET last_calculated = EXCLUDED.last_calculated
        ", context.data.player_id, context.data.server_id, worker_type, end_calculation)
        .execute(&*context.pool).await
}


#[async_trait]
impl WorkerQuery<DbPlayerDetail> for PlayerBasicQuery<DbPlayerDetail>{
    type Error = sqlx::Error;
    async fn execute(&self) -> Result<DbPlayerDetail, Self::Error> {
        let ctx = &self.context;
        let map_state = sqlx::query_as!(DbServerMapState, "
            SELECT
              sm.server_id,
                  STRING_AGG(
                    sm.map || ':' ||
                    COALESCE(CAST(COALESCE(sm.is_tryhard, mam.is_tryhard) AS INT), -1) || ':' ||
                    COALESCE(CAST(COALESCE(sm.is_casual, mam.is_casual) AS INT), -1),
                    '|' ORDER BY sm.map
                ) AS sum_key
            FROM server_map sm
            LEFT JOIN map_metadata mam ON mam.name = sm.map
            WHERE sm.server_id = $1
            GROUP BY sm.server_id
        ", ctx.data.server_id).fetch_one(&*ctx.pool).await?;

        let sum_key =  map_state.sum_key.unwrap_or_default();

        let worker_type = "player_playtime";
        let worker_data = get_worker_player_key(ctx, worker_type).await?;
        let has_no_completed_session = worker_data.start.is_none();

        let query: PlayerBasicQuery<Vec<DbPlayerMapPlayed>> = PlayerBasicQuery::raw(self.context.clone());
        let maps = query.execute().await?;

        let map_infos = sqlx::query_as!(DbMapBriefInfo, "
            SELECT
                sm.map as name,
                COALESCE(sm.is_tryhard, mam.is_tryhard) as is_tryhard,
                COALESCE(sm.is_casual, mam.is_casual) as is_casual,
                sm.first_occurrence
            FROM server_map sm
            LEFT JOIN map_metadata mam ON mam.name = sm.map
            WHERE sm.server_id=$1
            ", ctx.data.server_id).fetch_all(&*ctx.pool).await?;

        let infos: HashMap<String, DbMapBriefInfo> = map_infos
            .into_iter()
            .map(|info| (info.name.clone(), info))
            .collect();
        let durations: Vec<(String, Duration)> = maps.iter()
            .map(|e| (e.map.clone().unwrap_or_default(), e.played.map(interval_to_duration).unwrap_or(Duration::ZERO)))
            .collect();
        let mut total = Duration::from_micros(0);
        let mut casual = Duration::from_micros(0);
        let mut tryhard = Duration::from_micros(0);
        let mut mixed = Duration::from_micros(0);
        for (map_name, duration) in durations{
            total += duration;
            let Some(info) = infos.get(&map_name) else {
                continue;
            };
            let is_casual = info.is_casual.unwrap_or_default();
            let is_tryhard = info.is_tryhard.unwrap_or_default();
            let is_mixed = is_casual && is_tryhard;
            if is_mixed {
                mixed += duration;
            } else if is_casual{
                casual += duration;
            } else if is_tryhard{
                tryhard += duration;
            }
        }
        let total_playtime: PgInterval = total.try_into().unwrap_or_default();
        let casual_playtime: PgInterval = casual.try_into().unwrap_or_default();
        let tryhard_playtime: PgInterval = tryhard.try_into().unwrap_or_default();
        let mixed_playtime: PgInterval = mixed.try_into().unwrap_or_default();
        sqlx::query!("
            WITH pre_var AS (
                SELECT $3::INTERVAL AS total,
                $4::INTERVAL AS casual,
                $5::INTERVAL AS tryhard,
                $6::INTERVAL AS mixed
            ),
            category_calc AS (
                SELECT
                    CASE
                        WHEN pre_var.total < INTERVAL '5 hours' THEN null
                        WHEN EXTRACT(EPOCH FROM pre_var.casual) / NULLIF(EXTRACT(EPOCH FROM pre_var.total), 1) >= 0.6 THEN 'casual'
                        WHEN EXTRACT(EPOCH FROM pre_var.tryhard) / NULLIF(EXTRACT(EPOCH FROM pre_var.total), 1) >= 0.6 THEN 'tryhard'
                        WHEN EXTRACT(EPOCH FROM pre_var.mixed) / NULLIF(EXTRACT(EPOCH FROM pre_var.total), 1) >= 0.6 THEN 'mixed'
                        ELSE null
                    END AS category
                FROM pre_var
            )
            INSERT INTO website.player_playtime(
                player_id, server_id, total_playtime, casual_playtime, tryhard_playtime, mixed_playtime, sum_key, category
            )
            SELECT
                $1, $2, $3, $4, $5, $6, $7, c.category
            FROM category_calc AS c
            ON CONFLICT (player_id, server_id)
            DO UPDATE
            SET
                total_playtime = EXCLUDED.total_playtime,
                casual_playtime = EXCLUDED.casual_playtime,
                tryhard_playtime = EXCLUDED.tryhard_playtime,
                mixed_playtime = EXCLUDED.mixed_playtime,
                category = EXCLUDED.category,
                sum_key = EXCLUDED.sum_key;
        ", ctx.data.player_id, ctx.data.server_id, total_playtime,
            casual_playtime, tryhard_playtime, mixed_playtime, sum_key
        ).execute(&*ctx.pool).await?;

        if !has_no_completed_session{
            let _ = update_worker_time(ctx, worker_type, &worker_data.end).await?;
        }

        sqlx::query_as!(DbPlayerDetail, "
            SELECT
                su.player_id,
                su.player_name,
                su.created_at,
                su.associated_player_id,
                pp.total_playtime, pp.casual_playtime, pp.tryhard_playtime, pp.mixed_playtime,
                0::int AS rank,
                pp.category,
                NULL::TIMESTAMPTZ AS online_since,
                NULL::TIMESTAMPTZ AS last_played,
                NULL::TIMESTAMPTZ AS last_played_ended,
                NULL::interval AS last_played_duration
            FROM player su
            JOIN website.player_playtime pp on pp.player_id = su.player_id
            WHERE pp.server_id=$2 AND pp.player_id=$1
            LIMIT 1
        ", ctx.data.player_id, ctx.data.server_id).fetch_one(&*ctx.pool).await
    }

    fn cache_key_pattern(&self) -> String {
        let ctx = &self.context;
        format!("player_detail:{}:{}:{{session}}", ctx.data.server_id, ctx.data.player_id)
    }

    fn ttl(&self) -> u64 {
        60 * DAY
    }

    fn priority(&self) -> QueryPriority {
        QueryPriority::Heavy
    }

    fn job_kind(&self) -> JobKind {
        JobKind::PlayerDetail(self.context.data.clone())
    }
}
#[async_trait]
impl WorkerQuery<Vec<DbPlayerRegionTime>> for PlayerBasicQuery<Vec<DbPlayerRegionTime>>{
    type Error = sqlx::Error;
    async fn execute(&self) -> Result<Vec<DbPlayerRegionTime>, Self::Error> {
        let ctx = &self.context;
        sqlx::query_as!(DbPlayerRegionTime, "
            WITH session_days AS (
                SELECT
                    s.session_id,
                    generate_series(
                    date_trunc('day', s.started_at),
                    date_trunc('day', s.ended_at),
                    interval '1 day'
                    ) AS session_day,
                    s.started_at,
                    s.ended_at
                FROM player_server_session s
                WHERE player_id = $1 AND server_id=$2
            ),
            region_intervals AS (
                SELECT
                    sd.session_id,
                    rt.region_id,
                    s.region_start,
                    s.region_end,
                    sd.started_at,
                    sd.ended_at
                FROM session_days sd
                CROSS JOIN region_time rt
                CROSS JOIN LATERAL (
                    VALUES
                        (
                            ((sd.session_day::date || ' ' || rt.start_time::text)::timestamptz),
                            CASE
                                WHEN rt.start_time < rt.end_time THEN
                                    ((sd.session_day::date || ' ' || rt.end_time::text)::timestamptz)
                                ELSE
                                    (((sd.session_day::date + 1)::date || ' 00:00:00' || right(rt.end_time::text, length(rt.end_time::text) - 8))::timestamptz)
                            END
                        ),
                        (
                            ((sd.session_day::date || ' 00:00:00' || right(rt.end_time::text, length(rt.end_time::text) - 8))::timestamptz),
                            CASE
                                WHEN rt.start_time < rt.end_time THEN
                                    NULL
                                ELSE
                                    ((sd.session_day::date || ' ' || rt.end_time::text)::timestamptz)
                            END
                        )
                ) AS s(region_start, region_end)
                WHERE s.region_end IS NOT NULL
            ),
            session_region_overlap AS (
                SELECT
                    session_id,
                    region_id,
                    GREATEST(region_start, started_at) AS overlap_start,
                    LEAST(region_end, ended_at) AS overlap_end
                FROM region_intervals
                WHERE LEAST(region_end, ended_at) > GREATEST(region_start, started_at)
            ), finished AS (
                SELECT
                region_id,
                sum(overlap_end - overlap_start) AS played_time
                FROM session_region_overlap
                GROUP BY region_id
            )
            SELECT *,
                (SELECT region_name FROM region_time WHERE region_id=o.region_id LIMIT 1) AS region_name
            FROM finished o
            ORDER BY o.played_time
        ", ctx.data.player_id, ctx.data.server_id)
            .fetch_all(&*ctx.pool).await
    }

    fn cache_key_pattern(&self) -> String {
        let ctx = &self.context;
        format!("player-region:{}:{}:{{session}}", ctx.data.server_id, ctx.data.player_id)
    }

    fn ttl(&self) -> u64 {
        60 * DAY
    }

    fn priority(&self) -> QueryPriority {
        QueryPriority::Light
    }

    fn job_kind(&self) -> JobKind {
        JobKind::PlayerRegionTime(self.context.data.clone())
    }
}

struct LastWorkerCalculate{
    start: Option<String>,
    end: String,
    no_data: bool,
}
async fn get_worker_player_key(ctx: &Query<PlayerData>, worker_type: &str) -> Result<LastWorkerCalculate, sqlx::Error> {
    let player_id = &ctx.data.player_id;
    let server_id = &ctx.data.server_id;
    let last_calculated_row = sqlx::query_as!(DbWorkerLastCalculated, "
            SELECT player_id, server_id, type worker_type, last_calculated
            FROM website.player_server_worker
            WHERE player_id=$1 AND server_id=$2 AND type=$3
            LIMIT 1
        ", player_id, server_id, worker_type)
        .fetch_optional(&*ctx.pool).await?;

    let has_data = last_calculated_row.is_some();
    let (start, end) = match last_calculated_row {
        Some(last_calculated) => (Some(last_calculated.last_calculated), ctx.data.current_session.clone()),
        None => {
            if let Some(start) = sqlx::query_as!(DbPlayerSession, "
                    SELECT session_id, player_id, server_id, started_at, ended_at, last_verified, COALESCE(false, NULL) AS is_anonymous
                    FROM player_server_session
                    WHERE server_id = $1
                      AND player_id = $2
                      AND ended_at IS NOT NULL
                    ORDER BY started_at
                    LIMIT 1
                ", ctx.data.server_id, ctx.data.player_id).fetch_optional(&*ctx.pool).await?{
                (Some(start.session_id), ctx.data.current_session.clone())
            }else {
                (None, ctx.data.current_session.clone())
            }
        }
    };
    Ok(LastWorkerCalculate { start, end, no_data: !has_data })
}



#[async_trait]
impl WorkerQuery<Vec<DbPlayerSeen>> for PlayerSessionQuery<Vec<DbPlayerSeen>> {
    type Error = sqlx::Error;

    async fn execute(&self) -> Result<Vec<DbPlayerSeen>, Self::Error> {
        let ctx = &self.context;

        sqlx::query_as!(DbPlayerSeen, "
            WITH overlapping AS (
              SELECT
                target_session.player_id,
                s2.player_id AS seen_player,
                LEAST(target_session.ended_at, COALESCE(s2.ended_at, target_session.ended_at)) - GREATEST(target_session.started_at, s2.started_at) AS overlap_duration,
                LEAST(target_session.ended_at, COALESCE(s2.ended_at, target_session.ended_at)) AS seen_on
            FROM (
              SELECT player_id, server_id, started_at, COALESCE(ended_at, current_timestamp) ended_at
              FROM player_server_session
              WHERE session_id = ($3::TEXT::uuid) AND server_id=$1 AND player_id=$2
              LIMIT 1
            ) AS target_session
            JOIN player_server_session s2
              ON s2.server_id = target_session.server_id
             AND s2.player_id <> target_session.player_id
             AND s2.started_at < target_session.ended_at
             AND COALESCE(s2.ended_at, target_session.ended_at) > target_session.started_at
            )
            SELECT
              o.seen_player AS player_id,
              p.player_name,
              SUM(o.overlap_duration) AS total_time_together,
              MAX(o.seen_on) AS last_seen
            FROM overlapping o
            JOIN player p ON p.player_id = o.seen_player
            GROUP BY o.seen_player, p.player_name
            ORDER BY total_time_together DESC
        ", ctx.data.server_id, ctx.data.player_id, ctx.data.session_id).fetch_all(&*ctx.pool).await
    }

    fn cache_key_pattern(&self) -> String {
        let ctx = &self.context;
        format!("player-seen-session:{}:{}:{}", ctx.data.server_id, ctx.data.player_id, ctx.data.session_id)
    }

    fn ttl(&self) -> u64 { 130 * DAY }
    fn priority(&self) -> QueryPriority { QueryPriority::Heavy }

    fn job_kind(&self) -> JobKind {
        JobKind::PlayerSeen(self.context.data.clone())
    }
}


#[async_trait]
impl WorkerQuery<Vec<DbPlayerHourCount>> for PlayerBasicQuery<Vec<DbPlayerHourCount>> {
    type Error = sqlx::Error;
    async fn execute(&self) -> Result<Vec<DbPlayerHourCount>, Self::Error> {
        let ctx = &self.context;
        sqlx::query_as!(DbPlayerHourCount, "
            WITH join_count AS (
                SELECT player_id, (
                    EXTRACT(hours FROM started_at AT TIME ZONE 'UTC')
                ) hours, COUNT(*) FROM public.player_server_session
                WHERE player_id=$2 AND server_id=$1
                GROUP BY player_id, hours
            ), leave_count AS (
                SELECT player_id, (
                    EXTRACT(hours FROM ended_at AT TIME ZONE 'UTC')
                ) hours, COUNT(*) FROM public.player_server_session
                WHERE player_id=$2 AND server_id=$1
                GROUP BY player_id, hours
            )
            SELECT
                gs hours,
                COALESCE(jc.count, 0) join_counted,
                COALESCE(lc.count, 0) leave_counted
            FROM generate_series(0, 23) gs
            LEFT JOIN join_count jc
            ON jc.hours=gs
            LEFT JOIN leave_count lc
            ON lc.hours=gs
            ORDER BY hours
        ", ctx.data.server_id, ctx.data.player_id).fetch_all(&*ctx.pool).await
    }

    fn cache_key_pattern(&self) -> String {
        let ctx = &self.context;
        format!("player-hour-day:{}:{}:{{session}}", ctx.data.server_id, ctx.data.player_id)
    }

    fn ttl(&self) -> u64 {
        60 * DAY
    }

    fn priority(&self) -> QueryPriority {
        QueryPriority::Light
    }

    fn job_kind(&self) -> JobKind {
        JobKind::PlayerHourCount(self.context.data.clone())
    }
}

#[async_trait]
impl WorkerQuery<Vec<DbPlayerOnlineHeatmap>> for PlayerBasicQuery<Vec<DbPlayerOnlineHeatmap>> {
    type Error = sqlx::Error;
    async fn execute(&self) -> Result<Vec<DbPlayerOnlineHeatmap>, Self::Error> {
        let ctx = &self.context;
        sqlx::query_as!(DbPlayerOnlineHeatmap, "
            WITH sessions AS (
                SELECT started_at AT TIME ZONE 'UTC'                AS started_at,
                       COALESCE(ended_at, now()) AT TIME ZONE 'UTC' AS ended_at
                FROM public.player_server_session
                WHERE player_id = $2
                  AND server_id = $1
                  AND started_at IS NOT NULL
                  AND COALESCE(ended_at, now()) > started_at
            ), expanded AS (
                SELECT
                    EXTRACT(hour FROM bucket)::int AS hour_of_day,
                    -- overlap of this session with this specific hour bucket
                    EXTRACT(EPOCH FROM (
                        LEAST(s.ended_at, bucket + INTERVAL '1 hour')
                      - GREATEST(s.started_at, bucket)
                    )) AS seconds_online
                FROM sessions s
                CROSS JOIN LATERAL generate_series(
                    date_trunc('hour', s.started_at),
                    date_trunc('hour', s.ended_at),
                    INTERVAL '1 hour'
                ) AS bucket
            )
            SELECT
                gs                                                            AS hour_of_day,
                ROUND(COALESCE(SUM(e.seconds_online), 0)::numeric / 3600.0, 2)::double precision AS hours_online,
                COUNT(e.hour_of_day)                                          AS online_count
            FROM generate_series(0, 23) gs
            LEFT JOIN expanded e ON e.hour_of_day = gs
            GROUP BY gs
            ORDER BY gs
        ", ctx.data.server_id, ctx.data.player_id).fetch_all(&*ctx.pool).await
    }

    fn cache_key_pattern(&self) -> String {
        let ctx = &self.context;
        format!("player-online-heatmap:{}:{}:{{session}}", ctx.data.server_id, ctx.data.player_id)
    }

    fn ttl(&self) -> u64 {
        60 * DAY
    }

    fn priority(&self) -> QueryPriority {
        QueryPriority::Light
    }

    fn job_kind(&self) -> JobKind {
        JobKind::PlayerOnlineHeatmap(self.context.data.clone())
    }
}
#[async_trait]
impl WorkerQuery<DbGlobalPlaytimeSnapshot> for PlayerGlobalQuery<DbGlobalPlaytimeSnapshot> {
    type Error = sqlx::Error;

    /// The read side of global playtime: the stored summary row plus a freshness verdict. When the
    /// stored row is stale (or missing), live sums over `player_playtime` stand in for it — ranks
    /// always come from the stored row, since they are only recomputed daily.
    async fn execute(&self) -> Result<DbGlobalPlaytimeSnapshot, Self::Error> {
        let ctx = &self.context;
        let canonical_id = &ctx.data.canonical_id;

        let stored = sqlx::query_as!(DbPlayerGlobalPlaytime, "
            SELECT total_playtime, casual_playtime, tryhard_playtime, category,
                   server_count, community_count, global_rank, casual_rank, tryhard_rank,
                   rank_calculated_at, calculated_at
            FROM website.player_global_playtime
            WHERE player_id = $1
        ", canonical_id).fetch_optional(&*ctx.pool).await?;

        // Completed sessions only: an in-progress session would otherwise peg the player as
        // permanently outdated, and player_playtime is derived from completed data anyway.
        let latest_ended_at: Option<OffsetDateTime> = sqlx::query_scalar!("
            WITH user_players AS (
                SELECT player_id FROM player WHERE player_id = $1 OR associated_player_id = $1
            )
            SELECT MAX(pss.ended_at)
            FROM player_server_session pss
            JOIN user_players up ON up.player_id = pss.player_id
            WHERE pss.ended_at IS NOT NULL
        ", canonical_id).fetch_one(&*ctx.pool).await?;

        let is_outdated = match stored.as_ref().and_then(|s| s.calculated_at) {
            None => true,
            Some(calculated_at) => latest_ended_at.is_some_and(|ended| ended > calculated_at),
        };

        let snapshot = match (is_outdated, stored) {
            (false, Some(row)) => DbGlobalPlaytimeSnapshot {
                total_playtime: Some(row.total_playtime),
                casual_playtime: Some(row.casual_playtime),
                tryhard_playtime: Some(row.tryhard_playtime),
                category: row.category,
                server_count: row.server_count as i64,
                community_count: row.community_count as i64,
                global_rank: row.global_rank,
                casual_rank: row.casual_rank,
                tryhard_rank: row.tryhard_rank,
                is_outdated: false,
                calculated_at: row.calculated_at,
                rank_calculated_at: row.rank_calculated_at,
            },
            (_, stored) => {
                let sums = sqlx::query_as!(DbGlobalSums, "
                    WITH user_players AS (
                        SELECT player_id FROM player WHERE player_id = $1 OR associated_player_id = $1
                    ),
                    sums AS (
                        SELECT SUM(pp.total_playtime) AS total_playtime,
                               SUM(pp.casual_playtime) AS casual_playtime,
                               SUM(pp.tryhard_playtime) AS tryhard_playtime,
                               COUNT(DISTINCT pp.server_id) AS server_count,
                               COUNT(DISTINCT s.community_id) AS community_count
                        FROM website.player_playtime pp
                        JOIN user_players up ON up.player_id = pp.player_id
                        JOIN server s ON s.server_id = pp.server_id
                    )
                    SELECT total_playtime, casual_playtime, tryhard_playtime,
                           server_count, community_count,
                           CASE
                               WHEN total_playtime < INTERVAL '5 hours' THEN NULL
                               WHEN EXTRACT(EPOCH FROM casual_playtime) / NULLIF(EXTRACT(EPOCH FROM total_playtime), 0) >= 0.6 THEN 'casual'
                               WHEN EXTRACT(EPOCH FROM tryhard_playtime) / NULLIF(EXTRACT(EPOCH FROM total_playtime), 0) >= 0.6 THEN 'tryhard'
                               WHEN EXTRACT(EPOCH FROM tryhard_playtime) / NULLIF(EXTRACT(EPOCH FROM total_playtime), 0) BETWEEN 0.4 AND 0.6 THEN 'mixed'
                               ELSE NULL
                           END AS category
                    FROM sums
                ", canonical_id).fetch_one(&*ctx.pool).await?;

                DbGlobalPlaytimeSnapshot {
                    total_playtime: sums.total_playtime,
                    casual_playtime: sums.casual_playtime,
                    tryhard_playtime: sums.tryhard_playtime,
                    category: sums.category,
                    server_count: sums.server_count.unwrap_or(0),
                    community_count: sums.community_count.unwrap_or(0),
                    global_rank: stored.as_ref().and_then(|r| r.global_rank),
                    casual_rank: stored.as_ref().and_then(|r| r.casual_rank),
                    tryhard_rank: stored.as_ref().and_then(|r| r.tryhard_rank),
                    is_outdated: true,
                    calculated_at: stored.as_ref().and_then(|r| r.calculated_at),
                    rank_calculated_at: stored.and_then(|r| r.rank_calculated_at),
                }
            }
        };
        Ok(snapshot)
    }

    fn cache_key_pattern(&self) -> String {
        global_snapshot_key(&self.context.data.canonical_id)
    }

    // Short: this is the freshness signal, and it also bounds how long a stale "outdated" verdict
    // survives after the refresh job has already invalidated the key.
    fn ttl(&self) -> u64 { 60 }
    fn priority(&self) -> QueryPriority { QueryPriority::Light }

    fn job_kind(&self) -> JobKind {
        JobKind::PlayerGlobalSnapshot(self.context.data.clone())
    }
}

#[async_trait]
impl WorkerQuery<Vec<DbPlayerCommunityPlaytime>> for PlayerGlobalQuery<Vec<DbPlayerCommunityPlaytime>> {
    type Error = sqlx::Error;

    async fn execute(&self) -> Result<Vec<DbPlayerCommunityPlaytime>, Self::Error> {
        let ctx = &self.context;
        sqlx::query_as!(DbPlayerCommunityPlaytime, r#"
            WITH user_players AS (
                SELECT player_id FROM player WHERE player_id = $1 OR associated_player_id = $1
            )
            SELECT c.community_id,
                   COALESCE(c.community_name, '') AS "community_name!",
                   c.community_icon_url AS icon_url,
                   SUM(pp.total_playtime) AS total_playtime
            FROM website.player_playtime pp
            JOIN user_players up ON up.player_id = pp.player_id
            JOIN server s ON s.server_id = pp.server_id
            JOIN community c ON c.community_id = s.community_id
            GROUP BY c.community_id, c.community_name, c.community_icon_url
            ORDER BY SUM(pp.total_playtime) DESC
        "#, ctx.data.canonical_id).fetch_all(&*ctx.pool).await
    }

    fn cache_key_pattern(&self) -> String {
        community_playtime_key(&self.context.data.canonical_id)
    }

    fn ttl(&self) -> u64 { 5 * 60 }
    fn priority(&self) -> QueryPriority { QueryPriority::Light }

    fn job_kind(&self) -> JobKind {
        JobKind::PlayerCommunityPlaytime(self.context.data.clone())
    }
}

pub struct PlayerWorker {
    background_worker: Arc<BackgroundWorker>,
    pool: Arc<Pool<Postgres>>,
}

impl PlayerWorker {
    pub fn new(cache: Arc<FastCache>, pool: Arc<Pool<Postgres>>) -> Self {
        Self {
            background_worker: Arc::new(BackgroundWorker::new(cache)),
            pool,
        }
    }

    async fn query_player<T>(
        &self, context: &PlayerContext
    ) -> WorkResult<T>
    where
        PlayerBasicQuery<T>: WorkerQuery<T> + Send + Sync,
        <PlayerBasicQuery<T> as WorkerQuery<T>>::Error: std::fmt::Display,
        T: serde::Serialize + for<'de> serde::Deserialize<'de> + Send + Sync + Clone + 'static,
    {
        let query = PlayerBasicQuery::new(context, self.pool.clone(), self.background_worker.cache.clone());
        let result = self.background_worker.execute_with_session_fallback(
            query,
            &context.cache_key.current,
            context.cache_key.previous.as_deref(),
        ).await?;
        Ok(result.result)
    }

    async fn query_player_execute<T>(
        &self, context: &PlayerContext
    ) -> WorkResult<T>
    where
        PlayerBasicQuery<T>: WorkerQuery<T> + Send + Sync,
        <PlayerBasicQuery<T> as WorkerQuery<T>>::Error: std::fmt::Display,
        WorkError: From<<PlayerBasicQuery<T> as WorkerQuery<T>>::Error>,
        T: serde::Serialize + for<'de> serde::Deserialize<'de> + Send + Sync + Clone + 'static,
    {
        let query = PlayerBasicQuery::new(context, self.pool.clone(), self.background_worker.cache.clone());
        let result = self.background_worker.execute_get(
            query,
            &context.cache_key.current,
        ).await?;
        Ok(result.result)
    }
    async fn query_player_execute_session<T>(
        &self, context: &PlayerContext, session_id: &str
    ) -> WorkResult<T>
    where
        PlayerSessionQuery<T>: WorkerQuery<T> + Send + Sync,
        <PlayerSessionQuery<T> as WorkerQuery<T>>::Error: std::fmt::Display,
        WorkError: From<<PlayerSessionQuery<T> as WorkerQuery<T>>::Error>,
        T: serde::Serialize + for<'de> serde::Deserialize<'de> + Send + Sync + Clone + 'static,
    {
        let query = PlayerSessionQuery::new(context, self.pool.clone(), self.background_worker.cache.clone(), session_id);
        let result = self.background_worker.execute_get(
            query,
            &context.cache_key.current,
        ).await?;
        Ok(result.result)
    }
    pub async fn get_player_sessions(&self, context: &PlayerContext) -> WorkResult<Vec<PlayerSessionTime>> {
        let result: Vec<DbPlayerSessionTime> = self.query_player(context).await?;
        Ok(result.iter_into())
    }

    pub async fn get_player_approximate_friend(&self, context: &PlayerContext, session_id: &str) -> WorkResult<Vec<PlayerSeen>> {
        let result: Vec<DbPlayerSeen> = self.query_player_execute_session(context, session_id).await?;
        Ok(result.iter_into())
    }
    pub async fn get_most_played_maps(&self, context: &PlayerContext) -> WorkResult<Vec<PlayerMostPlayedMap>>{
        let result: Vec<DbPlayerMapPlayed> = self.query_player(context).await?;
        let values: Vec<PlayerMostPlayedMap> = result.iter_into();
        let ranks: Vec<DbMapRank> = self.query_player_execute(context).await?;
        let mut mapped_ranks: HashMap<String, MapRank> = HashMap::new();
        for rank in ranks{
            let map_rank: MapRank = rank.into();
            mapped_ranks.insert(map_rank.map.clone(), map_rank);
        }
        Ok(values
            .into_iter()
            .map(|mut e| {
                e.rank = mapped_ranks.get(&e.map).map(|e| e.rank).unwrap_or_default();
                e
            })
            .collect())

    }
    pub async fn get_regions(&self, context: &PlayerContext) -> WorkResult<Vec<PlayerRegionTime>>{
        let result: Vec<DbPlayerRegionTime> = self.query_player(context).await?;
        Ok(result.iter_into())
    }
    pub async fn get_detail(&self, context: &PlayerContext) -> WorkResult<DetailedPlayer>{
        let detail_db: DbPlayerDetail = self.query_player(context).await?;
        let mut detail: DetailedPlayer = detail_db.into();
        self.attach_ranks_and_aliases(context, &mut detail, false).await?;
        Ok(detail)
    }

    pub async fn get_detail_stored(&self, context: &PlayerContext) -> WorkResult<DetailedPlayer>{
        let player_id = &context.player.player_id;
        let server_id = &context.server.server_id;

        let detail_db = sqlx::query_as!(DbPlayerDetail, "
            SELECT
                su.player_id,
                su.player_name,
                su.created_at,
                su.associated_player_id,
                pp.total_playtime AS \"total_playtime?\",
                pp.casual_playtime AS \"casual_playtime?\",
                pp.tryhard_playtime AS \"tryhard_playtime?\",
                pp.mixed_playtime AS \"mixed_playtime?\",
                0::int AS rank,
                pp.category,
                NULL::TIMESTAMPTZ AS online_since,
                NULL::TIMESTAMPTZ AS last_played,
                NULL::TIMESTAMPTZ AS last_played_ended,
                NULL::interval AS last_played_duration
            FROM player su
            LEFT JOIN website.player_playtime pp
                ON pp.player_id = su.player_id AND pp.server_id = $2
            WHERE su.player_id = $1
            LIMIT 1
        ", player_id, server_id).fetch_optional(&*self.pool).await?;

        let Some(detail_db) = detail_db else {
            return Err(WorkError::NotFound);
        };
        let mut detail: DetailedPlayer = detail_db.into();
        self.attach_ranks_and_aliases(context, &mut detail, true).await?;
        Ok(detail)
    }

    async fn attach_ranks_and_aliases(
        &self, context: &PlayerContext, detail: &mut DetailedPlayer, forced: bool,
    ) -> WorkResult<()>{
        let playtime_ranks: Option<DbPlayerRank> = self.query_player_execute(context).await?;
        if let Some(playtime_ranks) = playtime_ranks {
            let mut ranks: PlayerRanks = playtime_ranks.into();
            let map_ranks: Vec<DbMapRank> = self.query_player_execute(context).await?;
            let filtering = 3_600_000_000;  // 1 hr in microseconds
            ranks.highest_map_rank = map_ranks.into_iter()
                .find(|e| e.total_playtime.map_or(false, |p| p.microseconds > filtering))
                .map(Into::into);
            detail.ranks = Some(ranks)
        }
        let aliases: Vec<DbPlayerAlias> = if forced {
            self.query_player_execute(context).await?
        } else {
            self.query_player(context).await?
        };
        let mut aliases_filtered = vec![];
        let mut last_seen = String::from("");
        for alias in aliases{ // due to buggy impl lol
            if alias.name != last_seen{
                last_seen = alias.name.to_string();
                aliases_filtered.push(alias);
            }
        }
        aliases_filtered.reverse();
        detail.aliases = aliases_filtered.iter_into();
        Ok(())
    }
    /// Global queries carry no session, so there is no fallback key and nothing for `{session}`
    /// substitution to do; the refresh job invalidates these keys instead (see
    /// `run_global_refresh`).
    async fn query_global<T>(&self, canonical_id: &str) -> WorkResult<T>
    where
        PlayerGlobalQuery<T>: WorkerQuery<T> + Send + Sync,
        <PlayerGlobalQuery<T> as WorkerQuery<T>>::Error: std::fmt::Display,
        WorkError: From<<PlayerGlobalQuery<T> as WorkerQuery<T>>::Error>,
        T: serde::Serialize + for<'de> serde::Deserialize<'de> + Send + Sync + Clone + 'static,
    {
        let query = PlayerGlobalQuery::new(canonical_id, self.pool.clone(), self.background_worker.cache.clone());
        let result = self.background_worker.execute_get(query, "").await?;
        Ok(result.result)
    }

    pub async fn get_global_playtime(&self, canonical_id: &str) -> WorkResult<GlobalPlaytimeSummary> {
        let snapshot: DbGlobalPlaytimeSnapshot = self.query_global(canonical_id).await?;

        // Live, never cached: the lock's presence is what tells the client a refresh is running.
        let cache = &self.background_worker.cache;
        let mut is_calculating = redis_key_exists(&cache.redis_pool, &global_lock_key(canonical_id)).await;

        if snapshot.is_outdated && !is_calculating {
            self.enqueue_global_refresh(canonical_id).await;
            // A refresh is queued by the time this response lands, so say so rather than
            // leaving the client to discover it on the next poll.
            is_calculating = true;
        }

        Ok(GlobalPlaytimeSummary {
            total_playtime: snapshot.total_playtime.to_f64(),
            casual_playtime: snapshot.casual_playtime.to_f64(),
            tryhard_playtime: snapshot.tryhard_playtime.to_f64(),
            category: snapshot.category,
            rank: snapshot.global_rank,
            casual_rank: snapshot.casual_rank,
            tryhard_rank: snapshot.tryhard_rank,
            total_ranked_players: self.total_ranked_players().await,
            server_count: snapshot.server_count,
            community_count: snapshot.community_count,
            is_outdated: snapshot.is_outdated,
            is_calculating,
            calculated_at: snapshot.calculated_at.map(db_to_utc),
            rank_calculated_at: snapshot.rank_calculated_at.map(db_to_utc),
        })
    }

    pub async fn get_community_playtime(&self, canonical_id: &str) -> WorkResult<Vec<PlayerCommunityPlaytime>> {
        let result: Vec<DbPlayerCommunityPlaytime> = self.query_global(canonical_id).await?;
        Ok(result.into_iter().map(Into::into).collect())
    }

    async fn total_ranked_players(&self) -> i64 {
        let pool = self.pool.clone();
        let func = || sqlx::query_scalar!("
            SELECT COUNT(*) FROM website.player_global_playtime WHERE total_playtime > INTERVAL '0'
        ").fetch_one(&*pool);

        cached_response("global-playtime-ranked-count", &self.background_worker.cache, HOUR * 12, func)
            .await
            .ok()
            .and_then(|cached: CachedResult<Option<i64>>| cached.result)
            .unwrap_or(0)
    }

    /// Hands the refresh to the worker instead of running it here. This is the heaviest job in the
    /// app, and it used to loop `execute_get` per server on the API's own runtime and connection
    /// pool while requests were being served.
    async fn enqueue_global_refresh(&self, canonical_id: &str) {
        self.background_worker.enqueue_refresh_job(RefreshJob {
            kind: JobKind::PlayerGlobalPlaytime { canonical_id: canonical_id.to_string() },
            // Nothing reads this key; it exists so the in-flight marker dedupes per player.
            cache_key: format!("global-playtime-refresh:{canonical_id}"),
            ttl: 0,
            priority: QueryPriority::Heavy,
            stale_key: None,
        }).await;
    }

    pub async fn get_online_heatmap(&self, context: &PlayerContext) -> WorkResult<Vec<PlayerOnlineHeatmap>> {
        let result: Vec<DbPlayerOnlineHeatmap> = self.query_player(context).await?;
        Ok(result.into_iter().map(Into::into).collect())
    }

    pub async fn get_hour_of_day(&self, context: &PlayerContext) -> WorkResult<Vec<PlayerHourDay>> {
        let result: Vec<DbPlayerHourCount> = self.query_player(context).await?;

        let mut to_return = vec![];
        for data in result{
            let (join, leave) = data.into();
            to_return.push(join);
            to_return.push(leave);
        }
        Ok(to_return)
    }
}

fn global_lock_key(canonical_id: &str) -> String {
    format!("lock:player_global_playtime:{canonical_id}")
}

/// Shared between `cache_key_pattern` and the eviction in `run_global_refresh`: deriving the key
/// once is what guarantees the refresh invalidates the same key the reads are cached under.
fn global_snapshot_key(canonical_id: &str) -> String {
    format!("player-global-playtime:{canonical_id}")
}

fn community_playtime_key(canonical_id: &str) -> String {
    format!("player-community-playtime:{canonical_id}")
}

/// Re-derives every server's `player_playtime` for this player, then stores the summation. Runs in
/// the worker process, off the back of a `PlayerGlobalPlaytime` job.
///
/// The redis lock still matters even though the queue already dedupes: the in-flight marker expires
/// after 5 minutes and this loop can outlive that, so a second job could otherwise be picked up and
/// race on the upsert. Its presence is also what `get_global_playtime` reports as `is_calculating`.
/// No semaphore here — the heavy queue's concurrency limit is what bounds this now.
pub(crate) async fn run_global_playtime_job(
    pool: Arc<Pool<Postgres>>,
    cache: Arc<FastCache>,
    canonical_id: &str,
) -> Result<(), sqlx::Error> {
    let lock_key = global_lock_key(canonical_id);

    let Some(lock_id) = try_redis_lock(&cache.redis_pool, &lock_key, 60 * 15).await else {
        tracing::debug!("GLOBAL PLAYTIME ALREADY CALCULATING {canonical_id}");
        return Ok(());
    };

    let background_worker = Arc::new(BackgroundWorker::new(cache.clone()));
    let result = run_global_refresh(&pool, &background_worker, &cache, canonical_id).await;

    release_redis_lock(&cache.redis_pool, &lock_key, &lock_id).await;
    tracing::debug!("GLOBAL PLAYTIME LOCK RELEASED {canonical_id}");

    result
}

async fn run_global_refresh(
    pool: &Arc<Pool<Postgres>>,
    background_worker: &Arc<BackgroundWorker>,
    cache: &Arc<FastCache>,
    canonical_id: &str,
) -> Result<(), sqlx::Error> {
    // Every fork on every server, not one fork per server: renamed accounts keep their own
    // player_playtime row and the summation below counts all of them.
    let targets = sqlx::query_as!(DbGlobalRefreshTarget, "
        WITH user_players AS (
            SELECT player_id FROM player WHERE player_id = $1 OR associated_player_id = $1
        )
        SELECT DISTINCT pss.player_id, pss.server_id
        FROM player_server_session pss
        JOIN user_players up ON up.player_id = pss.player_id
    ", canonical_id).fetch_all(&**pool).await?;

    tracing::info!("GLOBAL PLAYTIME REFRESH {canonical_id}: {} server(s)", targets.len());

    for target in targets {
        let Some(server) = get_server(pool, cache, &target.server_id).await else { continue };
        let Some(player) = get_player(pool, cache, &target.player_id).await else { continue };

        let cache_key = get_player_cache_key(pool, cache, &target.server_id, &target.player_id).await;
        let context = PlayerContext { player, server, cache_key };

        // execute_get waits for the recompute rather than deferring it, and short-circuits on a
        // cache hit, so servers that are already fresh cost nothing. The upsert into
        // player_playtime is this query's side effect.
        let query: PlayerBasicQuery<DbPlayerDetail> =
            PlayerBasicQuery::new(&context, pool.clone(), cache.clone());

        if let Err(e) = background_worker
            .execute_get::<DbPlayerDetail, _>(query, &context.cache_key.current)
            .await
        {
            tracing::warn!(
                "GLOBAL PLAYTIME: {} on {} failed: {e:?}", target.player_id, target.server_id
            );
        }
    }

    // Leaves the rank columns alone; those belong to the daily update-global-playtime-rank job.
    sqlx::query!("
        WITH user_players AS (
            SELECT player_id FROM player WHERE player_id = $1 OR associated_player_id = $1
        ),
        sums AS (
            SELECT SUM(pp.total_playtime) AS total_playtime,
                   SUM(pp.casual_playtime) AS casual_playtime,
                   SUM(pp.tryhard_playtime) AS tryhard_playtime,
                   COUNT(DISTINCT pp.server_id) AS server_count,
                   COUNT(DISTINCT s.community_id) AS community_count
            FROM website.player_playtime pp
            JOIN user_players up ON up.player_id = pp.player_id
            JOIN server s ON s.server_id = pp.server_id
        )
        INSERT INTO website.player_global_playtime(
            player_id, total_playtime, casual_playtime, tryhard_playtime, category,
            server_count, community_count, calculated_at, synced_at
        )
        SELECT $1,
               COALESCE(total_playtime, INTERVAL '0'),
               COALESCE(casual_playtime, INTERVAL '0'),
               COALESCE(tryhard_playtime, INTERVAL '0'),
               CASE
                   WHEN total_playtime < INTERVAL '5 hours' THEN NULL
                   WHEN EXTRACT(EPOCH FROM casual_playtime) / NULLIF(EXTRACT(EPOCH FROM total_playtime), 0) >= 0.6 THEN 'casual'
                   WHEN EXTRACT(EPOCH FROM tryhard_playtime) / NULLIF(EXTRACT(EPOCH FROM total_playtime), 0) >= 0.6 THEN 'tryhard'
                   WHEN EXTRACT(EPOCH FROM tryhard_playtime) / NULLIF(EXTRACT(EPOCH FROM total_playtime), 0) BETWEEN 0.4 AND 0.6 THEN 'mixed'
                   ELSE NULL
               END,
               COALESCE(server_count, 0)::INT,
               COALESCE(community_count, 0)::INT,
               CURRENT_TIMESTAMP,
               CURRENT_TIMESTAMP
        FROM sums
        ON CONFLICT (player_id) DO UPDATE
        SET total_playtime = EXCLUDED.total_playtime,
            casual_playtime = EXCLUDED.casual_playtime,
            tryhard_playtime = EXCLUDED.tryhard_playtime,
            category = EXCLUDED.category,
            server_count = EXCLUDED.server_count,
            community_count = EXCLUDED.community_count,
            calculated_at = EXCLUDED.calculated_at,
            synced_at = EXCLUDED.synced_at
    ", canonical_id).execute(&**pool).await?;

    // The reads derived from what was just upserted are now wrong; evict them so the next request
    // recomputes instead of serving a cached `is_outdated: true` snapshot (which would re-enqueue
    // this whole job until the TTL ran out).
    background_worker.drop_cached(&global_snapshot_key(canonical_id)).await;
    background_worker.drop_cached(&community_playtime_key(canonical_id)).await;

    tracing::info!("GLOBAL PLAYTIME REFRESH DONE {canonical_id}");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::super::test_support::{player_global_query, player_query, player_session_query, TEST_PLAYER, TEST_SERVER, TEST_SESSION};
    use super::*;

    /// Every assertion here goes through the pure half of `WorkerQuery`. `execute` is never called,
    /// which is what keeps these tests free of a database.
    fn metadata<T, Q: WorkerQuery<T>>(query: &Q) -> (String, u64, QueryPriority, JobKind) {
        (query.cache_key_pattern(), query.ttl(), query.priority(), query.job_kind())
    }

    /// Session-scoped keys must carry the placeholder, or `for_session` silently produces one key
    /// for every session and the cache never rolls over.
    macro_rules! assert_session_scoped {
        ($query:expr, $prefix:literal, $priority:pat, $kind:pat) => {{
            let (pattern, ttl, priority, kind) = metadata(&$query);
            assert!(
                pattern.starts_with(concat!($prefix, ":")),
                "expected {pattern} to start with {}", concat!($prefix, ":"),
            );
            assert!(pattern.ends_with(":{session}"), "{pattern} is not session-scoped");
            assert!(pattern.contains(TEST_PLAYER), "{pattern} does not identify the player");
            assert!(ttl > 0, "a zero ttl would cache nothing");
            assert!(matches!(priority, $priority), "unexpected priority for {pattern}");
            assert!(matches!(kind, $kind), "job_kind does not match the query type for {pattern}");
        }};
    }

    #[tokio::test]
    async fn player_query_metadata_matches_its_type() {
        assert_session_scoped!(
            player_query::<Vec<DbPlayerSessionTime>>(),
            "player-session", QueryPriority::Light, JobKind::PlayerSessionTime(_)
        );
        assert_session_scoped!(
            player_query::<Vec<DbPlayerMapPlayed>>(),
            "player-map-played", QueryPriority::Heavy, JobKind::PlayerMapPlayed(_)
        );
        assert_session_scoped!(
            player_query::<Option<DbPlayerRank>>(),
            "player-play-ranks", QueryPriority::Light, JobKind::PlayerPlaytimeRanks(_)
        );
        assert_session_scoped!(
            player_query::<Vec<DbMapRank>>(),
            "player-map-ranks", QueryPriority::Light, JobKind::PlayerMapRanks(_)
        );
        assert_session_scoped!(
            player_query::<Vec<DbPlayerAlias>>(),
            "player-aliases", QueryPriority::Light, JobKind::PlayerAliases(_)
        );
        assert_session_scoped!(
            player_query::<DbPlayerDetail>(),
            "player_detail", QueryPriority::Heavy, JobKind::PlayerDetail(_)
        );
        assert_session_scoped!(
            player_query::<Vec<DbPlayerRegionTime>>(),
            "player-region", QueryPriority::Light, JobKind::PlayerRegionTime(_)
        );
        assert_session_scoped!(
            player_query::<Vec<DbPlayerHourCount>>(),
            "player-hour-day", QueryPriority::Light, JobKind::PlayerHourCount(_)
        );
        assert_session_scoped!(
            player_query::<Vec<DbPlayerOnlineHeatmap>>(),
            "player-online-heatmap", QueryPriority::Light, JobKind::PlayerOnlineHeatmap(_)
        );
    }

    /// Aliases follow the player across servers, so this is the one player key deliberately not
    /// scoped by server. Asserted explicitly so narrowing it later is a conscious change.
    #[tokio::test]
    async fn aliases_are_keyed_by_player_only() {
        let pattern = player_query::<Vec<DbPlayerAlias>>().cache_key_pattern();

        assert_eq!(pattern, format!("player-aliases:{TEST_PLAYER}:{{session}}"));
        assert!(!pattern.contains(TEST_SERVER), "alias cache is intentionally server-agnostic");
    }

    /// `PlayerSeen` is the exception to the placeholder rule: its session is part of the query data
    /// rather than the cache-key pattern, so the pattern is already fully resolved.
    #[tokio::test]
    async fn player_seen_embeds_its_session_rather_than_a_placeholder() {
        let query = player_session_query::<Vec<DbPlayerSeen>>();
        let (pattern, ttl, priority, kind) = metadata(&query);

        assert_eq!(pattern, format!("player-seen-session:{TEST_SERVER}:{TEST_PLAYER}:{TEST_SESSION}"));
        assert!(!pattern.contains("{session}"), "the session is already substituted");
        assert!(ttl > 0);
        assert!(matches!(priority, QueryPriority::Heavy));
        assert!(matches!(kind, JobKind::PlayerSeen(_)));
    }

    /// Global queries are keyed by canonical id alone: no server, no `{session}` placeholder.
    /// Their invalidation contract is different too — `run_global_refresh` evicts these keys
    /// explicitly — so assert the pattern against the exact helper the eviction uses; if either
    /// side drifts, the refresh silently stops invalidating what the reads are cached under.
    #[tokio::test]
    async fn global_query_metadata_matches_its_type() {
        let (pattern, ttl, priority, kind) =
            metadata(&player_global_query::<DbGlobalPlaytimeSnapshot>());
        assert_eq!(pattern, global_snapshot_key(TEST_PLAYER));
        assert!(!pattern.contains("{session}"), "global keys are refresh-invalidated, not session-scoped");
        assert!(ttl > 0, "a zero ttl would cache nothing");
        assert!(matches!(priority, QueryPriority::Light));
        assert!(matches!(kind, JobKind::PlayerGlobalSnapshot(_)));

        let (pattern, ttl, priority, kind) =
            metadata(&player_global_query::<Vec<DbPlayerCommunityPlaytime>>());
        assert_eq!(pattern, community_playtime_key(TEST_PLAYER));
        assert!(!pattern.contains("{session}"), "global keys are refresh-invalidated, not session-scoped");
        assert!(ttl > 0, "a zero ttl would cache nothing");
        assert!(matches!(priority, QueryPriority::Light));
        assert!(matches!(kind, JobKind::PlayerCommunityPlaytime(_)));
    }

    #[tokio::test]
    async fn player_queries_are_scoped_by_server() {
        for pattern in [
            player_query::<Vec<DbPlayerSessionTime>>().cache_key_pattern(),
            player_query::<Vec<DbPlayerMapPlayed>>().cache_key_pattern(),
            player_query::<DbPlayerDetail>().cache_key_pattern(),
            player_query::<Vec<DbPlayerRegionTime>>().cache_key_pattern(),
        ] {
            assert!(pattern.contains(TEST_SERVER), "{pattern} must not be shared across servers");
        }
    }
}
