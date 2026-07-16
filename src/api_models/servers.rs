use std::cmp::Ordering;
use chrono::{DateTime, Utc};
use poem_openapi::Object;
use poem_openapi::types::{ParseFromJSON, ToJSON, Type};

#[derive(Object)]
pub struct ServerMapMatch{
    pub time_id: i32,
    pub server_id: String,
    pub map: String,
    pub player_count: i16,
    pub started_at: DateTime<Utc>,
    pub zombie_score: Option<i16>,
    pub human_score: Option<i16>,
    pub occurred_at: Option<DateTime<Utc>>,
    pub estimated_time_end: Option<DateTime<Utc>>,
    pub server_time_end: Option<DateTime<Utc>>,
    pub extend_count: Option<i16>,
}

#[derive(Object)]
pub struct ServerCountData{
    pub bucket_time: DateTime<Utc>,
    pub player_count: i32
}

#[derive(Object)]
pub struct ServerMapPlayed{
    pub time_id: i32,
    pub server_id: String,
    pub map: String,
    pub player_count: i32,
    pub started_at: DateTime<Utc>,
    pub ended_at: Option<DateTime<Utc>>,
}

#[derive(Object)]
pub struct ServerMapPlayedPaginated{
    pub total_sessions: i32,
    pub maps: Vec<ServerMapPlayed>
}

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
    pub readable_link: Option<String>,
    pub website: Option<String>,
    pub discord_link: Option<String>,
    pub source: Option<String>,
    pub by_id: bool,
    pub map: Option<String>,
    pub game: Option<String>
}

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
