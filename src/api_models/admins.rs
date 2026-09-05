use chrono::{DateTime, Utc};
use poem_openapi::Object;
use serde::{Deserialize, Serialize};

#[derive(Object, Serialize, Deserialize)]
pub struct UpdateReportStatusDto {
    /// Must be `resolved`, `dismissed` or `pending`.
    pub status: String,
}

#[derive(Object, Serialize, Deserialize)]
pub struct ReportMapMusicDto {
    /// Must be `video_unavailable` or `wrong_video`.
    pub reason: String,
    pub details: String,
    pub suggested_youtube_url: Option<String>,
}

/// A map-music report, with the track's and reporter's details resolved for the admin review
/// queue.
#[derive(Object)]
pub struct MapMusicReportAdmin {
    pub id: String,
    pub music_id: String,
    pub music_name: String,
    pub current_youtube_music: Option<String>,
    pub suggested_youtube_url: Option<String>,
    pub reporter_id: String,
    pub reporter_name: Option<String>,
    pub reason: String,
    pub details: String,
    /// `pending`, `resolved` or `dismissed`.
    pub status: String,
    pub resolved_by: Option<String>,
    pub resolver_name: Option<String>,
    pub resolved_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub music_duration: f64,
    pub music_source: String,
    /// Every map that currently uses this track.
    pub associated_maps: Vec<String>,
}

/// A page of map-music reports.
#[derive(Object)]
pub struct MapMusicReportsPaginated {
    pub total: i64,
    pub reports: Vec<MapMusicReportAdmin>,
}

#[derive(Object, Serialize, Deserialize)]
pub struct UpdateMapMusicDto {
    pub youtube_music: Option<String>,
}

/// A standard Web Push subscription object, as produced by the browser's Push API.
#[derive(Object, Serialize, Deserialize)]
pub struct PushSubscriptionDto {
    /// Must be HTTPS.
    pub endpoint: String,
    pub keys: PushSubscriptionKeys,
}

/// Base64url-encoded Web Push encryption keys.
#[derive(Object, Serialize, Deserialize)]
pub struct PushSubscriptionKeys {
    /// Must decode to exactly 65 bytes.
    pub p256dh: String,
    /// Must decode to exactly 16 bytes.
    pub auth: String,
}

/// A registered push subscription.
#[derive(Object, Serialize)]
pub struct PushSubscription {
    pub id: String,
    /// String rather than a numeric type to avoid precision loss on large Steam IDs in JS.
    pub user_id: String,
    pub endpoint: String,
    pub created_at: DateTime<Utc>,
    pub last_used_at: DateTime<Utc>,
}

#[derive(Object, Serialize, Deserialize)]
pub struct NotificationPreferencesDto {
    pub announcements_enabled: Option<bool>,
    pub system_enabled: Option<bool>,
    pub map_specific_enabled: Option<bool>,
}

/// A user's push notification preferences.
#[derive(Object, Serialize)]
pub struct NotificationPreferences {
    /// String rather than a numeric type to avoid precision loss on large Steam IDs in JS.
    pub user_id: String,
    pub announcements_enabled: bool,
    pub system_enabled: bool,
    pub map_specific_enabled: bool,
    pub updated_at: DateTime<Utc>,
}

#[derive(Object, Serialize, Deserialize)]
pub struct TestNotificationDto {
    pub title: String,
    pub body: String,
    /// Omit to broadcast to every subscribed user instead of one.
    pub user_id: Option<String>,
}

/// Outcome of sending a push notification (possibly to many subscriptions at once).
#[derive(Object, Serialize)]
pub struct NotificationSendResult {
    pub success: i32,
    pub failed: i32,
    pub total: i32,
    pub errors: Vec<String>,
}

/// A page of every push subscription across all users.
#[derive(Object, Serialize)]
pub struct PushSubscriptionsPaginated {
    pub total: i64,
    pub subscriptions: Vec<PushSubscription>,
}

/// A pending "notify me when this server's map changes" subscription.
#[derive(Object, Serialize)]
pub struct MapChangeSubscription {
    pub id: String,
    pub server_id: String,
    pub created_at: DateTime<Utc>,
    /// Whether this subscription has already fired (it is one-time, not recurring).
    pub triggered: bool,
}

#[derive(Object, Serialize, Deserialize)]
pub struct CreateMapChangeSubscriptionDto {
    pub server_id: String,
    /// ID of an existing push subscription (from `push/subscribe`) belonging to the caller.
    pub subscription_id: String,
}

/// A pending "notify me when this map is next played" subscription.
#[derive(Object, Serialize)]
pub struct MapNotifySubscription {
    pub id: String,
    pub map_name: String,
    /// `None` means the subscription watches for this map on any server.
    pub server_id: Option<String>,
    pub created_at: DateTime<Utc>,
    /// Whether this subscription has already fired (it is one-time, not recurring).
    pub triggered: bool,
}

#[derive(Object, Serialize, Deserialize)]
pub struct CreateMapNotifySubscriptionDto {
    pub map_name: String,
    /// Omit to watch for this map across every server.
    pub server_id: Option<String>,
    /// ID of an existing push subscription (from `push/subscribe`) belonging to the caller.
    pub subscription_id: String,
}

#[derive(Object, Serialize)]
pub struct MapNotifyStatusResponse {
    pub subscribed: bool,
    /// `"server"`, `"all"`, or `None` if not subscribed.
    pub subscription_type: Option<String>,
}

#[derive(Object, Serialize, Deserialize, Clone)]
pub struct ServerEntryResponse {
    pub ip: String,
    pub port: u16,
    pub readable_link: String,
}

/// A submitted community server request, with reviewer details resolved for the admin queue.
#[derive(Object, Serialize)]
pub struct ServerRequestAdmin {
    pub id: String,
    pub user_id: String,
    pub submitter_name: Option<String>,
    pub community_name: String,
    pub icon_url: Option<String>,
    pub servers: Vec<ServerEntryResponse>,
    pub game_type: String,
    pub elaboration: Option<String>,
    /// `pending`, `approved` or `rejected`.
    pub status: String,
    pub reviewed_by: Option<String>,
    pub reviewer_name: Option<String>,
    pub reviewed_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

/// A page of community server requests.
#[derive(Object, Serialize)]
pub struct ServerRequestsPaginated {
    pub total: i64,
    pub requests: Vec<ServerRequestAdmin>,
}

/// A player's request to have a name-tracked profile linked to their Steam account,
/// with the claimed profile and reviewer resolved for the admin queue.
#[derive(Object, Serialize)]
pub struct PlayerClaimAdmin {
    pub id: String,
    /// Steam ID of the person making the claim.
    pub user_id: String,
    pub claimer_name: Option<String>,
    /// The name-tracked `player.player_id` being claimed.
    pub player_id: String,
    pub player_name: Option<String>,
    pub server_id: String,
    pub server_name: Option<String>,
    /// Optional justification written by the claimer.
    pub note: Option<String>,
    /// `pending`, `approved` or `rejected`.
    pub status: String,
    pub reviewed_by: Option<String>,
    pub reviewer_name: Option<String>,
    pub reviewed_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

/// A page of profile claim requests.
#[derive(Object, Serialize)]
pub struct PlayerClaimsPaginated {
    pub total: i64,
    pub claims: Vec<PlayerClaimAdmin>,
}

/// A curated external community link.
#[derive(Debug, Serialize, Deserialize, Object, Clone)]
pub struct CommunityLinkResponse {
    pub id: String,
    pub name: String,
    pub url: String,
    pub description: Option<String>,
    pub sort_order: i32,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, Object, Clone)]
pub struct CreateCommunityLinkPayload {
    pub name: String,
    pub url: String,
    pub description: Option<String>,
    pub sort_order: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize, Object, Clone)]
pub struct UpdateCommunityLinkPayload {
    pub name: Option<String>,
    pub url: Option<String>,
    pub description: Option<String>,
    pub sort_order: Option<i32>,
}


/// A special-thanks/credits entry.
#[derive(Debug, Serialize, Deserialize, Object, Clone)]
pub struct SpecialThanksResponse {
    pub id: String,
    pub display_name: String,
    pub description: String,
}

#[derive(Debug, Serialize, Deserialize, Object, Clone)]
pub struct CreateSpecialThanksPayload {
    pub display_name: String,
    pub description: String,
}

#[derive(Debug, Serialize, Deserialize, Object, Clone)]
pub struct UpdateSpecialThanksPayload {
    pub display_name: Option<String>,
    pub description: Option<String>,
}

/// Full server metadata as shown in the admin server-management panel.
#[derive(Debug, Serialize, Deserialize, Object, Clone)]
pub struct AdminServer {
    pub server_id: String,
    pub server_name: Option<String>,
    pub server_fullname: Option<String>,
    pub server_ip: Option<String>,
    pub server_port: Option<i32>,
    pub community_id: Option<String>,
    pub online: Option<bool>,
    /// Short vanity slug used in URLs, if the server has one configured.
    pub readable_link: Option<String>,
    pub server_website: Option<String>,
    pub server_discord_link: Option<String>,
    pub server_source: Option<String>,
    pub timezone: Option<String>,
    pub game: Option<String>,
    /// Whether players on this server are tracked by Steam ID (`true`) rather than only by name.
    pub source_by_id: Option<bool>,
}


/// A community's admin-facing summary.
#[derive(Debug, Serialize, Deserialize, Object, Clone)]
pub struct AdminCommunity {
    pub id: String,
    pub name: Option<String>,
    pub shorten_name: Option<String>,
    pub icon_url: Option<String>,
    pub server_count: i64,
}


/// A map's per-server override settings, in the admin map-management panel.
#[derive(Object, Serialize)]
pub struct AdminMapServerEntry {
    pub server_id: String,
    pub server_name: String,
    /// Overrides the map's global `is_tryhard` on this server; `None` falls back to global.
    pub is_tryhard: Option<bool>,
    /// Overrides the map's global `is_casual` on this server; `None` falls back to global.
    pub is_casual: Option<bool>,
    pub workshop_id: Option<i64>,
    pub resolved_workshop_id: Option<i64>,
    pub no_noms: bool,
    pub min_players: Option<i16>,
    pub max_players: Option<i16>,
}

/// A map's global metadata plus its per-server overrides, in the admin map-management panel.
#[derive(Object, Serialize)]
pub struct AdminMapEntry {
    pub map_name: String,
    pub global_is_tryhard: Option<bool>,
    pub global_is_casual: Option<bool>,
    pub global_has_lasers: Option<bool>,
    pub global_workshop_id: Option<i64>,
    pub global_resolved_workshop_id: Option<i64>,
    pub servers: Vec<AdminMapServerEntry>,
}

/// A page of the admin map-management listing.
#[derive(Object, Serialize)]
pub struct AdminMapMetadataResponse {
    pub total: i64,
    pub maps: Vec<AdminMapEntry>,
}


#[derive(Object, Deserialize)]
pub struct UpdateGlobalMapMetadataDto {
    pub map_name: String,
    pub is_tryhard: Option<bool>,
    pub is_casual: Option<bool>,
    pub has_lasers: Option<bool>,
    pub workshop_id: Option<i64>,
    pub resolved_workshop_id: Option<i64>,
}

#[derive(Object, Deserialize)]
pub struct UpdateServerMapMetadataDto {
    pub server_id: String,
    pub map_name: String,
    pub is_tryhard: Option<bool>,
    pub is_casual: Option<bool>,
    pub workshop_id: Option<i64>,
    pub resolved_workshop_id: Option<i64>,
    pub no_noms: Option<bool>,
    pub min_players: Option<i16>,
    pub max_players: Option<i16>,
}


/// One field changed by an audited action.
#[derive(Object, Serialize)]
pub struct AuditFieldChange {
    pub field: String,
    pub old_value: Option<String>,
    pub new_value: Option<String>,
}

/// One row of the admin audit log.
#[derive(Object, Serialize)]
pub struct AuditLogEntry {
    pub id: i64,
    /// Grouping such as `map_metadata` — non-superusers only ever see this category.
    pub category: String,
    pub action: String,
    pub map_name: Option<String>,
    pub server_id: Option<String>,
    pub server_name: Option<String>,
    pub user_id: String,
    pub user_name: Option<String>,
    pub user_avatar: Option<String>,
    pub changes: Vec<AuditFieldChange>,
    pub created_at: DateTime<Utc>,
}

/// A page of the admin audit log.
#[derive(Object, Serialize)]
pub struct AuditLogsResponse {
    pub total: i64,
    pub logs: Vec<AuditLogEntry>,
}
