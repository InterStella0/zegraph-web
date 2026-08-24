use sqlx::{PgPool, Row};
use std::sync::Arc;
use web_push::*;
use serde_json::json;
use tracing::{error, info, warn};
use uuid::Uuid;
use std::io::Cursor;

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum NotificationType {
    #[allow(unused)]
    Announcements,
    System,
    MapSpecific,
}

impl NotificationType {
    pub fn as_str(&self) -> &str {
        match self {
            NotificationType::Announcements => "Announcements",
            NotificationType::System => "System",
            NotificationType::MapSpecific => "Map_Specific",
        }
    }
}

#[derive(Clone)]
pub struct NotificationSendResult {
    pub success: i32,
    pub failed: i32,
    pub total: i32,
    pub errors: Vec<String>,
}

#[derive(Clone)]
struct DbSubscription {
    id: Uuid,
    user_id: i64,
    endpoint: String,
    p256dh_key: String,
    auth_key: String,
}

fn read_vapid_keys_from_pem() -> Result<(String, String), Box<dyn std::error::Error + Send + Sync>> {
    use base64::{Engine as _, engine::general_purpose};

    let private_path = std::env::var("VAPID_PRIVATE_KEY_PATH")
        .unwrap_or_else(|_| "vapids/vapid_private.pem".to_string());
    let public_path = std::env::var("VAPID_PUBLIC_KEY_PATH")
        .unwrap_or_else(|_| "vapids/vapid_public.pem".to_string());

    let private_pem = std::fs::read_to_string(&private_path)?;
    let public_pem = std::fs::read_to_string(&public_path)?;

    // Extract base64 content from PEM (strip header/footer)
    let public_key_base64: String = public_pem
        .lines()
        .filter(|line| !line.starts_with("-----"))
        .collect();

    // Decode from standard base64
    let spki_bytes = general_purpose::STANDARD.decode(&public_key_base64)?;

    // PEM contains SPKI structure. For P-256, the raw 65-byte EC point starts at byte 26.
    // SPKI = 26 bytes ASN.1 header + 65 bytes uncompressed EC point (0x04 + 32 bytes X + 32 bytes Y)
    const SPKI_HEADER_LEN: usize = 26;
    const RAW_KEY_LEN: usize = 65;

    if spki_bytes.len() != SPKI_HEADER_LEN + RAW_KEY_LEN {
        return Err(format!(
            "Invalid SPKI length: expected {}, got {}",
            SPKI_HEADER_LEN + RAW_KEY_LEN,
            spki_bytes.len()
        ).into());
    }

    let raw_public_key = &spki_bytes[SPKI_HEADER_LEN..];

    // Re-encode as URL-safe base64 (no padding) - required by Web Push API
    let public_key_url_safe = general_purpose::URL_SAFE_NO_PAD.encode(raw_public_key);

    Ok((public_key_url_safe, private_pem))
}

pub struct PushNotificationService {
    pool: Arc<PgPool>,
    client: IsahcWebPushClient,
    vapid_public_key: String,
    vapid_private_key_pem: String,
}

impl PushNotificationService {
    pub async fn new(pool: Arc<PgPool>) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let (public_key, private_key_pem) = read_vapid_keys_from_pem()
            .map_err(|e| {
                error!("Failed to read VAPID PEM files: {}. Generate them with: mkdir -p vapids && openssl ecparam -genkey -name prime256v1 -out vapids/vapid_private.pem && openssl ec -in vapids/vapid_private.pem -pubout -out vapids/vapid_public.pem", e);
                e
            })?;

        info!("Using VAPID keys from PEM files");

        let client = IsahcWebPushClient::new()?;

        Ok(Self {
            pool,
            client,
            vapid_public_key: public_key,
            vapid_private_key_pem: private_key_pem,
        })
    }

    #[cfg(test)]
    pub(crate) fn stub(pool: Arc<PgPool>) -> Self {
        Self {
            pool,
            client: IsahcWebPushClient::new().expect("web push client should not need a server"),
            vapid_public_key: String::from("test-public-key"),
            vapid_private_key_pem: String::from("test-private-key-pem"),
        }
    }

    pub fn get_public_key(&self) -> &str {
        &self.vapid_public_key
    }

    pub async fn send_notification(
        &self,
        user_id: i64,
        title: String,
        body: String,
        notification_type: NotificationType,
    ) -> Result<NotificationSendResult, Box<dyn std::error::Error + Send + Sync>> {
        let preferences = sqlx::query(
            r#"
            SELECT announcements_enabled, system_enabled, map_specific_enabled
            FROM website.notification_preferences
            WHERE user_id = $1
            "#,
        )
        .bind(user_id)
        .fetch_optional(self.pool.as_ref())
        .await?;

        let should_send = if let Some(prefs) = preferences {
            match notification_type {
                NotificationType::Announcements => prefs.try_get::<bool, _>("announcements_enabled")?,
                NotificationType::System => prefs.try_get::<bool, _>("system_enabled")?,
                NotificationType::MapSpecific => prefs.try_get::<bool, _>("map_specific_enabled")?,
            }
        } else {
            true
        };

        if !should_send {
            return Ok(NotificationSendResult {
                success: 0,
                failed: 0,
                total: 0,
                errors: vec!["User has disabled this notification type".to_string()],
            });
        }

        let subscriptions = self.get_user_subscriptions(user_id).await?;

        if subscriptions.is_empty() {
            return Ok(NotificationSendResult {
                success: 0,
                failed: 0,
                total: 0,
                errors: vec!["No active subscriptions for user".to_string()],
            });
        }

        let payload = json!({
            "title": title,
            "body": body,
            "icon": "/favicon.png",
            "badge": "/favicon.png",
            "data": {
                "url": "/",
            }
        })
        .to_string();

        let mut success_count = 0;
        let mut failed_count = 0;
        let mut errors = Vec::new();

        for subscription in subscriptions {
            match self.send_to_subscription(&subscription, &payload, notification_type).await {
                Ok(_) => {
                    success_count += 1;
                    self.log_notification(&subscription, &title, &body, notification_type, true, None, None).await;
                }
                Err(e) => {
                    failed_count += 1;
                    let error_msg = format!("Failed to send to subscription {}: {}", subscription.id, e);
                    errors.push(error_msg.clone());
                    warn!("{}", error_msg);
                    self.log_notification(&subscription, &title, &body, notification_type, false, Some(e.to_string()), None).await;

                    // Clean up dead subscriptions (410 Gone or 404 Not Found)
                    if e.to_string().contains("410") || e.to_string().contains("404") {
                        self.remove_subscription(subscription.id).await.ok();
                    }
                }
            }
        }

        let total = success_count + failed_count;
        Ok(NotificationSendResult {
            success: success_count,
            failed: failed_count,
            total,
            errors,
        })
    }

    pub async fn send_notification_to_subscription(
        &self,
        subscription_id: Uuid,
        title: &str,
        body: &str,
        notification_type: NotificationType,
        url: Option<&str>,
        server_id: Option<&str>,
        is_map_notify: bool,
        map_name: Option<&str>,
    ) -> Result<NotificationSendResult, Box<dyn std::error::Error + Send + Sync>> {
        let subscription = sqlx::query_as!(
            DbSubscription,
            r#"
            SELECT id, user_id, endpoint, p256dh_key, auth_key
            FROM website.push_subscriptions
            WHERE id = $1
            "#,
            subscription_id
        )
        .fetch_optional(self.pool.as_ref())
        .await?;

        let subscription = match subscription {
            Some(sub) => sub,
            None => {
                return Ok(NotificationSendResult {
                    success: 0,
                    failed: 1,
                    total: 1,
                    errors: vec!["Subscription not found".to_string()],
                });
            }
        };

        let mut payload_data = json!({
            "url": url.unwrap_or("/"),
        });

        // Build image URL for map notifications
        let mut image_url: Option<String> = None;

        if notification_type == NotificationType::MapSpecific && let Some(server_id_val) = server_id {
            if is_map_notify {
                // map_notify: specific map subscription - show Join Now / Map Info buttons
                payload_data["notificationType"] = json!("map_notify");
                payload_data["serverId"] = json!(server_id_val);
                if let Some(map) = map_name {
                    payload_data["mapName"] = json!(map);
                    payload_data["mapInfoUrl"] = json!(format!("/servers/{}/maps/{}", server_id_val, map));
                    // Use medium thumbnail for notification image
                    image_url = Some(format!("/thumbnails/medium/{}.jpg", map));
                }
            } else {
                // map_change: any map change subscription - show Wait for Another / Dismiss buttons
                payload_data["notificationType"] = json!("map_change");
                payload_data["allowResubscribe"] = json!(true);
                payload_data["serverId"] = json!(server_id_val);
                payload_data["subscriptionId"] = json!(subscription.id.to_string());
            }
        }

        let mut payload_obj = json!({
            "title": title,
            "body": body,
            "icon": "/favicon.png",
            "badge": "/favicon.png",
            "data": payload_data,
        });

        if let Some(img) = image_url {
            payload_obj["image"] = json!(img);
        }

        let payload = payload_obj.to_string();

        match self.send_to_subscription(&subscription, &payload, notification_type).await {
            Ok(_) => {
                self.log_notification(&subscription, title, body, notification_type, true, None, None).await;
                Ok(NotificationSendResult {
                    success: 1,
                    failed: 0,
                    total: 1,
                    errors: vec![],
                })
            }
            Err(e) => {
                let error_msg = format!("Failed to send to subscription {}: {}", subscription.id, e);
                warn!("{}", error_msg);
                self.log_notification(&subscription, title, body, notification_type, false, Some(e.to_string()), None).await;

                // Clean up dead subscriptions (410 Gone or 404 Not Found)
                if e.to_string().contains("410") || e.to_string().contains("404") {
                    self.remove_subscription(subscription.id).await.ok();
                }

                Ok(NotificationSendResult {
                    success: 0,
                    failed: 1,
                    total: 1,
                    errors: vec![error_msg],
                })
            }
        }
    }

    pub async fn send_notification_broadcast(
        &self,
        title: String,
        body: String,
        notification_type: NotificationType,
    ) -> Result<NotificationSendResult, Box<dyn std::error::Error + Send + Sync>> {
        let query = format!(
            r#"
            SELECT DISTINCT ps.user_id
            FROM website.push_subscriptions ps
            LEFT JOIN website.notification_preferences np ON ps.user_id = np.user_id
            WHERE np.user_id IS NULL OR np.{}_enabled = TRUE
            "#,
            notification_type.as_str()
        );

        let users: Vec<i64> = sqlx::query(&query)
            .fetch_all(self.pool.as_ref())
            .await?
            .iter()
            .filter_map(|row| row.try_get::<i64, _>("user_id").ok())
            .collect();

        let mut total_success = 0;
        let mut total_failed = 0;
        let mut all_errors = Vec::new();

        for user_id in users {
            match self.send_notification(user_id, title.clone(), body.clone(), notification_type).await {
                Ok(result) => {
                    total_success += result.success;
                    total_failed += result.failed;
                    all_errors.extend(result.errors);
                }
                Err(e) => {
                    let error_msg = format!("Failed to send to user {}: {}", user_id, e);
                    all_errors.push(error_msg.clone());
                    error!("{}", error_msg);
                }
            }
        }

        let total = total_success + total_failed;
        Ok(NotificationSendResult {
            success: total_success,
            failed: total_failed,
            total,
            errors: all_errors,
        })
    }

    async fn send_to_subscription(
        &self,
        subscription: &DbSubscription,
        payload: &str,
        _notification_type: NotificationType,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let subscription_info = SubscriptionInfo {
            endpoint: subscription.endpoint.clone(),
            keys: SubscriptionKeys {
                p256dh: subscription.p256dh_key.clone(),
                auth: subscription.auth_key.clone(),
            },
        };

        let vapid_subject = std::env::var("VAPID_SUBJECT")
            .unwrap_or_else(|_| "mailto:admin@example.com".to_string());

        let mut sig_builder = VapidSignatureBuilder::from_pem(
            Cursor::new(self.vapid_private_key_pem.as_bytes()),
            &subscription_info
        )?;

        sig_builder.add_claim("sub", vapid_subject);

        let signature = sig_builder.build()?;

        let mut builder = WebPushMessageBuilder::new(&subscription_info);
        builder.set_payload(ContentEncoding::Aes128Gcm, payload.as_bytes());
        builder.set_vapid_signature(signature);

        let message = builder.build()?;

        self.client.send(message).await?;

        Ok(())
    }

    async fn get_user_subscriptions(&self, user_id: i64) -> Result<Vec<DbSubscription>, Box<dyn std::error::Error + Send + Sync>> {
        let subscriptions = sqlx::query_as!(
            DbSubscription,
            r#"
            SELECT id, user_id, endpoint, p256dh_key, auth_key
            FROM website.push_subscriptions
            WHERE user_id = $1
            "#,
            user_id
        )
        .fetch_all(self.pool.as_ref())
        .await?;

        Ok(subscriptions)
    }

    async fn remove_subscription(&self, subscription_id: Uuid) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        sqlx::query(
            r#"
            DELETE FROM website.push_subscriptions
            WHERE id = $1
            "#,
        )
        .bind(subscription_id)
        .execute(self.pool.as_ref())
        .await?;

        info!("Removed dead subscription: {}", subscription_id);
        Ok(())
    }

    async fn log_notification(
        &self,
        subscription: &DbSubscription,
        title: &str,
        body: &str,
        notification_type: NotificationType,
        success: bool,
        error_message: Option<String>,
        http_status: Option<i32>,
    ) {
        let result = sqlx::query(
            r#"
            INSERT INTO website.push_notification_log
            (user_id, subscription_id, notification_type, title, body, success, error_message, http_status)
            VALUES ($1, $2, $3::notification_preference_type, $4, $5, $6, $7, $8)
            "#,
        )
        .bind(subscription.user_id)
        .bind(subscription.id)
        .bind(notification_type.as_str())
        .bind(title)
        .bind(body)
        .bind(success)
        .bind(error_message)
        .bind(http_status)
        .execute(self.pool.as_ref())
        .await;

        if let Err(e) = result {
            error!("Failed to log notification: {}", e);
        }
    }
}
