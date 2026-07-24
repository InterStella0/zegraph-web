use std::fmt::Display;
use chrono::{DateTime, Utc};
use poem_openapi::{Enum, Object};
use serde::{Deserialize, Serialize};

/// A Steam profile, mirroring the Steam Web API's `GetPlayerSummaries` response shape.
#[derive(Object, Deserialize, Clone)]
pub struct SteamProfile {
    pub steamid: String,
    pub communityvisibilitystate: Option<i64>,
    pub commentpermission: Option<i32>,
    pub profilestate: Option<i32>,
    pub personaname: Option<String>,
    pub profileurl: Option<String>,
    pub avatar: Option<String>,
    pub avatarmedium: Option<String>,
    pub avatarfull: Option<String>,
    pub avatarhash: Option<String>,
    pub lastlogoff: Option<i64>,
    pub personastate: Option<i64>,
    pub primaryclanid: Option<String>,
    pub timecreated: Option<i64>,
    pub personastateflags: Option<i32>,
    pub loccountrycode: Option<String>,
    pub realname: Option<String>,
    pub gameid: Option<String>,
    pub gameextrainfo: Option<String>,
    pub gameserverip: Option<String>,
    pub locstatecode: Option<String>,
    pub loccityid: Option<i64>,
    /// Only populated on `/accounts/me`: whether this user holds the `superuser` role.
    pub is_superuser: Option<bool>,
    /// Only populated on `/accounts/me`: whether this user holds the `map_manager` role.
    pub is_map_manager: Option<bool>,
}

#[derive(Deserialize)]
pub struct SteamProfileResponse {
    pub players: Vec<SteamProfile>,
}

#[derive(Deserialize)]
pub struct SteamApiResponse {
    pub response: SteamProfileResponse,
}

/// A user's anonymization preference for one community.
#[derive(Object)]
pub struct UserAnonymization {
    /// String rather than a numeric type to avoid precision loss on large Steam IDs in JS.
    pub user_id: String,
    pub community_id: Option<String>,
    /// Whether the user's name/identity is hidden from other players in this community.
    pub anonymized: bool,
    /// Whether the user's geographic location is hidden in this community.
    pub hide_location: bool,
}

#[derive(Enum, Serialize, Deserialize)]
pub enum VoteType{
    UpVote,
    DownVote
}

/// Server-side state of an in-progress chunked map 3D model upload, cached in redis.
#[derive(Object, Serialize, Deserialize, Clone)]
pub struct UploadSession {
    pub session_id: String,
    pub map_name: String,
    pub res_type: String,
    pub credit: Option<String>,
    pub total_chunks: u32,
    pub chunk_size: usize,
    pub total_size: u64,
    pub uploaded_by: i64,
    pub created_at: String,
    /// Indices of chunks received so far.
    pub chunks_received: Vec<u32>,
}

/// Response to starting a chunked upload: how to split and where to send the file.
#[derive(Object, Serialize, Deserialize)]
pub struct InitiateUploadResponse {
    pub session_id: String,
    pub chunk_size: usize,
    pub total_chunks: u32,
}

/// Acknowledgement of one uploaded chunk.
#[derive(Object, Serialize, Deserialize)]
pub struct ChunkUploadResponse {
    pub chunk_index: u32,
    pub received: bool,
    pub chunks_remaining: u32,
}


/// An uploaded 3D model for a character/class.
#[derive(Object, Serialize)]
pub struct Character3DModel {
    pub id: i32,
    pub model_id: String,
    pub name: Option<String>,
    pub server_id: String,
    pub credit: Option<String>,
    /// URL to fetch the model file from.
    pub link_path: String,
    pub uploaded_by: Option<i64>,
    pub uploader_name: Option<String>,
    pub thumbnail_path: Option<String>,
    pub file_size: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Server-side state of an in-progress chunked character 3D model upload, cached in redis.
#[derive(Object, Serialize, Deserialize, Clone)]
pub struct CharacterUploadSession {
    pub session_id: String,
    pub model_id: String,
    pub name: Option<String>,
    pub server_id: String,
    pub credit: Option<String>,
    pub total_chunks: u32,
    pub chunk_size: usize,
    pub total_size: u64,
    pub uploaded_by: i64,
    pub created_at: String,
    /// Indices of chunks received so far.
    pub chunks_received: Vec<u32>,
}

#[derive(Serialize, Deserialize)]
pub struct ProviderResponse{
    pub provider: String,
    pub url: String
}

/// One data-scraper fetch attempt against a server.
#[derive(Object, Serialize, Deserialize, Clone)]
pub struct FetchStatusEntry {
    pub fetch_id: i64,
    pub server_id: String,
    pub server_name: String,
    pub community_id: String,
    pub community_name: String,
    pub op_name: String,
    pub source_name: String,
    pub fetched_at: DateTime<Utc>,
    pub ok: bool,
    pub error: Option<String>,
}

/// One time bucket of a scraper-health histogram.
#[derive(Object, Serialize, Deserialize, Clone)]
pub struct FetchStatusBucket {
    pub ok: i32,
    pub error: i32,
    /// First error message seen in this bucket, truncated.
    pub first_error: Option<String>,
    /// Position of this bucket within the fixed-size histogram (0 = oldest).
    pub bucket_index: u8,
}

/// Fetch history for one (operation, source) pair, bucketed over time.
#[derive(Object, Serialize, Deserialize, Clone)]
pub struct FetchStatusTrack {
    /// `"{op_name} · {source_name}"`.
    pub label: String,
    pub total_ok: i64,
    pub total_fetches: i64,
    pub buckets: Vec<FetchStatusBucket>,
}

/// Scraper health for one server, grouped by tracked data source.
#[derive(Object, Serialize, Deserialize, Clone)]
pub struct FetchStatusServerGroupTruncated {
    pub server_id: String,
    pub server_name: String,
    pub tracks: Vec<FetchStatusTrack>,
}

/// Scraper health for one community, grouped by server.
#[derive(Object, Serialize, Deserialize, Clone)]
pub struct FetchStatusCommunityGroupTruncated {
    pub community_id: String,
    pub community_name: String,
    pub servers: Vec<FetchStatusServerGroupTruncated>,
}

/// Filter for admin announcement listing.
#[derive(Enum, Clone)]
pub enum AnnouncementStatus{
    All,
    Active,
    Scheduled,
    Expired,
    Hidden,
}

impl Display for AnnouncementStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self{
            AnnouncementStatus::All => write!(f, "all"),
            AnnouncementStatus::Active => write!(f, "active"),
            AnnouncementStatus::Scheduled => write!(f, "scheduled"),
            AnnouncementStatus::Expired => write!(f, "expired"),
            AnnouncementStatus::Hidden => write!(f, "hidden"),
        }
    }
}

/// `Rich` announcements require a title; `Basic` ones do not.
#[derive(Enum, Clone, Serialize, Deserialize)]
pub enum AnnouncementType {
    Basic,
    Rich
}

impl Display for AnnouncementType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self{
            AnnouncementType::Basic => write!(f, "basic"),
            AnnouncementType::Rich => write!(f, "rich"),
        }
    }
}

/// A site-wide announcement.
#[derive(Object, Clone, Serialize)]
pub struct Announcement{
    pub id: String,
    pub r#type: AnnouncementType,
    /// Required for `Rich` announcements.
    pub title: Option<String>,
    pub text: String,
    pub created_at: DateTime<Utc>,
    /// When the announcement starts being shown; may be in the future to schedule it.
    pub published_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
    pub hidden: bool,
}

#[derive(Object, Deserialize)]
pub struct CreateAnnouncementDto{
    pub r#type: AnnouncementType,
    pub title: Option<String>,
    pub text: String,
    pub published_at: Option<DateTime<Utc>>,
    pub expires_at: Option<DateTime<Utc>>,
    pub show: bool,
}

#[derive(Object, Deserialize)]
pub struct UpdateAnnouncementDto{
    pub r#type: Option<AnnouncementType>,
    pub title: Option<String>,
    pub text: Option<String>,
    pub published_at: Option<DateTime<Utc>>,
    pub expires_at: Option<DateTime<Utc>>,
    pub show: Option<bool>,
}

/// A page of announcements.
#[derive(Object, Serialize)]
pub struct AnnouncementsPaginated{
    pub total: i64,
    pub announcements: Vec<Announcement>,
}