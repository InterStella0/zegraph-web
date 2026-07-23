use std::cmp::Ordering;
use chrono::{DateTime, Utc};
use poem_openapi::Object;
use poem_openapi::types::{ParseFromJSON, ToJSON, Type};

/// A single map session's live or final match (round) result.
#[derive(Object)]
pub struct ServerMapMatch{
    /// Unique ID of the map session this match belongs to.
    pub time_id: i32,
    pub server_id: String,
    pub map: String,
    pub player_count: i16,
    pub started_at: DateTime<Utc>,
    /// `None` if the match hasn't produced a score yet.
    pub zombie_score: Option<i16>,
    pub human_score: Option<i16>,
    /// When this match result was recorded.
    pub occurred_at: Option<DateTime<Utc>>,
    pub estimated_time_end: Option<DateTime<Utc>>,
    pub server_time_end: Option<DateTime<Utc>>,
    /// Number of times the match's time limit was extended, if applicable.
    pub extend_count: Option<i16>,
}

/// One bucket of a player-count-over-time chart.
#[derive(Object)]
pub struct ServerCountData{
    pub bucket_time: DateTime<Utc>,
    pub player_count: i32
}

/// A single map-play session.
#[derive(Object)]
pub struct ServerMapPlayed{
    /// Unique ID of this map session.
    pub time_id: i32,
    pub server_id: String,
    pub map: String,
    pub player_count: i32,
    pub started_at: DateTime<Utc>,
    /// `None` while the map is still being played.
    pub ended_at: Option<DateTime<Utc>>,
}

/// A page of a server's map-play sessions.
#[derive(Object)]
pub struct ServerMapPlayedPaginated{
    pub total_sessions: i32,
    pub maps: Vec<ServerMapPlayed>
}

/// A tracked ZE server, as shown in the frontend's server list.
#[derive(Object)]
pub struct Server{
    pub id: String,
    pub name: String,
    pub server_name: String,
    pub player_count: u16,
    pub max_players: u16,
    pub ip: String,
    pub port: u16,
    pub online: bool,
    /// Short vanity slug used in URLs, if the server has one configured.
    pub readable_link: Option<String>,
    pub website: Option<String>,
    pub discord_link: Option<String>,
    pub source: Option<String>,
    /// Whether players on this server are tracked by Steam ID (`true`) rather than only by name.
    pub by_id: bool,
    /// Map currently being played, if the server is online.
    pub map: Option<String>,
    pub game: Option<String>,
    /// When this server first appeared in tracking data. `None` if it has no sessions yet.
    pub tracking_since: Option<DateTime<Utc>>
}

/// A community and its servers, generic over the server representation used.
#[derive(Object)]
pub struct BaseCommunity<T: Sync + Send + Type + ParseFromJSON + ToJSON>{
    pub id: String,
    pub name: String,
    pub shorten_name: Option<String>,
    pub icon_url: Option<String>,
    pub servers: Vec<T>
}

pub type Community = BaseCommunity<Server>;

impl Eq for Community {

}

impl PartialEq<Self> for Community {
    fn eq(&self, other: &Self) -> bool {
        &self.id == &other.id
    }
}

impl PartialOrd<Self> for Community {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Option::from(self.id.cmp(&other.id))
    }
}

impl Ord for Community{
    fn cmp(&self, other: &Self) -> Ordering {
        self.id.cmp(&other.id)
    }
}
