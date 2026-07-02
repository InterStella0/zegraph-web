use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use async_trait::async_trait;
use sqlx::{Pool, Postgres};
use sqlx::postgres::PgQueryResult;
use sqlx::postgres::types::PgInterval;
use crate::core::model::*;
use crate::core::utils::*;
use crate::core::api_models::*;
use crate::FastCache;
use super::{BackgroundWorker, PlayerContext, PlayerData, PlayerSessionData, Query, QueryPriority, WorkError, WorkResult, WorkerQuery};

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
        Self {
            context: Query {
                pool,
                cache,
                data: PlayerSessionData{
                    player_id: ctx.player.player_id.clone(),
                    server_id: ctx.server.server_id.clone(),
                    session_id: session_id.to_string(),
                },
            },
            _phantom: std::marker::PhantomData,
        }
    }
}
#[derive(Clone)]
pub struct PlayerBasicQuery<T> {
    pub context: Query<PlayerData>,
    _phantom: std::marker::PhantomData<T>,
}
impl<T> PlayerBasicQuery<T> {
    fn new(ctx: &PlayerContext, pool: Arc<Pool<Postgres>>, cache: Arc<FastCache>) -> Self {
        Self {
            context: Query {
                pool,
                cache,
                data: PlayerData{
                    player_id: ctx.player.player_id.clone(),
                    server_id: ctx.server.server_id.clone(),
                    current_session: ctx.cache_key.current.clone()
                },
            },
            _phantom: std::marker::PhantomData,
        }
    }
    fn raw(context: Query<PlayerData>) -> Self {
        Self {
            context, _phantom: std::marker::PhantomData,
        }
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
}
#[async_trait]
impl WorkerQuery<Option<DbPlayerRank>> for PlayerBasicQuery<Option<DbPlayerRank>> {
    type Error = sqlx::Error;
    async fn execute(&self) -> Result<Option<DbPlayerRank>, Self::Error> {
        sqlx::query_as!(DbPlayerRank, "
            SELECT global_playtime_rank AS global_playtime,
                playtime_rank AS total_playtime,
                casual_rank AS casual_playtime,
                tryhard_rank AS tryhard_playtime
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
}
struct DbServerMapState{
    #[allow(dead_code)]
    server_id: String,
    sum_key: Option<String>,
}
#[allow(dead_code)]
struct DbPlayerPlayTime{
    server_id: String,
    player_id: String,
    total_playtime: PgInterval,
    casual_playtime: PgInterval,
    tryhard_playtime: PgInterval,
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
        for (map_name, duration) in durations{
            total += duration;
            let Some(info) = infos.get(&map_name) else {
                continue;
            };
            if info.is_casual.unwrap_or_default(){
                casual += duration;
            }
            if info.is_tryhard.unwrap_or_default(){
                tryhard += duration;
            }
        }
        let total_playtime: PgInterval = total.try_into().unwrap_or_default();
        let casual_playtime: PgInterval = casual.try_into().unwrap_or_default();
        let tryhard_playtime: PgInterval = tryhard.try_into().unwrap_or_default();
        sqlx::query!("
            WITH pre_var AS (
                SELECT $3::INTERVAL AS total,
                $4::INTERVAL AS casual,
                $5::INTERVAL AS tryhard
            ),
            category_calc AS (
                SELECT
                    CASE
                        WHEN pre_var.total < INTERVAL '5 hours' THEN null
                        WHEN EXTRACT(EPOCH FROM pre_var.casual) / NULLIF(EXTRACT(EPOCH FROM pre_var.total), 1) >= 0.6 THEN 'casual'
                        WHEN EXTRACT(EPOCH FROM pre_var.tryhard) / NULLIF(EXTRACT(EPOCH FROM pre_var.total), 1) >= 0.6 THEN 'tryhard'
                        WHEN EXTRACT(EPOCH FROM pre_var.tryhard) / NULLIF(EXTRACT(EPOCH FROM pre_var.total), 1) BETWEEN 0.4 AND 0.6 THEN 'mixed'
                        ELSE null
                    END AS category
                FROM pre_var
            )
            INSERT INTO website.player_playtime(
                player_id, server_id, total_playtime, casual_playtime, tryhard_playtime, sum_key, category
            )
            SELECT
                $1, $2, $3, $4, $5, $6, c.category
            FROM category_calc AS c
            ON CONFLICT (player_id, server_id)
            DO UPDATE
            SET
                total_playtime = EXCLUDED.total_playtime,
                casual_playtime = EXCLUDED.casual_playtime,
                tryhard_playtime = EXCLUDED.tryhard_playtime,
                category = EXCLUDED.category,
                sum_key = EXCLUDED.sum_key;
        ", ctx.data.player_id, ctx.data.server_id, total_playtime,
            casual_playtime, tryhard_playtime, sum_key
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
                pp.total_playtime, pp.casual_playtime, pp.tryhard_playtime,
                0::int AS rank,
                pp.category,
                NULL::TIMESTAMPTZ AS online_since,
                NULL::TIMESTAMPTZ AS last_played,
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
}
pub struct PlayerWorker {
    background_worker: Arc<BackgroundWorker>,
    pool: Arc<Pool<Postgres>>,
}

impl PlayerWorker {
    pub fn new(cache: Arc<FastCache>, pool: Arc<Pool<Postgres>>) -> Self {
        Self {
            background_worker: Arc::new(BackgroundWorker::new(cache, 5)),
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
        let aliases: Vec<DbPlayerAlias> = self.query_player(context).await?;
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
        Ok(detail)
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
