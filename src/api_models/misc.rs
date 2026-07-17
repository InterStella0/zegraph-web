use std::fmt::Display;
use chrono::{DateTime, Utc};
use poem_openapi::{Enum, Object};
use serde::{Deserialize, Serialize};

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
    pub is_superuser: Option<bool>,
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

#[derive(Object)]
pub struct UserAnonymization {
    pub user_id: String, // String to avoid JS precision loss with large i64
    pub community_id: Option<String>,
    pub anonymized: bool,
    pub hide_location: bool,
}

#[derive(Enum, Serialize, Deserialize)]
pub enum VoteType{
    UpVote,
    DownVote
}

#[derive(Object, Serialize, Deserialize)]
pub struct VoteDto {
    pub vote_type: VoteType,
}

#[derive(Object)]
pub struct GuideAuthor {
    pub id: String, // do not turn this back into integer, bigint is not supported on js AAAAAAAAA
    pub name: String,
    pub avatar: Option<String>,
}

#[derive(Object)]
pub struct Guide {
    pub id: String,
    pub map_name: String,
    pub server_id: Option<String>,
    pub title: String,
    pub content: String,
    pub category: String,
    pub author: GuideAuthor,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub upvotes: i64,
    pub downvotes: i64,
    pub comment_count: i64,
    pub slug: String,
    pub user_vote: Option<VoteType>,
}

#[derive(Object)]
pub struct GuideComment {
    pub id: String,
    pub guide_id: String,
    pub author: GuideAuthor,
    pub content: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub upvotes: i64,
    pub downvotes: i64,
    pub user_vote: Option<VoteType>
}

#[derive(Object)]
pub struct GuideCommentPaginated{
    pub comments: Vec<GuideComment>,
    pub total_comments: i32,
}

#[derive(Object)]
pub struct GuidesPaginated {
    pub(crate) total_guides: i32,
    pub(crate) guides: Vec<Guide>,
}

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
    pub chunks_received: Vec<u32>,
}

#[derive(Object, Serialize, Deserialize)]
pub struct InitiateUploadResponse {
    pub session_id: String,
    pub chunk_size: usize,
    pub total_chunks: u32,
}

#[derive(Object, Serialize, Deserialize)]
pub struct ChunkUploadResponse {
    pub chunk_index: u32,
    pub received: bool,
    pub chunks_remaining: u32,
}


#[derive(Object, Serialize)]
pub struct Character3DModel {
    pub id: i32,
    pub model_id: String,
    pub name: Option<String>,
    pub server_id: String,
    pub credit: Option<String>,
    pub link_path: String,
    pub uploaded_by: Option<i64>,
    pub uploader_name: Option<String>,
    pub thumbnail_path: Option<String>,
    pub file_size: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

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
    pub chunks_received: Vec<u32>,
}

#[derive(Serialize, Deserialize)]
pub struct ProviderResponse{
    pub provider: String,
    pub url: String
}

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

#[derive(Object, Serialize, Deserialize, Clone)]
pub struct FetchStatusBucket {
    pub ok: i32,
    pub error: i32,
    pub first_error: Option<String>,
    pub bucket_index: u8,
}

#[derive(Object, Serialize, Deserialize, Clone)]
pub struct FetchStatusTrack {
    pub label: String,
    pub total_ok: i64,
    pub total_fetches: i64,
    pub buckets: Vec<FetchStatusBucket>,
}

#[derive(Object, Serialize, Deserialize, Clone)]
pub struct FetchStatusServerGroupTruncated {
    pub server_id: String,
    pub server_name: String,
    pub tracks: Vec<FetchStatusTrack>,
}

#[derive(Object, Serialize, Deserialize, Clone)]
pub struct FetchStatusCommunityGroupTruncated {
    pub community_id: String,
    pub community_name: String,
    pub servers: Vec<FetchStatusServerGroupTruncated>,
}

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

#[derive(Object, Clone, Serialize)]
pub struct Announcement{
    pub id: String,
    pub r#type: AnnouncementType,
    pub title: Option<String>,
    pub text: String,
    pub created_at: DateTime<Utc>,
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

#[derive(Object, Serialize)]
pub struct AnnouncementsPaginated{
    pub total: i64,
    pub announcements: Vec<Announcement>,
}