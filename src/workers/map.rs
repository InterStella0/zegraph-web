use std::collections::HashMap;
use std::sync::Arc;
use chrono::{DateTime, Utc};
use sqlx::{Pool, Postgres};
use crate::api_models::maps::*;
use crate::core::period::TimePeriod;
use crate::core::utils::*;
use crate::FastCache;
use crate::models::admins::DbEvent;
use crate::models::maps::*;
use crate::models::players::DbPlayerBrief;
use crate::models::servers::*;
use super::{BackgroundWorker, Cacheable, MapContext, MapData, MapPeriodData, Query, WorkResult, WorkerQ, WorkerQuery};

pub type MapBasicQuery<T> = WorkerQ<MapData, T>;
pub type MapPeriodQuery<T> = WorkerQ<MapPeriodData, T>;

impl<T> MapBasicQuery<T> {
    fn new(ctx: &MapContext, pool: Arc<Pool<Postgres>>, cache: Arc<FastCache>) -> Self {
        Self::raw(Query { pool, cache, data: MapData {
            map_name: ctx.map.map.clone(),
            server_id: ctx.server.server_id.clone(),
        }})
    }
}
impl<T> MapPeriodQuery<T> {
    fn new(ctx: &MapContext, period: TimePeriod, pool: Arc<Pool<Postgres>>, cache: Arc<FastCache>) -> Self {
        Self::raw(Query { pool, cache, data: ctx.period_data(period) })
    }
}

worker_query! {
    MapBasicQuery<Vec<DbMapRegion>> => MapRegions, 7 * DAY, Light,
    |self, ctx| format!("map-regions-2:{}:{}:{{session}}", ctx.data.server_id, ctx.data.map_name), {
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
}
worker_query! {
    MapBasicQuery<Vec<DbMapRegionDate>> => MapHeatRegions, 7 * DAY, Light,
    |self, ctx| format!("heat-region:{}:{}:{{session}}", ctx.data.server_id, ctx.data.map_name), {
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
}
worker_query! {
    MapBasicQuery<Vec<DbEvent>> => MapEvents, DAY, Light,
    |self, ctx| format!("map-events:{}:{}:{{session}}", ctx.data.server_id, ctx.data.map_name), {
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
}
worker_query! {
    MapBasicQuery<Vec<DbMapSessionDistribution>> => MapSessionDistribution, 30 * DAY, Heavy,
    |self, ctx| format!("sessions_distribution:{}:{}:{{session}}", ctx.data.server_id, ctx.data.map_name), {
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
                    ON pss.server_id = smp.server_id
                    AND pss.started_at < smp.ended_at
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
}
worker_query! {
    MapBasicQuery<DbServerMapPartial> => MapPartial, 7 * DAY, Light,
    |self, ctx| format!("map-partial:{}:{}:{{session}}", ctx.data.server_id, ctx.data.map_name), {
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
}
worker_query! {
    MapBasicQuery<Option<DbMapMeta>> => MapMetadata, DAY, Light,
    |self, ctx| format!("map_metadata:{}:{}:{{session}}", ctx.data.server_id, ctx.data.map_name), {
        sqlx::query_as!(DbMapMeta, "SELECT * FROM map_metadata WHERE name=$1 LIMIT 1", ctx.data.map_name)
            .fetch_optional(&*ctx.pool).await
    }
}
worker_query! {
    MapBasicQuery<Vec<DbMapPlayerTypeTime>> => MapPlayerTypeTime, DAY, Light,
    |self, ctx| format!("map_player_type_time:{}:{}:{{session}}", ctx.data.server_id, ctx.data.map_name), {
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
}
worker_query! {
    MapBasicQuery<DbMapInfo> => MapInfo, HOUR, Light,
    |self, ctx| format!("map_info_data:{}:{}:{{session}}", ctx.data.server_id, ctx.data.map_name), {
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
}
worker_query! {
    MapBasicQuery<DbMapAnalyze> => MapAnalyze, 30 * DAY, Heavy,
    |self, ctx| format!("map_analyze-2:{}:{}:{{session}}", ctx.data.server_id, ctx.data.map_name), {
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
                  COALESCE(pd.cum_hours, '00:00:00'::interval) cum_player_hours,
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
              cum_player_hours = COALESCE(EXCLUDED.cum_player_hours, '00:00:00'::interval),
              unique_players = EXCLUDED.unique_players,
              last_played = EXCLUDED.last_played,
              last_played_ended = EXCLUDED.last_played_ended,
              avg_playtime_before_quitting = EXCLUDED.avg_playtime_before_quitting,
              dropoff_rate = EXCLUDED.dropoff_rate,
              avg_players_per_session = EXCLUDED.avg_players_per_session;
        ", ctx.data.server_id, ctx.data.map_name).execute(&*ctx.pool).await;
        let _ = sqlx::query!("
            WITH session_players AS (
                SELECT DISTINCT pss.player_id
                FROM server_map_played smp
                JOIN player_server_session pss
                    ON pss.server_id = smp.server_id
                   AND tstzrange(pss.started_at, pss.ended_at) && tstzrange(smp.started_at, smp.ended_at)
                WHERE smp.map = $1
                  AND smp.server_id = ANY(SELECT server_id FROM server_map WHERE map = $1)
            )
            INSERT INTO website.global_map_analyze (map, unique_players, calculated_at)
            SELECT $1::TEXT, COUNT(DISTINCT COALESCE(p.associated_player_id, sp.player_id)), CURRENT_TIMESTAMP
            FROM session_players sp
            JOIN player p ON p.player_id = sp.player_id
            ON CONFLICT (map) DO UPDATE SET
                unique_players = EXCLUDED.unique_players,
                calculated_at = EXCLUDED.calculated_at
        ", ctx.data.map_name).execute(&*ctx.pool).await;
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
}

pub const MAP_PERIOD_TOP_LIMIT: i64 = 100;

worker_query! {
    MapPeriodQuery<DbMapAnalyze> => MapPeriodAnalyze, period "analyze", Heavy, |self, ctx| {
        let (start, end) = self.bounds();
        sqlx::query_as!(DbMapAnalyze, "
            WITH smp AS (
                SELECT started_at, ended_at
                FROM server_map_played
                WHERE server_id = $1 AND map = $2
                  AND ended_at IS NOT NULL
                  AND started_at >= $3 AND started_at < $4
            ),
            overlapped AS (
                SELECT
                    pss.player_id,
                    LEAST(pss.ended_at, smp.ended_at) - GREATEST(pss.started_at, smp.started_at) AS played
                FROM smp
                JOIN player_server_session pss
                  ON pss.server_id = $1
                 AND tstzrange(pss.started_at, pss.ended_at) && tstzrange(smp.started_at, smp.ended_at)
            ),
            player_metrics AS (
                SELECT
                    COUNT(DISTINCT player_id) AS unique_players,
                    SUM(played) AS cum_hours,
                    AVG(played) AS avg_playtime,
                    SUM(CASE WHEN played < INTERVAL '5 minutes' THEN 1 ELSE 0 END)::float
                        / NULLIF(COUNT(*), 0) AS dropoff_rate
                FROM overlapped
            ),
            player_counts AS (
                SELECT AVG(spc.player_count) AS avg_players
                FROM smp
                JOIN server_player_counts spc
                  ON spc.server_id = $1
                 AND spc.bucket_time BETWEEN smp.started_at AND smp.ended_at
            )
            SELECT
                $2 AS \"map!\",
                COALESCE(pm.unique_players, 0) AS \"unique_players!\",
                COALESCE(pm.cum_hours, INTERVAL '0 seconds') AS cum_player_hours,
                (SELECT SUM(ended_at - started_at) FROM smp) AS total_playtime,
                (SELECT COUNT(*) FROM smp)::int AS \"total_sessions!\",
                (SELECT MAX(started_at) FROM smp) AS last_played,
                (SELECT MAX(ended_at) FROM smp) AS last_played_ended,
                pm.avg_playtime AS avg_playtime_before_quitting,
                COALESCE(pm.dropoff_rate, 0) AS dropoff_rate,
                ROUND(COALESCE(pc.avg_players, 0)::numeric, 3)::FLOAT AS avg_players_per_session
            FROM player_metrics pm
            CROSS JOIN player_counts pc
        ", ctx.data.server_id, ctx.data.map_name, start, end).fetch_one(&*ctx.pool).await
    }
}

worker_query! {
    MapPeriodQuery<Vec<DbMapRegion>> => MapPeriodRegions, period "regions", Light, |self, ctx| {
        let (start, end) = self.bounds();
        sqlx::query_as!(DbMapRegion, "
            WITH session_data AS (
              SELECT
                g.started_at AT TIME ZONE 'UTC' AS started_at,
                g.ended_at AT TIME ZONE 'UTC' AS ended_at,
                date_trunc('day', g.started_at AT TIME ZONE 'UTC') AS start_day,
                date_trunc('day', g.ended_at AT TIME ZONE 'UTC') AS end_day
              FROM server_map_played g
              WHERE g.server_id = $1
                AND g.map = $2
                AND g.ended_at IS NOT NULL
                AND g.started_at >= $3 AND g.started_at < $4
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
                gd.started_at,
                gd.ended_at,
                rt.region_id,
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
            region_play AS (
              SELECT
                region_id,
                SUM(LEAST(ended_at, region_end) - GREATEST(started_at, region_start)) AS region_play_duration
              FROM region_intervals
              WHERE ended_at > region_start
                AND started_at < region_end
              GROUP BY region_id
            )
            SELECT
              rt.region_name,
              $2 AS map,
              SUM(COALESCE(rp.region_play_duration, interval '0 seconds')) AS total_play_duration
            FROM region_time rt
            LEFT JOIN region_play rp ON rp.region_id = rt.region_id
            GROUP BY rt.region_name
        ", ctx.data.server_id, ctx.data.map_name, start, end).fetch_all(&*ctx.pool).await
    }
}

worker_query! {
    MapPeriodQuery<Vec<DbMapRegionDate>> => MapPeriodHeatRegions, period "heat-region", Light, |self, ctx| {
        let (start, end) = self.bounds();
        sqlx::query_as!(DbMapRegionDate, "
            WITH session_data AS (
              SELECT
                g.started_at AT TIME ZONE 'UTC' AS started_at,
                g.ended_at AT TIME ZONE 'UTC' AS ended_at,
                date_trunc('day', g.started_at AT TIME ZONE 'UTC') AS start_day,
                date_trunc('day', g.ended_at AT TIME ZONE 'UTC') AS end_day
              FROM server_map_played g
              WHERE g.server_id = $1
                AND g.map = $2
                AND g.ended_at IS NOT NULL
                AND g.started_at >= $3 AND g.started_at < $4
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
                gd.started_at,
                gd.ended_at,
                gd.play_day,
                rt.region_id,
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
                play_day,
                SUM(
                  LEAST(ended_at, region_end) - GREATEST(started_at, region_start)
                ) AS region_play_duration
              FROM region_intervals
              WHERE ended_at > region_start
                AND started_at < region_end
              GROUP BY region_id, play_day
            ),
            all_days AS (
              SELECT day::date AS play_day
              FROM generate_series(
                $3 AT TIME ZONE 'UTC',
                LEAST($4, CURRENT_TIMESTAMP) AT TIME ZONE 'UTC' - interval '1 second',
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
        ", ctx.data.server_id, ctx.data.map_name, start, end).fetch_all(&*ctx.pool).await
    }
}

worker_query! {
    MapPeriodQuery<Vec<DbMapSessionDistribution>> => MapPeriodSessionDistribution, period "session-distribution", Heavy, |self, ctx| {
        let (start, end) = self.bounds();
        sqlx::query_as!(DbMapSessionDistribution, "
            WITH time_spent AS (
                SELECT
                    LEAST(pss.ended_at, smp.ended_at) - GREATEST(pss.started_at, smp.started_at) AS total_duration
                FROM server_map_played smp
                JOIN player_server_session pss
                  ON pss.server_id = $1
                 AND tstzrange(pss.started_at, pss.ended_at) && tstzrange(smp.started_at, smp.ended_at)
                WHERE smp.server_id = $1 AND smp.map = $2
                  AND smp.ended_at IS NOT NULL
                  AND smp.started_at >= $3 AND smp.started_at < $4
            )
            SELECT
                CASE
                    WHEN total_duration < INTERVAL '10 minutes' THEN 'Under 10'
                    WHEN total_duration BETWEEN INTERVAL '10 minutes' AND INTERVAL '30 minutes' THEN '10 - 30'
                    WHEN total_duration BETWEEN INTERVAL '30 minutes' AND INTERVAL '45 minutes' THEN '30 - 45'
                    WHEN total_duration BETWEEN INTERVAL '45 minutes' AND INTERVAL '60 minutes' THEN '45 - 60'
                    ELSE 'Over 60'
                END AS \"session_range!\",
                COUNT(*)::int AS \"session_count!\"
            FROM time_spent
            GROUP BY 1
        ", ctx.data.server_id, ctx.data.map_name, start, end).fetch_all(&*ctx.pool).await
    }
}

worker_query! {
    MapPeriodQuery<Vec<DbMapPlayerTypeTime>> => MapPeriodPlayerTypeTime, period "player-type", Heavy, |self, ctx| {
        let (start, end) = self.bounds();
        sqlx::query_as!(DbMapPlayerTypeTime, "
            WITH smp AS (
                SELECT started_at, ended_at
                FROM server_map_played
                WHERE server_id = $1 AND map = $2
                  AND ended_at IS NOT NULL
                  AND started_at >= $3 AND started_at < $4
            ),
            time_spent AS (
                SELECT
                    pss.player_id,
                    SUM(LEAST(pss.ended_at, smp.ended_at) - GREATEST(pss.started_at, smp.started_at)) AS played
                FROM smp
                JOIN player_server_session pss
                  ON pss.server_id = $1
                 AND tstzrange(pss.started_at, pss.ended_at) && tstzrange(smp.started_at, smp.ended_at)
                GROUP BY pss.player_id
            )
            SELECT pp.category, SUM(ts.played) AS time_spent
            FROM time_spent ts
            JOIN website.player_playtime pp
              ON pp.player_id = ts.player_id AND pp.server_id = $1
            WHERE pp.category IS NOT NULL
            GROUP BY pp.category
        ", ctx.data.server_id, ctx.data.map_name, start, end).fetch_all(&*ctx.pool).await
    }
}

worker_query! {
    MapPeriodQuery<Vec<DbMapPeriodPlayer>> => MapPeriodTopPlayers, period "top-players-v2", Heavy, |self, ctx| {
        let (start, end) = self.bounds();
        sqlx::query_as!(DbMapPeriodPlayer, "
            WITH smp AS (
                SELECT started_at, ended_at
                FROM server_map_played
                WHERE server_id = $1 AND map = $2
                  AND ended_at IS NOT NULL
                  AND started_at >= $3 AND started_at < $4
            ),
            time_spent AS (
                SELECT
                    pss.player_id,
                    SUM(LEAST(pss.ended_at, smp.ended_at) - GREATEST(pss.started_at, smp.started_at)) AS total_playtime
                FROM smp
                JOIN player_server_session pss
                  ON pss.server_id = $1
                 AND tstzrange(pss.started_at, pss.ended_at) && tstzrange(smp.started_at, smp.ended_at)
                WHERE NOT EXISTS (SELECT 1 FROM bot_player b WHERE b.player_id = pss.player_id)
                GROUP BY pss.player_id
                ORDER BY total_playtime DESC, pss.player_id
                LIMIT $5
            )
            SELECT
                ts.player_id AS \"player_id!\",
                p.player_name AS \"player_name!\",
                ts.total_playtime
            FROM time_spent ts
            JOIN player p ON p.player_id = ts.player_id
            ORDER BY ts.total_playtime DESC, ts.player_id
        ", ctx.data.server_id, ctx.data.map_name, start, end, MAP_PERIOD_TOP_LIMIT).fetch_all(&*ctx.pool).await
    }
}

pub struct MapWorker {
    background_worker: Arc<BackgroundWorker>,
    pool: Arc<Pool<Postgres>>,
}

impl MapWorker {
    pub fn new(cache: Arc<FastCache>, pool: Arc<Pool<Postgres>>) -> Self {
        Self {
            background_worker: Arc::new(BackgroundWorker::new(cache)),
            pool,
        }
    }
    async fn query_map<T: Cacheable>(&self, context: &MapContext) -> WorkResult<CachedResult<T>>
    where MapBasicQuery<T>: WorkerQuery<T, Error = sqlx::Error>,
    {
        let query = MapBasicQuery::new(context, self.pool.clone(), self.background_worker.cache.clone());
        self.background_worker.execute_with_session_fallback(
            query,
            &context.cache_key.current,
            context.cache_key.previous.as_deref(),
        ).await
    }
    fn period_query<T>(&self, context: &MapContext, period: TimePeriod) -> MapPeriodQuery<T> {
        MapPeriodQuery::new(context, period, self.pool.clone(), self.background_worker.cache.clone())
    }

    async fn query_map_period<T: Cacheable>(&self, context: &MapContext, period: TimePeriod) -> WorkResult<CachedResult<T>>
    where MapPeriodQuery<T>: WorkerQuery<T, Error = sqlx::Error>,
    {
        let (job, current_key, fallback_key) = self.period_query::<T>(context, period).period_keys(&context.cache_key);
        self.background_worker.get_with_fallback(&current_key, fallback_key.as_deref(), job).await
    }

    async fn query_map_or_period<T: Cacheable>(&self, context: &MapContext, period: Option<TimePeriod>) -> WorkResult<CachedResult<T>>
    where
        MapBasicQuery<T>: WorkerQuery<T, Error = sqlx::Error>,
        MapPeriodQuery<T>: WorkerQuery<T, Error = sqlx::Error>,
    {
        match period {
            Some(period) => self.query_map_period(context, period).await,
            None => self.query_map(context).await,
        }
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
    pub async fn get_statistics(&self, context: &MapContext, period: Option<TimePeriod>) -> WorkResult<MapAnalyze> {
        if let Some(period) = period {
            let value: CachedResult<DbMapAnalyze> = self.query_map_period(context, period).await?;
            return Ok(value.result.into());
        }
        let mut value: CachedResult<DbMapAnalyze> = self.query_map(context).await?;
        if !value.is_new{
            let partial: DbServerMapPartial = self.query_map(&context).await?.result;
            value.result.last_played = partial.last_played;
            value.result.total_sessions = partial.total_sessions.unwrap_or_default() as i32;
            value.result.total_playtime = partial.total_playtime;
        }
        Ok(value.result.into())
    }
    pub async fn get_regions(&self, context: &MapContext, period: Option<TimePeriod>) -> WorkResult<Vec<MapRegion>> {
        let value: CachedResult<Vec<DbMapRegion>> = self.query_map_or_period(context, period).await?;
        Ok(value.result.iter_into())
    }
    pub async fn get_events(&self, context: &MapContext) -> WorkResult<Vec<MapEventAverage>> {
        let value: CachedResult<Vec<DbEvent>> = self.query_map(context).await?;
        Ok(value.result.iter_into())
    }
    pub async fn get_session_distributions(&self, context: &MapContext, period: Option<TimePeriod>) -> WorkResult<Vec<MapSessionDistribution>> {
        let value: CachedResult<Vec<DbMapSessionDistribution>> = self.query_map_or_period(context, period).await?;
        Ok(value.result.iter_into())
    }
    pub async fn get_heat_regions(&self, context: &MapContext, period: Option<TimePeriod>) -> WorkResult<Vec<DailyMapRegion>> {
        let value: CachedResult<Vec<DbMapRegionDate>> = self.query_map_or_period(context, period).await?;
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
    pub async fn get_player_types(&self, context: &MapContext, period: Option<TimePeriod>) -> WorkResult<Vec<MapPlayerTypeTime>> {
        let value: CachedResult<Vec<DbMapPlayerTypeTime>> = self.query_map_or_period(context, period).await?;
        Ok(value.result.iter_into())
    }

    pub async fn get_period_top_players(
        &self, context: &MapContext, period: TimePeriod, search: Option<&str>,
    ) -> WorkResult<Vec<DbPlayerBrief>> {
        let query: MapPeriodQuery<Vec<DbMapPeriodPlayer>> = self.period_query(context, period);
        let (job, current_key, fallback_key) = query.period_keys(&context.cache_key);

        let cached: Vec<DbMapPeriodPlayer> = match search {
            Some(_) => match self.background_worker.peek(&current_key).await {
                Some(rows) => rows,
                None => match fallback_key.as_deref() {
                    Some(fallback) => self.background_worker.peek(fallback).await.unwrap_or_default(),
                    None => vec![],
                },
            },
            None => self.background_worker.get_with_fallback(&current_key, fallback_key.as_deref(), job).await?.result,
        };

        let search = search.map(str::to_lowercase);
        let ranked: Vec<(i32, DbMapPeriodPlayer)> = cached.into_iter()
            .enumerate()
            .map(|(index, row)| (index as i32 + 1, row))
            .filter(|(_, row)| search.as_deref().is_none_or(|q| row.player_name.to_lowercase().contains(q)))
            .collect();
        if ranked.is_empty() {
            return Ok(vec![]);
        }

        let ids: Vec<String> = ranked.iter().map(|(_, row)| row.player_id.clone()).collect();
        let details = sqlx::query_as!(DbPlayerBrief, "
            SELECT
                NULL::bigint AS total_players,
                p.player_id,
                p.player_name,
                p.created_at,
                NULL::interval AS total_playtime,
                NULL::int AS rank,
                op.started_at AS \"online_since?\",
                lp.started_at AS \"last_played?\",
                lp.ended_at AS \"last_played_ended?\",
                (lp.ended_at - lp.started_at) AS \"last_played_duration?\",
                COALESCE((SELECT is_anonymous FROM server_player_names spn WHERE spn.server_id = $1 AND spn.player_id = p.player_id), FALSE) AS \"is_anonymous!\"
            FROM player p
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
            WHERE p.player_id = ANY($2)
        ", context.server.server_id, &ids).fetch_all(&*self.pool).await?;

        let mut details: HashMap<String, DbPlayerBrief> = details.into_iter()
            .map(|row| (row.player_id.clone(), row))
            .collect();
        Ok(ranked.into_iter()
            .filter_map(|(rank, row)| {
                let mut brief = details.remove(&row.player_id)?;
                brief.rank = Some(rank);
                brief.total_playtime = row.total_playtime;
                Some(brief)
            })
            .collect())
    }
}

#[cfg(test)]
mod tests {
    use super::super::test_support::{map_period_query, map_query, map_range_query, TEST_LONG_RANGE, TEST_MAP, TEST_SERVER, TEST_SESSION, TEST_SHORT_RANGE};
    use super::super::{JobKind, QueryPriority, RefreshJob};
    use super::*;

    macro_rules! assert_map_metadata {
        ($query:expr, $prefix:literal, $priority:pat, $kind:pat) => {{
            let query = $query;
            let pattern = query.cache_key_pattern();
            assert_eq!(pattern, format!("{}:{TEST_SERVER}:{TEST_MAP}:{{session}}", $prefix));
            assert!(query.ttl() > 0, "a zero ttl would cache nothing");
            assert!(matches!(query.priority(), $priority), "unexpected priority for {pattern}");
            assert!(
                matches!(query.job_kind(), $kind),
                "job_kind does not match the query type for {pattern}",
            );
        }};
    }

    #[tokio::test]
    async fn map_query_metadata_matches_its_type() {
        assert_map_metadata!(
            map_query::<Vec<DbMapRegion>>(), "map-regions-2", QueryPriority::Light, JobKind::MapRegions(_)
        );
        assert_map_metadata!(
            map_query::<Vec<DbMapRegionDate>>(), "heat-region", QueryPriority::Light, JobKind::MapHeatRegions(_)
        );
        assert_map_metadata!(
            map_query::<Vec<DbEvent>>(), "map-events", QueryPriority::Light, JobKind::MapEvents(_)
        );
        assert_map_metadata!(
            map_query::<Vec<DbMapSessionDistribution>>(),
            "sessions_distribution", QueryPriority::Heavy, JobKind::MapSessionDistribution(_)
        );
        assert_map_metadata!(
            map_query::<DbServerMapPartial>(), "map-partial", QueryPriority::Light, JobKind::MapPartial(_)
        );
        assert_map_metadata!(
            map_query::<Option<DbMapMeta>>(), "map_metadata", QueryPriority::Light, JobKind::MapMetadata(_)
        );
        assert_map_metadata!(
            map_query::<Vec<DbMapPlayerTypeTime>>(),
            "map_player_type_time", QueryPriority::Light, JobKind::MapPlayerTypeTime(_)
        );
        assert_map_metadata!(
            map_query::<DbMapInfo>(), "map_info_data", QueryPriority::Light, JobKind::MapInfo(_)
        );
        assert_map_metadata!(
            map_query::<DbMapAnalyze>(), "map_analyze-2", QueryPriority::Heavy, JobKind::MapAnalyze(_)
        );
    }

    macro_rules! assert_period_scoped {
        ($query:ty, $prefix:literal, $priority:pat, $kind:pat) => {{
            let closed: MapPeriodQuery<$query> = map_period_query(true);
            let open: MapPeriodQuery<$query> = map_period_query(false);
            let closed_pattern = closed.cache_key_pattern();
            let open_pattern = open.cache_key_pattern();

            assert_eq!(closed_pattern, format!(concat!($prefix, ":{}:{}:2025-06"), TEST_SERVER, TEST_MAP));
            assert!(!closed_pattern.contains("{session}"), "a closed period cannot change per session");
            assert_eq!(open_pattern, format!(concat!($prefix, ":{}:{}:2026:{{session}}"), TEST_SERVER, TEST_MAP));
            assert!(closed.ttl() > open.ttl(), "{closed_pattern} cannot change, so it should outlive the open period");
            assert!(open.ttl() > 0);
            assert!(matches!(closed.priority(), $priority), "unexpected priority for {closed_pattern}");
            assert!(matches!(closed.job_kind(), $kind), "job_kind does not match the query type for {closed_pattern}");
        }};
    }

    #[tokio::test]
    async fn period_query_metadata_matches_its_type() {
        assert_period_scoped!(DbMapAnalyze, "map-period-analyze", QueryPriority::Heavy, JobKind::MapPeriodAnalyze(_));
        assert_period_scoped!(Vec<DbMapRegion>, "map-period-regions", QueryPriority::Light, JobKind::MapPeriodRegions(_));
        assert_period_scoped!(Vec<DbMapRegionDate>, "map-period-heat-region", QueryPriority::Light, JobKind::MapPeriodHeatRegions(_));
        assert_period_scoped!(
            Vec<DbMapSessionDistribution>, "map-period-session-distribution",
            QueryPriority::Heavy, JobKind::MapPeriodSessionDistribution(_)
        );
        assert_period_scoped!(
            Vec<DbMapPlayerTypeTime>, "map-period-player-type", QueryPriority::Heavy, JobKind::MapPeriodPlayerTypeTime(_)
        );
        assert_period_scoped!(
            Vec<DbMapPeriodPlayer>, "map-period-top-players-v2", QueryPriority::Heavy, JobKind::MapPeriodTopPlayers(_)
        );
    }

    macro_rules! assert_range_scoped {
        ($query:ty, $prefix:literal, $priority:pat) => {{
            let short: MapPeriodQuery<$query> = map_range_query(TEST_SHORT_RANGE);
            let pattern = short.cache_key_pattern();

            assert_eq!(pattern, format!(concat!($prefix, ":{}:{}:2025-06-01..2025-06-15"), TEST_SERVER, TEST_MAP));
            assert_eq!(short.ttl(), HOUR, "{pattern} is a range, so it is cached for an hour");
            assert!(matches!(short.priority(), QueryPriority::Light), "{pattern} is a short range, so it runs light");

            let long: MapPeriodQuery<$query> = map_range_query(TEST_LONG_RANGE);
            let pattern = long.cache_key_pattern();

            assert_eq!(long.ttl(), HOUR, "{pattern} is a range, so it is cached for an hour");
            assert!(matches!(long.priority(), $priority), "{pattern} is a long range, so it keeps its priority");
        }};
    }

    #[tokio::test]
    async fn a_closed_range_is_cached_for_an_hour_and_light_only_when_short() {
        assert_range_scoped!(DbMapAnalyze, "map-period-analyze", QueryPriority::Heavy);
        assert_range_scoped!(Vec<DbMapRegion>, "map-period-regions", QueryPriority::Light);
        assert_range_scoped!(Vec<DbMapRegionDate>, "map-period-heat-region", QueryPriority::Light);
        assert_range_scoped!(Vec<DbMapSessionDistribution>, "map-period-session-distribution", QueryPriority::Heavy);
        assert_range_scoped!(Vec<DbMapPlayerTypeTime>, "map-period-player-type", QueryPriority::Heavy);
        assert_range_scoped!(Vec<DbMapPeriodPlayer>, "map-period-top-players-v2", QueryPriority::Heavy);
    }

    #[tokio::test]
    async fn a_closed_period_job_has_no_session_fallbacks() {
        let query: MapPeriodQuery<DbMapAnalyze> = map_period_query(true);
        let (job, current_key, fallback_key) = RefreshJob::for_session(&query, TEST_SESSION, None);

        assert_eq!(current_key, format!("map-period-analyze:{TEST_SERVER}:{TEST_MAP}:2025-06"));
        assert_eq!(job.cache_key, current_key);
        assert!(fallback_key.is_none());
        assert!(job.stale_key.is_none(), "a closed period has no older key to evict");
        assert!(job.latest_key.is_none(), "a closed period's key is already session-independent");
    }

    #[tokio::test]
    async fn an_open_period_falls_back_to_the_previous_session() {
        let query: MapPeriodQuery<DbMapAnalyze> = map_period_query(false);
        let (job, current_key, _) = RefreshJob::for_session(&query, TEST_SESSION, Some("older"));

        assert!(current_key.ends_with(&format!(":2026:{TEST_SESSION}")));
        assert_eq!(job.stale_key, Some(format!("map-period-analyze:{TEST_SERVER}:{TEST_MAP}:2026:older")));
    }

    #[tokio::test]
    async fn period_keys_never_collide_with_all_time_keys() {
        let all_time = map_query::<DbMapAnalyze>().cache_key_pattern();
        for closed in [true, false] {
            let period = map_period_query::<DbMapAnalyze>(closed).cache_key_pattern();
            assert!(!period.starts_with(all_time.trim_end_matches("{session}")));
        }
    }
}
