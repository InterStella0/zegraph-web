
use crate::core::utils::{format_pg_time_tz, TimeToChrono};
use crate::global_serializer::*;
use serde::{Deserialize, Serialize};
use serde_macros::{auto_serde_with, DbInto};
use sqlx::postgres::types::PgTimeTz;
use sqlx::{postgres::types::PgInterval, types::time::OffsetDateTime};
use std::fmt::{Display, Formatter};
use chrono::{DateTime, Utc};
use poem_openapi::Object;
use serde_json::Value;
use uuid::Uuid;
use crate::api_models::misc::*;
use crate::api_models::admins::*;
use crate::api_models::maps::*;

#[derive(DbInto)]
#[auto_serde_with]
#[db_into(FetchStatusEntry)]
pub struct DbFetchStatus {
    pub fetch_id: i64,
    pub server_id: String,
    #[default("Unknown".into())]
    pub server_name: Option<String>,
    #[default("Unknown".into())]
    pub community_id: Option<String>,
    #[default("Unknown".into())]
    pub community_name: Option<String>,
    pub op_name: String,
    pub source_name: String,
    pub fetched_at: OffsetDateTime,
    pub ok: bool,
    pub error: Option<String>,
}


#[derive(Clone, DbInto)]
#[auto_serde_with]
#[db_into(UserAnonymization)]
pub struct DbUserAnonymization {
    #[method(to_string)]
    pub user_id: i64,
    #[expr(self.community_id.map(|e| e.to_string()))]
    pub community_id: Option<uuid::Uuid>,
    pub anonymized: bool,
    pub hide_location: bool,
}

#[derive(Serialize, Deserialize, Clone, DbInto)]
#[db_into(MapEventAverage)]
pub struct DbEvent{
    #[default("Unknown".to_string())]
    pub event_name: Option<String>,
    #[unwrap_default]
    pub average: Option<f64>
}

#[derive(DbInto)]
#[db_into(Region)]
pub struct DbRegion{
    pub region_name: String,
    pub region_id: i64,
    #[expr(format_pg_time_tz(&self.start_time))]
    pub start_time: PgTimeTz,
    #[expr(format_pg_time_tz(&self.end_time))]
    pub end_time: PgTimeTz,
}


#[derive(Clone, Debug, PartialEq, PartialOrd, sqlx::Type, Deserialize, Serialize)]
#[sqlx(type_name = "announcement_type_enum", rename_all = "PascalCase")]
pub enum AnnouncementTypeState {
    Basic,
    Rich
}
impl From<AnnouncementType> for AnnouncementTypeState{
    fn from(value: AnnouncementType) -> Self {
        match value {
            AnnouncementType::Basic => AnnouncementTypeState::Basic,
            AnnouncementType::Rich => AnnouncementTypeState::Rich
        }
    }
}
impl Into<AnnouncementType> for AnnouncementTypeState{
    fn into(self) -> AnnouncementType {
        match self{
            AnnouncementTypeState::Basic => AnnouncementType::Basic,
            AnnouncementTypeState::Rich => AnnouncementType::Rich
        }
    }
}
#[derive(Clone, DbInto)]
#[db_into(Announcement)]
#[extra(hidden = !self.show)]
#[auto_serde_with]
pub struct DbAnnouncement {
    pub id: String,
    #[method(into)]
    pub r#type: AnnouncementTypeState,
    pub title: Option<String>,
    pub text: String,
    pub created_at: OffsetDateTime,
    pub published_at: OffsetDateTime,
    pub expires_at: Option<OffsetDateTime>,
    #[skip]
    pub show: bool,
}


#[derive(DbInto)]
#[db_into(SteamProfile)]
#[extra(loccountrycode = Some("".to_string()), realname = None, gameid = None, gameextrainfo = None, gameserverip = None, locstatecode = None, loccityid = None, is_superuser = Some(false), is_map_manager = Some(false))]
pub struct DbSteam{
    #[rename(steamid)]
    #[method(to_string)]
    pub user_id: i64,
    #[rename(communityvisibilitystate)]
    #[expr(Some(i32::try_from(self.community_visibility_state).unwrap_or_default() as i64))]
    pub community_visibility_state: CommunityVisibilityState,
    #[rename(profilestate)]
    #[expr(Some(self.profile_state as i32))]
    pub profile_state: i64,
    #[rename(personaname)]
    #[expr(Some(self.persona_name))]
    pub persona_name: String,
    #[rename(profileurl)]
    #[expr(Some(self.profile_url))]
    pub profile_url: String,
    #[expr(Some(self.avatar))]
    pub avatar: String,
    #[rename(avatarmedium)]
    #[expr(Some(self.avatar_medium))]
    pub avatar_medium: String,
    #[rename(avatarfull)]
    #[expr(Some(self.avatar_full))]
    pub avatar_full: String,
    #[rename(avatarhash)]
    #[expr(Some(self.avatar_hash))]
    pub avatar_hash: String,
    #[rename(lastlogoff)]
    #[expr(if self.last_log_off == -1 { None } else { Some(self.last_log_off) })]
    pub last_log_off: i64,
    #[rename(personastate)]
    #[expr(Some(i32::try_from(self.persona_state).unwrap_or_default() as i64))]
    pub persona_state: PersonaState,
    #[rename(primaryclanid)]
    #[expr(Some(self.primary_clan_id))]
    pub primary_clan_id: String,
    #[rename(timecreated)]
    #[expr(Some(self.time_created))]
    pub time_created: i64,
    #[rename(personastateflags)]
    #[expr(Some(self.persona_state_flags as i32))]
    pub persona_state_flags: i64,
    #[rename(commentpermission)]
    #[expr(Some(if self.comment_permission { 1 } else { 0 }))]
    pub comment_permission: bool,
}

#[derive(Clone, Debug, PartialEq, PartialOrd, sqlx::Type, Deserialize, Serialize)]
#[sqlx(type_name = "community_visibility_state_enum")]
pub enum CommunityVisibilityState {
    Private,
    FriendsOnly,
    Public
}
impl TryFrom<i32> for CommunityVisibilityState {
    type Error = &'static str;

    fn try_from(value: i32) -> Result<Self, Self::Error> {
        match value {
            1 => Ok(CommunityVisibilityState::Private),
            2 => Ok(CommunityVisibilityState::FriendsOnly),
            3 => Ok(CommunityVisibilityState::Public),
            _ => Err("Invalid CommunityVisibilityState value"),
        }
    }
}
impl Into<i32> for CommunityVisibilityState {

    fn into(self) -> i32 {
        match self {
            CommunityVisibilityState::Private => 1i32,
            CommunityVisibilityState::FriendsOnly => 2i32,
            CommunityVisibilityState::Public => 3i32
        }
    }
}
impl Display for CommunityVisibilityState {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            CommunityVisibilityState::Private => f.write_str("Private"),
            CommunityVisibilityState::FriendsOnly => f.write_str("FriendsOnly"),
            CommunityVisibilityState::Public => f.write_str("Public")
        }
    }
}
#[derive(Clone, Debug, PartialEq, PartialOrd, sqlx::Type, Deserialize, Serialize)]
#[sqlx(type_name = "persona_state_enum")]
pub enum PersonaState{
    Offline,
    Online,
    Busy,
    Away,
    Snooze,
    LookingToTrade,
    LookingToPlay,
}
impl TryFrom<i32> for PersonaState {
    type Error = &'static str;

    fn try_from(value: i32) -> Result<Self, Self::Error> {
        match value {
            0 => Ok(PersonaState::Offline),
            1 => Ok(PersonaState::Online),
            2 => Ok(PersonaState::Busy),
            3 => Ok(PersonaState::Away),
            4 => Ok(PersonaState::Snooze),
            5 => Ok(PersonaState::LookingToTrade),
            6 => Ok(PersonaState::LookingToPlay),
            _ => Err("Invalid PersonaState value"),
        }
    }
}

impl Into<i32> for PersonaState {

    fn into(self) -> i32 {
        match self {
            PersonaState::Offline => 0i32,
            PersonaState::Online => 1i32,
            PersonaState::Busy => 2i32,
            PersonaState::Away => 3i32,
            PersonaState::Snooze => 4i32,
            PersonaState::LookingToTrade => 5i32,
            PersonaState::LookingToPlay => 6i32,
        }
    }
}
impl Display for PersonaState{
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            PersonaState::Offline => f.write_str("Offline"),
            PersonaState::Online => f.write_str("Online"),
            PersonaState::Busy => f.write_str("Busy"),
            PersonaState::Away => f.write_str("Away"),
            PersonaState::Snooze => f.write_str("Snooze"),
            PersonaState::LookingToTrade => f.write_str("LookingToTrade"),
            PersonaState::LookingToPlay => f.write_str("LookingToPlay"),
        }
    }
}

#[allow(dead_code)]
#[derive(DbInto)]
#[db_into(ServerMapMusic)]
pub struct DbAssociatedMapMusic{
    #[method(to_string)]
    pub id: uuid::Uuid,
    #[rename(name)]
    pub music_name: String,
    #[unwrap_default]
    pub duration: Option<f64>,
    pub youtube_music: Option<String>,
    #[default("Unknown".to_string())]
    pub source: Option<String>,
    #[skip]
    pub map_name: Option<String>,
    #[unwrap_default]
    pub other_maps: Option<Vec<String>>,
    #[unwrap_default]
    pub tags: Option<Vec<String>>,
    #[expr(self.yt_source.map(|v| v.to_string()))]
    pub yt_source: Option<i64>,
    #[expr(Some(if self.yt_source == Some(0) { String::from("System") } else { self.yt_source_name.unwrap_or("Unknown".into()) }))]
    pub yt_source_name: Option<String>,
}
#[derive(Clone, sqlx::Type, Deserialize, Serialize, Debug)]
#[sqlx(type_name = "data_vote_type_enum")]
pub enum DataVoteType{
    UpVote,
    DownVote
}

impl From<VoteType> for DataVoteType {
    fn from(vote_type: VoteType) -> Self {
        match vote_type {
            VoteType::UpVote => DataVoteType::UpVote,
            VoteType::DownVote => DataVoteType::DownVote,
        }
    }
}

impl Into<VoteType> for DataVoteType {
    fn into(self) -> VoteType {
        match self {
            DataVoteType::UpVote => VoteType::UpVote,
            DataVoteType::DownVote => VoteType::DownVote,
        }
    }
}

#[auto_serde_with]
pub struct DbGuideBrief{
    pub id: uuid::Uuid,
    pub map_name: String,
    pub server_id: Option<String>,
    pub author_id: i64
}
#[derive(Debug, DbInto)]
#[auto_serde_with]
#[db_into(Guide)]
#[extra(author = GuideAuthor { id: self.author_id.to_string(), name: self.author_name.unwrap_or("Unknown".into()), avatar: self.author_avatar })]
pub struct DbGuide {
    #[method(to_string)]
    pub id: uuid::Uuid,
    pub map_name: String,
    pub server_id: Option<String>,
    pub title: String,
    pub content: String,
    pub category: String,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
    pub upvotes: i64,
    pub downvotes: i64,
    pub comment_count: i64,
    #[expr(self.user_vote.map(Into::into))]
    pub user_vote: Option<DataVoteType>,
    #[skip]
    pub author_id: i64,
    #[skip]
    pub author_name: Option<String>,
    #[skip]
    pub author_avatar: Option<String>,
    pub slug: String,
    #[skip]
    pub total_guides: Option<i32>
}


#[derive(DbInto)]
#[auto_serde_with]
#[db_into(GuideComment)]
#[extra(author = GuideAuthor { id: self.author_id.to_string(), name: self.author_name.unwrap_or("Unknown".into()), avatar: self.author_avatar })]
pub struct DbGuideComment {
    #[method(to_string)]
    pub id: uuid::Uuid,
    #[method(to_string)]
    pub guide_id: uuid::Uuid,
    #[skip]
    pub author_id: i64,
    #[skip]
    pub author_name: Option<String>,
    #[skip]
    pub author_avatar: Option<String>,
    pub content: String,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
    pub upvotes: i64,
    pub downvotes: i64,
    #[expr(self.user_vote.map(Into::into))]
    pub user_vote: Option<DataVoteType>,
    #[skip]
    pub total_comments: Option<i32>
}
#[auto_serde_with]
pub struct DbGuideCommentBrief{
    pub id: uuid::Uuid,
    pub guide_id: uuid::Uuid,
    pub author_id: i64,
}

#[auto_serde_with]
pub struct DbReportGuide {
    guide_id: String,
    user_id: i64,
    reason: String,
    details: String,
    timestamp: OffsetDateTime
}

// Admin models for guide moderation
#[derive(DbInto)]
#[auto_serde_with]
#[db_into(GuideReportAdmin)]
pub struct DbGuideReportFull {
    #[method(to_string)]
    pub id: uuid::Uuid,
    #[method(to_string)]
    pub guide_id: uuid::Uuid,
    #[rename(reporter_id)]
    #[method(to_string)]
    pub user_id: i64,
    pub reason: String,
    pub details: String,
    pub status: String,
    #[expr(self.resolved_by.map(|id| id.to_string()))]
    pub resolved_by: Option<i64>,
    pub resolved_at: Option<OffsetDateTime>,
    #[rename(created_at)]
    pub timestamp: OffsetDateTime,
    // Joined fields
    pub guide_title: Option<String>,
    pub guide_map_name: Option<String>,
    #[expr(self.guide_author_id.map(|id| id.to_string()))]
    pub guide_author_id: Option<i64>,
    pub guide_author_name: Option<String>,
    pub reporter_name: Option<String>,
    pub resolver_name: Option<String>,
    #[skip]
    pub total_reports: Option<i64>,
}

#[derive(DbInto)]
#[auto_serde_with]
#[db_into(CommentReportAdmin)]
pub struct DbCommentReportFull {
    #[method(to_string)]
    pub id: uuid::Uuid,
    #[method(to_string)]
    pub comment_id: uuid::Uuid,
    #[rename(reporter_id)]
    #[method(to_string)]
    pub user_id: i64,
    pub reason: String,
    pub details: String,
    pub status: String,
    #[expr(self.resolved_by.map(|id| id.to_string()))]
    pub resolved_by: Option<i64>,
    pub resolved_at: Option<OffsetDateTime>,
    #[rename(created_at)]
    pub timestamp: OffsetDateTime,
    // Joined fields
    pub comment_content: Option<String>,
    #[expr(self.comment_author_id.map(|id| id.to_string()))]
    pub comment_author_id: Option<i64>,
    pub comment_author_name: Option<String>,
    #[expr(self.guide_id.map(|id| id.to_string()))]
    pub guide_id: Option<uuid::Uuid>,
    pub reporter_name: Option<String>,
    pub resolver_name: Option<String>,
    #[skip]
    pub total_reports: Option<i64>,
}

#[derive(DbInto)]
#[auto_serde_with]
#[db_into(MapMusicReportAdmin)]
pub struct DbMapMusicReportFull {
    #[method(to_string)]
    pub id: uuid::Uuid,
    #[method(to_string)]
    pub music_id: uuid::Uuid,
    #[rename(reporter_id)]
    #[method(to_string)]
    pub user_id: i64,
    pub reason: String,
    pub details: String,
    pub suggested_youtube_url: Option<String>,
    pub current_youtube_music: Option<String>,
    pub status: String,
    #[expr(self.resolved_by.map(|id| id.to_string()))]
    pub resolved_by: Option<i64>,
    pub resolved_at: Option<OffsetDateTime>,
    #[rename(created_at)]
    pub timestamp: OffsetDateTime,
    // Joined fields from map_music
    #[default("Unknown Track".to_string())]
    pub music_name: Option<String>,
    #[default(0.0)]
    pub music_duration: Option<f64>,
    #[default("Unknown".to_string())]
    pub music_source: Option<String>,
    // Reporter/resolver info
    pub reporter_name: Option<String>,
    pub resolver_name: Option<String>,
    // Associated maps (aggregated)
    #[unwrap_default]
    pub associated_maps: Option<Vec<String>>,
    #[skip]
    pub total_reports: Option<i64>,
}

#[derive(DbInto)]
#[auto_serde_with]
#[db_into(GuideBanAdmin)]
pub struct DbGuideBan {
    #[method(to_string)]
    pub id: uuid::Uuid,
    #[method(to_string)]
    pub user_id: i64,
    #[method(to_string)]
    pub banned_by: i64,
    pub reason: String,
    pub created_at: OffsetDateTime,
    pub expires_at: Option<OffsetDateTime>,
    pub is_active: bool,
    // Joined fields
    pub user_name: Option<String>,
    pub user_avatar: Option<String>,
    pub banned_by_name: Option<String>,
    #[skip]
    pub total_bans: Option<i64>,
}


#[derive(DbInto)]
#[auto_serde_with]
#[db_into(PushSubscription)]
pub struct DbPushSubscription {
    #[method(to_string)]
    pub id: uuid::Uuid,
    #[method(to_string)]
    pub user_id: i64,
    pub endpoint: String,
    #[skip]
    pub p256dh_key: String,
    #[skip]
    pub auth_key: String,
    #[skip]
    pub user_agent: Option<String>,
    pub created_at: OffsetDateTime,
    pub last_used_at: OffsetDateTime,
}

#[derive(DbInto)]
#[auto_serde_with]
#[db_into(NotificationPreferences)]
pub struct DbNotificationPreferences {
    #[method(to_string)]
    pub user_id: i64,
    pub announcements_enabled: bool,
    pub system_enabled: bool,
    pub map_specific_enabled: bool,
    pub updated_at: OffsetDateTime,
}

#[auto_serde_with]
pub struct DbVapidKey {
    pub id: i32,
    pub public_key: String,
    pub private_key: String,
    pub created_at: OffsetDateTime,
    pub is_active: bool,
}


#[derive(DbInto)]
#[auto_serde_with]
#[db_into(Character3DModel)]
#[extra(uploader_name = None)]
pub struct DbCharacter3DModel {
    pub id: i32,
    pub model_id: String,
    pub name: Option<String>,
    pub server_id: String,
    pub credit: Option<String>,
    pub link_path: String,
    pub uploaded_by: Option<i64>,
    pub thumbnail_path: Option<String>,
    pub file_size: i64,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
}

pub struct DbCommunityServerEntry {
    pub server_id: String,
    pub player_id: String,
    pub community_id: uuid::Uuid,
    pub community_name: Option<String>,
    pub community_shorten_name: Option<String>,
    pub community_icon_url: Option<String>,
}

pub struct DbProfileServerStat {
    pub online_count: Option<i64>,
    pub map: Option<String>,
    pub last_started_at: Option<OffsetDateTime>,
    pub last_ended_at: Option<OffsetDateTime>,
}

pub struct DbLinkedName {
    #[allow(dead_code)]
    pub player_id: String,
    pub player_name: String,
    pub total_playtime: Option<PgInterval>,
}

pub struct DbPlayerGlobalPlaytime {
    pub total_playtime: PgInterval,
    pub casual_playtime: PgInterval,
    pub tryhard_playtime: PgInterval,
    pub category: Option<String>,
    pub server_count: i32,
    pub community_count: i32,
    pub global_rank: Option<i64>,
    pub casual_rank: Option<i64>,
    pub tryhard_rank: Option<i64>,
    pub rank_calculated_at: Option<OffsetDateTime>,
    pub calculated_at: Option<OffsetDateTime>,
}

pub struct DbGlobalSums {
    pub total_playtime: Option<PgInterval>,
    pub casual_playtime: Option<PgInterval>,
    pub tryhard_playtime: Option<PgInterval>,
    pub server_count: Option<i64>,
    pub community_count: Option<i64>,
    pub category: Option<String>,
}

pub struct DbGlobalRefreshTarget {
    pub player_id: String,
    pub server_id: String,
}

#[derive(Serialize, Deserialize)]
pub struct DbGlobalMapRankEntry {
    pub player_id: String,
    pub global_position: Option<i64>,
    pub map: Option<String>,
    pub rank: Option<i64>,
}

pub struct DbGuideBanStatus {
    pub reason: String,
    pub expires_at: Option<OffsetDateTime>,
}

pub struct DbMapName {
    pub map_name: String,
}

pub struct DbServerNameMaxPlayers {
    pub server_name: Option<String>,
    pub max_players: Option<i16>,
}

#[derive(DbInto)]
#[auto_serde_with]
#[db_into(ServerRequestAdmin)]
pub struct DbServerRequest {
    #[method(to_string)]
    pub id: Uuid,
    #[method(to_string)]
    pub user_id: i64,
    pub community_name: String,
    pub icon_url: Option<String>,
    #[expr(serde_json::from_value(self.servers).unwrap_or_default())]
    pub servers: serde_json::Value,
    pub game_type: String,
    pub elaboration: Option<String>,
    pub status: String,
    #[expr(self.reviewed_by.map(|id| id.to_string()))]
    pub reviewed_by: Option<i64>,
    pub reviewed_at: Option<OffsetDateTime>,
    pub created_at: OffsetDateTime,
    pub submitter_name: Option<String>,
    pub reviewer_name: Option<String>,
    #[skip]
    pub total_requests: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, Object, Clone)]
pub struct DonorResponse {
    pub id: String,
    pub display_name: String,
    pub amount: f64,
    pub message: Option<String>,
    pub donated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, Object, Clone)]
pub struct CreateDonorPayload {
    pub display_name: String,
    pub amount: f64,
    pub message: Option<String>,
    pub donated_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize, Deserialize, Object, Clone)]
pub struct UpdateDonorPayload {
    pub display_name: Option<String>,
    pub amount: Option<f64>,
    pub message: Option<String>,
    pub donated_at: Option<DateTime<Utc>>,
}


#[derive(Debug, Serialize, Deserialize, Object)]
pub struct CreateCommunityPayload {
    pub name: String,
    pub shorten_name: Option<String>,
    pub icon_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Object)]
pub struct UpdateCommunityPayload {
    pub name: Option<String>,
    pub shorten_name: Option<String>,
    pub icon_url: Option<String>,
}


#[derive(Debug, Serialize, Deserialize, Object, Clone)]
pub struct AdminServerBrowser {
    pub ip: String,
    pub port: i16,
    pub tracking: bool,
    pub cooldown_type: String,
}

#[derive(Debug, Serialize, Deserialize, Object)]
pub struct CreateServerBrowserPayload {
    pub ip: String,
    pub port: i16,
    pub tracking: Option<bool>,
    pub cooldown_type: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Object)]
pub struct UpdateServerBrowserPayload {
    pub tracking: Option<bool>,
    pub cooldown_type: Option<String>,
}

pub struct AdminServerRow {
    pub server_id: String,
    pub server_name: Option<String>,
    pub server_fullname: Option<String>,
    pub server_ip: Option<String>,
    pub server_port: Option<i32>,
    pub community_id: Option<Uuid>,
    pub online: Option<bool>,
    pub readable_link: Option<String>,
    pub server_website: Option<String>,
    pub server_discord_link: Option<String>,
    pub server_source: Option<String>,
    pub timezone: Option<String>,
    pub game: Option<String>,
    pub source_by_id: Option<bool>,
}

impl From<AdminServerRow> for AdminServer {
    fn from(r: AdminServerRow) -> Self {
        AdminServer {
            server_id: r.server_id,
            server_name: r.server_name,
            server_fullname: r.server_fullname,
            server_ip: r.server_ip,
            server_port: r.server_port,
            community_id: r.community_id.map(|u| u.to_string()),
            online: r.online,
            readable_link: r.readable_link,
            server_website: r.server_website,
            server_discord_link: r.server_discord_link,
            server_source: r.server_source,
            timezone: r.timezone,
            game: r.game,
            source_by_id: r.source_by_id,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Object)]
pub struct UpdateServerPayload {
    pub server_name: Option<String>,
    pub readable_link: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Object)]
pub struct UpdateServerMetadataPayload {
    pub server_website: Option<String>,
    pub server_discord_link: Option<String>,
    pub server_source: Option<String>,
    pub timezone: Option<String>,
    pub game: Option<String>,
    pub source_by_id: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Object)]
pub struct SetServerCommunityPayload {
    /// UUID string to assign, or null/empty string to detach
    pub community_id: Option<String>,
}

pub struct DbAdminMapRow {
    pub map_name: String,
    pub total: Option<i64>,
    pub global_is_tryhard: Option<bool>,
    pub global_is_casual: Option<bool>,
    pub global_has_lasers: Option<bool>,
    pub global_workshop_id: Option<i64>,  // nullable because LEFT JOIN (no map_metadata row)
    pub global_resolved_workshop_id: Option<i64>,
}

pub struct DbAdminMapServerRow {
    pub map_name: String,
    pub server_id: String,
    pub server_name: Option<String>,  // server.server_name
    pub is_tryhard: Option<bool>,
    pub is_casual: Option<bool>,
    pub workshop_id: Option<i64>,
    pub resolved_workshop_id: Option<i64>,
    pub no_noms: bool,
    pub min_players: Option<i16>,
    pub max_players: Option<i16>,
}


pub struct DbAuditLogRow {
    pub id: i64,
    pub category: String,
    pub action: String,
    pub map_name: Option<String>,
    pub server_id: Option<String>,
    pub server_name: Option<String>,
    pub user_id: i64,
    pub user_name: Option<String>,
    pub user_avatar: Option<String>,
    pub changes: Value,
    pub created_at: OffsetDateTime,
    pub total: Option<i64>,
}
