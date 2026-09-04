use std::collections::{HashMap, HashSet};
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
use crate::api_models::players::{PlayerBrief, PlayerDetailSession};
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
    let community_id = server_community_id(data, server_id)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let Some(community_id) = community_id else {
        return Ok(true);
    };

    if can_view_player_in_community(data, player_id, community_id, Some(user_token.id))
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    {
        Ok(true)
    } else {
        Err(StatusCode::FORBIDDEN)
    }
}

async fn server_community_id(app: &AppData, server_id: &str) -> Result<Option<Uuid>, sqlx::Error> {
    sqlx::query_scalar::<_, Option<Uuid>>(
        "SELECT community_id FROM server WHERE server_id = $1",
    )
    .bind(server_id)
    .fetch_optional(&*app.pool)
    .await
    .map(Option::flatten)
}

/// Returns whether a viewer may see a player's activity in one community.
/// Anonymization belongs to the canonical account, not an individual linked player row.
pub async fn can_view_player_in_community(
    app: &AppData,
    player_id: &str,
    community_id: Uuid,
    viewer_id: Option<i64>,
) -> Result<bool, sqlx::Error> {
    struct PlayerVisibilityCheck {
        owner_id: String,
        anonymized: bool,
        is_superuser: bool,
        is_community_admin: bool,
    }

    let check = sqlx::query_as!(
        PlayerVisibilityCheck,
        r#"SELECT
            COALESCE(p.associated_player_id, p.player_id) AS "owner_id!",
            COALESCE(ua.anonymized, FALSE) AS "anonymized!",
            COALESCE(website.is_superuser($3::BIGINT), FALSE) AS "is_superuser!",
            COALESCE(website.is_community_admin($3::BIGINT, $2), FALSE) AS "is_community_admin!"
         FROM player p
         LEFT JOIN website.user_anonymization ua
           ON ua.user_id::TEXT = COALESCE(p.associated_player_id, p.player_id)
          AND ua.community_id = $2
         WHERE p.player_id = $1"#,
        player_id,
        community_id,
        viewer_id,
    )
    .fetch_optional(&*app.pool)
    .await?;

    let Some(check) = check else {
        return Ok(true);
    };

    Ok(visibility_allows(
        check.anonymized,
        &check.owner_id,
        viewer_id,
        check.is_superuser,
        check.is_community_admin,
    ))
}

fn visibility_allows(
    anonymized: bool,
    owner_id: &str,
    viewer_id: Option<i64>,
    is_superuser: bool,
    is_community_admin: bool,
) -> bool {
    !anonymized
        || viewer_id.is_some_and(|id| owner_id == id.to_string())
        || is_superuser
        || is_community_admin
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
    let Ok(Some(community_id)) = server_community_id(app, server_id).await else {
        return false;
    };

    let func = || async {
        can_view_player_in_community(app, player_id, community_id, None)
            .await
            .map(|visible| !visible)
    };
    let key = format!("anon-check-v2:{server_id}:{player_id}");
    cached_response(&key, &app.cache, 60, func)
        .await
        .map(|result| result.result)
        .unwrap_or(false)
}


pub struct BriefAnonymizer {
    reveal_all: bool,
    viewer_player_ids: HashSet<String>,
}

impl BriefAnonymizer {
    pub async fn new(app: &AppData, server_id: &str, viewer_id: Option<i64>) -> Self {
        let Some(viewer_id) = viewer_id else {
            return Self { reveal_all: false, viewer_player_ids: HashSet::new() };
        };
        let reveal_all = check_superuser(app, viewer_id).await
            || is_community_admin_of_server(app, viewer_id, server_id).await;
        let viewer_id = viewer_id.to_string();
        let viewer_player_ids = sqlx::query_scalar::<_, String>(
            "SELECT player_id FROM player WHERE player_id = $1 OR associated_player_id = $1",
        )
        .bind(&viewer_id)
        .fetch_all(&*app.pool)
        .await
        .unwrap_or_default()
        .into_iter()
        .chain(std::iter::once(viewer_id))
        .collect();
        Self { reveal_all, viewer_player_ids }
    }

    fn reveal(&self, player_id: &str) -> bool {
        self.reveal_all || self.viewer_player_ids.contains(player_id)
    }

    pub fn apply<T: AnonRow>(&self, rows: &mut [T]) {
        for row in rows.iter_mut() {
            // The raw opt-in bit, before the privilege check overwrites it. A revealed row keeps
            // its real name but must still report that the public sees "Anonymous" here, otherwise
            // a player who just anonymized themselves sees their own name and assumes the toggle
            // did nothing.
            let hidden = row.is_anonymous();
            if hidden && !self.reveal(row.row_id()) {
                row.mask();
            } else {
                row.set_anonymous(false);
            }
            row.set_hidden_from_others(hidden);
        }
    }

    pub fn retain_visible<T: AnonRow>(&self, rows: &mut Vec<T>) {
        rows.retain(|row| !(row.is_anonymous() && !self.reveal(row.row_id())));
        // The retained rows still carry the raw flag; let apply settle both flags so the two entry
        // points cannot drift.
        self.apply(rows);
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

pub trait AnonRow {
    fn row_id(&self) -> &str;
    fn is_anonymous(&self) -> bool;
    fn set_anonymous(&mut self, value: bool);
    fn set_hidden_from_others(&mut self, value: bool);
    fn mask(&mut self);
}

impl AnonRow for PlayerBrief {
    fn row_id(&self) -> &str { &self.id }
    fn is_anonymous(&self) -> bool { self.is_anonymous }
    fn set_anonymous(&mut self, value: bool) { self.is_anonymous = value; }
    fn set_hidden_from_others(&mut self, value: bool) { self.hidden_from_others = value; }
    fn mask(&mut self) {
        self.name = "Anonymous".to_string();
        self.id = Uuid::new_v4().to_string();
        self.is_anonymous = true;
        self.hidden_from_others = true;
    }
}

impl AnonRow for CountryPlayer {
    fn row_id(&self) -> &str { &self.id }
    fn is_anonymous(&self) -> bool { self.is_anonymous }
    fn set_anonymous(&mut self, value: bool) { self.is_anonymous = value; }
    fn set_hidden_from_others(&mut self, value: bool) { self.hidden_from_others = value; }
    fn mask(&mut self) {
        self.name = "Anonymous".to_string();
        self.id = Uuid::new_v4().to_string();
        self.is_anonymous = true;
        self.hidden_from_others = true;
    }
}

impl AnonRow for PlayerDetailSession {
    fn row_id(&self) -> &str { &self.id }
    fn is_anonymous(&self) -> bool { self.is_anonymous }
    fn set_anonymous(&mut self, value: bool) { self.is_anonymous = value; }
    fn set_hidden_from_others(&mut self, value: bool) { self.hidden_from_others = value; }
    fn mask(&mut self) {
        self.name = "Anonymous".to_string();
        self.is_anonymous = true;
        self.hidden_from_others = true;
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
              lp.started_at AS \"last_played?\",
              lp.ended_at AS last_played_ended,
              lp.ended_at - lp.started_at AS last_played_duration,
              FALSE AS \"is_anonymous!\",
              FALSE AS \"hidden_from_others!\"
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

#[cfg(test)]
mod anonymizer_tests {
    use super::{visibility_allows, BriefAnonymizer};
    use crate::api_models::players::PlayerDetailSession;
    use chrono::Utc;

    fn session(id: &str, name: &str, anonymized: bool) -> PlayerDetailSession {
        PlayerDetailSession {
            id: id.to_string(),
            session_id: format!("session-{id}"),
            name: name.to_string(),
            started_at: Utc::now(),
            ended_at: None,
            is_anonymous: anonymized,
            hidden_from_others: false,
        }
    }

    fn anonymizer(reveal_all: bool, viewer_ids: &[&str]) -> BriefAnonymizer {
        BriefAnonymizer {
            reveal_all,
            viewer_player_ids: viewer_ids.iter().map(|id| (*id).to_string()).collect(),
        }
    }

    #[test]
    fn an_anonymous_viewer_sees_anonymized_players_masked() {
        let mut rows = vec![session("111", "RealName", true), session("222", "Public", false)];
        anonymizer(false, &[]).apply(&mut rows);

        assert_eq!(rows[0].name, "Anonymous", "an opted-out player's name must not reach a stranger");
        assert!(rows[0].is_anonymous, "the masked row still reports itself as anonymous");
        assert!(rows[0].hidden_from_others, "and as hidden from the public");
        assert_eq!(rows[1].name, "Public", "a player who never opted out is untouched");
        assert!(!rows[1].is_anonymous);
        assert!(!rows[1].hidden_from_others, "a public player is not hidden from anyone");
    }

    #[test]
    fn a_player_always_sees_their_own_name() {
        let mut rows = vec![session("111", "RealName", true)];
        anonymizer(false, &["111"]).apply(&mut rows);

        assert_eq!(rows[0].name, "RealName", "you are never anonymised to yourself");
        assert!(!rows[0].is_anonymous, "and the row is not flagged as masked");
        assert!(
            rows[0].hidden_from_others,
            "but you must still be told the name is hidden, or the anonymize toggle looks broken"
        );
    }

    #[test]
    fn reveal_all_unmasks_every_row() {
        // reveal_all stands in for superuser / community-admin of the server.
        let mut rows = vec![session("111", "RealName", true)];
        anonymizer(true, &["999"]).apply(&mut rows);

        assert_eq!(rows[0].name, "RealName");
        assert!(!rows[0].is_anonymous);
        assert!(rows[0].hidden_from_others, "an admin is told the public cannot see this name");
    }

    #[test]
    fn masking_keeps_the_player_id() {
        let mut rows = vec![session("111", "RealName", true)];
        anonymizer(false, &[]).apply(&mut rows);

        assert_eq!(rows[0].id, "111", "player_id is preserved, matching the query this replaced");
    }

    #[test]
    fn a_player_sees_an_anonymized_linked_player_row() {
        let mut rows = vec![session("linked-id", "RealName", true)];
        anonymizer(false, &["canonical-id", "linked-id"]).apply(&mut rows);

        assert_eq!(rows[0].name, "RealName");
        assert!(!rows[0].is_anonymous);
        assert!(rows[0].hidden_from_others);
    }

    #[test]
    fn retain_visible_settles_both_flags_on_the_rows_it_keeps() {
        // The map top-players search path filters instead of masking; the rows that survive must
        // come out with the same flag pairing apply() produces, not the raw opt-in bit.
        let mut rows = vec![
            session("111", "RealName", true),
            session("222", "Public", false),
            session("333", "Stranger", true),
        ];
        anonymizer(false, &["111"]).retain_visible(&mut rows);

        assert_eq!(rows.len(), 2, "the row the viewer may not see is dropped entirely");
        assert_eq!(rows[0].name, "RealName");
        assert!(!rows[0].is_anonymous, "a kept row is never reported as masked");
        assert!(rows[0].hidden_from_others, "but it is still hidden from the public");
        assert!(!rows[1].is_anonymous);
        assert!(!rows[1].hidden_from_others);
    }

    #[test]
    fn community_visibility_has_the_expected_privilege_order() {
        assert!(visibility_allows(false, "111", None, false, false));
        assert!(visibility_allows(true, "111", Some(111), false, false));
        assert!(visibility_allows(true, "111", Some(999), true, false));
        assert!(visibility_allows(true, "111", Some(999), false, true));
        assert!(!visibility_allows(true, "111", Some(999), false, false));
        assert!(!visibility_allows(true, "111", None, false, false));
    }
}
