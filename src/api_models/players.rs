use std::fmt::Display;
use chrono::{DateTime, Utc};
use poem_openapi::{Enum, Object, Union};
use serde::{Deserialize, Serialize};
use crate::api_models::maps::MapRank;
use crate::api_models::misc::UserAnonymization;
use crate::api_models::servers::BaseCommunity;

/// A player's playtime and rank across every category, on one server.
#[derive(Object)]
pub struct PlayerRanks{
    /// Cross-community rank from the player's global profile; null while unranked.
    pub global_playtime: Option<i64>,
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
    pub calculated_at: Option<DateTime<Utc>>,
    /// The server's own lifetime playtime counter, when it publishes one. `total_playtime` already
    /// includes `playtime_correction`; it is all-time only and absent when a `period` is requested.
    pub external_playtime: Option<ExternalPlaytime>,
    /// Flagged as a bot. Bots are left out of rankings and online lists, so `rank` and `ranks` are
    /// empty for them.
    pub is_bot: bool,
}

/// Lifetime playtime reported by the game server itself.
#[derive(Object, Clone, Debug, PartialEq)]
pub struct ExternalPlaytime{
    pub source: String,
    /// Seconds, as reported at `fetched_at`.
    pub external_total: f64,
    pub fetched_at: DateTime<Utc>,
    /// Seconds added to the tracked playtime so it matched `external_total` at `fetched_at`. Can be negative.
    pub playtime_correction: f64,
    /// Seconds of playtime in our own session history, before `playtime_correction` is added.
    pub tracked_playtime: f64,
    /// Where `source` publishes this figure, from the server's `external_source_url`, with
    /// `{player_id}` replaced by the player's ID.
    pub source_url: Option<String>,
}

impl DetailedPlayer{
    pub fn apply_external_playtime(&mut self, mut external: ExternalPlaytime){
        external.tracked_playtime = self.total_playtime;
        self.total_playtime = (self.total_playtime + external.playtime_correction).max(0.0);
        self.external_playtime = Some(external);
    }
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
    /// Flagged as a bot. Only appears in a name search, with `rank` -1.
    pub is_bot: bool,
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
    pub last_seen: Option<DateTime<Utc>>,
    pub is_anonymous: bool,
    pub hidden_from_others: bool,
}

/// A page of who a player has played with on a server.
#[derive(Object)]
pub struct PlayerMightFriendsPage{
    pub total_pages: i64,
    pub rows: Vec<PlayerSeen>,
    pub calculated_at: Option<DateTime<Utc>>,
    pub is_stale: bool,
    pub is_calculating: bool,
    pub live_search: bool,
}

/// What a request to recalculate a player's "played with" list did.
#[derive(Enum, Clone, Copy, PartialEq, Debug)]
#[oai(rename_all = "snake_case")]
pub enum MightFriendsCalculateStatus{
    NoSessions,
    UpToDate,
    Calculating,
    Queued,
}

/// The result of a request to recalculate a player's "played with" list.
#[derive(Object)]
pub struct MightFriendsCalculation{
    pub status: MightFriendsCalculateStatus,
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

/// Stats a game server publishes about a player, tagged by `source` (see `PlayerApi::get_external_stats`).
#[derive(Union)]
#[oai(discriminator_name = "source", one_of)]
pub enum PlayerExternalStats {
    #[oai(mapping = "gfl")]
    Gfl(GflPlayerStats),
    #[oai(mapping = "nide")]
    Nide(NidePlayerStats),
    #[oai(mapping = "mapeadores")]
    Mapeadores(MapeadoresPlayerStats),
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum ExternalStatsSource {
    Gfl,
    Nide,
    Mapeadores,
}

impl ExternalStatsSource {
    pub fn for_server(server_id: &str) -> Option<Self> {
        match server_id {
            "85568392935951359" => Some(Self::Gfl),
            "7ae2ca188ebf8be21d4f42b2827153ac" => Some(Self::Nide),
            "674b592b744afc3c108d345a" => Some(Self::Mapeadores),
            _ => None,
        }
    }
}

/// NiDE's own leaderboard stats for a player.
#[derive(Object)]
pub struct NidePlayerStats {
    /// Name on NiDE's leaderboard.
    pub name: Option<String>,
    pub points: Option<i32>,
    /// NiDE's leaderboard rank.
    pub rank: Option<i32>,
    pub kills: Option<i32>,
    pub deaths: Option<i32>,
    pub kills_per_death: Option<f64>,
    pub kills_per_minute: Option<f64>,
    pub headshots: Option<i32>,
    /// Ratio, 0 to 1.
    pub headshots_per_kill: Option<f64>,
    pub shots_per_kill: Option<f64>,
    /// Percentage, 0 to 100.
    pub weapon_accuracy: Option<f64>,
    pub longest_kill_streak: Option<i32>,
    pub longest_death_streak: Option<i32>,
    /// Lifetime playtime in seconds, as reported by NiDE.
    pub playtime: Option<i64>,
    /// Country name, in English, as reported by NiDE.
    pub country: Option<String>,
    pub country_code: Option<String>,
    pub updated_at: Option<DateTime<Utc>>,
}

/// Mapeadores' VIP playtime leaderboard entry for a player.
#[derive(Object)]
pub struct MapeadoresPlayerStats {
    /// Name on Mapeadores' leaderboard.
    pub name: String,
    /// Lifetime playtime in seconds, as reported by Mapeadores.
    pub playtime: i64,
    /// Position on the Mapeadores leaderboard.
    pub position: i32,
    pub is_supporter: bool,
    pub fetched_at: DateTime<Utc>,
}

/// Legacy GFL CS:GO leaderboard stats and ranks.
#[derive(Object)]
pub struct GflPlayerStats {
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
    /// Steam name when GFL last recorded the player.
    pub personaname: Option<String>,
    /// When GFL last recorded the player.
    pub last_seen: Option<DateTime<Utc>>,
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
    pub id: String,
    pub infractions: Vec<PlayerInfraction>,
}

/// A player's Steam avatar at two sizes.
#[derive(Object, Clone)]
pub struct PlayerProfilePicture{
    pub id: String,
    pub full: String,
    pub medium: String,
}

impl PlayerProfilePicture {
    pub fn from_full_url(id: String, full: String) -> Self {
        let medium = match full.split_once("_full"){
            Some((medium, ext)) => format!("{medium}_medium{ext}"),
            None => full.clone()
        };
        PlayerProfilePicture{ id, full, medium }
    }
}

/// Cosmetics a player has equipped on their Steam profile. Every URL is absolute; slots the
/// player has nothing equipped in are null.
#[derive(Object, Serialize, Deserialize, Clone, Default)]
pub struct SteamProfileItems{
    /// Transparent PNG (often animated) drawn over the avatar, slightly larger than it.
    pub avatar_frame: Option<String>,
    /// Animated GIF that Steam shows in place of the static avatar.
    pub animated_avatar: Option<String>,
    pub profile_background: Option<SteamProfileBackground>,
    pub mini_profile_background: Option<SteamProfileBackground>,
}

/// A Steam profile background: a still image, plus videos when the background is animated.
#[derive(Object, Serialize, Deserialize, Clone)]
pub struct SteamProfileBackground{
    pub image: String,
    pub video_webm: Option<String>,
    pub video_mp4: Option<String>,
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
    /// Flagged as a bot.
    pub(crate) is_bot: bool,
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

/// What `POST /accounts/me/merge` moved.
#[derive(Object)]
pub struct MergeAccountsResult {
    pub merged_profiles: i64,
    pub sessions_moved: i64,
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
    /// Linked name-tracked profiles on this server not yet merged into the account. Only
    /// counted for the profile's owner.
    pub mergeable_count: i64,
    /// The player's last few sessions on this server, oldest first.
    pub recent_sessions: Vec<ProfileRecentSession>,
}

pub type ProfileCommunityDetail = BaseCommunity<ProfileServerEntry>;

/// A player's best map ranking, and its position among every player's best rank.
///
/// Only maps with more than 5 hours of playtime count. The best map is the one where the player's rank is the
/// smallest fraction of the players with more than 5 hours on it, ties going to the most playtime.
#[derive(Object)]
pub struct GlobalMapRank {
    /// This player's position among all players, ordered by that best rank fraction.
    pub position: i64,
    pub map: String,
    /// The player's rank on `map` among the players with more than 5 hours on it.
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
    /// Playtime per community, largest first. A community the player anonymized is left out unless
    /// the requester is that player, a superuser, or an admin of that community.
    pub communities: Vec<PlayerCommunityPlaytime>,
    /// Null when the picture is not cached yet; `/players/pfps` resolves it.
    pub pfp: Option<PlayerProfilePicture>,
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
    /// Whether the requester may read and change this user's anonymization settings: the owner, or
    /// a superuser acting on their behalf. Drives whether the profile page shows the toggles.
    pub can_manage_anonymization: bool,
    /// Only populated when `can_manage_anonymization` is true.
    pub anonymization: Option<Vec<UserAnonymization>>,
    /// Cosmetics equipped on the user's Steam profile. Null for users this site has never recorded,
    /// and when Steam didn't answer in time; a later request picks up the cached result.
    pub steam_items: Option<SteamProfileItems>,
}

/// Aggregate playtime/player/country counts for a server.
#[derive(Object, Clone)]
pub struct PlayersStatistic{
    /// Sum of every player's individual playtime (player-hours, not wall-clock time).
    pub total_cum_playtime: f64,
    pub total_players: i64,
    pub countries: i64
}

/// Whether a name-tracked profile can be claimed, and where any claim on it stands.
///
/// Drives the "Claim this profile" control on the player page.
#[derive(Object)]
pub struct PlayerClaimState {
    /// True when the server tracks by name, the profile is a name row, and it is not yet linked.
    pub claimable: bool,
    /// True when a claim on this profile is awaiting review, from anyone.
    pub pending: bool,
    /// Status of the requester's own most recent claim on this profile, if they have made one.
    pub own_status: Option<String>,
    /// The Steam ID this profile is already linked to, if any.
    pub associated_player_id: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn player(total_playtime: f64) -> DetailedPlayer {
        DetailedPlayer {
            id: "76561198000000000".into(),
            name: "test".into(),
            aliases: vec![],
            created_at: DateTime::<Utc>::MIN_UTC,
            category: None,
            tryhard_playtime: 0.0,
            casual_playtime: 0.0,
            mixed_playtime: 0.0,
            total_playtime,
            rank: 0,
            ranks: None,
            associated_player_id: None,
            is_stale: false,
            calculated_at: None,
            external_playtime: None,
            is_bot: false,
        }
    }

    fn external(playtime_correction: f64) -> ExternalPlaytime {
        ExternalPlaytime {
            source: "nide".into(),
            external_total: 0.0,
            fetched_at: DateTime::<Utc>::MIN_UTC,
            playtime_correction,
            tracked_playtime: 0.0,
            source_url: None,
        }
    }

    #[test]
    fn a_positive_correction_adds_untracked_time() {
        let mut detail = player(3600.0);
        detail.apply_external_playtime(external(7200.0));
        assert_eq!(detail.total_playtime, 10800.0);
        assert_eq!(detail.external_playtime, Some(ExternalPlaytime { tracked_playtime: 3600.0, ..external(7200.0) }));
    }

    #[test]
    fn a_negative_correction_lowers_the_total() {
        let mut detail = player(10800.0);
        detail.apply_external_playtime(external(-3600.0));
        assert_eq!(detail.total_playtime, 7200.0);
    }

    #[test]
    fn external_stats_sources_are_per_server() {
        assert_eq!(ExternalStatsSource::for_server("85568392935951359"), Some(ExternalStatsSource::Gfl));
        assert_eq!(ExternalStatsSource::for_server("7ae2ca188ebf8be21d4f42b2827153ac"), Some(ExternalStatsSource::Nide));
        assert_eq!(ExternalStatsSource::for_server("674b592b744afc3c108d345a"), Some(ExternalStatsSource::Mapeadores));
        assert_eq!(ExternalStatsSource::for_server("unknown"), None);
    }

    #[test]
    fn external_stats_are_tagged_with_their_source() {
        use poem_openapi::types::ToJSON;
        let stats = PlayerExternalStats::Mapeadores(MapeadoresPlayerStats {
            name: "Rold".into(),
            playtime: 3600,
            position: 1,
            is_supporter: true,
            fetched_at: DateTime::<Utc>::MIN_UTC,
        });
        let json = stats.to_json().expect("serializable");
        assert_eq!(json["source"], "mapeadores");
        assert_eq!(json["playtime"], 3600);
    }

    #[test]
    fn the_total_never_goes_below_zero() {
        let mut detail = player(1800.0);
        detail.apply_external_playtime(external(-3600.0));
        assert_eq!(detail.total_playtime, 0.0);
    }

    #[test]
    fn a_clamped_total_keeps_the_tracked_playtime() {
        let mut detail = player(1800.0);
        detail.apply_external_playtime(external(-3600.0));
        assert_eq!(detail.external_playtime.map(|e| e.tracked_playtime), Some(1800.0));
    }
}
