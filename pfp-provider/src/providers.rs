use std::time::Duration;
use async_trait::async_trait;
use regex::Regex;
use reqwest::{Client, StatusCode};
use serde_json::json;
use anyhow::Result;
use serde::{Deserialize, Serialize};
use tokio::time::sleep;

#[async_trait]
pub trait Provider: Send + Sync {
    async fn get_pfp(&self, uuid: u64) -> Result<String>;
    fn name(&self) -> String;
}

pub struct SteamIdPro {
    client: Client,
}

impl SteamIdPro {
    pub fn new(client: Client) -> Self {
        Self { client }
    }
}

#[async_trait]
impl Provider for SteamIdPro {
    async fn get_pfp(&self, uuid: u64) -> Result<String> {
        let base_url = "https://steamid.pro/lookup";
        let url = format!("{}/{}", base_url, uuid);

        let response = self.client.get(&url).send().await?.text().await?;

        let pattern = r#""image": "https://avatars\.steamstatic\.com/([a-f0-9]+)_full\.jpg""#;
        let regex = Regex::new(pattern)?;

        if let Some(captures) = regex.captures(&response) {
            if let Some(hash) = captures.get(1) {
                return Ok(format!("https://avatars.steamstatic.com/{}_full.jpg", hash.as_str()));
            }
        }

        Ok(String::new())
    }

    fn name(&self) -> String {
        "SteamIdPro".to_string()
    }
}

pub struct PlayerDb {
    client: Client,
}

impl PlayerDb {
    pub fn new(client: Client) -> Self {
        Self { client }
    }
}

#[derive(Serialize, Deserialize)]
struct Meta {
    pub steam2id: String,
    pub steam2id_new: String,
    pub steam3id: String,
    pub steam64id: String,
    pub steamid: String,
    pub communityvisibilitystate: i64,
    pub profilestate: Option<i64>,
    pub personaname: String,
    pub commentpermission: Option<i64>,
    pub profileurl: String,
    pub avatar: String,
    pub avatarmedium: String,
    pub avatarfull: String,
    pub avatarhash: String,
    pub personastate: i64,
}

#[derive(Serialize, Deserialize)]
struct Player {
    pub meta: Meta,
    pub id: String,
    pub avatar: String,
    pub username: String,
    pub cached_at: i64,
}

#[derive(Serialize, Deserialize)]
struct Data {
    // Error responses still carry a `data` object, just an empty one.
    pub player: Option<Player>,
}

#[derive(Serialize, Deserialize)]
struct PlayerDbResponse {
    pub code: String,
    pub message: String,
    pub data: Option<Data>,
    pub success: bool,
}

#[derive(Debug, thiserror::Error)]
enum PlayerDbError{
    #[error("error: {0}")]
    Error(String)
}

#[async_trait]
impl Provider for PlayerDb {
    async fn get_pfp(&self, uuid: u64) -> Result<String> {
        let base_url = "https://playerdb.co/api/player/steam";
        let url = format!("{}/{}", base_url, uuid);

        let response: PlayerDbResponse = self.client.get(&url).send().await?.json().await?;
        if !response.success{
            // A rejected id is a definitive "no picture", not a provider failure.
            if response.code == "steam.invalid_id"{
                return Ok(String::new());
            }
            return Err(PlayerDbError::Error(response.message).into());
        }
        let Some(player) = response.data.and_then(|d| d.player) else {
            return Err(PlayerDbError::Error(response.message).into());
        };
        Ok(player.meta.avatarfull)
    }

    fn name(&self) -> String {
        "PlayerDb".to_string()
    }
}

pub struct SteamIdXyz {
    client: Client,
}

impl SteamIdXyz {
    pub fn new(client: Client) -> Self {
        Self { client }
    }
}

#[async_trait]
impl Provider for SteamIdXyz {
    async fn get_pfp(&self, uuid: u64) -> Result<String> {
        let base_url = "https://steamid.xyz";
        let url = format!("{}/{}", base_url, uuid);

        let response = self.client
            .get(&url)
            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36")
            .send()
            .await?
            .text()
            .await?;

        let pattern = r#"src="https://avatars\.steamstatic\.com/([a-f0-9]+)_full\.jpg""#;
        let regex = Regex::new(pattern)?;

        if let Some(captures) = regex.captures(&response) {
            if let Some(hash) = captures.get(1) {
                return Ok(format!("https://avatars.steamstatic.com/{}_full.jpg", hash.as_str()));
            }
        }

        Ok(String::new())
    }

    fn name(&self) -> String {
        "SteamIdXyz".to_string()
    }
}

pub struct TradeItProvider {
    client: Client,
}

impl TradeItProvider {
    pub fn new(client: Client) -> Self {
        Self { client }
    }
}

#[async_trait]
impl Provider for TradeItProvider {
    async fn get_pfp(&self, uuid: u64) -> Result<String> {
        let base_url = "https://tradeit.gg/api/steam/v1/steams/id-finder";

        let payload = json!({
            "id": format!("{}", uuid)
        });

        let response = self.client
            .post(base_url)
            .json(&payload)
            .send()
            .await?
            .json::<serde_json::Value>()
            .await?;

        if let Some(avatar) = response.get("avatar") {
            if let Some(large) = avatar.get("large") {
                if let Some(url) = large.as_str() {
                    return Ok(url.to_string());
                }
            }
        }

        Ok(String::new())
    }

    fn name(&self) -> String {
        "TradeItProvider".to_string()
    }
}

pub struct SteamOfficialApi {
    client: Client,
    api_key: String,
}

#[derive(Deserialize)]
#[allow(dead_code)]
struct SteamProfile {
    pub steamid: String,
    pub communityvisibilitystate: i64,
    pub profilestate: Option<i64>,
    pub personaname: String,
    pub commentpermission: Option<i64>,
    pub profileurl: String,
    pub avatar: String,
    pub avatarmedium: String,
    pub avatarfull: String,
    pub avatarhash: String,
    pub personastate: i64,
}

#[derive(Deserialize)]
struct SteamProfileResponse {
    pub players: Vec<SteamProfile>,
}

#[derive(Deserialize)]
struct SteamApiResponse {
    pub response: SteamProfileResponse,
}

impl SteamOfficialApi {
    pub fn new(client: Client, api_key: String) -> Self {
        Self { client, api_key }
    }
}

#[async_trait]
impl Provider for SteamOfficialApi {
    async fn get_pfp(&self, uuid: u64) -> Result<String> {
        let base_url = "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/";
        let mut attempt = 0;
        let max_backoff = 300;

        loop {
            let res = self.client
                .get(base_url)
                .query(&[
                    ("key", &self.api_key),
                    ("steamids", &uuid.to_string())
                ])
                .send()
                .await;

            match res {
                Ok(resp) => {
                    if resp.status().is_success() {
                        let response = resp.json::<SteamApiResponse>().await?;
                        let Some(profile) = response.response.players.first() else {
                            return Ok(String::new());
                        };
                        return Ok(profile.avatarfull.clone());
                    } else if resp.status() == StatusCode::TOO_MANY_REQUESTS.as_u16() {
                        attempt += 1;
                        let backoff = Duration::from_secs(2u64.pow(attempt).min(max_backoff));
                        sleep(backoff).await;
                        continue;
                    } else {
                        return Err(anyhow::anyhow!("Failed with status: {}", resp.status()));
                    }
                }
                Err(e) => {
                    attempt += 1;
                    let backoff = Duration::from_secs(2u64.pow(attempt).min(max_backoff));
                    if attempt > 7 {
                        return Err(anyhow::anyhow!("Request failed after retries: {}", e));
                    }
                    sleep(backoff).await;
                    continue;
                }
            }
        }
    }

    fn name(&self) -> String {
        "SteamOfficialApi".to_string()
    }
}