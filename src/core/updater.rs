use std::fmt::Display;
use std::sync::Arc;
use sqlx::postgres::{PgListener, PgNotification};
use rand::{rng, Rng};
use std::time::Duration;
use chrono::{DateTime, Utc};
use reqwest::Client;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use sqlx::{Pool, Postgres};
use tokio::time::sleep;
use crate::FastCache;
use crate::core::model::*;
use crate::core::utils::*;
use crate::core::push_service::{PushNotificationService, NotificationType};

struct Updater{
    client: Client,
    port: String,
}
#[derive(Deserialize)]
#[allow(dead_code)]
struct EventPlayerActivity{
    player_id: String,
    server_id: String,
    event_name: String,
    event_value: String,
    created_at: String,
}
#[derive(Deserialize)]
#[allow(dead_code)]
struct EventMapEnded{
    time_id: i64,
    server_id: String,
    map: String,
    player_count: i64,
    started_at: String,
    ended_at: Option<String>,
}
enum UpdaterError{
    ParseError(String),
    ConnectionError(String),
}
impl Display for UpdaterError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::ConnectionError(e) => write!(f, "Connection error: {}", e),
            Self::ParseError(e) => write!(f, "Parse error: {}", e),
        }
    }
}
type UpdatedResult<T> = Result<T, UpdaterError>;
type Updated = UpdatedResult<()>;

impl Updater{
    pub fn new(port: &str) -> Self{
        Self{
            client: Client::builder()
                .user_agent("trigger-robot/1.0 (Rust)")
                .build()
                .expect("Could not build client"),
            port: port.to_string(),
        }
    }
    async fn call<T>(&self, endpoint: T)
    where
        T: AsRef<str>,
    {
        let url = format!("http://127.0.0.1:{}{}", self.port, endpoint.as_ref());
        tracing::debug!("Updater call {}", url);
        let Ok(resp) = self.client
            .get(&url)
            .send()
            .await else {
            tracing::warn!("Couldn't call {}", url);
            return
        };
        let Ok(_) = resp.text().await else {
            tracing::warn!("Couldn't read {}", url);
            return
        };
        tracing::debug!("Success call {}", url);
    }
    async fn calls<T>(&self, endpoints: impl IntoIterator<Item = T>)
    where
        T: AsRef<str>,
    {
        for endpoint in endpoints{
            self.call(endpoint).await;
        }
    }
    pub async fn notify(&self, notification: PgNotification) -> Updated{
        match notification.channel() {
            "player_activity" => self.update_player_metadata_notify(notification).await,
            "map_update" => self.update_map_metadata_notify(notification).await,
            other => {
                tracing::warn!("Received notification for unknown channel: {}", other);
                Ok(())
            }
        }
    }
    fn parse_payload<D: DeserializeOwned>(&self, notification: PgNotification) -> UpdatedResult<D>{
        serde_json::from_str(notification.payload())
            .map_err(|e| UpdaterError::ParseError(format!("Failed to deserialize payload: {e}")))
    }
    async fn update_player_metadata(&self, server_id: &str, player_id: &str) -> Updated{
        let urls = vec![
            "/servers/{server_id}/players/{player_id}/graph/sessions",
            "/servers/{server_id}/players/{player_id}/infractions",
            "/servers/{server_id}/players/{player_id}/detail",
            "/servers/{server_id}/players/{player_id}/most_played_maps",
            "/servers/{server_id}/players/{player_id}/regions",
        ];
        let formatted: Vec<String> = urls.into_iter().map(|url|
            url.replace("{server_id}", server_id)
                .replace("{player_id}", player_id))
            .collect();

        self.calls(formatted.iter()).await;
        Ok(())
    }
    async fn update_player_metadata_notify(&self, notification: PgNotification) -> Updated{
        let value: EventPlayerActivity = self.parse_payload(notification)?;
        if value.event_name != "leave"{
            return Ok(())
        }
        self.update_player_metadata(&value.server_id, &value.player_id).await
    }
    async fn update_map_metadata(&self, server_id: &str, map: &str) -> Updated{
        let urls = vec![
            "/servers/{server_id}/maps/{map_name}/analyze",
            "/servers/{server_id}/maps/{map_name}/sessions",
            "/servers/{server_id}/maps/{map_name}/events",
            "/servers/{server_id}/maps/{map_name}/heat-regions",
            "/servers/{server_id}/maps/{map_name}/regions",
            "/servers/{server_id}/maps/{map_name}/sessions_distribution",
            "/servers/{server_id}/maps/{map_name}/top_players",
            "/servers/{server_id}/maps/{map_name}/player_types",
        ];
        let formatted: Vec<String> = urls.into_iter().map(|url|
            url.replace("{server_id}", server_id)
                .replace("{map_name}", map))
            .collect();

        self.calls(formatted.iter()).await;
        Ok(())
    }
    async fn update_map_metadata_notify(&self, notification: PgNotification) -> Updated{
        let value: EventMapEnded = self.parse_payload(notification)?;
        self.update_map_metadata(&value.server_id, &value.map).await
    }
}

async fn connect_and_listen(db_url: &str, valid_channels: &[&str]) -> UpdatedResult<PgListener> {
    let mut listener = PgListener::connect(db_url).await.map_err(
        |e| UpdaterError::ConnectionError(format!("Failed to connect to database: {e}"))
    )?;

    for channel in valid_channels {
        if let Err(e) = listener.listen(channel).await {
            tracing::warn!("Failed to LISTEN on channel '{}': {}", channel, e);
        }
    }

    Ok(listener)
}
#[derive(Serialize, Deserialize)]
struct LastUpdater{
    last_updated: DateTime<Utc>,
}
async fn get_last_update() -> UpdatedResult<LastUpdater>{
    Ok(LastUpdater{last_updated: Utc::now()})
}
pub async fn maps_updater(pool: Arc<Pool<Postgres>>, port: &str, cache: FastCache){
    let pool = &*pool;
    if let Ok(result) = cached_response("map-updater", &cache, DAY, get_last_update).await{
        let last_updated = result.result.last_updated;
        let now = Utc::now();

        if !result.is_new && now - last_updated < chrono::Duration::days(1) {
            tracing::info!("Updating maps from cache is not needed. Last update was less than a day ago.");
            return
        }
    }
    let Ok(result) = sqlx::query_as!(DbMap, "
            WITH maps AS (
                SELECT server_id, map, MAX(started_at) recent
                FROM server_map_played
                GROUP BY server_id, map
                ORDER BY recent DESC
            )
            SELECT server_id, map
            FROM maps
        ").fetch_all(pool).await else {
        tracing::warn!("Couldn't update 100 players top recent players");
        return
    };
    let updater = Updater::new(port);
    let delay = Duration::from_secs(1);
    let total = result.len();
    for (i, row) in result.into_iter().enumerate(){
        if let Err(e) = updater.update_map_metadata(&row.server_id, &row.map).await{
            tracing::warn!("Updater couldn't update maps metadata: {}", e)
        }
        tracing::info!("UPDATING MAPS {}/{total} [{:.2}%]", i + 1,(i as f64 / total as f64) * 100.0);
        sleep(delay).await;
    }
}
struct DbServerSimple{
    server_id: String,
}

async fn recent_players(pool: &Pool<Postgres>, server_id: &str, port: &str, pre_calculate_player_full: &bool){
    let results: Vec<DbPlayerBrief> = if *pre_calculate_player_full{
        let Ok(result) = sqlx::query_as!(DbPlayerBrief, "
                WITH pre_vars AS (
                    SELECT $1 AS server_id
                ),
                sessions_selection AS (
                    SELECT *,
                        CASE
                            WHEN ended_at IS NOT NULL THEN ended_at - started_at
                            WHEN ended_at IS NULL AND CURRENT_TIMESTAMP - started_at < INTERVAL '12 hours'
                                THEN CURRENT_TIMESTAMP - started_at
                            ELSE INTERVAL '0'
                        END AS duration
                    FROM player_server_session
                    WHERE server_id = (SELECT server_id FROM pre_vars)
                      AND started_at <= CURRENT_TIMESTAMP
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
                )
                SELECT
                    p.player_id,
                    p.player_name,
                    p.created_at,
                    sp.played_time AS total_playtime,
                    ROW_NUMBER() OVER (ORDER BY sp.played_time DESC)::int AS rank,
                    COALESCE(op.started_at, NULL) AS online_since,
                    lp.ended_at AS last_played,
                    (lp.ended_at - lp.started_at) AS last_played_duration,
                    sp.total_players
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
                      AND CURRENT_TIMESTAMP - s.started_at < INTERVAL '12 hours'
                    ORDER BY s.started_at ASC
                    LIMIT 1
                ) op ON TRUE
                ORDER BY sp.played_time DESC;
            ", server_id).fetch_all(pool).await else {
            tracing::warn!("Couldn't update 100 players top recent players");
            return
        };
        result
    } else {
        let Ok(result) = sqlx::query_as!(DbPlayerBrief, "
    		WITH pre_vars AS (
				SELECT $1 AS server_id
			),
			vars AS (
				SELECT
					CURRENT_TIMESTAMP AS right_now,
					CURRENT_TIMESTAMP - INTERVAL '6 month' AS min_start
				FROM pre_vars pv
			),
			sessions_selection AS (
				SELECT *,
					CASE
						WHEN ended_at IS NOT NULL THEN ended_at - started_at
						WHEN ended_at IS NULL AND CURRENT_TIMESTAMP - started_at < INTERVAL '12 hours'
							THEN CURRENT_TIMESTAMP - started_at
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
				LIMIT 50000
			)
			SELECT
				p.player_id,
				p.player_name,
				p.created_at,
				sp.played_time AS total_playtime,
				ROW_NUMBER() OVER (ORDER BY sp.played_time DESC)::int AS rank,
				COALESCE(op.started_at, NULL) AS online_since,
				lp.ended_at AS last_played,
				(lp.ended_at - lp.started_at) AS last_played_duration,
				sp.total_players
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
				  AND CURRENT_TIMESTAMP - s.started_at < INTERVAL '12 hours'
				ORDER BY s.started_at ASC
				LIMIT 1
			) op ON TRUE
			ORDER BY sp.played_time DESC;
        ", server_id).fetch_all(pool).await else {
            tracing::warn!("Couldn't update 100 players top recent players");
            return
        };
        result
    };
    let delay = Duration::from_millis(100);
    let updater = Updater::new(port);
    let total = results.len();
    for (i, row) in results.into_iter().enumerate(){
        if let Err(e) = updater.update_player_metadata(server_id, &row.player_id).await{
            tracing::warn!("Updater couldn't update player metadata: {}", e)
        }
        tracing::info!("UPDATING TOP PLAYERS {}/{total} [{:.2}%]", i + 1,(i as f64 / total as f64) * 100.0);
        sleep(delay).await;
    }
}
pub async fn recent_players_updater(pool: Arc<Pool<Postgres>>, port: &str, cache: FastCache, pre_calculate_player_full: &bool) {
    let pool = &*pool;

    if let Ok(result) = cached_response("recent-players-updater", &cache, DAY, get_last_update).await{
        let last_updated = result.result.last_updated;
        let now = Utc::now();

        if !result.is_new && (now - last_updated) < chrono::Duration::days(1) {
            tracing::info!("Updating top players from cache is not needed. Last update was less than a day ago.");
            return
        }
    }
    let Ok(servers) = sqlx::query_as!(DbServerSimple, "
        SELECT DISTINCT server_id FROM public.player_server_session
    ").fetch_all(pool).await else {
        tracing::warn!("Couldn't get server for player updater");
        return
    };

    for server in servers{
        tokio::spawn(async move {
            recent_players(pool, &server.server_id, port, pre_calculate_player_full).await
        })
    }
}


pub async fn listen_new_update(db_url: &str, port: &str) {
    let valid_channels = ["player_activity", "map_update"];
    let mut attempt = 0;
    let updater = Arc::new(Updater::new(port));
    loop {
        match connect_and_listen(db_url, &valid_channels).await {
            Ok(mut listener) => {
                tracing::info!("Listening to channels...");

                attempt = 0;

                loop {
                    match listener.recv().await {
                        Ok(notification) => {
                            let updater_ref = Arc::clone(&updater);
                            tokio::spawn(async move {
                                sleep(Duration::from_secs(2 * 60)).await;
                                if let Err(e) = updater_ref.notify(notification).await{
                                    match e{
                                        UpdaterError::ParseError(e) => {
                                            tracing::error!("Error parsing notify: {e}");
                                        }
                                        _ => {}
                                    }
                                }
                            });
                        },
                        Err(e) => {
                            tracing::error!("Error receiving notification: {}", e);
                            break;
                        }
                    }
                }
            }
            Err(e) => {
                tracing::error!("Failed to connect to PostgreSQL: {}", e);
            }
        }

        attempt += 1;
        let base_delay = 2_u64.pow(attempt.min(5));
        let jitter = rng().random_range(0..1000);
        let delay = Duration::from_millis((base_delay * 1000) + jitter);
        tracing::warn!("Reconnecting in {delay:.2?}...");
        sleep(delay).await;
    }
}

#[derive(Deserialize, Debug)]
#[allow(dead_code)]
struct MapChangePayload {
    time_id: i32,
    server_id: String,
    map: String,
    server_name: String,
    started_at: DateTime<Utc>,
    ended_at: Option<DateTime<Utc>>,
    player_count: i32,
}

pub async fn listen_map_change_notifications(
    db_url: &str,
    pool: Arc<Pool<Postgres>>,
    push_service: Arc<PushNotificationService>,
) {
    let channel = "map_changed";
    let mut attempt = 0;

    loop {
        match connect_and_listen(db_url, &[channel]).await {
            Ok(mut listener) => {
                tracing::info!("Listening to map_changed channel for push notifications...");
                attempt = 0;

                loop {
                    match listener.recv().await {
                        Ok(notification) => {
                            let payload: Result<EventMapEnded, _> = serde_json::from_str(notification.payload());

                            match payload {
                                Ok(data) => {
                                    let pool_clone = Arc::clone(&pool);
                                    let push_service_clone = Arc::clone(&push_service);

                                    tokio::spawn(async move {
                                        if let Err(e) = send_map_change_notifications(
                                            pool_clone,
                                            push_service_clone,
                                            data.server_id,
                                            &data.map,
                                            data.player_count,
                                        ).await {
                                            tracing::error!("Failed to send map change notifications: {}", e);
                                        }
                                    });
                                }
                                Err(e) => {
                                    tracing::error!("Failed to parse map change payload: {} - payload: {}", e, notification.payload());
                                }
                            }
                        }
                        Err(e) => {
                            tracing::error!("Error receiving map change notification: {}", e);
                            break;
                        }
                    }
                }
            }
            Err(e) => {
                tracing::error!("Failed to connect to PostgreSQL for map change notifications: {}", e);
            }
        }

        attempt += 1;
        let base_delay = 2_u64.pow(attempt.min(5));
        let jitter = rng().random_range(0..1000);
        let delay = Duration::from_millis((base_delay * 1000) + jitter);
        tracing::warn!("Reconnecting to map_changed channel in {delay:.2?}...");
        sleep(delay).await;
    }
}

async fn send_map_change_notifications(
    pool: Arc<Pool<Postgres>>,
    push_service: Arc<PushNotificationService>,
    server_id: String,
    new_map_name: &str,
    player_count: i64,
) -> Result<(), Box<dyn std::error::Error>> {

    let server_info = sqlx::query_as!(
        DbServerNameMaxPlayers,
        "SELECT server_name, max_players FROM server WHERE server_id = $1",
        &server_id
    )
    .fetch_optional(pool.as_ref())
    .await?;

    let (server_name, max_players) = match server_info {
        Some(info) => (info.server_name.unwrap_or_else(|| server_id.clone()), info.max_players.unwrap_or(64) as i64),
        None => {
            tracing::warn!("Server {} not found in database, skipping notifications", server_id);
            return Ok(());
        }
    };

    let subscriptions = sqlx::query_as!(
        DbMapChangeSubscription,
        r#"
        SELECT id, user_id, server_id, subscription_id, created_at, triggered, triggered_at
        FROM website.map_change_subscriptions
        WHERE server_id = $1
          AND triggered = FALSE
        "#,
        &server_id
    )
    .fetch_all(pool.as_ref())
    .await?;

    tracing::info!(
        "Sending map change notifications for server {} ({}): {} - {}/{} players - {} subscriptions",
        server_id,
        server_name,
        new_map_name,
        player_count,
        max_players,
        subscriptions.len()
    );

    for sub in subscriptions {
        let title = format!("{} - Map Changed", server_name);
        let body = format!(
            "{}\n{}/{} players",
            new_map_name,
            player_count,
            max_players
        );
        let url = format!("/servers/{}/maps/{}", server_id, new_map_name);

        let result = push_service.send_notification_to_subscription(
            sub.subscription_id,
            &title,
            &body,
            NotificationType::MapSpecific,
            Some(&url),
            Some(&server_id),
            false,  // is_map_notify: false for map_change
            None,   // map_name not needed for map_change
        ).await;

        match result {
            Ok(res) if res.success > 0 => {
                tracing::info!("Sent map change notification to subscription {}", sub.id);
            }
            Ok(res) => {
                tracing::warn!("Failed to send map change notification to subscription {}: {:?}", sub.id, res.errors);
            }
            Err(e) => {
                tracing::error!("Error sending map change notification to subscription {}: {}", sub.id, e);
            }
        }

        let mark_result = sqlx::query!(
            "UPDATE website.map_change_subscriptions SET triggered = TRUE, triggered_at = CURRENT_TIMESTAMP WHERE id = $1",
            sub.id
        )
        .execute(pool.as_ref())
        .await;

        if let Err(e) = mark_result {
            tracing::error!("Failed to mark subscription {} as triggered: {}", sub.id, e);
        }
    }

    let map_notify_subscriptions = sqlx::query_as!(
        DbMapNotifySubscription,
        r#"
        SELECT id, user_id, map_name, server_id, subscription_id, created_at, triggered, triggered_at
        FROM website.map_notify_subscriptions
        WHERE map_name = $1
          AND (server_id IS NULL OR server_id = $2)
          AND triggered = FALSE
        "#,
        new_map_name,
        &server_id
    )
    .fetch_all(pool.as_ref())
    .await?;

    tracing::info!(
        "Sending map-specific notifications for map {} on server {} - {} subscriptions",
        new_map_name,
        server_id,
        map_notify_subscriptions.len()
    );

    for sub in map_notify_subscriptions {
        let title = format!("{} is now playing!", new_map_name);
        let body = format!(
            "{}\n{}/{} players",
            server_name,
            player_count,
            max_players
        );
        let url = format!("/servers/{}/maps/{}", server_id, new_map_name);

        let result = push_service.send_notification_to_subscription(
            sub.subscription_id,
            &title,
            &body,
            NotificationType::MapSpecific,
            Some(&url),
            Some(&server_id),
            true,                   // is_map_notify: true for map_notify
            Some(new_map_name),     // map_name for building URLs
        ).await;

        match result {
            Ok(res) if res.success > 0 => {
                tracing::info!("Sent map-specific notification to subscription {}", sub.id);
            }
            Ok(res) => {
                tracing::warn!("Failed to send map-specific notification to subscription {}: {:?}", sub.id, res.errors);
            }
            Err(e) => {
                tracing::error!("Error sending map-specific notification to subscription {}: {}", sub.id, e);
            }
        }

        let mark_result = sqlx::query!(
            "UPDATE website.map_notify_subscriptions SET triggered = TRUE, triggered_at = CURRENT_TIMESTAMP WHERE id = $1",
            sub.id
        )
        .execute(pool.as_ref())
        .await;

        if let Err(e) = mark_result {
            tracing::error!("Failed to mark map notify subscription {} as triggered: {}", sub.id, e);
        }
    }

    Ok(())
}

/// Cleanup stale upload sessions and temporary directories
pub async fn cleanup_stale_uploads(store_upload: String) {
    let mut interval = tokio::time::interval(Duration::from_secs(3600)); // Run every hour
    loop {
        interval.tick().await;

        let tmp_dir = format!("{}/.tmp", store_upload);

        let Ok(mut entries) = tokio::fs::read_dir(&tmp_dir).await else {
            continue;
        };

        let now = std::time::SystemTime::now();
        let stale_threshold = Duration::from_secs(48 * 3600); // 48 hours

        while let Ok(Some(entry)) = entries.next_entry().await {
            let path = entry.path();

            if !path.is_dir() {
                continue;
            }

            let Ok(metadata) = tokio::fs::metadata(&path).await else {
                continue;
            };

            let Ok(modified) = metadata.modified() else {
                continue;
            };

            let Ok(age) = now.duration_since(modified) else {
                continue;
            };

            if age > stale_threshold {
                if let Err(e) = tokio::fs::remove_dir_all(&path).await {
                    tracing::warn!("Failed to cleanup stale upload directory {:?}: {}", path, e);
                } else {
                    tracing::info!("Cleaned up stale upload directory: {:?} (age: {:?})", path, age);
                }
            }
        }
    }
}
