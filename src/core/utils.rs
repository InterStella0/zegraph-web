use std::collections::HashMap;
use std::env;
use std::fmt::Display;
use std::future::Future;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use chrono::{DateTime, Utc};
use deadpool_redis::Pool;
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use poem::{FromRequest, Request};
use poem::http::StatusCode;
use poem_openapi::{Enum, Object};
use poem_openapi::auth::{Bearer, BearerAuthorization};
use poem_openapi::types::{ParseFromJSON, ToJSON};
use rand::distr::Alphanumeric;
use rand::RngExt;
use redis::{RedisResult, ValueComparison};
use redis::AsyncCommands;
use rust_fuzzy_search::fuzzy_search_threshold;
use serde::{Deserialize, Serialize};
use serde::de::DeserializeOwned;
use sqlx::{postgres::types::PgInterval, types::time::{Date, OffsetDateTime, Time, UtcOffset}, Postgres};
use sqlx::postgres::types::PgTimeTz;
use uuid::Uuid;
use crate::{response, FastCache, AppData};
use crate::api_models::common::*;
use crate::api_models::misc::ProviderResponse;
use crate::api_models::players::PlayerBrief;
use crate::api_models::radars::CountryPlayer;
use crate::models::players::DbPlayerBrief;
use crate::models::servers::DbServer;
use crate::workers::*;

pub const HOUR: u64 = 60 * 60;
pub const DAY: u64 = 24 * 60 * 60;
pub fn get_env(name: &str) -> String{
    env::var(name).expect(&format!("Couldn't load environment '{name}'"))
}
pub const ISSUER: &str = "ze-graph";

pub struct UserToken{
    pub id: i64,
    #[allow(dead_code)]
    pub global_name: String,
}

fn parse_user_from_token(token: &str) -> Option<UserToken> {
    let mut validation = Validation::new(Algorithm::HS256);
    validation.set_issuer(&[ISSUER]);

    if let Some(token_data) = decode::<Claims>(
        token,
        &DecodingKey::from_secret(get_env("NEXTAUTH_SECRET").as_ref()),
        &validation
    ).ok() {
        let Ok(id) = token_data.claims.sub.parse::<i64>() else {
            return None
        };
        let token = UserToken { id, global_name: token_data.claims.name };
        return Some(token)
    }
    None
}

pub struct TokenBearer(pub UserToken);
impl<'a> FromRequest<'a> for TokenBearer {
    async fn from_request(req: &'a Request, _body: &mut poem::RequestBody) -> poem::Result<Self> {
        <Self as BearerAuthorization>::from_request(req)
    }
}

impl BearerAuthorization for TokenBearer {
    fn from_request(req: &Request) -> poem::Result<Self> {
        let bearer = Bearer::from_request(req)?;
        let user_token = parse_user_from_token(&bearer.token)
            .ok_or_else(|| poem::Error::from_string("Invalid token", StatusCode::FORBIDDEN))?;
        Ok(Self(user_token))
    }
}

pub struct OptionalTokenBearer(pub Option<UserToken>);

impl<'a> FromRequest<'a> for OptionalTokenBearer {
    async fn from_request(req: &'a Request, _body: &mut poem::RequestBody) -> poem::Result<Self> {
        <Self as BearerAuthorization>::from_request(req)
    }
}

impl BearerAuthorization for OptionalTokenBearer {
    fn from_request(req: &Request) -> poem::Result<Self> {
        let auth = Bearer::from_request(req).ok();
        if let Some(bearer) = &auth{
            let Some(user) = parse_user_from_token(&bearer.token) else {
                return Ok(Self(None));
            };
            return Ok(Self(Some(user)))
        }
        Ok(Self(None))
    }
}

async fn check_player_anonymization_internal(
    data: &AppData,
    player_id: &str,
    server_id: &str,
    user_token: &UserToken,
) -> Result<bool, StatusCode> {
    if user_token.id.to_string() == player_id{
        return Ok(true)
    }
    struct ServerCommunity {
        community_id: Option<Uuid>,
    }

    let server_community = sqlx::query_as!(
        ServerCommunity,
        "SELECT community_id FROM server WHERE server_id = $1",
        server_id
    )
    .fetch_optional(&*data.pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let Some(server_comm) = server_community else {
        return Ok(false);
    };

    let Some(community_id) = server_comm.community_id else {
        return Ok(false);
    };

    struct AnonymizationCheck {
        anonymized: bool,
    }

    let player_id_i64 = match player_id.parse::<i64>() {
        Ok(id) => id,
        Err(_) => {
            // If player_id is not a valid i64 (Steam ID), no anonymization applies
            return Ok(false);
        }
    };

    let anonymization = sqlx::query_as!(
        AnonymizationCheck,
        "SELECT anonymized FROM website.user_anonymization
         WHERE user_id = $1 AND community_id = $2",
        player_id_i64,
        community_id
    )
    .fetch_optional(&*data.pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let Some(anon) = anonymization else {
        return Ok(false);
    };

    if !anon.anonymized {
        return Ok(false);
    }

    let is_superuser = sqlx::query_scalar!(
        "SELECT website.is_superuser($1)",
        user_token.id
    )
    .fetch_optional(&*data.pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if is_superuser == Some(Some(true)) {
        return Ok(true);
    }

    let is_admin = sqlx::query_scalar!(
        "SELECT website.is_community_admin($1, $2)",
        user_token.id,
        community_id
    )
    .fetch_optional(&*data.pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if is_admin == Some(Some(true)) {
        return Ok(true);
    }
    // Player is anonymized and the requester is not the player, a superuser, or a community
    // admin -> deny. The guard turns this into a hard 403 (frontend renders its AccessDenied page).
    Err(StatusCode::FORBIDDEN)
}

pub async fn check_superuser(app: &AppData, user_id: i64) -> bool{
    let Ok(is_superuser) = sqlx::query_scalar!(
        "SELECT website.is_superuser($1)",
        user_id
    )
        .fetch_optional(&*app.pool)
        .await else {
        return false
    };

    is_superuser == Some(Some(true))
}

pub async fn check_map_manager(app: &AppData, user_id: i64) -> bool{
    let Ok(is_map_manager) = sqlx::query_scalar!(
        "SELECT website.is_map_manager($1)",
        user_id
    )
        .fetch_optional(&*app.pool)
        .await else {
        return false
    };

    is_map_manager == Some(Some(true))
}

pub async fn check_superuser_or_map_manager(app: &AppData, user_id: i64) -> bool {
    check_superuser(app, user_id).await || check_map_manager(app, user_id).await
}

pub async fn is_player_activity_anonymized(app: &AppData, server_id: &str, player_id: &str) -> bool {
    let Ok(player_id_i64) = player_id.parse::<i64>() else {
        return false;
    };

    let func = || sqlx::query_scalar!(
        r#"SELECT COALESCE(ua.anonymized, FALSE) AS "anonymized!"
           FROM server s
           LEFT JOIN website.user_anonymization ua
               ON ua.community_id = s.community_id AND ua.user_id = $2
           WHERE s.server_id = $1"#,
        server_id,
        player_id_i64
    ).fetch_one(&*app.pool);

    let key = format!("anon-check:{server_id}:{player_id_i64}");
    cached_response(&key, &app.cache, 60, func).await
        .map(|r| r.result)
        .unwrap_or(false)
}


pub struct BriefAnonymizer {
    reveal_all: bool,
    viewer_id: Option<String>,
}

impl BriefAnonymizer {
    pub async fn new(app: &AppData, server_id: &str, viewer_id: Option<i64>) -> Self {
        let Some(viewer_id) = viewer_id else {
            return Self { reveal_all: false, viewer_id: None };
        };
        let reveal_all = check_superuser(app, viewer_id).await
            || is_community_admin_of_server(app, viewer_id, server_id).await;
        Self { reveal_all, viewer_id: Some(viewer_id.to_string()) }
    }

    /// Whether the requester may see this player's real identity: superuser, this community's
    /// admin, or the player themselves.
    fn reveal(&self, player_id: &str) -> bool {
        self.reveal_all || self.viewer_id.as_deref() == Some(player_id)
    }

    /// Mask, in place, every anonymized row the requester isn't allowed to see. Rows that stay
    /// visible get `is_anonymous` cleared so the frontend renders them normally.
    pub fn apply<T: AnonRow>(&self, rows: &mut [T]) {
        for row in rows.iter_mut() {
            if row.is_anonymous() && !self.reveal(row.row_id()) {
                row.mask();
            } else {
                row.set_anonymous(false);
            }
        }
    }

    /// Drop anonymized rows the requester isn't allowed to see
    pub fn retain_visible<T: AnonRow>(&self, rows: &mut Vec<T>) {
        rows.retain(|row| !(row.is_anonymous() && !self.reveal(row.row_id())));
    }
}

async fn is_community_admin_of_server(app: &AppData, user_id: i64, server_id: &str) -> bool {
    sqlx::query_scalar!(
        "SELECT COALESCE(website.is_community_admin($1, s.community_id), FALSE)
         FROM server s WHERE s.server_id = $2",
        user_id, server_id
    )
    .fetch_optional(&*app.pool)
    .await
    .ok()
    .flatten()
    .flatten()
    .unwrap_or(false)
}

/// A player-list row whose identity can be masked when the owner has opted out.
pub trait AnonRow {
    fn row_id(&self) -> &str;
    fn is_anonymous(&self) -> bool;
    fn set_anonymous(&mut self, value: bool);
    /// Replace identity with an anonymous placeholder and a throwaway id.
    fn mask(&mut self);
}

impl AnonRow for PlayerBrief {
    fn row_id(&self) -> &str { &self.id }
    fn is_anonymous(&self) -> bool { self.is_anonymous }
    fn set_anonymous(&mut self, value: bool) { self.is_anonymous = value; }
    fn mask(&mut self) {
        self.name = "Anonymous".to_string();
        self.id = Uuid::new_v4().to_string();
        self.is_anonymous = true;
    }
}

impl AnonRow for CountryPlayer {
    fn row_id(&self) -> &str { &self.id }
    fn is_anonymous(&self) -> bool { self.is_anonymous }
    fn set_anonymous(&mut self, value: bool) { self.is_anonymous = value; }
    fn mask(&mut self) {
        self.name = "Anonymous".to_string();
        self.id = Uuid::new_v4().to_string();
        self.is_anonymous = true;
    }
}

#[allow(dead_code)]
pub struct UserTokenAuthorized{
    user_token: UserToken,
    authorized: bool,
}
pub struct OptionalAnonymousTokenBearer(pub Option<UserTokenAuthorized>);

impl<'a> FromRequest<'a> for OptionalAnonymousTokenBearer {
    async fn from_request(req: &'a Request, _body: &mut poem::RequestBody) -> poem::Result<Self> {
        let auth = Bearer::from_request(req).ok();

        let player_id = req.raw_path_param("player_id")
            .ok_or_else(|| poem::Error::from_string("Missing player_id", StatusCode::BAD_REQUEST))?;

        let server_id = req.raw_path_param("server_id")
            .ok_or_else(|| poem::Error::from_string("Missing server_id", StatusCode::BAD_REQUEST))?;

        let data: &AppData = req.data()
            .ok_or_else(|| poem::Error::from_string("Missing AppData", StatusCode::INTERNAL_SERVER_ERROR))?;

        let Some(user_token) = auth.and_then(|bearer| parse_user_from_token(&bearer.token)) else {
            if is_player_activity_anonymized(data, server_id, player_id).await {
                return Err(poem::Error::from_string("Access forbidden", StatusCode::FORBIDDEN));
            }
            return Ok(Self(None));
        };

        // Explicitly only true if we know its user == player_id, or user == superuser, or user == community admin
        let authorized = check_player_anonymization_internal(data, player_id, server_id, &user_token)
            .await
            .map_err(|status| poem::Error::from_string("Access forbidden", status))?;


        Ok(Self(Some(UserTokenAuthorized { user_token, authorized })))
    }
}
pub fn get_env_default(name: &str) -> Option<String>{
    env::var(name).ok()
}
pub fn get_env_bool(name: &str, default: bool) -> bool{
    get_env_bool_ok(name).unwrap_or(default)
}
pub fn get_env_bool_ok(name: &str) -> Option<bool>{
    env::var(name)
        .ok()
        .and_then(|s| s.trim().to_ascii_lowercase().parse::<bool>().ok())
}

pub trait ChronoToTime {
    fn to_db_time(&self) -> OffsetDateTime;
}
impl ChronoToTime for DateTime<Utc> {
    fn to_db_time(&self) -> OffsetDateTime {
        OffsetDateTime::from_unix_timestamp(self.timestamp()).unwrap_or(OffsetDateTime::new_in_offset(Date::MIN, Time::MIDNIGHT, UtcOffset::UTC))
    }
}
pub trait TimeToChrono{
    fn to_utc_time(&self) -> DateTime<Utc>;
    fn to_utc_optional(&self) -> Option<DateTime<Utc>>;
}
impl TimeToChrono for OffsetDateTime {
    fn to_utc_time(&self) -> DateTime<Utc>{
        db_to_utc(*self)
    }
    fn to_utc_optional(&self) -> Option<DateTime<Utc>>{
        Some(db_to_utc(*self))
    }
}
impl TimeToChrono for Option<OffsetDateTime> {
    fn to_utc_time(&self) -> DateTime<Utc>{
        db_to_utc(self.unwrap_or(smallest_date()))
    }
    fn to_utc_optional(&self) -> Option<DateTime<Utc>>{
        self.map(db_to_utc)
    }
}
pub fn format_pg_time_tz(pg_time: &PgTimeTz) -> DateTime<Utc> {
    db_to_utc(OffsetDateTime::new_in_offset(Date::MIN, pg_time.time.clone(), pg_time.offset))
}
pub fn smallest_date() -> OffsetDateTime{
    OffsetDateTime::new_in_offset(Date::MIN, Time::MIDNIGHT, UtcOffset::UTC)
}

pub fn db_to_utc(date: OffsetDateTime) -> DateTime<Utc>{
    DateTime::<Utc>::from_timestamp(date.unix_timestamp(), 0).unwrap_or_default()
}
pub fn retain_peaks<T: PartialEq + Clone>(points: Vec<T>, max_points: usize,
    comp_max: impl Fn(&T, &T) -> bool,
    comp_min: impl Fn(&T, &T) -> bool,
) -> Vec<T> {
    let total_points = points.len();
    if total_points <= max_points {
        return points;
    }

    let interval_size = (total_points as f64 / max_points as f64).ceil() as usize;
    let mut result: Vec<T> = Vec::with_capacity(max_points);

    for chunk in points.chunks(interval_size) {
        if chunk.is_empty() {
            continue;
        }

        let mut max_point = &chunk[0];
        let mut min_point = &chunk[0];

        for point in chunk.iter() {
            if comp_max(point, max_point) {
                max_point = point;
            }
            if comp_min(point, max_point) {
                min_point = point;
            }
        }

        result.push(chunk[0].clone());
        if min_point != &chunk[0] && min_point != &chunk[chunk.len() - 1] {
            result.push(min_point.clone());
        }
        if max_point != &chunk[0] && max_point != &chunk[chunk.len() - 1] {
            result.push(max_point.clone());
        }
        if chunk.len() > 1 {
            result.push(chunk[chunk.len() - 1].clone()); // Last point
        }
    }
    result
}
pub trait PgIntervalNumber{
    fn to_f64(&self) -> f64;
}

impl PgIntervalNumber for PgInterval {
    fn to_f64(&self) -> f64{
        pg_interval_to_f64(*self)
    }
}

impl PgIntervalNumber for Option<PgInterval> {
    fn to_f64(&self) -> f64{
        self.map(pg_interval_to_f64).unwrap_or_default()
    }
}

pub fn pg_interval_to_f64(interval: PgInterval) -> f64 {
    let months_to_seconds = (interval.months as f64) * 30.0 * 86400.0; // Approximate month length
    let days_to_seconds = (interval.days as f64) * 86400.0;
    let micros_to_seconds = (interval.microseconds as f64) / 1_000_000.0;

    months_to_seconds + days_to_seconds + micros_to_seconds
}
pub fn interval_to_duration(interval: PgInterval) -> Duration {
    let days_from_months = interval.months as i64 * 30;
    let total_days = days_from_months + interval.days as i64;
    let total_seconds = total_days * 86400;
    let total_microseconds = total_seconds * 1_000_000 + interval.microseconds;

    if total_microseconds <= 0 {
        Duration::ZERO
    } else {
        let secs = total_microseconds / 1_000_000;
        let micros = total_microseconds % 1_000_000;
        Duration::new(secs as u64, (micros * 1000) as u32)
    }
}
fn generate_lock_id() -> String {
    let timestamp = SystemTime::now().duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let random_suffix: String = rand::rng()
        .sample_iter(&Alphanumeric)
        .take(6)
        .map(char::from)
        .collect();
    format!("{}-{}", timestamp, random_suffix)
}
pub async fn try_redis_lock(pool: &Pool, key: &str, ttl_secs: i64) -> Option<String> {
    let lock_value = generate_lock_id();
    let mut conn = pool.get().await.ok()?;

    let acquired: Option<String> = redis::cmd("SET")
        .arg(key)
        .arg(&lock_value)
        .arg("NX")
        .arg("EX")
        .arg(ttl_secs)
        .query_async(&mut conn)
        .await
        .ok()?;

    acquired.map(|_| lock_value)
}

pub async fn redis_key_exists(pool: &Pool, key: &str) -> bool {
    let Ok(mut conn) = pool.get().await else {
        return false;
    };
    conn.exists(key).await.unwrap_or(false)
}

pub async fn release_redis_lock(pool: &Pool, key: &str, value: &str) {
    let mut conn = match pool.get().await {
        Ok(c) => c,
        Err(_) => return,
    };

    // DELEX IFEQ deletes only when we still own the lock, so a lock that already
    // expired and was retaken by someone else survives.
    let _: RedisResult<usize> = conn.del_ex(key, ValueComparison::ifeq(value)).await;
}


pub trait IterConvert<R>: Sized {
     fn iter_into(self) -> Vec<R>;
}
impl<T, R> IterConvert<R> for Vec<T>
where 
    T: Into<R>
{
    fn iter_into(self) -> Vec<R> {
        self.into_iter().map(|e| e.into()).collect()
    }
}

pub async fn get_server(pool: &sqlx::Pool<Postgres>, cache: &FastCache, server_id_or_link: &str) -> Option<DbServer>{
    let key = format!("find_server_detail:{}", server_id_or_link);
    let func = ||
        sqlx::query_as!(DbServer, "
            SELECT server_name, s.server_id, server_ip, server_port, max_players, server_fullname, readable_link,
                   server_website, server_discord_link, server_source, game, source_by_id, timezone
            FROM server s
            LEFT JOIN server_metadata sm ON sm.server_id=s.server_id
            WHERE s.server_id=$1 OR readable_link=$1 LIMIT 1"
            , server_id_or_link)
            .fetch_one(pool);
    let data = cached_response(&key, cache, HOUR, func).await.ok();
    data.map(|e| e.result)
}

pub async fn update_online_brief(
    pool: &sqlx::Pool<Postgres>, cache: &FastCache, server_id: &str, briefs: &mut Vec<PlayerBrief>
){

    let func = || sqlx::query_as!(DbPlayerBrief, "
            WITH online AS (
              SELECT
                player_id,
                MIN(started_at) AS online_since
              FROM player_server_session
              WHERE server_id=$1 AND ended_at IS NULL
                AND CURRENT_TIMESTAMP - last_verified < INTERVAL '12 minutes'
              GROUP BY player_id
            )
            SELECT
              count(*) OVER () AS total_players,
              INTERVAL '0 seconds' AS total_playtime,
              0::int AS rank,
              p.player_id,
              p.player_name,
              p.created_at,
              online.online_since,
              lp.started_at AS last_played,
              lp.ended_at AS last_played_ended,
              lp.ended_at - lp.started_at AS last_played_duration,
              FALSE AS \"is_anonymous!\"
            FROM player p
            JOIN online
              ON online.player_id = p.player_id
            LEFT JOIN LATERAL (
              SELECT st.started_at, st.ended_at
              FROM player_server_session st
              WHERE st.player_id = p.player_id AND st.server_id=$1
              ORDER BY st.ended_at DESC NULLS LAST
              LIMIT 1
            ) lp ON true;
        ", server_id).fetch_all(pool);
    let key = format!("online_brief:{server_id}");
    if let Some(result) = cached_response(&key, cache, 5 * 60, func).await.ok(){
        let new_briefs: Vec<PlayerBrief> = result.result.iter_into();
        for player in briefs{
            let Some(found) = new_briefs.iter().find(|e| e.id==player.id) else {
                continue
            };
            (*player).online_since = found.online_since;
            (*player).last_played = found.last_played;
            (*player).last_played_ended = found.last_played_ended;
            (*player).last_played_duration = found.last_played_duration;
        }
    }else{
        tracing::warn!("Couldn't update online brief!");
    }
}
pub async fn fetch_profile(provider: &str, player_id: &i64) -> Result<ProviderResponse, ErrorCode> {
    let url = format!("{provider}/steams/pfp/{player_id}");
    let resp = reqwest::get(&url).await.map_err(|_| ErrorCode::NotImplemented)?;
    let result = resp.json::<ProviderResponse>().await.map_err(|_| ErrorCode::NotFound)?;
    Ok(result)
}
pub async fn get_profile(cache: &FastCache, provider: &str, player_id: &i64) -> Result<ProviderResponse, ErrorCode> {
    let callable = || fetch_profile(provider, &player_id);
    let redis_key = format!("pfp_cache:{}", player_id);
    let result = cached_response(&redis_key, cache, 7 * DAY, callable).await
        .map_err(|_| ErrorCode::InternalServerError)?;

    Ok(result.result)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct VauffResponseData {
    #[serde(flatten)]
    maps: HashMap<String, Vec<String>>,
    #[allow(dead_code)]
    last_updated: u64,
}


#[derive(Enum)]
#[oai(rename_all = "snake_case")]
pub enum ThumbnailType{
    Small,
    Medium,
    Large,
    ExtraLarge,
}

impl Display for ThumbnailType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ThumbnailType::Small => write!(f, "small"),
            ThumbnailType::Medium => write!(f, "medium"),
            ThumbnailType::Large => write!(f, "large"),
            ThumbnailType::ExtraLarge => write!(f, "extra_large"),
        }
    }
}
#[derive(Object, Serialize, Deserialize)]
pub struct MapImage{
    pub map_name: String,
    pub game_type: String,
    small: String,
    medium: String,
    large: String,
    extra_large: String,
}
pub async fn get_map_images(cache: &FastCache) -> Vec<MapImage>{
    let resp = cached_response("map_images", cache, 7 * DAY, || fetch_map_images());
    match resp.await {
        Ok(r) => r.result,
        Err(e) => {
            tracing::error!("Fetching map images results in an error {e}");
            vec![]
        }
    }
}
pub const THRESHOLD_MAP_NAME: f32 = 0.5;

pub fn get_map_image<'a>(map_name: &'a str, map_names: &'a Vec<String>) -> Option<&'a str>{
    let mut res = fuzzy_search_threshold(map_name, &map_names, THRESHOLD_MAP_NAME);
    res.sort_by(|(_, d1), (_, d2)| d2.total_cmp(d1));
    let mut res = res.iter().filter(|(e, _)| map_name.starts_with(e));
    let Some((map_image, _)) = res.next() else {
        return None
    };
    Some(*map_image)
}

pub const GAME_TYPES: &[&str] = &["730_cs2", "240", "730_csgo"];
pub const BASE_URL: &str = "https://vauff.com/mapimgs";
pub async fn fetch_map_images() -> reqwest::Result<Vec<MapImage>>{
    let list_maps = format!("{BASE_URL}/list.php");

    let response: VauffResponseData = reqwest::get(&list_maps).await?.json().await?;
    let data: Vec<MapImage> = response.maps.iter()
        .filter(|(k, _values)| GAME_TYPES.contains(&k.as_str()))
        .map(|(e, values)|
            values.into_iter()
                .map(|map_name| MapImage {
                    map_name: map_name.clone(),
                    game_type: e.clone(),
                    small: format!("/thumbnails/{}/{}--{}.jpg", ThumbnailType::Small, e, map_name),
                    medium: format!("/thumbnails/{}/{}--{}.jpg", ThumbnailType::Medium, e, map_name),
                    large: format!("/thumbnails/{}/{}--{}.jpg", ThumbnailType::Large, e, map_name),
                    extra_large: format!("/thumbnails/{}/{}--{}.jpg", ThumbnailType::ExtraLarge, e, map_name),
                }).collect::<Vec<MapImage>>()
        )
        .flatten()
        .collect::<Vec<_>>();

    Ok(data)
}

pub struct CachedResult<T>{
    pub result: T,
    pub is_new: bool,
    #[allow(dead_code)]
    pub backup: bool,
}

impl<T> CachedResult<T>{
    pub fn current_data(result: T) -> CachedResult<T>{
        CachedResult{result, backup: false, is_new: false}
    }
    pub fn backup_data(result: T) -> CachedResult<T>{
        CachedResult{result, backup: true, is_new: false}
    }
    pub fn new_data(result: T) -> CachedResult<T>{
        CachedResult{result, backup: false, is_new: true}
    }
}

#[derive(Clone)]
pub struct CacheKey{
    pub current: String,
    pub previous: Option<String>,
}
pub async fn cached_response<T, E, F, Fut>(
    key: &str,
    cache: &FastCache,
    ttl: u64,
    callable: F,
) -> Result<CachedResult<T>, E>
where
    T: Serialize + DeserializeOwned + Send + Sync + 'static,
    F: Fn() -> Fut,
    Fut: Future<Output = Result<T, E>>,
{
    let cache_key = format!("gfl-ze-watcher:{key}");

    if let Some(val) = cache.memory.get(key).await {
        tracing::debug!("Memory cache hit for {}", key);
        if let Ok(deserialized) = serde_json::from_str::<T>(&val) {
            return Ok(CachedResult::current_data(deserialized));
        }else{
            tracing::warn!("Memory deserialize failed: for {}", cache_key);
        }
    }
    let redis_pool = &cache.redis_pool;
    let conn_result = redis_pool.get().await;
    if let Err(e) = &conn_result {
        tracing::warn!("Redis connection failed: {}", e);
    }

    if let Ok(mut conn) = conn_result {
        if let Ok(result_str) = conn.get::<_, String>(&cache_key).await {
            cache.memory.insert(key.to_string(), result_str.clone()).await;
            if let Ok(deserialized) = serde_json::from_str::<T>(&result_str) {
                tracing::debug!("Redis cache hit for {}", cache_key);
                return Ok(CachedResult::current_data(deserialized));
            } else {
                tracing::warn!("Redis deserialize failed: for {}", cache_key);
            }
        }
        tracing::debug!("Cache miss for {}", cache_key);
    }

    let result = callable().await?;


    if let Ok(json_value) = serde_json::to_string(&result) {
        cache.memory.insert(key.to_string(), json_value.clone()).await;
        if let Ok(mut conn) = redis_pool.get().await {
            let save: RedisResult<()> = conn.set_ex(&cache_key, &json_value, ttl).await;
            if let Err(e) = save {
                tracing::warn!("Failed to cache in Redis: {}: {}", cache_key, e);
            } else {
                tracing::debug!("Cached in Redis: {} for {} seconds", cache_key, ttl);
            }
        }
    } else {
        tracing::warn!("Failed to serialize cache {}", cache_key);
    }

    Ok(CachedResult::new_data(result))
}
pub fn handle_worker_result<T>(result: WorkResult<T>, error_not_found: &str) -> Response<T>
    where T: ParseFromJSON + ToJSON + Send + Sync{
        match result {
            Ok(result) => response!(ok result),
            Err(WorkError::NotFound) => response!(err error_not_found, ErrorCode::NotFound),
            Err(WorkError::Database(_)) => response!(internal_server_error),
            Err(WorkError::Calculating) => response!(calculating),
        }
}


#[cfg(test)]
mod cached_result_tests {
    use super::CachedResult;

    /// Callers branch on these two flags — `MapWorker::get_statistics` reads `is_new` to decide
    /// whether it is looking at a freshly computed value — so the three constructors must keep
    /// setting them apart from one another.
    #[test]
    fn the_constructors_set_distinct_flag_pairs() {
        let current = CachedResult::current_data(1);
        assert!(!current.is_new && !current.backup, "a cache hit is neither new nor a backup");

        let fresh = CachedResult::new_data(1);
        assert!(fresh.is_new && !fresh.backup, "a computed value is new and not a backup");

        let backup = CachedResult::backup_data(1);
        assert!(!backup.is_new && backup.backup, "a fallback value is a backup and not new");
    }

    #[test]
    fn the_result_is_carried_through_untouched() {
        assert_eq!(CachedResult::new_data("payload").result, "payload");
        assert_eq!(CachedResult::backup_data("payload").result, "payload");
        assert_eq!(CachedResult::current_data("payload").result, "payload");
    }
}
