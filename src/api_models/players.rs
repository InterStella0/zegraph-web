use std::fmt::Display;
use chrono::{DateTime, Utc};
use poem_openapi::{Enum, Object};
use crate::api_models::maps::MapRank;
use crate::api_models::misc::UserAnonymization;
use crate::api_models::servers::BaseCommunity;

/// A player's playtime and rank across every category, on one server.
#[derive(Object)]
pub struct PlayerRanks{
    pub global_playtime: i64,
    pub server_playtime: i64,
    pub casual_playtime: i64,
    pub tryhard_playtime: i64,
    pub mixed_playtime: i64,
    pub highest_map_rank: Option<MapRank>,
}
/// Full player profile for a single server, as shown on a player's detail page.
#[derive(Object)]
pub struct DetailedPlayer{
    pub id: String,
    pub name: String,
    /// Previous names this player (or a name-only alias merged into them) has used.
    pub aliases: Vec<PlayerAlias>,
    pub created_at: DateTime<Utc>,
    pub category: Option<String>,
    pub tryhard_playtime: f64,
    pub casual_playtime: f64,
    pub mixed_playtime: f64,
    pub total_playtime: f64,
    pub rank: i64,
    pub ranks: Option<PlayerRanks>,
    /// Canonical player ID this record has been merged into, if it's a name-only alias.
    pub associated_player_id: Option<String>,
    pub is_stale: bool,
    pub calculated_at: Option<DateTime<Utc>>
}

#[derive(Object)]
pub struct PlayerAlias{
    pub name: String,
    pub created_at: DateTime<Utc>,
}

/// A page of a player leaderboard.
#[derive(Object)]
pub struct BriefPlayers {
    pub total_players: i64,
    pub players: Vec<PlayerBrief>
}
/// A player's row in the ranked players table.
#[derive(Object)]
pub struct PlayerTableRank{
    pub rank: i64,
    pub id: String,
    pub name: String,
    pub tryhard_playtime: f64,
    pub casual_playtime: f64,
    pub mixed_playtime: f64,
    pub total_playtime: f64,
    pub is_anonymous: bool,
    /// `true` when this player opted into anonymization for this community, regardless of whether
    /// the requester is allowed to see the real name. `is_anonymous` says "this row is masked for
    /// you"; this says "the public sees Anonymous here". The frontend renders a `(Hidden)` marker
    /// off it so a privileged viewer isn't fooled into thinking their toggle did nothing.
    pub hidden_from_others: bool,
}
/// A page of the ranked players table.
#[derive(Object)]
pub struct PlayersTableRanked{
    pub total_players: i64,
    pub players: Vec<PlayerTableRank>
}
/// A player's summary row, as shown in a leaderboard or session list.
#[derive(Object)]
pub struct PlayerBrief{
    pub id: String,
    pub name: String,
    pub created_at: DateTime<Utc>,
    pub total_playtime: f64,
    pub rank: i64,
    /// Set if the player is currently connected.
    pub online_since: Option<DateTime<Utc>>,
    pub last_played: DateTime<Utc>,
    /// End of that session; null while the player is still in it.
    pub last_played_ended: Option<DateTime<Utc>>,
    pub last_played_duration: f64,
    pub is_anonymous: bool,
    /// `true` when this player opted into anonymization for this community, regardless of whether
    /// the requester is allowed to see the real name. `is_anonymous` says "this row is masked for
    /// you"; this says "the public sees Anonymous here". The frontend renders a `(Hidden)` marker
    /// off it so a privileged viewer isn't fooled into thinking their toggle did nothing.
    pub hidden_from_others: bool,
}

/// A single match (round) result within a map session, embedded on a player's session history.
#[derive(Object)]
pub struct MatchData {
    pub zombie_score: i16,
    pub human_score: i16,
    pub occurred_at: DateTime<Utc>,
    pub extend_count: i16,
}

/// A map played during a player's session, with any matches (rounds) that occurred.
#[derive(Object)]
pub struct PlayerSessionMapPlayed{
    pub time_id: i32,
    pub server_id: String,
    pub map: String,
    pub player_count: i32,
    pub started_at: DateTime<Utc>,
    pub ended_at: Option<DateTime<Utc>>,
    pub match_data: Vec<MatchData>
}

#[derive(Object)]
pub struct PlayerMostPlayedMap{
    pub map: String,
    pub duration: f64,
    pub rank: i64,
}

/// Time a player spent in one geographic region.
#[derive(Object)]
pub struct PlayerRegionTime{
    pub id: i16,
    pub name: String,
    pub duration: f64,
}

/// A player's session, as shown in a "currently playing" list.
#[derive(Object)]
pub struct PlayerDetailSession{
    pub id: String,
    pub session_id: String,
    pub name: String,
    pub started_at: DateTime<Utc>,
    /// `None` while the session is still active.
    pub ended_at: Option<DateTime<Utc>>,
    pub is_anonymous: bool,
    /// `true` when this player opted into anonymization for this community, regardless of whether
    /// the requester is allowed to see the real name. `is_anonymous` says "this row is masked for
    /// you"; this says "the public sees Anonymous here". The frontend renders a `(Hidden)` marker
    /// off it so a privileged viewer isn't fooled into thinking their toggle did nothing.
    pub hidden_from_others: bool,
}

/// A player session paired with which server it's on (used for global "currently playing" lists).
#[derive(Object)]
pub struct PlayerDetailSessionCommunity{
    pub player_detail: PlayerDetailSession,
    pub server_id: String,
}

/// A single player session.
#[derive(Object)]
pub struct PlayerSession{
    pub id: String,
    pub server_id: String,
    pub player_id: String,
    pub started_at: DateTime<Utc>,
    /// `None` while the session is still active.
    pub ended_at: Option<DateTime<Utc>>,
    /// Last time the scraper confirmed this session was still active.
    pub last_verified: Option<DateTime<Utc>>
}

/// A player who was likely playing alongside another player (see `might_friends`).
#[derive(Object)]
pub struct PlayerSeen{
    pub id: String,
    pub name: String,
    pub total_time_together: f64,
    pub last_seen: DateTime<Utc>,
}

/// A page of a player's session list.
#[derive(Object)]
pub struct PlayerSessionPage{
    pub total_pages: i64,
    pub rows: Vec<PlayerSession>
}

/// A single player session, carrying the server and community it happened on.
///
/// Unlike `PlayerSession` this is not scoped to one server, so each row has to identify where it
/// took place — that's what the global profile's session list shows.
#[derive(Object)]
pub struct GlobalPlayerSession{
    pub id: String,
    pub player_id: String,
    pub server_id: String,
    pub server_name: Option<String>,
    pub community_name: Option<String>,
    pub community_icon_url: Option<String>,
    pub started_at: DateTime<Utc>,
    /// `None` while the session is still active.
    pub ended_at: Option<DateTime<Utc>>,
}

/// A page of a player's cross-server session list.
#[derive(Object)]
pub struct GlobalPlayerSessionPage{
    pub total_pages: i64,
    pub rows: Vec<GlobalPlayerSession>
}

/// One bucket of a player's playtime-over-time chart.
#[derive(Object)]
pub struct PlayerSessionTime{
    pub bucket_time: DateTime<Utc>,
    pub hours: f64,
}


/// Connect/disconnect event type, for hour-of-day breakdowns.
#[derive(Enum)]
pub enum EventType{
    Join,
    Leave
}

impl Display for EventType{
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let result = match self {
            EventType::Join => "join",
            EventType::Leave => "leave"
        };
        write!(f, "{}", String::from(result))
    }
}

/// Count of join/leave events in one hour of the day, summed across all days.
#[derive(Object)]
pub struct PlayerHourDay{
    pub event_type: EventType,
    pub hour: u8,
    pub count: i64,
}

/// A player's typical online activity for one hour of the day.
#[derive(Object)]
pub struct PlayerOnlineHeatmap{
    pub hour_of_day: i32,
    pub hours_online: f64,
    pub online_count: i64,
}

/// Legacy GFL CS:GO leaderboard stats and ranks (see `PlayerApi::get_legacy_stats`).
#[derive(Object)]
pub struct PlayerWithLegacyRanks {
    pub steamid64: String,
    pub points: f64,
    pub human_time: i64,
    pub zombie_time: i64,
    pub zombie_killed: i32,
    pub headshot: i32,
    pub infected_time: i32,
    pub item_usage: i32,
    pub boss_killed: i32,
    pub leader_count: i32,
    pub td_count: i32,
    pub rank_total_playtime: i64,
    pub rank_points: i64,
    pub rank_human_time: i64,
    pub rank_zombie_time: i64,
    pub rank_zombie_killed: i64,
    pub rank_headshot: i64,
    pub rank_infected_time: i64,
    pub rank_item_usage: i64,
    pub rank_boss_killed: i64,
    pub rank_leader_count: i64,
    pub rank_td_count: i64,
}

/// A single ban/mute record from an anti-cheat or ban-tracking source.
#[derive(Object)]
pub struct PlayerInfraction{
    pub id: String,
    /// Which external system this infraction came from (e.g. GFLBans).
    pub source: String,
    /// Name of the admin who issued it.
    pub by: String,
    pub reason: Option<String>,
    pub infraction_time: Option<DateTime<Utc>>,
    /// Bitflags describing the infraction type, defined by the source system.
    pub flags: i64,
    pub admin_avatar: Option<String>
}

#[derive(Object)]
pub struct PlayerInfractionUpdate{
    pub id: i64,
    pub infractions: Vec<PlayerInfraction>,
}

/// A player's Steam avatar at two sizes.
#[derive(Object)]
pub struct PlayerProfilePicture{
    pub id: String,
    pub full: String,
    pub medium: String,
}

/// An autocomplete search result.
#[derive(Object)]
pub struct SearchPlayer{
    pub(crate) name: String,
    pub(crate) id: String,
    pub(crate) is_anonymous: bool,
    /// `true` when this player opted into anonymization for this community, regardless of whether
    /// the requester is allowed to see the real name. `is_anonymous` says "this row is masked for
    /// you"; this says "the public sees Anonymous here". The frontend renders a `(Hidden)` marker
    /// off it so a privileged viewer isn't fooled into thinking their toggle did nothing.
    pub(crate) hidden_from_others: bool,
}

/// A player's detail on one server, paired with which server it's on.
#[derive(Object)]
pub struct ServerPlayerDetail {
    pub server_id: String,
    pub server_name: String,
    pub player: DetailedPlayer,
}

pub type CommunityPlayerDetail = BaseCommunity<ServerPlayerDetail>;

/// A name-only alias linked to a player's profile, for servers that don't track by Steam ID.
#[derive(Object)]
pub struct LinkedName {
    pub name: String,
    pub total_playtime: f64,
    /// Whether this is the name currently in use.
    pub is_current: bool,
}

/// One of a player's recent sessions on a server, for the profile activity strip.
#[derive(Object)]
pub struct ProfileRecentSession {
    pub started_at: DateTime<Utc>,
    pub ended_at: Option<DateTime<Utc>>,
    /// Session length in seconds; elapsed-so-far for a session still running.
    pub duration: f64,
}

/// A player's profile detail on one server, for the public profile page.
#[derive(Object)]
pub struct ProfileServerEntry {
    pub server_id: String,
    pub server_name: String,
    /// Whether this server tracks players by Steam ID rather than only by name.
    pub by_id: bool,
    pub is_online: bool,
    pub last_played: Option<DateTime<Utc>>,
    pub last_played_duration: Option<f64>,
    pub player: DetailedPlayer,
    /// Other names this player has used on this server, if not tracked by Steam ID.
    pub linked_names: Vec<LinkedName>,
    /// The player's last few sessions on this server, oldest first.
    pub recent_sessions: Vec<ProfileRecentSession>,
}

pub type ProfileCommunityDetail = BaseCommunity<ProfileServerEntry>;

/// A player's best map ranking, and its position among every player's best rank.
#[derive(Object)]
pub struct GlobalMapRank {
    /// This player's position among all players ranked by their single best map rank.
    pub position: i64,
    pub map: String,
    /// The player's rank on `map` itself.
    pub rank: i64,
}

/// A player's playtime and rank summed across every server they've played on.
#[derive(Object, Clone, Default)]
pub struct GlobalPlaytimeSummary {
    pub total_playtime: f64,
    pub casual_playtime: f64,
    pub tryhard_playtime: f64,
    pub category: Option<String>,
    pub rank: Option<i64>,
    pub casual_rank: Option<i64>,
    pub tryhard_rank: Option<i64>,
    pub total_ranked_players: i64,
    pub server_count: i64,
    pub community_count: i64,
    /// Whether this summary is stale and due for recalculation.
    pub is_outdated: bool,
    /// Whether a recalculation is currently in progress.
    pub is_calculating: bool,
    pub calculated_at: Option<DateTime<Utc>>,
    pub rank_calculated_at: Option<DateTime<Utc>>,
}

/// One segment of the per-player "hours split" bar: how much of the player's time lives in one
/// community, across all their linked accounts.
#[derive(Object, Clone)]
pub struct PlayerCommunityPlaytime {
    pub community_id: String,
    pub community_name: String,
    pub icon_url: Option<String>,
    pub total_playtime: f64,
}

/// One row of the global, cross-community player list.
#[derive(Object, Clone)]
pub struct GlobalPlayerBrief {
    pub id: String,
    pub name: String,
    pub total_playtime: f64,
    /// -1 when the player has no `website.player_global_playtime` row yet.
    pub rank: i64,
    pub online_since: Option<DateTime<Utc>>,
    pub last_played: DateTime<Utc>,
    pub last_community_id: Option<String>,
    pub server_count: i64,
    pub game: Option<String>,
}

/// A page of the global, cross-community player list.
#[derive(Object)]
pub struct GlobalBriefPlayers {
    pub total_players: i64,
    pub players: Vec<GlobalPlayerBrief>,
}

/// Aggregate stats shown at the top of a public profile page.
#[derive(Object)]
pub struct ProfileSummary {
    pub total_playtime: f64,
    pub community_count: i64,
    pub server_count: i64,
    pub is_online: bool,
    pub last_online: Option<DateTime<Utc>>,
    pub last_session_duration: Option<f64>,
    pub best_rank: Option<GlobalMapRank>,
    pub global: GlobalPlaytimeSummary,
}

/// A user's public profile page.
#[derive(Object)]
pub struct ProfileResponse {
    /// String rather than a numeric type to avoid precision loss on large Steam IDs in JS.
    pub steamid: String,
    /// `"Anonymous"` if every community this user appears in has them anonymized and the
    /// requester isn't the owner, a superuser, or an admin of a visible community.
    pub name: Option<String>,
    pub summary: ProfileSummary,
    pub communities: Vec<ProfileCommunityDetail>,
    /// Whether the requester is viewing their own profile.
    pub is_owner: bool,
    /// Only populated when `is_owner` is true.
    pub anonymization: Option<Vec<UserAnonymization>>,
}

/// Aggregate playtime/player/country counts for a server.
#[derive(Object, Clone)]
pub struct PlayersStatistic{
    /// Sum of every player's individual playtime (player-hours, not wall-clock time).
    pub total_cum_playtime: f64,
    pub total_players: i64,
    pub countries: i64
}
