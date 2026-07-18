use chrono::{DateTime, Utc};
use poem_openapi::Object;
use serde::{Deserialize, Serialize};

#[derive(Object, Serialize, Deserialize)]
pub struct CreateGuideDto {
    pub title: String,
    pub content: String,
    pub category: String,
    pub server_id: Option<String>
}

#[derive(Object, Serialize, Deserialize)]
pub struct UpdateGuideDto {
    pub title: Option<String>,
    pub content: Option<String>,
    pub category: Option<String>,
    #[serde(default)]
    pub server_id: Option<Option<String>>,  // None = not provided, Some(None) = global, Some(Some(x)) = server x
}

#[derive(Object, Serialize, Deserialize)]
pub struct ReportGuideDto {
    pub reason: String,
    pub details: String,
}

#[derive(Object, Serialize, Deserialize)]
pub struct CreateUpdateCommentDto {
    pub content: String,
}

#[derive(Object)]
pub struct GuideReportAdmin {
    pub id: String,
    pub guide_id: String,
    pub guide_title: Option<String>,
    pub guide_map_name: Option<String>,
    pub guide_author_id: Option<String>,
    pub guide_author_name: Option<String>,
    pub reporter_id: String,
    pub reporter_name: Option<String>,
    pub reason: String,
    pub details: String,
    pub status: String,
    pub resolved_by: Option<String>,
    pub resolver_name: Option<String>,
    pub resolved_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Object)]
pub struct CommentReportAdmin {
    pub id: String,
    pub comment_id: String,
    pub comment_content: Option<String>,
    pub comment_author_id: Option<String>,
    pub comment_author_name: Option<String>,
    pub guide_id: Option<String>,
    pub reporter_id: String,
    pub reporter_name: Option<String>,
    pub reason: String,
    pub details: String,
    pub status: String,
    pub resolved_by: Option<String>,
    pub resolver_name: Option<String>,
    pub resolved_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Object)]
pub struct GuideBanAdmin {
    pub id: String,
    pub user_id: String,
    pub user_name: Option<String>,
    pub user_avatar: Option<String>,
    pub banned_by: String,
    pub banned_by_name: Option<String>,
    pub reason: String,
    pub created_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
    pub is_active: bool,
}

#[derive(Object)]
pub struct GuideReportsPaginated {
    pub total: i64,
    pub reports: Vec<GuideReportAdmin>,
}

#[derive(Object)]
pub struct CommentReportsPaginated {
    pub total: i64,
    pub reports: Vec<CommentReportAdmin>,
}

#[derive(Object)]
pub struct GuideBansPaginated {
    pub total: i64,
    pub bans: Vec<GuideBanAdmin>,
}

#[derive(Object, Serialize, Deserialize)]
pub struct UpdateReportStatusDto {
    pub status: String,
}

#[derive(Object, Serialize, Deserialize)]
pub struct CreateBanDto {
    pub reason: String,
    pub expires_at: Option<DateTime<Utc>>,
}

#[derive(Object)]
pub struct BanStatus {
    pub is_banned: bool,
    pub reason: Option<String>,
    pub expires_at: Option<DateTime<Utc>>,
}

#[derive(Object, Serialize, Deserialize)]
pub struct ReportMapMusicDto {
    pub reason: String,
    pub details: String,
    pub suggested_youtube_url: Option<String>,
}

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
    pub status: String,
    pub resolved_by: Option<String>,
    pub resolver_name: Option<String>,
    pub resolved_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub music_duration: f64,
    pub music_source: String,
    pub associated_maps: Vec<String>,
}

#[derive(Object)]
pub struct MapMusicReportsPaginated {
    pub total: i64,
    pub reports: Vec<MapMusicReportAdmin>,
}

#[derive(Object, Serialize, Deserialize)]
pub struct UpdateMapMusicDto {
    pub youtube_music: Option<String>,
}

#[derive(Object, Serialize, Deserialize)]
pub struct PushSubscriptionDto {
    pub endpoint: String,
    pub keys: PushSubscriptionKeys,
}

#[derive(Object, Serialize, Deserialize)]
pub struct PushSubscriptionKeys {
    pub p256dh: String,
    pub auth: String,
}

#[derive(Object, Serialize)]
pub struct PushSubscription {
    pub id: String,
    pub user_id: String, // String to avoid JS precision loss with large i64
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

#[derive(Object, Serialize)]
pub struct NotificationPreferences {
    pub user_id: String, // String to avoid JS precision loss with large i64
    pub announcements_enabled: bool,
    pub system_enabled: bool,
    pub map_specific_enabled: bool,
    pub updated_at: DateTime<Utc>,
}

#[derive(Object, Serialize, Deserialize)]
pub struct TestNotificationDto {
    pub title: String,
    pub body: String,
    pub user_id: Option<String>, // String to avoid JS precision loss with large i64
}

#[derive(Object, Serialize)]
pub struct NotificationSendResult {
    pub success: i32,
    pub failed: i32,
    pub total: i32,
    pub errors: Vec<String>,
}

#[derive(Object, Serialize)]
pub struct PushSubscriptionsPaginated {
    pub total: i64,
    pub subscriptions: Vec<PushSubscription>,
}

#[derive(Object, Serialize)]
pub struct MapChangeSubscription {
    pub id: String,
    pub server_id: String,
    pub created_at: DateTime<Utc>,
    pub triggered: bool,
}

#[derive(Object, Serialize, Deserialize)]
pub struct CreateMapChangeSubscriptionDto {
    pub server_id: String,
    pub subscription_id: String,
}

#[derive(Object, Serialize)]
pub struct MapNotifySubscription {
    pub id: String,
    pub map_name: String,
    pub server_id: Option<String>,
    pub created_at: DateTime<Utc>,
    pub triggered: bool,
}

#[derive(Object, Serialize, Deserialize)]
pub struct CreateMapNotifySubscriptionDto {
    pub map_name: String,
    pub server_id: Option<String>,
    pub subscription_id: String,
}

#[derive(Object, Serialize)]
pub struct MapNotifyStatusResponse {
    pub subscribed: bool,
    pub subscription_type: Option<String>, // "server" or "all" or null
}

#[derive(Object, Serialize, Deserialize, Clone)]
pub struct ServerEntryResponse {
    pub ip: String,
    pub port: u16,
    pub readable_link: String,
}

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
    pub status: String,
    pub reviewed_by: Option<String>,
    pub reviewer_name: Option<String>,
    pub reviewed_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Object, Serialize)]
pub struct ServerRequestsPaginated {
    pub total: i64,
    pub requests: Vec<ServerRequestAdmin>,
}

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

#[derive(Debug, Serialize, Deserialize, Object, Clone)]
pub struct AdminServer {
    pub server_id: String,
    pub server_name: Option<String>,
    pub server_fullname: Option<String>,
    pub server_ip: Option<String>,
    pub server_port: Option<i32>,
    pub community_id: Option<String>,
    pub online: Option<bool>,
    pub readable_link: Option<String>,
    pub server_website: Option<String>,
    pub server_discord_link: Option<String>,
    pub server_source: Option<String>,
    pub timezone: Option<String>,
    pub game: Option<String>,
    pub source_by_id: Option<bool>,
}


#[derive(Debug, Serialize, Deserialize, Object, Clone)]
pub struct AdminCommunity {
    pub id: String,
    pub name: Option<String>,
    pub shorten_name: Option<String>,
    pub icon_url: Option<String>,
    pub server_count: i64,
}


#[derive(Object, Serialize)]
pub struct AdminMapServerEntry {
    pub server_id: String,
    pub server_name: String,
    pub is_tryhard: Option<bool>,
    pub is_casual: Option<bool>,
    pub workshop_id: Option<i64>,
    pub resolved_workshop_id: Option<i64>,
    pub no_noms: bool,
    pub min_players: Option<i16>,
    pub max_players: Option<i16>,
}

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


#[derive(Object, Serialize)]
pub struct AuditFieldChange {
    pub field: String,
    pub old_value: Option<String>,
    pub new_value: Option<String>,
}

#[derive(Object, Serialize)]
pub struct AuditLogEntry {
    pub id: i64,
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

#[derive(Object, Serialize)]
pub struct AuditLogsResponse {
    pub total: i64,
    pub logs: Vec<AuditLogEntry>,
}
