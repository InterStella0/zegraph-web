use std::collections::HashMap;
use std::sync::Arc;
use async_trait::async_trait;
use chrono::{DateTime, Utc};
use sqlx::{Pool, Postgres};
use crate::core::model::*;
use crate::core::utils::*;
use crate::core::api_models::*;
use crate::FastCache;
use super::{BackgroundWorker, MapContext, MapData, Query, QueryPriority, WorkResult, WorkerQuery};

#[derive(Clone)]
pub struct MapBasicQuery<T> {
    pub context: Query<MapData>,
    _phantom: std::marker::PhantomData<T>,
}

impl<T> MapBasicQuery<T> {
    fn new(ctx: &MapContext, pool: Arc<Pool<Postgres>>, cache: Arc<FastCache>) -> Self {
        Self {
            context: Query {
                pool,
                cache,
                data: MapData{
                    map_name: ctx.map.map.clone(),
                    server_id: ctx.server.server_id.clone(),
                },
            },
            _phantom: std::marker::PhantomData,
        }
    }
}
#[async_trait]
impl WorkerQuery<Vec<DbMapRegion>> for MapBasicQuery<Vec<DbMapRegion>> {
    type Error = sqlx::Error;

    async fn execute(&self) -> Result<Vec<DbMapRegion>, Self::Error> {
        let ctx = &self.context;
        sqlx::query_as!(DbMapRegion, "
            WITH session_data AS (
              SELECT
                g.map,
                g.started_at AT TIME ZONE 'UTC' AS started_at,
                g.ended_at AT TIME ZONE 'UTC' AS ended_at,
                date_trunc('day', g.started_at AT TIME ZONE 'UTC') AS start_day,
                date_trunc('day', g.ended_at AT TIME ZONE 'UTC') AS end_day
              FROM server_map_played g

              WHERE g.map = $2
                AND g.server_id = $1
                AND g.started_at AT TIME ZONE 'UTC'
                     BETWEEN (CURRENT_TIMESTAMP AT TIME ZONE 'UTC' - interval '1 year')
                         AND CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
            ),
            game_days AS (
              SELECT
                sd.*,
                d::date AS play_day
              FROM session_data sd,
                   generate_series(sd.start_day, sd.end_day, interval '1 day') AS d
            ),
            region_intervals AS (
              SELECT
                gd.map,
                gd.started_at,
                gd.ended_at,
                gd.play_day,
                rt.region_id,
                rt.region_name,
                s.region_start,
                s.region_end
              FROM game_days gd
              CROSS JOIN region_time rt
              CROSS JOIN LATERAL (
                VALUES
                  (
                    gd.play_day + (rt.start_time AT TIME ZONE 'UTC')::time,
                    CASE
                      WHEN (rt.start_time AT TIME ZONE 'UTC')::time <= (rt.end_time AT TIME ZONE 'UTC')::time
                        THEN gd.play_day + (rt.end_time AT TIME ZONE 'UTC')::time
                      ELSE gd.play_day + interval '1 day'
                    END
                  ),
                  (
                    gd.play_day + time '00:00',
                    CASE
                      WHEN (rt.start_time AT TIME ZONE 'UTC')::time <= (rt.end_time AT TIME ZONE 'UTC')::time
                        THEN NULL
                      ELSE gd.play_day + (rt.end_time AT TIME ZONE 'UTC')::time
                    END
                  )
              ) AS s(region_start, region_end)
              WHERE s.region_end IS NOT NULL
            ),
            daily_region_play AS (
              SELECT
                region_id,
                region_name,
                map,
                play_day,
                SUM(
                  LEAST(ended_at, region_end) - GREATEST(started_at, region_start)
                ) AS region_play_duration
              FROM region_intervals
              WHERE ended_at > region_start
                AND started_at < region_end
              GROUP BY region_id, region_name, map, play_day
            ),
            all_days AS (
              SELECT day::date AS play_day
              FROM generate_series(
                CURRENT_TIMESTAMP AT TIME ZONE 'UTC' - interval '1 year',
                CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
                interval '1 day'
              ) day
            ), final_calculation AS (
            SELECT
              ad.play_day::timestamptz AS date,
              rt.region_name,
              COALESCE(drp.region_play_duration, interval '0 seconds') AS total_play_duration
            FROM all_days ad
            CROSS JOIN region_time rt
            LEFT JOIN daily_region_play drp
              ON ad.play_day = drp.play_day
             AND rt.region_id = drp.region_id
            ORDER BY ad.play_day, total_play_duration DESC
			)
			SELECT region_name, $2 as map, SUM(total_play_duration) total_play_duration
			FROM final_calculation
			GROUP BY region_name
        ", ctx.data.server_id, ctx.data.map_name).fetch_all(&*ctx.pool).await
    }

    fn cache_key_pattern(&self) -> String {
        let ctx = &self.context;
        format!("map-regions-2:{}:{}:{{session}}", ctx.data.server_id, ctx.data.map_name)
    }

    fn ttl(&self) -> u64 {
        7 * DAY
    }

    fn priority(&self) -> QueryPriority {
        QueryPriority::Light
    }
}
#[async_trait]
impl WorkerQuery<Vec<DbMapRegionDate>> for MapBasicQuery<Vec<DbMapRegionDate>> {
    type Error = sqlx::Error;

    async fn execute(&self) -> Result<Vec<DbMapRegionDate>, Self::Error> {
        let ctx = &self.context;
        sqlx::query_as!(DbMapRegionDate, "
            WITH session_data AS (
              SELECT
                g.map,
                g.started_at AT TIME ZONE 'UTC' AS started_at,
                g.ended_at AT TIME ZONE 'UTC' AS ended_at,
                date_trunc('day', g.started_at AT TIME ZONE 'UTC') AS start_day,
                date_trunc('day', g.ended_at AT TIME ZONE 'UTC') AS end_day
              FROM server_map_played g
                WHERE g.map = $2
                  AND g.server_id = $1
                AND g.started_at AT TIME ZONE 'UTC'
                     BETWEEN (CURRENT_TIMESTAMP AT TIME ZONE 'UTC' - interval '1 year')
                         AND CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
            ),
            game_days AS (
              SELECT
                sd.*,
                d::date AS play_day
              FROM session_data sd,
                   generate_series(sd.start_day, sd.end_day, interval '1 day') AS d
            ),
            region_intervals AS (
              SELECT
                gd.map,
                gd.started_at,
                gd.ended_at,
                gd.play_day,
                rt.region_id,
                rt.region_name,
                s.region_start,
                s.region_end
              FROM game_days gd
              CROSS JOIN region_time rt
              CROSS JOIN LATERAL (
                VALUES
                  (
                    gd.play_day + (rt.start_time AT TIME ZONE 'UTC')::time,
                    CASE
                      WHEN (rt.start_time AT TIME ZONE 'UTC')::time <= (rt.end_time AT TIME ZONE 'UTC')::time
                        THEN gd.play_day + (rt.end_time AT TIME ZONE 'UTC')::time
                      ELSE gd.play_day + interval '1 day'
                    END
                  ),
                  (
                    gd.play_day + time '00:00',
                    CASE
                      WHEN (rt.start_time AT TIME ZONE 'UTC')::time <= (rt.end_time AT TIME ZONE 'UTC')::time
                        THEN NULL
                      ELSE gd.play_day + (rt.end_time AT TIME ZONE 'UTC')::time
                    END
                  )
              ) AS s(region_start, region_end)
              WHERE s.region_end IS NOT NULL
            ),
            daily_region_play AS (
              SELECT
                region_id,
                region_name,
                map,
                play_day,
                SUM(
                  LEAST(ended_at, region_end) - GREATEST(started_at, region_start)
                ) AS region_play_duration
              FROM region_intervals
              WHERE ended_at > region_start
                AND started_at < region_end
              GROUP BY region_id, region_name, map, play_day
            ),
            all_days AS (
              SELECT day::date AS play_day
              FROM generate_series(
                CURRENT_TIMESTAMP AT TIME ZONE 'UTC' - interval '1 year',
                CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
                interval '1 day'
              ) day
            )
            SELECT
              ad.play_day::timestamptz AS date,
              rt.region_name,
              COALESCE(drp.region_play_duration, interval '0 seconds') AS total_play_duration
            FROM all_days ad
            CROSS JOIN region_time rt
            LEFT JOIN daily_region_play drp
              ON ad.play_day = drp.play_day
             AND rt.region_id = drp.region_id
            ORDER BY ad.play_day, total_play_duration DESC
        ", ctx.data.server_id, ctx.data.map_name).fetch_all(&*ctx.pool).await
    }

    fn cache_key_pattern(&self) -> String {
        let ctx = &self.context;
        format!("heat-region:{}:{}:{{session}}", ctx.data.server_id, ctx.data.map_name)
    }

    fn ttl(&self) -> u64 {
        7 * DAY
    }

    fn priority(&self) -> QueryPriority {
        QueryPriority::Light
    }
}
#[async_trait]
impl WorkerQuery<Vec<DbEvent>> for MapBasicQuery<Vec<DbEvent>> {
    type Error = sqlx::Error;

    async fn execute(&self) -> Result<Vec<DbEvent>, Self::Error> {
        let ctx = &self.context;
        sqlx::query_as!(DbEvent, "
            WITH smp_filtered AS (
              SELECT *
              FROM server_map_played
              WHERE map = $2
                AND server_id = $1
            )
            SELECT vals.event_name, AVG(vals.counted)::FLOAT average
            FROM (
              SELECT psa.event_name, smp.time_id, COUNT(psa.event_name) AS counted
              FROM smp_filtered smp
              CROSS JOIN LATERAL (
                SELECT *
                FROM player_server_activity psa
                WHERE psa.created_at BETWEEN smp.started_at AND smp.ended_at
              ) psa
              GROUP BY psa.event_name, smp.time_id
            ) vals
            GROUP BY vals.event_name
        ", ctx.data.server_id, ctx.data.map_name).fetch_all(&*ctx.pool).await
    }

    fn cache_key_pattern(&self) -> String {
        let ctx = &self.context;
        format!("map-events:{}:{}:{{session}}", ctx.data.server_id, ctx.data.map_name)
    }

    fn ttl(&self) -> u64 {
        DAY
    }

    fn priority(&self) -> QueryPriority {
        QueryPriority::Light
    }
}
#[async_trait]
impl WorkerQuery<Vec<DbMapSessionDistribution>> for MapBasicQuery<Vec<DbMapSessionDistribution>> {
    type Error = sqlx::Error;

    async fn execute(&self) -> Result<Vec<DbMapSessionDistribution>, Self::Error> {
        let ctx = &self.context;
        // noted to be slow, but i dont think there is anyway to make it faster.
        // possible session_range to be invalid if there is a new key.
        let _ = sqlx::query!("
            WITH params AS (
                SELECT $2 AS map_target,
                       $1 AS target_server
            ),
            time_spent AS (
                SELECT
                    pss.player_id,
                    LEAST(pss.ended_at, smp.ended_at) - GREATEST(pss.started_at, smp.started_at) as total_duration
                FROM public.server_map_played smp
                INNER JOIN player_server_session pss
                    ON pss.started_at < smp.ended_at
                    AND pss.ended_at > smp.started_at
                WHERE smp.map = (SELECT map_target FROM params)
                    AND smp.server_id = (SELECT target_server FROM params)
            ),
            session_distribution AS (
                SELECT
                    CASE
                        WHEN total_duration < INTERVAL '10 minutes' THEN 'Under 10'
                        WHEN total_duration BETWEEN INTERVAL '10 minutes' AND INTERVAL '30 minutes' THEN '10 - 30'
                        WHEN total_duration BETWEEN INTERVAL '30 minutes' AND INTERVAL '45 minutes' THEN '30 - 45'
                        WHEN total_duration BETWEEN INTERVAL '45 minutes' AND INTERVAL '60 minutes' THEN '45 - 60'
                        ELSE 'Over 60'
                    END AS session_range
                FROM time_spent
            )
            INSERT INTO website.map_session_distribution(server_id, map, session_range, session_count)
            SELECT
                $1 AS server_id,
                $2 AS map,
                session_range,
                COUNT(*) AS session_count
            FROM session_distribution
            GROUP BY session_range
            ON CONFLICT(server_id, map, session_range)
            DO UPDATE SET
                session_count=EXCLUDED.session_count",
            ctx.data.server_id, ctx.data.map_name
            ).execute(&*ctx.pool).await?;
        sqlx::query_as!(DbMapSessionDistribution,
            "SELECT session_range, session_count
                FROM website.map_session_distribution
                WHERE server_id=$1 AND map=$2",
            ctx.data.server_id, ctx.data.map_name
        ).fetch_all(&*ctx.pool).await
    }

    fn cache_key_pattern(&self) -> String {
        let ctx = &self.context;
        format!("sessions_distribution:{}:{}:{{session}}", ctx.data.server_id, ctx.data.map_name)
    }

    fn ttl(&self) -> u64 {
        30 * DAY
    }

    fn priority(&self) -> QueryPriority {
        QueryPriority::Light
    }
}
#[async_trait]
impl WorkerQuery<DbServerMapPartial> for MapBasicQuery<DbServerMapPartial> {
    type Error = sqlx::Error;

    async fn execute(&self) -> Result<DbServerMapPartial, Self::Error> {
        let ctx = &self.context;
        sqlx::query_as!(DbServerMapPartial,
                "SELECT
                    map,
                    SUM(ended_at - started_at)AS total_playtime,
                    COUNT(time_id) AS total_sessions,
                    MAX(started_at) AS last_played
                    FROM server_map_played
                    WHERE server_id=$1 AND map=$2
                    GROUP BY map
                    LIMIT 1",
            ctx.data.server_id, ctx.data.map_name
            ).fetch_one(&*ctx.pool).await
    }

    fn cache_key_pattern(&self) -> String {
        let ctx = &self.context;
        format!("map-partial:{}:{}:{{session}}", ctx.data.server_id, ctx.data.map_name)
    }

    fn ttl(&self) -> u64 {
        7 * DAY
    }

    fn priority(&self) -> QueryPriority {
        QueryPriority::Light
    }
}
#[async_trait]
impl WorkerQuery<Vec<DbPlayerBrief>> for MapBasicQuery<Vec<DbPlayerBrief>> {
    // Can be reduced
    type Error = sqlx::Error;

    async fn execute(&self) -> Result<Vec<DbPlayerBrief>, Self::Error> {
        // Noted to be a slow query, probably can be speed up
        let ctx = &self.context;
        sqlx::query_as!(DbPlayerBrief,
                "
            WITH params AS (
                SELECT $2 AS map_target, $1 AS target_server
            ),
            time_spent AS (
                SELECT
                    pss.player_id, SUM(
                        LEAST(pss.ended_at, smp.ended_at) - GREATEST(pss.started_at, smp.started_at)
                    ) AS total
                FROM  public.server_map_played smp
                INNER JOIN player_server_session pss
                ON pss.started_at < smp.ended_at
                AND pss.ended_at > smp.started_at
                WHERE smp.map = (SELECT map_target FROM params)
                    AND smp.server_id=(SELECT target_server FROM params)
                GROUP BY pss.player_id
            )
            ,
            online_players AS (
                SELECT player_id, started_at
                FROM player_server_session
                WHERE server_id=(SELECT target_server FROM params)
                    AND ended_at IS NULL
                        AND (CURRENT_TIMESTAMP - started_at) < INTERVAL '12 hours'
                ),
            last_player_sessions AS (
                SELECT DISTINCT ON (player_id) player_id, started_at, ended_at
                FROM player_server_session
                WHERE ended_at IS NOT NULL
                    AND server_id=(SELECT target_server FROM params)
                ORDER BY player_id, started_at DESC
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
            JOIN time_spent ts
            ON ts.player_id = p.player_id
            LEFT JOIN online_players op
            ON op.player_id=p.player_id
            JOIN last_player_sessions lps
            ON lps.player_id=p.player_id
            ORDER BY total_playtime DESC
            LIMIT 10",
            ctx.data.server_id, ctx.data.map_name
            ).fetch_all(&*ctx.pool).await
    }

    fn cache_key_pattern(&self) -> String {
        let ctx = &self.context;
        format!("map-top-10:{}:{}:{{session}}", ctx.data.server_id, ctx.data.map_name)
    }

    fn ttl(&self) -> u64 {
        7 * DAY
    }

    fn priority(&self) -> QueryPriority {
        QueryPriority::Light
    }
}
#[async_trait]
impl WorkerQuery<Option<DbMapMeta>> for MapBasicQuery<Option<DbMapMeta>> {
    type Error = sqlx::Error;
    async fn execute(&self) -> Result<Option<DbMapMeta>, Self::Error> {
        let ctx = &self.context;
        sqlx::query_as!(DbMapMeta, "SELECT * FROM map_metadata WHERE name=$1 LIMIT 1", ctx.data.map_name)
            .fetch_optional(&*ctx.pool).await
    }

    fn cache_key_pattern(&self) -> String {
        let ctx = &self.context;
        format!("map_metadata:{}:{}:{{session}}", ctx.data.server_id, ctx.data.map_name)
    }

    fn ttl(&self) -> u64 {
        DAY
    }

    fn priority(&self) -> QueryPriority {
        QueryPriority::Light
    }
}
#[async_trait]
impl WorkerQuery<Vec<DbMapPlayerTypeTime>> for MapBasicQuery<Vec<DbMapPlayerTypeTime>> {
    type Error = sqlx::Error;
    async fn execute(&self) -> Result<Vec<DbMapPlayerTypeTime>, Self::Error> {
        let ctx = &self.context;
        sqlx::query_as!(DbMapPlayerTypeTime, "
            SELECT pp.category, SUM(pmt.total_playtime) AS time_spent
            FROM website.player_map_time pmt
            JOIN website.player_playtime pp ON pmt.player_id = pp.player_id
            WHERE pp.category IS NOT NULL
              AND pmt.map = $2
              AND pmt.server_id = $1
            GROUP BY pp.category"
            , ctx.data.server_id, ctx.data.map_name)
            .fetch_all(&*ctx.pool).await
    }

    fn cache_key_pattern(&self) -> String {
        let ctx = &self.context;
        format!("map_player_type_time:{}:{}:{{session}}", ctx.data.server_id, ctx.data.map_name)
    }

    fn ttl(&self) -> u64 {
        DAY
    }

    fn priority(&self) -> QueryPriority {
        QueryPriority::Light
    }
}
#[async_trait]
impl WorkerQuery<DbMapInfo> for MapBasicQuery<DbMapInfo> {
    type Error = sqlx::Error;
    async fn execute(&self) -> Result<DbMapInfo, Self::Error> {
        let ctx = &self.context;
        sqlx::query_as!(DbMapInfo, "
            SELECT sm.map AS name,
                   sm.first_occurrence,
                   sm.cleared_at,
                   COALESCE(sm.is_tryhard, mam.is_tryhard) AS is_tryhard,
                   COALESCE(sm.is_casual, mam.is_casual) AS is_casual,
                   mam.has_lasers,
                   sm.current_cooldown,
                   sm.pending_cooldown,
                   sm.map_left,
                   sm.map_left_last_update,
                   sm.no_noms,
                   sm.workshop_id, sm.resolved_workshop_id,
                   sm.enabled,
                   sm.min_players,
                   sm.max_players,
                   sm.removed
            FROM server_map sm
            LEFT JOIN map_metadata mam ON mam.name = sm.map
            WHERE sm.server_id=$1 AND sm.map=$2
            LIMIT 1", ctx.data.server_id, ctx.data.map_name)
            .fetch_one(&*ctx.pool)
            .await
    }

    fn cache_key_pattern(&self) -> String {
        let ctx = &self.context;
        format!("map_info_data:{}:{}:{{session}}", ctx.data.server_id, ctx.data.map_name)
    }

    fn ttl(&self) -> u64 {
        60 * 60
    }

    fn priority(&self) -> QueryPriority {
        QueryPriority::Light
    }
}
#[async_trait]
impl WorkerQuery<DbMapAnalyze> for MapBasicQuery<DbMapAnalyze> {
    type Error = sqlx::Error;

    async fn execute(&self) -> Result<DbMapAnalyze, Self::Error> {
        let ctx = &self.context;
        let _ = sqlx::query!("
             WITH params AS (
               SELECT
                 $2::text AS map_target,
                 $1::text AS target_server
             ),
             map_data AS (
               SELECT
                 map,
                 COUNT(time_id) AS total_sessions,
                 SUM(ended_at - started_at) AS total_playtime
               FROM server_map_played smp
               CROSS JOIN params p
               WHERE smp.map = p.map_target
                 AND smp.server_id = p.target_server
               GROUP BY map
             ),
             player_metrics AS (
                SELECT
                   COUNT(DISTINCT pss.player_id) AS unique_players,
                   SUM(LEAST(pss.ended_at, smp.ended_at) - GREATEST(pss.started_at, smp.started_at)) cum_hours,
                  AVG(LEAST(pss.ended_at, smp.ended_at) - GREATEST(pss.started_at, smp.started_at))
                    AS avg_playtime_before_quitting,
                  SUM(CASE WHEN (LEAST(pss.ended_at, smp.ended_at) - GREATEST(pss.started_at, smp.started_at)) < INTERVAL '5 minutes'
                           THEN 1 ELSE 0 END)::float / COUNT(pss.session_id) AS dropoff_rate
                FROM player_server_session pss
                CROSS JOIN params p
                JOIN server_map_played smp
                  ON smp.server_id = pss.server_id
                  AND smp.map = p.map_target
                  AND tstzrange(pss.started_at, pss.ended_at) && tstzrange(smp.started_at, smp.ended_at)
                WHERE pss.server_id = p.target_server
             ),
             player_counts AS (
                SELECT
                  COALESCE(AVG(spc.player_count), 0) AS avg_players_per_session
                FROM server_player_counts spc
                CROSS JOIN params p
                JOIN server_map_played smp
                  ON smp.server_id = spc.server_id
                  AND smp.map = p.map_target
                  AND spc.bucket_time BETWEEN smp.started_at AND smp.ended_at
                WHERE spc.server_id = p.target_server
             )
             INSERT INTO website.map_analyze (
                server_id,
                map,
                total_playtime,
                total_sessions,
                cum_player_hours,
                unique_players,
                last_played,
                last_played_ended,
                avg_playtime_before_quitting,
                dropoff_rate,
                avg_players_per_session
            )
             SELECT
                  p.target_server,
                  md.map,
                  md.total_playtime,
                  md.total_sessions,
                  pd.cum_hours cum_player_hours,
                  pd.unique_players,
			    (SELECT MAX(started_at)
                    FROM server_map_played
                    WHERE server_id=(
                        SELECT target_server FROM params
                        ) AND map=(
                        SELECT map_target FROM params
                        ) LIMIT 1
                ) AS last_played,
                (SELECT MAX(ended_at)
                    FROM server_map_played
                    WHERE server_id=(
                        SELECT target_server FROM params
                    ) AND map=(
                        SELECT map_target FROM params
                    ) LIMIT 1
                ) AS last_played_ended,
                pd.avg_playtime_before_quitting,
               COALESCE(pd.dropoff_rate, 0) AS dropoff_rate,
               ROUND(pc.avg_players_per_session::numeric, 3)::FLOAT AS avg_players_per_session
             FROM map_data md
             JOIN player_metrics pd ON true
             JOIN player_counts pc ON true
             JOIN params p ON true
             ON CONFLICT (server_id, map) DO UPDATE SET
              total_playtime = EXCLUDED.total_playtime,
              total_sessions = EXCLUDED.total_sessions,
              cum_player_hours = EXCLUDED.cum_player_hours,
              unique_players = EXCLUDED.unique_players,
              last_played = EXCLUDED.last_played,
              last_played_ended = EXCLUDED.last_played_ended,
              avg_playtime_before_quitting = EXCLUDED.avg_playtime_before_quitting,
              dropoff_rate = EXCLUDED.dropoff_rate,
              avg_players_per_session = EXCLUDED.avg_players_per_session;
        ", ctx.data.server_id, ctx.data.map_name).execute(&*ctx.pool).await;
        sqlx::query_as!(DbMapAnalyze, "
            SELECT map,
                total_playtime,
                total_sessions,
                unique_players,
                cum_player_hours,
                last_played,
                last_played_ended,
                dropoff_rate,
                avg_playtime_before_quitting,
                avg_players_per_session
            FROM website.map_analyze WHERE server_id=$1 AND map=$2
            LIMIT 1
        ", ctx.data.server_id, ctx.data.map_name).fetch_one(&*ctx.pool).await
    }

    fn cache_key_pattern(&self) -> String {
        let ctx = &self.context;
        format!("map_analyze-2:{}:{}:{{session}}", ctx.data.server_id, ctx.data.map_name)
    }

    fn ttl(&self) -> u64 {
        30 * DAY
    }

    fn priority(&self) -> QueryPriority {
        QueryPriority::Heavy
    }
}

pub struct MapWorker {
    background_worker: Arc<BackgroundWorker>,
    pool: Arc<Pool<Postgres>>,
}

impl MapWorker {
    pub fn new(cache: Arc<FastCache>, pool: Arc<Pool<Postgres>>) -> Self {
        Self {
            background_worker: Arc::new(BackgroundWorker::new(cache, 5)),
            pool,
        }
    }
    async fn query_map<T>(
        &self, context: &MapContext
    ) -> WorkResult<CachedResult<T>>
    where
        MapBasicQuery<T>: WorkerQuery<T> + Send + Sync,
        <MapBasicQuery<T> as WorkerQuery<T>>::Error: std::fmt::Display,
        T: serde::Serialize + for<'de> serde::Deserialize<'de> + Send + Sync + Clone + 'static,
    {
        let query = MapBasicQuery::new(context, self.pool.clone(), self.background_worker.cache.clone());
        self.background_worker.execute_with_session_fallback(
            query,
            &context.cache_key.current,
            context.cache_key.previous.as_deref(),
        ).await
    }
    pub async fn get_detail(&self, context: &MapContext) -> WorkResult<MapInfo>{
        let value: CachedResult<DbMapInfo> = self.query_map(context).await?;
        let meta: CachedResult<Option<DbMapMeta>> = self.query_map(context).await?;
        let meta = meta.result;
        let mut result: MapInfo = value.result.into();
        if let Some(meta) = meta {
            result.workshop_id = meta.workshop_id;
            result.creators = meta.creators;
            result.file_bytes = meta.file_bytes;
        }
        Ok(result)
    }
    pub async fn get_statistics(&self, context: &MapContext) -> WorkResult<MapAnalyze> {
        let mut value: CachedResult<DbMapAnalyze> = self.query_map(context).await?;
        if !value.is_new{
            let partial: DbServerMapPartial = self.query_map(&context).await?.result;
            value.result.last_played = partial.last_played;
            value.result.total_sessions = partial.total_sessions.unwrap_or_default() as i32;
            value.result.total_playtime = partial.total_playtime;
        }
        Ok(value.result.into())
    }
    pub async fn get_regions(&self, context: &MapContext) -> WorkResult<Vec<MapRegion>> {
        let value: CachedResult<Vec<DbMapRegion>> = self.query_map(context).await?;
        Ok(value.result.iter_into())
    }
    pub async fn get_top_10_players(&self, context: &MapContext) -> WorkResult<Vec<PlayerBrief>> {
        let value: CachedResult<Vec<DbPlayerBrief>> = self.query_map(context).await?;
        Ok(value.result.iter_into())
    }
    pub async fn get_events(&self, context: &MapContext) -> WorkResult<Vec<MapEventAverage>> {
        let value: CachedResult<Vec<DbEvent>> = self.query_map(context).await?;
        Ok(value.result.iter_into())
    }
    pub async fn get_session_distributions(&self, context: &MapContext) -> WorkResult<Vec<MapSessionDistribution>> {
        let value: CachedResult<Vec<DbMapSessionDistribution>> = self.query_map(context).await?;
        Ok(value.result.iter_into())
    }
    pub async fn get_heat_regions(&self, context: &MapContext) -> WorkResult<Vec<DailyMapRegion>> {
        let value: CachedResult<Vec<DbMapRegionDate>> = self.query_map(context).await?;
        let resp: Vec<MapRegionDate> = value.result.iter_into();
        let mut grouped: HashMap<DateTime<Utc>, Vec<MapRegion>> = HashMap::new();

        for record in resp {
            let Some(date) = record.date else {
                tracing::warn!("Invalid date detected for heat region!");
                continue;
            };
            grouped.entry(date).or_insert_with(Vec::new).push(record.into());
        }

        let mut days:Vec<DailyMapRegion> = grouped
            .into_iter()
            .map(|(date, regions)| DailyMapRegion{
                date, regions: regions.into_iter().filter(|e| e.total_play_duration > 0.).collect()
            }).collect();

        days.sort_by(|a, b| a.date.cmp(&b.date));
        Ok(days)
    }
    pub async fn get_player_types(&self, context: &MapContext) -> WorkResult<Vec<MapPlayerTypeTime>> {
        let value: CachedResult<Vec<DbMapPlayerTypeTime>> = self.query_map(context).await?;
        Ok(value.result.iter_into())
    }
}
