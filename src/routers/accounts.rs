use chrono::{DateTime, TimeDelta, Utc};
use indexmap::IndexMap;
use poem::web::Data;
use poem_openapi::payload::Json;
use poem_openapi::{Object, OpenApi};
use poem_openapi::param::{Path, Query};
use poem_openapi::types::{MaybeUndefined, ParseFromJSON, ToJSON};
use tokio::io::AsyncReadExt;
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use futures::stream::{self, StreamExt};
use sqlx::types::time::OffsetDateTime;
use tokio::time::sleep;
use uuid::Uuid;

use crate::core::utils::*;
use crate::workers::PlayerContext;
use crate::{or_ise, require, response, AppData};
use crate::api_models::admins::*;
use crate::api_models::common::*;
use crate::api_models::misc::*;
use crate::api_models::players::*;
use crate::core::audit::{
    insert_audit_log, ACTION_UPDATE_ANONYMIZATION, CATEGORY_USER_PRIVACY,
};
use crate::core::player_merge::{is_steam_id, merge_player, revert_merge, LinkError, SteamName};
use crate::core::push_service::NotificationType;
use crate::routers::players::{get_player, get_player_cache_key, NIDE_SERVER_ID};
use crate::FastCache;
use crate::models::admins::*;
use crate::models::maps::{best_map_rank_order, DbMapChangeSubscription, DbMapNotifySubscription, BEST_MAP_RANK_MIN_HOURS};
use crate::models::players::*;
use crate::routers::ApiTags;
use crate::core::storage::{media_ext_from_content_type, sniff_media_ext, MediaKind};

pub struct AccountsApi;

#[derive(Debug, Serialize, Deserialize, Object, Clone)]
pub struct AnonymizationRequest {
    pub community_id: String,
    pub anonymize: Option<bool>,
    pub hide_location: Option<bool>,
}

fn announcement_media_limit(kind: MediaKind) -> u64 {
    match kind {
        MediaKind::Image => 15 * 1024 * 1024,
        MediaKind::Video => 50 * 1024 * 1024,
    }
}

fn extract_youtube_id(url: &str) -> Option<String> {

    if url.contains("youtube.com/watch?v=") {
        url.split("v=")
            .nth(1)
            .and_then(|s| s.split('&').next())
            .map(|s| s.to_string())
    } else if url.contains("youtu.be/") {
        url.split("youtu.be/")
            .nth(1)
            .and_then(|s| s.split('?').next())
            .map(|s| s.to_string())
    } else {
        Some(url.to_string())
    }
}

fn validate_push_subscription(dto: &PushSubscriptionDto) -> Result<(), String> {
    use base64::Engine;
    let engine = base64::engine::general_purpose::URL_SAFE_NO_PAD;

    let p256dh = engine.decode(&dto.keys.p256dh)
        .map_err(|_| "Invalid p256dh key encoding".to_string())?;
    if p256dh.len() != 65 {
        return Err("p256dh key must be 65 bytes".to_string());
    }

    let auth = engine.decode(&dto.keys.auth)
        .map_err(|_| "Invalid auth key encoding".to_string())?;
    if auth.len() != 16 {
        return Err("auth key must be 16 bytes".to_string());
    }

    if !dto.endpoint.starts_with("https://") {
        return Err("Endpoint must use HTTPS".to_string());
    }

    Ok(())
}

async fn resolve_canonical_player_id(
    pool: &sqlx::Pool<sqlx::Postgres>,
    steam_id: &str,
) -> Option<String> {
    sqlx::query_scalar!(
        "SELECT COALESCE(associated_player_id, player_id) AS \"canonical!\"
         FROM player WHERE player_id = $1",
        steam_id
    ).fetch_optional(pool).await.ok().flatten()
}

struct LinkChange {
    previous: Option<String>,
    current: Option<String>,
    sessions_moved: i64,
    name_conflict: bool,
}

async fn set_associated_player(
    conn: &mut sqlx::PgConnection,
    player_id: &str,
    target_steam_id: Option<&str>,
    merged_by: Option<i64>,
    claim_id: Option<Uuid>,
    steam_name: Option<&SteamName>,
) -> Result<LinkChange, LinkError> {
    let previous = sqlx::query_scalar!(
        "SELECT associated_player_id FROM player WHERE player_id = $1",
        player_id,
    )
    .fetch_optional(&mut *conn)
    .await
    .map_err(|e| {
        tracing::error!("Failed to read the current link of {player_id}: {e}");
        LinkError::Internal
    })?
    .flatten();

    let Some(target) = target_steam_id else {
        let reverted = revert_merge(conn, player_id).await?;
        let result = sqlx::query!(
            "UPDATE player SET associated_player_id = NULL WHERE player_id = $1",
            player_id,
        )
        .execute(&mut *conn)
        .await
        .map_err(|e| {
            tracing::error!("Failed to unlink {player_id}: {e}");
            LinkError::Internal
        })?;

        if result.rows_affected() == 0 {
            return Err(LinkError::User("Player not found".to_string()));
        }
        return Ok(LinkChange {
            previous,
            current: None,
            sessions_moved: reverted.as_ref().map(|r| -r.sessions_restored).unwrap_or(0),
            name_conflict: reverted.is_some_and(|r| r.name_conflict),
        });
    };

    let canonical = sqlx::query_scalar!(
        r#"SELECT COALESCE(associated_player_id, player_id) AS "canonical!"
           FROM player WHERE player_id = $1"#,
        target,
    )
    .fetch_optional(&mut *conn)
    .await
    .map_err(|e| {
        tracing::error!("Failed to resolve link target {target}: {e}");
        LinkError::Internal
    })?;

    let canonical = match canonical {
        Some(canonical) => canonical,
        None if is_steam_id(target) && !is_steam_id(player_id) => target.to_string(),
        None => return Err(LinkError::User(format!("No player record exists for {target}."))),
    };

    if !is_steam_id(&canonical) {
        return Err(LinkError::User(format!(
            "{target} is not linked to a Steam account yet, so there is nothing to merge into. \
             Link that profile to a Steam ID first."
        )));
    }

    if canonical == player_id {
        return Err(LinkError::User(
            "A profile cannot be linked to itself".to_string(),
        ));
    }

    let sessions_moved = if is_steam_id(player_id) {
        let result = sqlx::query!(
            "UPDATE player SET associated_player_id = $1 WHERE player_id = $2",
            canonical,
            player_id,
        )
        .execute(&mut *conn)
        .await
        .map_err(|e| {
            tracing::error!("Failed to link {player_id} -> {canonical}: {e}");
            LinkError::Internal
        })?;

        if result.rows_affected() == 0 {
            return Err(LinkError::User("Player not found".to_string()));
        }
        0
    } else {
        merge_player(conn, player_id, &canonical, merged_by, claim_id, steam_name).await?.sessions_moved
    };

    sqlx::query!(
        "UPDATE player SET associated_player_id = $1 WHERE associated_player_id = $2",
        canonical,
        player_id,
    )
    .execute(&mut *conn)
    .await
    .map_err(|e| {
        tracing::error!("Failed to re-point aliases of {player_id}: {e}");
        LinkError::Internal
    })?;

    Ok(LinkChange { previous, current: Some(canonical), sessions_moved, name_conflict: false })
}

/// Order matters: `BackgroundWorker::execute` serves a cached value rather than recomputing, so
/// a refresh queued while the old entries are still present would simply re-read them and the
/// profile would keep its pre-link shape until the (multi-week) TTLs expired.
async fn apply_link_side_effects(data: &AppData, player_id: &str, change: &LinkChange) {
    let touched = accounts_touched_by(player_id, change);
    data.player_worker.invalidate_players(&touched).await;

    for account in [change.previous.as_deref(), change.current.as_deref()].into_iter().flatten() {
        data.player_worker.enqueue_global_refresh(account).await;
    }
}

fn accounts_touched_by(player_id: &str, change: &LinkChange) -> Vec<String> {
    let mut ids = vec![player_id.to_string()];
    for id in [change.previous.as_deref(), change.current.as_deref()].into_iter().flatten() {
        if !ids.iter().any(|existing| existing == id) {
            ids.push(id.to_string());
        }
    }
    ids
}

async fn fetch_player_claim(
    pool: &sqlx::Pool<sqlx::Postgres>,
    claim_id: Uuid,
) -> Result<Option<DbPlayerClaim>, sqlx::Error> {
    sqlx::query_as!(
        DbPlayerClaim,
        r#"
        SELECT
            c.id, c.user_id, c.player_id, c.server_id, c.note, c.status,
            c.reviewed_by, c.reviewed_at, c.created_at,
            claimer.persona_name AS "claimer_name?",
            p.player_name AS "player_name?",
            s.server_name AS "server_name?",
            reviewer.persona_name AS "reviewer_name?",
            NULL::bigint AS total_claims
        FROM website.player_claiming c
        LEFT JOIN website.steam_user claimer ON c.user_id = claimer.user_id
        LEFT JOIN website.steam_user reviewer ON c.reviewed_by = reviewer.user_id
        LEFT JOIN player p ON p.player_id = c.player_id
        LEFT JOIN server s ON s.server_id = c.server_id
        WHERE c.id = $1
        "#,
        claim_id,
    )
    .fetch_optional(pool)
    .await
}

async fn hidden_community_ids(
    app: &AppData,
    player_id: &str,
    settings: &[DbUserAnonymization],
    viewer_id: Option<i64>,
) -> Result<HashSet<Uuid>, sqlx::Error> {
    let mut hidden = HashSet::new();
    for community_id in settings
        .iter()
        .filter(|setting| setting.anonymized)
        .filter_map(|setting| setting.community_id)
    {
        if !can_view_player_in_community(app, player_id, community_id, viewer_id).await? {
            hidden.insert(community_id);
        }
    }
    Ok(hidden)
}

fn resolve_user_id<T: poem_openapi::types::ParseFromJSON + poem_openapi::types::ToJSON + Send + Sync>(
    user_id_param: &str,
    requester: &Option<UserToken>,
) -> Result<i64, Response<T>> {
    if user_id_param == "me" {
        match requester {
            Some(token) => Ok(token.id),
            None => Err(response!(err "Login required to view your own profile", ErrorCode::Forbidden)),
        }
    } else {
        match user_id_param.parse::<i64>() {
            Ok(id) => Ok(id),
            Err(_) => Err(response!(err "Invalid user id", ErrorCode::BadRequest)),
        }
    }
}

/// The player a global profile endpoint is about, and the communities to leave out of its answer.
struct ProfileScope {
    canonical_id: String,
    /// Communities the player anonymized themselves in that the requester has no permission for.
    excluded_community_ids: Vec<Uuid>,
}

/// Resolves `player_id` (`"me"` or a Steam ID) to the player's canonical id and the communities the
/// requester may not see, the same way `/players/{player_id}/profile` does.
async fn resolve_profile_scope<T: ParseFromJSON + ToJSON + Send + Sync>(
    app: &AppData,
    player_id: &str,
    requester: &Option<UserToken>,
) -> Result<ProfileScope, Response<T>> {
    let pool = &*app.pool;
    let target_user_id = resolve_user_id(player_id, requester)?;
    let steam_id = target_user_id.to_string();
    let canonical_id = resolve_canonical_player_id(pool, &steam_id)
        .await
        .unwrap_or(steam_id);
    let canonical_user_id = canonical_id.parse::<i64>().unwrap_or(target_user_id);
    let requester_id = requester.as_ref().map(|token| token.id);

    let anonymization_settings = sqlx::query_as!(
        DbUserAnonymization,
        "SELECT user_id, community_id, anonymized, hide_location FROM website.user_anonymization WHERE user_id = $1",
        canonical_user_id
    ).fetch_all(pool).await.map_err(|e| {
        tracing::error!("Failed to read anonymization of {canonical_id}: {e}");
        response!(internal_server_error)
    })?;

    let excluded_community_ids = hidden_community_ids(
        app,
        &canonical_id,
        &anonymization_settings,
        requester_id,
    ).await.map_err(|e| {
        tracing::error!("Failed to resolve hidden communities of {canonical_id}: {e}");
        response!(internal_server_error)
    })?.into_iter().collect();

    Ok(ProfileScope { canonical_id, excluded_community_ids })
}

async fn get_global_best_rank(
    pool: &sqlx::Pool<sqlx::Postgres>,
    cache: &FastCache,
    steam_id: &str,
) -> Option<GlobalMapRank> {
    let func = || sqlx::query_as!(
        DbGlobalMapRankEntry,
        "WITH qualifying AS (
            SELECT pmt.player_id, pmt.map, pmt.total_playtime,
                RANK() OVER (PARTITION BY pmt.server_id, pmt.map ORDER BY pmt.total_playtime DESC) AS map_rank,
                COUNT(*) OVER (PARTITION BY pmt.server_id, pmt.map) AS players
            FROM website.player_map_time pmt
            WHERE pmt.total_playtime > make_interval(hours => $1)
                AND NOT EXISTS (SELECT 1 FROM bot_player b WHERE b.player_id = pmt.player_id)
        ),
        best AS (
            SELECT DISTINCT ON (player_id)
                player_id, map, map_rank, map_rank::float8 / players AS score, total_playtime
            FROM qualifying
            ORDER BY player_id, map_rank::float8 / players, total_playtime DESC, map
        )
        SELECT
            player_id AS \"player_id!\",
            RANK() OVER (ORDER BY score) AS \"global_position\",
            map AS \"map\",
            map_rank AS \"rank\",
            score AS \"score\",
            EXTRACT(EPOCH FROM total_playtime)::float8 AS \"playtime_seconds\"
        FROM best",
        BEST_MAP_RANK_MIN_HOURS
    ).fetch_all(pool);

    let entries = cached_response("global-best-map-rank-table-v2", cache, 900, func).await.ok()?.result;

    let merged_ids: HashSet<String> = sqlx::query_scalar!(
        "SELECT player_id FROM player WHERE player_id = $1 OR associated_player_id = $1",
        steam_id
    ).fetch_all(pool).await.unwrap_or_default().into_iter().collect();

    let best = entries.into_iter()
        .filter(|e| merged_ids.contains(&e.player_id))
        .filter(|e| e.best_map_key().is_some())
        .min_by(|a, b| best_map_rank_order(a.best_map_key().unwrap(), b.best_map_key().unwrap()))?;

    let map = best.map?;
    Some(GlobalMapRank {
        position: best.global_position.unwrap_or_default(),
        map,
        rank: best.rank.unwrap_or_default(),
    })
}

const PROFILE_SERVER_CONCURRENCY: usize = 4;
/// How long a profile waits on an uncached Steam cosmetics lookup before answering without it.
const PROFILE_STEAM_ITEMS_WAIT: std::time::Duration = std::time::Duration::from_millis(1500);

async fn profile_server_entry(
    app: &AppData,
    entry: &DbCommunityServerEntry,
    canonical_id: &str,
    current_name: Option<&String>,
    is_owner: bool,
) -> Option<(ProfileServerEntry, Option<OffsetDateTime>)> {
    let pool = &*app.pool;
    let server_id = &entry.server_id;
    let player_id = &entry.player_id;

    let server = get_server(pool, &app.cache, server_id).await?;
    let player = get_player(pool, &app.cache, player_id).await?;

    let cache_key = get_player_cache_key(pool, &app.cache, server_id, player_id).await;
    let ctx = PlayerContext { player, server: server.clone(), cache_key };

    let mut detail = app.player_worker.get_detail_stored(&ctx).await.ok()?;

    let mut sessions = sqlx::query_as!(
        DbProfileRecentSession,
        "WITH user_players AS (
            SELECT player_id FROM player WHERE player_id = $2 OR associated_player_id = $2
        )
        SELECT
            started_at,
            ended_at,
            EXTRACT(EPOCH FROM (COALESCE(ended_at, CURRENT_TIMESTAMP) - started_at))::float8 AS \"duration!\",
            (ended_at IS NULL AND CURRENT_TIMESTAMP - last_verified < INTERVAL '20 minutes') AS \"is_live!\"
        FROM player_server_session
        WHERE server_id = $1 AND player_id IN (SELECT player_id FROM user_players)
        ORDER BY started_at DESC
        LIMIT 7",
        server_id,
        canonical_id
    ).fetch_all(pool).await.unwrap_or_default();

    let by_id = server.source_by_id.unwrap_or(false);
    let mut linked_names: Vec<LinkedName> = vec![];
    let mut mergeable_count = 0;
    if !by_id {
        let names = sqlx::query_as!(
            DbLinkedName,
            "SELECT p.player_id, p.player_name, pp.total_playtime
             FROM player p
             JOIN website.player_playtime pp ON pp.player_id = p.player_id AND pp.server_id = $1
             WHERE (p.player_id = $2 OR p.associated_player_id = $2)
                AND pp.total_playtime > interval '0'
             ORDER BY pp.total_playtime DESC",
            server_id,
            canonical_id
        ).fetch_all(pool).await.unwrap_or_default();

        linked_names = names.into_iter().map(|n| LinkedName {
            is_current: Some(&n.player_name) == current_name,
            name: n.player_name,
            total_playtime: n.total_playtime.map(|i| i.to_f64()).unwrap_or(0.0),
        }).collect();

        if !linked_names.is_empty() {
            detail.total_playtime = linked_names.iter().map(|n| n.total_playtime).sum();
        }

        if is_owner {
            mergeable_count = sqlx::query_scalar!(
                r#"SELECT COUNT(DISTINCT p.player_id) AS "count!"
                   FROM player p
                   JOIN player_server_session pss
                     ON pss.player_id = p.player_id AND pss.server_id = $1
                   WHERE p.associated_player_id = $2
                     AND p.merged_at IS NULL
                     AND p.player_id !~ '^[0-9]+$'"#,
                server_id,
                canonical_id
            ).fetch_one(pool).await.unwrap_or(0);
        }
    }

    let (server_online, server_last_played, server_duration) = match sessions.first() {
        Some(s) => (
            s.is_live,
            Some(db_to_utc(s.ended_at.unwrap_or(s.started_at))),
            Some(s.duration),
        ),
        None => (false, None, None),
    };

    let latest_started_at = sessions.first().map(|s| s.started_at);
    sessions.reverse();
    let recent_sessions = sessions.into_iter().map(|s| ProfileRecentSession {
        started_at: db_to_utc(s.started_at),
        ended_at: s.ended_at.map(db_to_utc),
        duration: s.duration,
    }).collect();

    let server_entry = ProfileServerEntry {
        server_id: server_id.clone(),
        server_name: server.server_name.clone().unwrap_or_default(),
        by_id,
        is_online: server_online,
        last_played: server_last_played,
        last_played_duration: server_duration,
        player: detail,
        linked_names,
        mergeable_count,
        recent_sessions,
    };

    Some((server_entry, latest_started_at))
}

#[derive(Debug, Serialize, Deserialize, Object, Clone)]
pub struct ServerEntryDto {
    pub ip: String,
    pub port: u16,
    pub readable_link: String,
}

#[derive(Debug, Serialize, Deserialize, Object, Clone)]
pub struct ServerRequestDto {
    pub community_name: String,
    pub icon_url: Option<String>,
    pub servers: Vec<ServerEntryDto>,
    pub game_type: String,
    pub elaboration: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Object, Clone)]
pub struct ServerRequestStatusDto {
    pub status: String,
}

#[derive(Debug, Serialize, Deserialize, Object, Clone)]
pub struct PlayerClaimDto {
    pub server_id: String,
    pub player_id: String,
    /// Optional justification shown to the moderator. Capped at 500 characters.
    pub note: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Object, Clone)]
pub struct PlayerClaimStatusDto {
    pub status: String,
}

#[derive(Debug, Serialize, Deserialize, Object, Clone)]
pub struct MergeAccountsDto {
    /// Only merge profiles seen on this server. Omit to merge every linked profile.
    pub server_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Object, Clone)]
pub struct AssociatePlayerDto {
    /// Steam ID to link this profile to. `null` unlinks it.
    pub associated_player_id: Option<String>,
}

#[derive(Debug, Clone)]
enum UserRole {
    Superuser,
    CommunityAdmin(Uuid),
    Regular,
}


async fn get_user_role(data: &AppData, user_id: i64) -> Result<UserRole, ErrorCode> {
    let is_superuser = sqlx::query_scalar!(
        "SELECT website.is_superuser($1) ",
        user_id
    )
    .fetch_optional(&*data.pool)
    .await
    .map_err(|_| ErrorCode::InternalServerError)?;

    if is_superuser == Some(Some(true)) {
        return Ok(UserRole::Superuser);
    }

    struct AdminCommunity {
        community_id: Option<Uuid>,
    }
    let admin_communities = sqlx::query_as!(
        AdminCommunity,
        "SELECT community_id FROM website.user_roles
         WHERE user_id = $1 AND role = 'community_admin'",
        user_id
    )
    .fetch_all(&*data.pool)
    .await
    .map_err(|_| ErrorCode::InternalServerError)?;

    if let Some(admin_comm) = admin_communities.first() {
        if let Some(community_id) = admin_comm.community_id{
            return Ok(UserRole::CommunityAdmin(community_id));
        }
    }

    Ok(UserRole::Regular)
}

async fn owned_push_subscription<T: ParseFromJSON + ToJSON + Send + Sync>(
    data: &AppData, user_id: i64, subscription_id: &str, server_id: Option<&String>,
) -> Result<Uuid, Response<T>> {
    let Ok(subscription_id) = Uuid::parse_str(subscription_id) else {
        return Err(response!(err "Invalid subscription ID format", ErrorCode::BadRequest));
    };
    let subscription_check = sqlx::query_scalar!(
        "SELECT user_id FROM website.push_subscriptions WHERE id = $1", subscription_id
    ).fetch_optional(&*data.pool).await;
    match subscription_check {
        Ok(Some(owner)) if owner == user_id => {}
        Ok(Some(_)) => return Err(response!(err "Subscription does not belong to user", ErrorCode::Forbidden)),
        Ok(None) => return Err(response!(err "Subscription not found", ErrorCode::NotFound)),
        Err(e) => {
            tracing::error!("Failed to verify subscription: {}", e);
            return Err(response!(internal_server_error));
        }
    }
    let Some(server_id) = server_id else { return Ok(subscription_id) };
    let server_check = sqlx::query_scalar!(
        "SELECT server_id FROM server WHERE server_id = $1", server_id
    ).fetch_optional(&*data.pool).await;
    match server_check {
        Ok(Some(_)) => Ok(subscription_id),
        Ok(None) => Err(response!(err "Server not found", ErrorCode::NotFound)),
        Err(e) => {
            tracing::error!("Failed to verify server: {}", e);
            Err(response!(internal_server_error))
        }
    }
}

async fn check_permission(
    data: &AppData,
    requester_id: i64,
    target_user_id: i64,
    community_id: Uuid
) -> Result<bool, ErrorCode> {
    if requester_id == target_user_id {
        return Ok(true);
    }

    let role = get_user_role(data, requester_id).await?;

    match role {
        UserRole::Superuser => Ok(true),
        UserRole::CommunityAdmin(admin_community) => {
            Ok(admin_community == community_id)
        }
        UserRole::Regular => Ok(false),
    }
}

async fn fetch_steam_info(steam_id: &i64) -> Result<SteamProfile, ErrorCode> {
    let base_url = "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002";
    let client = http_client();
    let mut attempt = 0;
    let max_backoff = 300;

    loop {
        let res = client
            .get(base_url)
            .query(&[
                ("key", get_env("STEAM_API_KEY")),
                ("steamids", steam_id.to_string())
            ])
            .send()
            .await;

        match res {
            Ok(resp) => {
                if resp.status().is_success() {
                    let response = resp.json::<SteamApiResponse>()
                        .await
                        .map_err(|_| ErrorCode::InternalServerError)?;
                    let Some(profile) = response.response.players.first() else {
                        return Err(ErrorCode::NotFound)
                    };
                    return Ok(profile.clone());
                } else if resp.status() == StatusCode::TOO_MANY_REQUESTS.as_u16() {
                    attempt += 1;
                    let backoff = std::time::Duration::from_secs(2u64.pow(attempt).min(max_backoff));
                    sleep(backoff).await;
                    continue;
                } else {
                    return Err(ErrorCode::InternalServerError);
                }
            }
            Err(_) => {
                attempt += 1;
                let backoff = std::time::Duration::from_secs(2u64.pow(attempt).min(max_backoff));
                if attempt > 7 {
                    return Err(ErrorCode::FailedRetry);
                }
                sleep(backoff).await;
                continue;
            }
        }
    }
}

const PLAYERDB_USER_AGENT: &str = "ZE Graph (https://zegraph.xyz)";

#[derive(Deserialize)]
struct PlayerDbResponse {
    success: bool,
    data: Option<PlayerDbData>,
}

#[derive(Deserialize)]
struct PlayerDbData {
    player: PlayerDbPlayer,
}

#[derive(Deserialize)]
struct PlayerDbPlayer {
    meta: PlayerDbMeta,
}

#[derive(Deserialize)]
struct PlayerDbMeta {
    personaname: Option<String>,
    profileurl: Option<String>,
    avatar: Option<String>,
    avatarmedium: Option<String>,
    avatarfull: Option<String>,
    avatarhash: Option<String>,
}

async fn fetch_playerdb_profile(steam_id: i64) -> Result<PlayerDbMeta, String> {
    let resp = http_client()
        .get(format!("https://playerdb.co/api/player/steam/{steam_id}"))
        .header(reqwest::header::USER_AGENT, PLAYERDB_USER_AGENT)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let body = resp.json::<PlayerDbResponse>().await.map_err(|e| e.to_string())?;
    match body.data {
        Some(data) if body.success => Ok(data.player.meta),
        _ => Err("playerdb has no profile".to_string()),
    }
}

/// Re-pulls the signed-in user's name and avatar from playerdb.co once a week. The row is only
/// written on first login otherwise, so the navbar avatar would never change.
async fn refresh_steam_user_if_stale(data: &AppData, user_id: i64) {
    let stale = sqlx::query_scalar!(
        r#"SELECT (refreshed_at IS NULL OR refreshed_at < NOW() - INTERVAL '7 days') AS "stale!"
           FROM website.steam_user WHERE user_id = $1"#,
        user_id
    )
    .fetch_optional(&*data.pool)
    .await;
    if !matches!(stale, Ok(Some(true))) {
        return;
    }

    let result = match fetch_playerdb_profile(user_id).await {
        Ok(meta) => sqlx::query!(
            "UPDATE website.steam_user SET
                persona_name = COALESCE($2, persona_name),
                profile_url = COALESCE($3, profile_url),
                avatar = COALESCE($4, avatar),
                avatar_medium = COALESCE($5, avatar_medium),
                avatar_full = COALESCE($6, avatar_full),
                avatar_hash = COALESCE($7, avatar_hash),
                refreshed_at = NOW()
             WHERE user_id = $1",
            user_id,
            meta.personaname,
            meta.profileurl,
            meta.avatar,
            meta.avatarmedium,
            meta.avatarfull,
            meta.avatarhash,
        )
        .execute(&*data.pool)
        .await,
        Err(e) => {
            tracing::warn!("Failed to refresh Steam profile {user_id} from playerdb: {e}");
            // Try again in a day rather than on every request while playerdb is unreachable.
            sqlx::query!(
                "UPDATE website.steam_user SET refreshed_at = NOW() - INTERVAL '6 days' WHERE user_id = $1",
                user_id
            )
            .execute(&*data.pool)
            .await
        }
    };
    if let Err(e) = result {
        tracing::error!("Failed to update refreshed Steam profile {user_id}: {e}");
    }
}

async fn fetch_steam_name(data: &AppData, steam_id: &str) -> Result<Option<SteamName>, String> {
    let Ok(steam_user_id) = steam_id.parse::<i64>() else {
        return Err(format!("{steam_id} is not a valid Steam ID"));
    };

    let failure = match tokio::time::timeout(
        std::time::Duration::from_secs(10),
        fetch_steam_info(&steam_user_id),
    ).await {
        Ok(Ok(profile)) => match profile.personaname.filter(|n| !n.trim().is_empty()) {
            Some(name) => return Ok(Some(SteamName { steam_id: steam_id.to_string(), name })),
            None => format!("Steam has no account with ID {steam_id}"),
        },
        Ok(Err(ErrorCode::NotFound)) => format!("Steam has no account with ID {steam_id}"),
        Ok(Err(_)) | Err(_) => {
            format!("Couldn't reach Steam to look up {steam_id}. Try again in a moment.")
        }
    };

    let known = sqlx::query_scalar!(
        r#"SELECT (
            EXISTS (SELECT 1 FROM player WHERE player_id = $1)
            OR EXISTS (SELECT 1 FROM website.steam_user WHERE user_id = $2)
        ) AS "known!""#,
        steam_id,
        steam_user_id,
    )
    .fetch_one(&*data.pool)
    .await
    .map_err(|e| {
        tracing::error!("Failed to check whether {steam_id} is known: {e}");
        "Internal server error".to_string()
    })?;

    if known {
        tracing::warn!("{failure}; merging {steam_id} under its stored name");
        return Ok(None);
    }
    Err(failure)
}

async fn steam_name_for_link(
    data: &AppData,
    player_id: &str,
    target: &str,
) -> Result<Option<SteamName>, String> {
    if is_steam_id(player_id) {
        return Ok(None);
    }
    let canonical = resolve_canonical_player_id(&data.pool, target)
        .await
        .unwrap_or_else(|| target.to_string());
    if !is_steam_id(&canonical) {
        return Ok(None);
    }
    fetch_steam_name(data, &canonical).await
}

#[OpenApi(tag = "ApiTags::Accounts")]
impl AccountsApi {
    /// Create this user's Steam profile record on first login.
    #[oai(path="/accounts/create", method="post")]
    async fn create_user_info(&self, Data(data): Data<&AppData>, TokenBearer(user_token): TokenBearer) -> Response<SteamProfile>{
        let user_id = user_token.id;
        if let Ok(_) = sqlx::query_as!(DbSteam,
            "SELECT user_id,
                community_visibility_state AS \"community_visibility_state: CommunityVisibilityState\",
                profile_state,
                persona_name,
                profile_url,
                avatar,
                avatar_medium,
                avatar_full,
                avatar_hash,
                last_log_off,
                persona_state AS \"persona_state: PersonaState\",
                primary_clan_id,
                time_created,
                persona_state_flags,
                comment_permission
            FROM website.steam_user WHERE user_id=$1 LIMIT 1", user_id
        ).fetch_one(&*data.pool).await {
            return response!(err "User existed!", ErrorCode::Conflict)
        };
        let steam_profile = match fetch_steam_info(&user_token.id).await {
            Ok(r) => r,
            Err(e) => {
                tracing::error!("ERROR fetching for {} {e}", &user_token.id.to_string());
                return response!(err "User Steam ID is invalid", ErrorCode::NotFound)
            }
        };
        let cvs = or_ise!(CommunityVisibilityState::try_from(steam_profile.communityvisibilitystate.unwrap_or(1) as i32));
        let ps = or_ise!(PersonaState::try_from(steam_profile.personastate.unwrap_or(0) as i32));
        let steam_id = or_ise!(steam_profile.steamid.parse::<i64>());
        let timecreated = steam_profile.timecreated.unwrap_or(-1);
        let clan_id = steam_profile.primaryclanid.unwrap_or("-1".to_string());
        let commentpermission = steam_profile.commentpermission.and_then(|e| Some(e == 1)).unwrap_or(false);
        let lastlogoff = steam_profile.lastlogoff.unwrap_or(-1);
        let personastateflags = steam_profile.personastateflags.unwrap_or_default();
        let avatarhash = steam_profile.avatarhash.unwrap_or_default();
        let avatarfull = steam_profile.avatarfull.unwrap_or_default();
        let avatarmedium = steam_profile.avatarmedium.unwrap_or_default();
        let avatar = steam_profile.avatar.unwrap_or_default();
        let profileurl = steam_profile.profileurl.unwrap_or_default();
        let personaname = steam_profile.personaname.unwrap_or_default();
        let profilestate = steam_profile.profilestate.unwrap_or_default();
        let steam_profile_db = or_ise!(sqlx::query_as!(DbSteam,
            "INSERT INTO website.steam_user(user_id,
                community_visibility_state,
                profile_state,
                persona_name,
                profile_url,
                avatar,
                avatar_medium,
                avatar_full,
                avatar_hash,
                last_log_off,
                persona_state,
                primary_clan_id,
                time_created,
                persona_state_flags,
                comment_permission,
                refreshed_at)
             VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW()) RETURNING
             user_id,
                community_visibility_state AS \"community_visibility_state: CommunityVisibilityState\",
                profile_state,
                persona_name,
                profile_url,
                avatar,
                avatar_medium,
                avatar_full,
                avatar_hash,
                last_log_off,
                persona_state AS \"persona_state: PersonaState\",
                primary_clan_id,
                time_created,
                persona_state_flags,
                comment_permission
             ", steam_id,
                cvs as CommunityVisibilityState,
                profilestate,
                personaname,
                profileurl,
                avatar,
                avatarmedium,
                avatarfull,
                avatarhash,
                lastlogoff,
                ps as PersonaState,
                clan_id,
                timecreated,
                personastateflags,
                commentpermission
        ).fetch_one(&*data.pool).await, e => "ERROR {e}");
        response!(ok steam_profile_db.into())

    }
    /// The signed-in user's own Steam profile, including their superuser/map-manager role flags.
    #[oai(path="/accounts/me", method="get")]
    async fn get_user_info(&self, Data(data): Data<&AppData>, TokenBearer(user_token): TokenBearer) -> Response<SteamProfile>{
        refresh_steam_user_if_stale(data, user_token.id).await;
        let Ok(user) = sqlx::query_as!(DbSteam,
            "SELECT user_id,
                community_visibility_state AS \"community_visibility_state: CommunityVisibilityState\",
                profile_state,
                persona_name,
                profile_url,
                avatar,
                avatar_medium,
                avatar_full,
                avatar_hash,
                last_log_off,
                persona_state AS \"persona_state: PersonaState\",
                primary_clan_id,
                time_created,
                persona_state_flags,
                comment_permission
            FROM website.steam_user WHERE user_id=$1 LIMIT 1", user_token.id
        ).fetch_one(&*data.pool).await else {
            return response!(err "User does not exist!", ErrorCode::NotFound)
        };

        let is_superuser = check_superuser(data, user_token.id).await;
        let is_map_manager = check_map_manager(data, user_token.id).await;
        let mut profile: SteamProfile = user.into();
        profile.is_superuser = Some(is_superuser);
        profile.is_map_manager = Some(is_map_manager);

        response!(ok profile)
    }
    /// Every community/server the signed-in user has played on, with per-server player detail.
    #[oai(path="/accounts/me/communities", method="get")]
    async fn get_my_communities(&self, Data(app): Data<&AppData>, TokenBearer(user_token): TokenBearer) ->  Response<Vec<CommunityPlayerDetail>> {
        let pool = &*app.pool;
        let steam_id = user_token.id.to_string();

        let servers_played = sqlx::query_as!(
            DbCommunityServerEntry,
            "WITH user_players AS (
                SELECT DISTINCT player_id
                FROM player
                WHERE player_id = $1 OR associated_player_id = $1
            ),
            known AS (
                SELECT pss.server_id, pss.player_id
                FROM player_server_session pss
                JOIN user_players up ON up.player_id = pss.player_id
                UNION
                SELECT e.server_id, e.player_id
                FROM website.player_external_playtime e
                JOIN user_players up ON up.player_id = e.player_id
            )
            SELECT DISTINCT ON (s.server_id)
                s.server_id,
                k.player_id AS \"player_id!\",
                c.community_id,
                c.community_name,
                c.community_shorten_name,
                c.community_icon_url
            FROM known k
            JOIN server s ON s.server_id = k.server_id
            JOIN community c ON c.community_id = s.community_id
            ORDER BY s.server_id, k.player_id = $1 DESC",
            steam_id
        ).fetch_all(pool).await;

        let servers_played = or_ise!(servers_played);

        let mut results: IndexMap<String, CommunityPlayerDetail> = IndexMap::new();

        for entry in servers_played {
            let server_id = &entry.server_id;
            let player_id = &entry.player_id;

            let Some(server) = get_server(pool, &app.cache, server_id).await else { continue };
            let Some(player) = get_player(pool, &app.cache, player_id).await else { continue };

            let cache_key = get_player_cache_key(pool, &app.cache, server_id, player_id).await;
            let ctx = PlayerContext { player, server: server.clone(), cache_key };

            let Ok(detail) = app.player_worker.get_detail(&ctx, None).await else { continue };
            let server_player = ServerPlayerDetail {
                server_id: server_id.clone(),
                server_name: server.server_name.clone().unwrap_or_default(),
                player: detail,
            };

            let community_id = entry.community_id.to_string();
            let com = results.entry(community_id.clone()).or_insert(CommunityPlayerDetail {
                id: community_id.clone(),
                name: entry.community_name.clone().unwrap_or_default(),
                shorten_name: entry.community_shorten_name.clone(),
                icon_url: entry.community_icon_url.clone(),
                servers: vec![]
            });
            com.servers.push(server_player);
        }

        response!(ok results.into_values().collect())
    }
    /// A player's public profile: aggregate stats, global rank, and per-community/server detail.
    ///
    /// `player_id` may be `"me"` (requires auth) or a numeric Steam ID.
    #[oai(path="/players/:player_id/profile", method="get", tag = "ApiTags::Players")]
    async fn get_user_profile(
        &self,
        Data(app): Data<&AppData>,
        OptionalTokenBearer(requester): OptionalTokenBearer,
        Path(player_id): Path<String>,
    ) -> Response<ProfileResponse> {
        let pool = &*app.pool;
        let target_user_id = match resolve_user_id(&player_id, &requester) {
            Ok(id) => id,
            Err(e) => return e,
        };
        let steam_id = target_user_id.to_string();
        let known_canonical_id = resolve_canonical_player_id(pool, &steam_id).await;
        // Only players this site has recorded get a Steam lookup, so profiles can't be used to probe
        // arbitrary accounts. Spawned up front to run alongside the queries below; if it misses the
        // deadline it keeps going and fills the cache for the next view.
        let steam_items_deadline = tokio::time::Instant::now() + PROFILE_STEAM_ITEMS_WAIT;
        let steam_items_lookup = known_canonical_id.as_deref()
            .and_then(|id| id.parse::<i64>().ok())
            .map(|id| {
                let cache = app.cache.clone();
                tokio::task::spawn(async move { get_steam_profile_items(&cache, id).await })
            });
        let canonical_id = known_canonical_id.unwrap_or_else(|| steam_id.clone());
        let canonical_user_id = canonical_id.parse::<i64>().unwrap_or(target_user_id);
        let requester_id = requester.as_ref().map(|token| token.id);
        let is_owner = requester_id == Some(canonical_user_id);

        let servers_played = sqlx::query_as!(
            DbCommunityServerEntry,
            "WITH user_players AS (
                SELECT DISTINCT player_id
                FROM player
                WHERE player_id = $1 OR associated_player_id = $1
            ),
            known AS (
                SELECT pss.server_id, pss.player_id
                FROM player_server_session pss
                JOIN user_players up ON up.player_id = pss.player_id
                UNION
                SELECT e.server_id, e.player_id
                FROM website.player_external_playtime e
                JOIN user_players up ON up.player_id = e.player_id
            )
            SELECT DISTINCT ON (s.server_id)
                s.server_id,
                k.player_id AS \"player_id!\",
                c.community_id,
                c.community_name,
                c.community_shorten_name,
                c.community_icon_url
            FROM known k
            JOIN server s ON s.server_id = k.server_id
            JOIN community c ON c.community_id = s.community_id
            ORDER BY s.server_id, k.player_id = $1 DESC",
            canonical_id
        ).fetch_all(pool).await;

        let servers_played = or_ise!(servers_played);

        let anonymization_settings = sqlx::query_as!(
            DbUserAnonymization,
            "SELECT user_id, community_id, anonymized, hide_location FROM website.user_anonymization WHERE user_id = $1",
            canonical_user_id
        ).fetch_all(pool).await;
        let anonymization_settings = or_ise!(anonymization_settings);

        let anonymized_community_ids = or_ise!(hidden_community_ids(
            app,
            &canonical_id,
            &anonymization_settings,
            requester_id,
        ).await);

        let all_community_ids: HashSet<Uuid> = servers_played.iter().map(|e| e.community_id).collect();
        let has_visible_community = all_community_ids.iter().any(|c| !anonymized_community_ids.contains(c));

        let current_name = get_player(pool, &app.cache, &canonical_id).await.map(|p| p.player_name);

        let persona_name = sqlx::query_scalar!(
            "SELECT persona_name FROM website.steam_user WHERE user_id = $1",
            canonical_user_id
        ).fetch_optional(pool).await.ok().flatten();

        let mut results: IndexMap<String, ProfileCommunityDetail> = IndexMap::new();
        let mut total_playtime = 0f64;
        let mut is_online = false;
        let mut last_online: Option<DateTime<Utc>> = None;
        let mut last_session_duration: Option<f64> = None;
        let mut latest_started_at: Option<OffsetDateTime> = None;

        let canonical = canonical_id.as_str();
        let current_name_ref = current_name.as_ref();
        let visible_servers: Vec<&DbCommunityServerEntry> = servers_played.iter()
            .filter(|entry| !anonymized_community_ids.contains(&entry.community_id))
            .collect();
        let lookups: Vec<_> = visible_servers.iter().copied()
            .map(|entry| profile_server_entry(app, entry, canonical, current_name_ref, is_owner))
            .collect();
        let server_entries: Vec<_> = stream::iter(lookups)
            .buffered(PROFILE_SERVER_CONCURRENCY)
            .collect()
            .await;

        for (entry, server_entry) in visible_servers.into_iter().zip(server_entries) {
            let Some((server_entry, started_at)) = server_entry else { continue };
            if server_entry.is_online {
                is_online = true;
            }
            if let Some(started) = started_at {
                let is_newer = match latest_started_at {
                    Some(latest) => started > latest,
                    None => true,
                };
                if is_newer {
                    latest_started_at = Some(started);
                    last_online = server_entry.last_played;
                    last_session_duration = server_entry.last_played_duration;
                }
            }

            total_playtime += server_entry.player.total_playtime;

            let community_id = entry.community_id.to_string();
            let com = results.entry(community_id.clone()).or_insert(ProfileCommunityDetail {
                id: community_id.clone(),
                name: entry.community_name.clone().unwrap_or_default(),
                shorten_name: entry.community_shorten_name.clone(),
                icon_url: entry.community_icon_url.clone(),
                rank: None,
                servers: vec![]
            });
            com.servers.push(server_entry);
        }

        let community_ranks = sqlx::query!(
            "SELECT community_id::text AS \"community_id!\",
                    playtime_rank AS \"rank!\",
                    total_players AS \"total_players!\"
             FROM website.player_community_ranks
             WHERE player_id = $1",
            canonical_id
        ).fetch_all(pool).await.unwrap_or_else(|e| {
            tracing::error!("Failed to read community ranks of {canonical_id}: {e}");
            vec![]
        });
        for row in community_ranks {
            if let Some(com) = results.get_mut(&row.community_id) {
                com.rank = Some(CommunityPlaytimeRank { rank: row.rank, total_players: row.total_players });
            }
        }

        let communities: Vec<ProfileCommunityDetail> = results.into_values().collect();
        let community_count = communities.len() as i64;
        let server_count = communities.iter().map(|c| c.servers.len() as i64).sum();

        let best_rank = get_global_best_rank(pool, &app.cache, &canonical_id).await;
        let best_map_rank = sqlx::query_as!(
            PlayerMapRank,
            "SELECT map AS \"map!\", map_rank AS \"rank!\", total_players AS \"total_players!\"
             FROM website.player_global_map_rank
             WHERE player_id = $1 AND total_playtime > make_interval(hours => $2)
             ORDER BY map_rank::float8 / total_players, total_playtime DESC, map
             LIMIT 1",
            canonical_id,
            BEST_MAP_RANK_MIN_HOURS
        ).fetch_optional(pool).await.unwrap_or_else(|e| {
            tracing::error!("Failed to read the best map rank of {canonical_id}: {e}");
            None
        });

        let global = app.player_worker
            .get_global_playtime(&canonical_id)
            .await
            .unwrap_or_default();

        let can_manage_anonymization = match requester_id {
            Some(id) => is_owner || check_superuser(app, id).await,
            None => false,
        };
        let anonymization = if can_manage_anonymization {
            Some(anonymization_settings.iter_into())
        } else {
            None
        };

        let profile_name = if is_owner || all_community_ids.is_empty() || has_visible_community {
            persona_name.or(current_name)
        } else {
            Some("Anonymous".to_string())
        };

        let steam_items = match steam_items_lookup {
            Some(lookup) => match tokio::time::timeout_at(steam_items_deadline, lookup).await {
                Ok(Ok(Ok(items))) => Some(items),
                _ => None,
            },
            None => None,
        };

        response!(ok ProfileResponse {
            steamid: steam_id,
            name: profile_name,
            summary: ProfileSummary {
                total_playtime,
                community_count,
                server_count,
                is_online,
                last_online,
                last_session_duration,
                best_rank,
                best_map_rank,
                global,
            },
            communities,
            is_owner,
            can_manage_anonymization,
            anonymization,
            steam_items,
        })
    }
    /// A player's total playtime summed across every server. `player_id` may be `"me"` or a numeric
    /// Steam ID.
    #[oai(path="/players/:player_id/global-playtime", method="get", tag = "ApiTags::Players")]
    async fn get_user_global_playtime(
        &self,
        Data(app): Data<&AppData>,
        OptionalTokenBearer(requester): OptionalTokenBearer,
        Path(player_id): Path<String>,
    ) -> Response<GlobalPlaytimeSummary> {
        let pool = &*app.pool;
        let target_user_id = match resolve_user_id(&player_id, &requester) {
            Ok(id) => id,
            Err(e) => return e,
        };

        let Some(canonical_id) = resolve_canonical_player_id(pool, &target_user_id.to_string()).await else {
            return response!(ok GlobalPlaytimeSummary::default());
        };

        let result = app.player_worker.get_global_playtime(&canonical_id).await;
        handle_worker_result(result, "Player not found")
    }

    /// A player's playtime by day, summed across every server they've played on, with each day split
    /// by community.
    ///
    /// `player_id` may be `"me"` or a numeric Steam ID. Communities where the target anonymized
    /// themselves are excluded for viewers without permission for those communities.
    #[oai(path="/players/:player_id/playtime-heatmap", method="get", tag = "ApiTags::Players", operation_id = "get_player_global_playtime_heatmap", tag = "ApiTags::Mcp")]
    async fn get_user_playtime_heatmap(
        &self,
        Data(app): Data<&AppData>,
        OptionalTokenBearer(requester): OptionalTokenBearer,
        Path(player_id): Path<String>,
    ) -> Response<Vec<GlobalPlayerSessionTime>> {
        let pool = &*app.pool;
        let scope = match resolve_profile_scope(app, &player_id, &requester).await {
            Ok(scope) => scope,
            Err(e) => return e,
        };

        let result = sqlx::query_as!(
            DbCommunityDayTime,
            "WITH user_players AS (
                SELECT player_id FROM player WHERE player_id = $1 OR associated_player_id = $1
            )
            SELECT
                DATE_TRUNC('day', pss.started_at) AS bucket_time,
                s.community_id::text AS \"community_id!\",
                SUM(EXTRACT(EPOCH FROM (pss.ended_at - pss.started_at)))::float8 AS seconds
            FROM player_server_session pss
            JOIN user_players up ON up.player_id = pss.player_id
            JOIN server s ON s.server_id = pss.server_id
            WHERE NOT (s.community_id = ANY($2))
            GROUP BY bucket_time, s.community_id
            ORDER BY bucket_time",
            scope.canonical_id,
            &scope.excluded_community_ids
        ).fetch_all(pool).await;

        let result = or_ise!(result);

        let to_hours = |seconds: f64| (seconds / 36.0).round() / 100.0;
        let mut days: Vec<GlobalPlayerSessionTime> = vec![];
        for row in result {
            let bucket_time = row.bucket_time.to_utc_time();
            let seconds = row.seconds.unwrap_or_default();
            match days.last_mut() {
                Some(day) if day.bucket_time == bucket_time => {
                    day.hours += seconds;
                    day.communities.push(CommunityHours { community_id: row.community_id, hours: seconds });
                }
                _ => days.push(GlobalPlayerSessionTime {
                    bucket_time,
                    hours: seconds,
                    communities: vec![CommunityHours { community_id: row.community_id, hours: seconds }],
                }),
            }
        }
        for day in &mut days {
            day.hours = to_hours(day.hours);
            day.communities.sort_by(|a, b| b.hours.total_cmp(&a.hours));
            for community in &mut day.communities {
                community.hours = to_hours(community.hours);
            }
        }

        response!(ok days)
    }
    /// Paginated list of a player's sessions across every server they have played on.
    ///
    /// `player_id` may be `"me"` (requires auth) or a numeric Steam ID. `datetime` narrows the list
    /// to the single UTC day it falls in; omitted, every session is listed. `page` is zero-based and
    /// pages are 10 rows. Communities where the target anonymized themselves are omitted for
    /// viewers without permission, matching `/players/{player_id}/profile`.
    #[oai(path="/players/:player_id/sessions", method="get", tag = "ApiTags::Players")]
    async fn get_user_global_sessions(
        &self,
        Data(app): Data<&AppData>,
        OptionalTokenBearer(requester): OptionalTokenBearer,
        Path(player_id): Path<String>,
        Query(page): Query<Option<usize>>,
        Query(datetime): Query<Option<DateTime<Utc>>>,
    ) -> Response<GlobalPlayerSessionPage> {
        const PAGE_SIZE: i64 = 10;

        let pool = &*app.pool;
        let scope = match resolve_profile_scope(app, &player_id, &requester).await {
            Ok(scope) => scope,
            Err(e) => return e,
        };

        let offset = PAGE_SIZE * page.unwrap_or(0) as i64;
        let (start, end) = match datetime {
            Some(date) => (
                Some(date.to_db_time()),
                Some((date + TimeDelta::days(1)).to_db_time()),
            ),
            None => (None, None),
        };

        let result = sqlx::query_as!(
            DbGlobalPlayerSession,
            "WITH user_players AS (
                SELECT player_id FROM player WHERE player_id = $1 OR associated_player_id = $1
            )
            SELECT
                pss.session_id::text AS \"session_id!\",
                pss.player_id,
                pss.server_id,
                s.server_name,
                c.community_id::text AS community_id,
                c.community_name,
                c.community_icon_url,
                pss.started_at,
                pss.ended_at,
                COUNT(*) OVER() AS total_rows
            FROM player_server_session pss
            JOIN user_players up ON up.player_id = pss.player_id
            JOIN server s ON s.server_id = pss.server_id
            LEFT JOIN community c ON c.community_id = s.community_id
            WHERE (c.community_id IS NULL OR NOT (c.community_id = ANY($2)))
                AND ($3::timestamptz IS NULL OR pss.started_at >= $3)
                AND ($4::timestamptz IS NULL OR pss.started_at < $4)
            ORDER BY pss.started_at DESC
            LIMIT $5
            OFFSET $6",
            scope.canonical_id,
            &scope.excluded_community_ids,
            start,
            end,
            PAGE_SIZE,
            offset
        ).fetch_all(pool).await;

        let result = or_ise!(result);

        let total_rows = result.first().and_then(|e| e.total_rows).unwrap_or_default();
        let total_pages = (total_rows + PAGE_SIZE - 1) / PAGE_SIZE;

        response!(ok GlobalPlayerSessionPage{ total_pages, total_rows, rows: result.iter_into() })
    }
    /// How many sessions a player has across every server, and how long they last.
    ///
    /// `player_id` may be `"me"` (requires auth) or a numeric Steam ID. Lengths cover finished
    /// sessions only. Communities where the target anonymized themselves are left out for viewers
    /// without permission, matching `/players/{player_id}/sessions`.
    #[oai(path="/players/:player_id/session-stats", method="get", tag = "ApiTags::Players")]
    async fn get_user_session_stats(
        &self,
        Data(app): Data<&AppData>,
        OptionalTokenBearer(requester): OptionalTokenBearer,
        Path(player_id): Path<String>,
    ) -> Response<PlayerSessionStats> {
        let pool = &*app.pool;
        let scope = match resolve_profile_scope(app, &player_id, &requester).await {
            Ok(scope) => scope,
            Err(e) => return e,
        };

        let result = sqlx::query_as!(
            DbPlayerSessionStats,
            "WITH user_players AS (
                SELECT player_id FROM player WHERE player_id = $1 OR associated_player_id = $1
            ),
            sessions AS (
                SELECT pss.started_at,
                       EXTRACT(EPOCH FROM (pss.ended_at - pss.started_at))::float8 AS duration
                FROM player_server_session pss
                JOIN user_players up ON up.player_id = pss.player_id
                JOIN server s ON s.server_id = pss.server_id
                WHERE s.community_id IS NULL OR NOT (s.community_id = ANY($2))
            ),
            longest AS (
                SELECT started_at, duration
                FROM sessions
                WHERE duration IS NOT NULL
                ORDER BY duration DESC
                LIMIT 1
            )
            SELECT
                (SELECT COUNT(*) FROM sessions) AS \"total_sessions!\",
                (SELECT AVG(duration) FROM sessions) AS average_duration,
                (SELECT duration FROM longest) AS longest_duration,
                (SELECT started_at FROM longest) AS longest_started_at",
            scope.canonical_id,
            &scope.excluded_community_ids
        ).fetch_one(pool).await;

        let result = or_ise!(result, e => "Failed to read session stats of {}: {e}", scope.canonical_id);
        response!(ok result.into())
    }
    /// Every map a player has played, with their time summed across servers and split by community.
    ///
    /// `player_id` may be `"me"` (requires auth) or a numeric Steam ID. Sorted by time, most played
    /// first. `rank` orders every player on the map by their time summed across servers, the same
    /// ranking as `/maps/{map_name}/top_players`, as of the last daily refresh. Communities where the
    /// target anonymized themselves are left out for viewers without permission.
    #[oai(path="/players/:player_id/maps", method="get", tag = "ApiTags::Players")]
    async fn get_user_global_maps(
        &self,
        Data(app): Data<&AppData>,
        OptionalTokenBearer(requester): OptionalTokenBearer,
        Path(player_id): Path<String>,
    ) -> Response<Vec<GlobalPlayerMap>> {
        let pool = &*app.pool;
        let scope = match resolve_profile_scope(app, &player_id, &requester).await {
            Ok(scope) => scope,
            Err(e) => return e,
        };

        let result = sqlx::query_as!(
            DbGlobalPlayerMapCommunity,
            "WITH user_players AS (
                SELECT player_id FROM player WHERE player_id = $1 OR associated_player_id = $1
            ),
            per_community AS (
                SELECT pmt.map, s.community_id, SUM(pmt.total_playtime) AS total_playtime
                FROM website.player_map_time pmt
                JOIN user_players up ON up.player_id = pmt.player_id
                JOIN server s ON s.server_id = pmt.server_id
                WHERE NOT (s.community_id = ANY($2))
                GROUP BY pmt.map, s.community_id
                HAVING SUM(pmt.total_playtime) > INTERVAL '0'
            )
            SELECT
                pc.map AS \"map!\",
                pc.community_id::text AS \"community_id!\",
                EXTRACT(EPOCH FROM pc.total_playtime)::float8 AS \"duration!\",
                r.map_rank AS rank,
                r.total_players
            FROM per_community pc
            LEFT JOIN website.player_global_map_rank r ON r.player_id = $1 AND r.map = pc.map
            ORDER BY pc.map",
            scope.canonical_id,
            &scope.excluded_community_ids
        ).fetch_all(pool).await;

        let result = or_ise!(result, e => "Failed to read global maps of {}: {e}", scope.canonical_id);

        let mut maps: Vec<GlobalPlayerMap> = vec![];
        for row in result {
            let community = CommunityDuration { community_id: row.community_id, duration: row.duration };
            match maps.last_mut() {
                Some(map) if map.map == row.map => {
                    map.total_duration += community.duration;
                    map.communities.push(community);
                }
                _ => maps.push(GlobalPlayerMap {
                    map: row.map,
                    total_duration: community.duration,
                    rank: row.rank,
                    total_players: row.total_players,
                    communities: vec![community],
                }),
            }
        }
        for map in &mut maps {
            map.communities.sort_by(|a, b| b.duration.total_cmp(&a.duration));
        }
        maps.sort_by(|a, b| b.total_duration.total_cmp(&a.total_duration));

        response!(ok maps)
    }
    /// When a player is online across every server, by local hour of day and weekday, split by
    /// community.
    ///
    /// `player_id` may be `"me"` (requires auth) or a numeric Steam ID. `tz` is an IANA timezone the
    /// hours and weekdays are reported in, UTC when omitted. Each session's time is spread over the
    /// hours it covers; a session still running counts up to when it was last seen. Communities
    /// where the target anonymized themselves are left out for viewers without permission.
    #[oai(path="/players/:player_id/online-activity", method="get", tag = "ApiTags::Players")]
    async fn get_user_online_activity(
        &self,
        Data(app): Data<&AppData>,
        OptionalTokenBearer(requester): OptionalTokenBearer,
        Path(player_id): Path<String>,
        Query(tz): Query<Option<String>>,
    ) -> Response<PlayerOnlineActivity> {
        let pool = &*app.pool;
        let scope = match resolve_profile_scope(app, &player_id, &requester).await {
            Ok(scope) => scope,
            Err(e) => return e,
        };

        let timezone = tz.filter(|tz| !tz.is_empty()).unwrap_or_else(|| "UTC".to_string());
        if timezone != "UTC" {
            let known = sqlx::query_scalar!(
                "SELECT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name = $1) AS \"known!\"",
                timezone
            ).fetch_one(pool).await;
            if !or_ise!(known) {
                return response!(err "Unknown timezone", ErrorCode::BadRequest);
            }
        }

        let result = sqlx::query_as!(
            DbOnlineActivityHour,
            "WITH user_players AS (
                SELECT player_id FROM player WHERE player_id = $1 OR associated_player_id = $1
            ),
            sessions AS (
                SELECT s.community_id,
                       pss.started_at AT TIME ZONE $3 AS started_local,
                       COALESCE(pss.ended_at, LEAST(pss.last_verified, CURRENT_TIMESTAMP)) AT TIME ZONE $3 AS ended_local
                FROM player_server_session pss
                JOIN user_players up ON up.player_id = pss.player_id
                JOIN server s ON s.server_id = pss.server_id
                WHERE NOT (s.community_id = ANY($2))
            ),
            slices AS (
                SELECT se.community_id,
                       h AS hour_start,
                       EXTRACT(EPOCH FROM (
                           LEAST(se.ended_local, h + INTERVAL '1 hour') - GREATEST(se.started_local, h)
                       )) AS seconds
                FROM sessions se
                CROSS JOIN LATERAL generate_series(
                    date_trunc('hour', se.started_local), se.ended_local, INTERVAL '1 hour'
                ) AS h
                WHERE se.ended_local > se.started_local
            )
            SELECT
                community_id::text AS \"community_id!\",
                hour_start::date AS \"day!\",
                EXTRACT(HOUR FROM hour_start)::int AS \"hour!\",
                SUM(seconds)::float8 AS \"seconds!\"
            FROM slices
            WHERE seconds > 0
            GROUP BY 1, 2, 3",
            scope.canonical_id,
            &scope.excluded_community_ids,
            timezone
        ).fetch_all(pool).await;

        let result = or_ise!(result, e => "Failed to read online activity of {}: {e}", scope.canonical_id);

        let mut buckets: IndexMap<(String, i32, i32), f64> = IndexMap::new();
        let mut days: HashSet<sqlx::types::time::Date> = HashSet::new();
        for row in result {
            let weekday = row.day.weekday().number_from_monday() as i32;
            *buckets.entry((row.community_id, weekday, row.hour)).or_default() += row.seconds;
            days.insert(row.day);
        }
        let mut active_days: IndexMap<i32, i64> = (1..=7).map(|weekday| (weekday, 0)).collect();
        for day in days {
            *active_days.entry(day.weekday().number_from_monday() as i32).or_default() += 1;
        }

        response!(ok PlayerOnlineActivity {
            timezone,
            buckets: buckets.into_iter()
                .map(|((community_id, weekday, hour), seconds)| OnlineActivityBucket { community_id, weekday, hour, seconds })
                .collect(),
            active_days: active_days.into_iter()
                .map(|(weekday, days)| WeekdayActiveDays { weekday, days })
                .collect(),
        })
    }
    /// A player's infraction (ban/mute) history across every server they have played on, newest
    /// first.
    ///
    /// `player_id` may be `"me"` (requires auth) or a numeric Steam ID. Communities where the target
    /// anonymized themselves are left out for viewers without permission.
    #[oai(path="/players/:player_id/infractions", method="get", tag = "ApiTags::Players")]
    async fn get_user_global_infractions(
        &self,
        Data(app): Data<&AppData>,
        OptionalTokenBearer(requester): OptionalTokenBearer,
        Path(player_id): Path<String>,
    ) -> Response<Vec<GlobalPlayerInfraction>> {
        let pool = &*app.pool;
        let scope = match resolve_profile_scope(app, &player_id, &requester).await {
            Ok(scope) => scope,
            Err(e) => return e,
        };

        let result = sqlx::query_as!(
            DbGlobalPlayerInfraction,
            "WITH found AS (
                SELECT infraction_id, source,
                       payload->>'server_id' AS server_id,
                       payload->>'reason' AS reason,
                       payload->'admin'->>'admin_name' AS by,
                       payload->'admin'->>'avatar_id' AS admin_avatar,
                       (payload->>'flags')::bigint AS flags,
                       to_timestamp((payload->>'created')::double precision::bigint) AS infraction_time
                FROM public.server_infractions
                WHERE payload->'player'->>'gs_id' = $1
                    AND payload->>'server_id' <> $3
                UNION ALL
                SELECT infraction_id, source,
                       payload->>'server_id' AS server_id,
                       payload->>'reason' AS reason,
                       payload->>'admin' AS by,
                       NULL AS admin_avatar,
                       (payload->>'flags')::bigint AS flags,
                       to_timestamp((payload->>'invoked_on')::double precision::bigint) AS infraction_time
                FROM public.server_infractions
                WHERE payload->>'steam64_id' = $1
                    AND payload->>'server_id' = $3
            )
            SELECT
                f.infraction_id AS \"infraction_id!\",
                f.source AS \"source!\",
                f.reason,
                f.by,
                f.admin_avatar,
                f.flags,
                f.infraction_time,
                s.server_id,
                s.community_id::text AS \"community_id!\"
            FROM found f
            JOIN server s ON s.server_id = f.server_id
            WHERE NOT (s.community_id = ANY($2))
            ORDER BY f.infraction_time DESC NULLS LAST",
            scope.canonical_id,
            &scope.excluded_community_ids,
            NIDE_SERVER_ID
        ).fetch_all(pool).await;

        let result = or_ise!(result, e => "Failed to read global infractions of {}: {e}", scope.canonical_id);
        response!(ok result.iter_into())
    }
    /// Set the signed-in user's anonymization/location-hiding preference for one community.
    #[oai(path="/accounts/me/anonymize", method="post")]
    async fn set_user_anonymization(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
        Json(request): Json<AnonymizationRequest>,
    ) -> Response<UserAnonymization> {
        let user_id = user_token.id;
        let Ok(uuid) = Uuid::parse_str(&request.community_id) else {
            return response!(err "Invalid community ID", ErrorCode::BadRequest);
        };

        let result = sqlx::query_as!(DbUserAnonymization,
            "INSERT INTO website.user_anonymization (user_id, community_id, anonymized, hide_location)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (user_id, community_id)
             DO UPDATE SET anonymized = $3, hide_location=$4, updated_at = CURRENT_TIMESTAMP
             RETURNING user_id, community_id, anonymized, hide_location",
            user_id,
            uuid,
            request.anonymize,
            request.hide_location
        )
        .fetch_one(&*data.pool)
        .await;

        let setting = or_ise!(result, e => "Failed to set anonymization: {}", e);
        response!(ok setting.into())
    }

    /// The signed-in user's anonymization settings across every community they've configured.
    #[oai(path="/accounts/me/anonymize", method="get")]
    async fn get_user_anonymization(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
    ) -> Response<Vec<UserAnonymization>> {
        let user_id = user_token.id;

        let settings = or_ise!(sqlx::query_as!(
            DbUserAnonymization,
            "SELECT user_id, community_id, anonymized, hide_location FROM website.user_anonymization
             WHERE user_id = $1",
            user_id
        )
        .fetch_all(&*data.pool)
        .await, e => "Failed to fetch anonymization settings: {}", e);

        response!(ok settings.iter_into())
    }

    /// Set another user's anonymization preference for one community.
    ///
    /// Requires being that user, a superuser, or a community admin of that community.
    #[oai(path="/accounts/:user_id/anonymize", method="post")]
    async fn set_other_user_anonymization(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(requester_token): TokenBearer,
        Path(user_id): Path<i64>,
        Json(request): Json<AnonymizationRequest>,
    ) -> Response<UserAnonymization> {
        let requester_id = requester_token.id;

        let Ok(uuid) = Uuid::parse_str(&request.community_id) else {
            return response!(err "Invalid community ID", ErrorCode::BadRequest);
        };

        let user_id = resolve_canonical_player_id(&data.pool, &user_id.to_string())
            .await
            .and_then(|id| id.parse::<i64>().ok())
            .unwrap_or(user_id);

        let has_permission = or_ise!(check_permission(data, requester_id, user_id, uuid).await);

        require!(has_permission, "Insufficient permissions", ErrorCode::Forbidden);

        let user_exists = or_ise!(sqlx::query_scalar!(
            "SELECT EXISTS(SELECT 1 FROM website.steam_user WHERE user_id = $1)",
            user_id
        )
        .fetch_one(&*data.pool)
        .await);

        if user_exists != Some(true) {
            return response!(err "Target user not found", ErrorCode::NotFound);
        }

        let acting_for_other = requester_id != user_id;
        let previous = if acting_for_other {
            sqlx::query_as!(DbUserAnonymization,
                "SELECT user_id, community_id, anonymized, hide_location
                 FROM website.user_anonymization WHERE user_id = $1 AND community_id = $2",
                user_id,
                uuid
            ).fetch_optional(&*data.pool).await.ok().flatten()
        } else {
            None
        };

        let result = sqlx::query_as!(DbUserAnonymization,
            "INSERT INTO website.user_anonymization (user_id, community_id, anonymized, hide_location)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (user_id, community_id)
             DO UPDATE SET anonymized = $3, hide_location=$4, updated_at = CURRENT_TIMESTAMP
             RETURNING user_id, community_id, anonymized, hide_location",
            user_id,
            uuid,
            request.anonymize,
            request.hide_location
        )
        .fetch_one(&*data.pool)
        .await;

        let setting = or_ise!(result, e => "Failed to set anonymization: {}", e);
        if acting_for_other {
            let changes = serde_json::json!({
                "target_user_id": user_id.to_string(),
                "community_id": request.community_id,
                "anonymized": {
                    "old": previous.as_ref().map(|p| p.anonymized),
                    "new": setting.anonymized,
                },
                "hide_location": {
                    "old": previous.as_ref().map(|p| p.hide_location),
                    "new": setting.hide_location,
                },
            });
            if let Err(e) = insert_audit_log(
                &*data.pool,
                CATEGORY_USER_PRIVACY,
                ACTION_UPDATE_ANONYMIZATION,
                None,
                None,
                requester_id,
                &changes,
            ).await {
                tracing::error!("Failed to audit anonymization change for {user_id}: {e}");
            }
        }
        response!(ok  setting.into())
    }

    /// Another user's anonymization settings across every community.
    ///
    /// Only requires the caller to be signed in; there is no additional ownership or role check.
    #[oai(path="/accounts/:user_id/anonymize", method="get")]
    async fn get_other_user_anonymization(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(_requester_token): TokenBearer,
        Path(user_id): Path<i64>,
    ) -> Response<Vec<UserAnonymization>> {
        let target_user_id = user_id;

        let s = or_ise!(sqlx::query_as!(
            DbUserAnonymization,
            "SELECT community_id, anonymized, hide_location, user_id FROM website.user_anonymization
             WHERE user_id = $1",
            target_user_id
        )
        .fetch_all(&*data.pool)
        .await, e => "Failed to fetch anonymization settings: {}", e);
        response!(ok s.iter_into())
    }

    /// Paginated list of map-music reports (e.g. wrong/missing YouTube link). Requires the
    /// `superuser` role.
    ///
    /// `status` filters to `pending`/`resolved`/`dismissed`; pages are 20 reports each.
    #[oai(path="/admin/reports/music", method="get", tag = "ApiTags::AdminReports")]
    async fn get_music_reports(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
        Query(page): Query<Option<i64>>,
        Query(status): Query<Option<String>>,
    ) -> Response<MapMusicReportsPaginated> {
        require!(check_superuser(data, user_token.id).await, "Unauthorized", ErrorCode::Forbidden);

        let page = page.unwrap_or(1).max(1);
        let limit = 20i64;
        let offset = (page - 1) * limit;

        let status_filter = status.as_deref();

        let reports = or_ise!(sqlx::query_as!(
            DbMapMusicReportFull,
            r#"
            SELECT
                r.id,
                r.music_id,
                r.user_id,
                r.reason,
                r.details,
                r.suggested_youtube_url,
                r.current_youtube_music,
                r.status,
                r.resolved_by,
                r.resolved_at,
                r.timestamp,
                m.music_name,
                m.duration AS music_duration,
                m.source AS "music_source?",
                COALESCE(reporter.persona_name, NULL) AS reporter_name,
                COALESCE(resolver.persona_name, NULL) AS resolver_name,
                ARRAY_AGG(DISTINCT amm.map_name ORDER BY amm.map_name) FILTER (WHERE amm.map_name IS NOT NULL) AS associated_maps,
                COUNT(*) OVER() AS total_reports
            FROM website.report_map_music r
            LEFT JOIN map_music m ON r.music_id = m.id
            LEFT JOIN associated_map_music amm ON m.id = amm.map_music_id
            LEFT JOIN website.steam_user reporter ON r.user_id = reporter.user_id
            LEFT JOIN website.steam_user resolver ON r.resolved_by = resolver.user_id
            WHERE ($1::text IS NULL OR r.status = $1)
            GROUP BY r.id, r.music_id, r.user_id, r.reason, r.details, r.suggested_youtube_url,
                     r.current_youtube_music, r.status, r.resolved_by, r.resolved_at, r.timestamp,
                     m.music_name, m.duration, m.source, reporter.persona_name, resolver.persona_name
            ORDER BY r.timestamp DESC
            LIMIT $2 OFFSET $3
            "#,
            status_filter,
            limit,
            offset
        )
        .fetch_all(&*data.pool)
        .await, e => "Failed to fetch music reports: {}", e);

        let total = reports.first().and_then(|r| r.total_reports).unwrap_or(0);

        response!(ok MapMusicReportsPaginated {
            total,
            reports: reports.into_iter().map(Into::into).collect(),
        })
    }

    /// Change a map-music report's status. Requires the `superuser` role.
    ///
    /// Resolving a report that carries a suggested YouTube URL applies it to the track and
    /// credits the reporter as its source.
    #[oai(path="/admin/reports/music/:report_id/status", method="put", tag = "ApiTags::AdminReports")]
    async fn update_music_report_status(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
        Path(report_id): Path<String>,
        Json(payload): Json<UpdateReportStatusDto>,
    ) -> Response<MapMusicReportAdmin> {
        require!(check_superuser(data, user_token.id).await, "Unauthorized", ErrorCode::Forbidden);

        let Ok(report_uuid) = Uuid::parse_str(&report_id) else {
            return response!(err "Invalid report ID", ErrorCode::BadRequest);
        };

        if !["resolved", "dismissed", "pending"].contains(&payload.status.as_str()) {
            return response!(err "Invalid status. Must be 'resolved', 'dismissed', or 'pending'", ErrorCode::BadRequest);
        }

        let resolved_by = if payload.status == "pending" { None } else { Some(user_token.id) };

        let Some(report) = or_ise!(sqlx::query_as!(
            DbMapMusicReportFull,
            r#"
            UPDATE website.report_map_music
            SET status = $1::TEXT, resolved_by = $2, resolved_at = CASE WHEN $1 = 'pending' THEN NULL ELSE CURRENT_TIMESTAMP END
            WHERE id = $3
            RETURNING
                id,
                music_id,
                user_id,
                reason,
                details,
                suggested_youtube_url,
                current_youtube_music,
                status,
                resolved_by,
                resolved_at,
                timestamp,
                (SELECT music_name FROM map_music WHERE id = music_id) AS music_name,
                (SELECT duration FROM map_music WHERE id = music_id) AS music_duration,
                (SELECT source FROM map_music WHERE id = music_id) AS music_source,
                (SELECT persona_name FROM website.steam_user WHERE user_id = report_map_music.user_id) AS reporter_name,
                (SELECT persona_name FROM website.steam_user WHERE user_id = report_map_music.resolved_by) AS resolver_name,
                ARRAY(SELECT map_name FROM associated_map_music WHERE map_music_id = music_id ORDER BY map_name) AS associated_maps,
                1::bigint AS total_reports
            "#,
            payload.status,
            resolved_by,
            report_uuid
        )
        .fetch_optional(&*data.pool)
        .await, e => "Failed to update music report: {}", e) else {
            return response!(err "Report not found", ErrorCode::NotFound);
        };

        if payload.status == "resolved" {
            if let Some(ref suggested_url) = report.suggested_youtube_url {
                if let Some(video_id) = extract_youtube_id(suggested_url) {
                    let update_result = sqlx::query!(
                        "UPDATE map_music SET youtube_music = $1, yt_source = $2 WHERE id = $3",
                        video_id,
                        report.user_id,
                        report.music_id
                    )
                    .execute(&*data.pool)
                    .await;

                    if let Err(e) = update_result {
                        tracing::error!("Failed to update music with reporter credit: {}", e);
                    }
                }
            }
        }

        response!(ok report.into())
    }

    /// Directly set a map music track's YouTube link. Requires the `superuser` role.
    #[oai(path="/admin/music/:music_id/youtube", method="put", tag = "ApiTags::AdminReports")]
    async fn update_music_youtube(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
        Path(music_id): Path<String>,
        Json(payload): Json<UpdateMapMusicDto>,
    ) -> Response<String> {
        require!(check_superuser(data, user_token.id).await, "Unauthorized", ErrorCode::Forbidden);

        let Ok(music_uuid) = Uuid::parse_str(&music_id) else {
            return response!(err "Invalid music ID", ErrorCode::BadRequest);
        };

        let result = sqlx::query!(
            r#"
            UPDATE map_music
            SET youtube_music = $1, yt_source = $2
            WHERE id = $3
            "#,
            payload.youtube_music,
            user_token.id,
            music_uuid
        )
        .execute(&*data.pool)
        .await;

        let result = or_ise!(result, e => "Failed to update music YouTube ID: {}", e);
        if result.rows_affected() == 0 {
            return response!(err "Music track not found", ErrorCode::NotFound);
        }
        response!(ok "Updated successfully".into())
    }

    /// Paginated list of every announcement, including hidden/scheduled/expired ones. Requires
    /// the `superuser` role.
    ///
    /// `status` filters to `active`/`scheduled`/`expired`/`hidden`/`all`; `type` filters by
    /// announcement type. Pages are 20 each.
    #[oai(path="/admin/announcements", method="get", tag = "ApiTags::Announcements")]
    async fn get_announcements_admin(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
        Query(page): Query<Option<i64>>,
        Query(status): Query<Option<AnnouncementStatus>>,
        Query(r#type): Query<Option<AnnouncementType>>,
    ) -> Response<AnnouncementsPaginated> {
        require!(check_superuser(data, user_token.id).await, "Unauthorized", ErrorCode::Forbidden);

        let page = page.unwrap_or(1).max(1);
        let limit = 20i64;
        let offset = (page - 1) * limit;

        let mut all_announcements = or_ise!(sqlx::query_as!(
            DbAnnouncement,
            r#"
            SELECT id, type as "type!: AnnouncementTypeState", title, text, created_at, published_at, expires_at, show
            FROM website.announce
            ORDER BY created_at DESC
            "#
        )
        .fetch_all(&*data.pool)
        .await, e => "Failed to fetch announcements: {}", e);

        if let Some(type_filter) = r#type {
            let type_state: AnnouncementTypeState = type_filter.into();
            all_announcements.retain(|a| a.r#type == type_state);
        }

        if let Some(status_filter) = status {
            let now = chrono::Utc::now();
            all_announcements.retain(|a| {
                let published_at = db_to_utc(a.published_at);
                let expires_at = a.expires_at.map(db_to_utc);

                match status_filter {
                    AnnouncementStatus::Active => {
                        a.show && published_at <= now && expires_at.map_or(true, |exp| exp > now)
                    },
                    AnnouncementStatus::Scheduled => {
                        a.show && published_at > now
                    },
                    AnnouncementStatus::Expired => {
                        expires_at.map_or(false, |exp| exp <= now)
                    },
                    AnnouncementStatus::Hidden => {
                        !a.show
                    },
                    AnnouncementStatus::All => {
                        true
                    }
                }
            });
        }

        let total = all_announcements.len() as i64;

        let paginated: Vec<DbAnnouncement> = all_announcements
            .into_iter()
            .skip(offset as usize)
            .take(limit as usize)
            .collect();

        response!(ok AnnouncementsPaginated {
            total,
            announcements: paginated.into_iter().map(|a| a.into()).collect(),
        })
    }

    /// Create a site announcement. Requires the `superuser` role.
    ///
    /// `Rich` announcements require a non-empty title; `text` must be 10-10000 characters, and
    /// `title` (if given) 5-200. `published_at` must be before `expires_at` when both are set.
    #[oai(path="/admin/announcements", method="post", tag = "ApiTags::Announcements")]
    async fn create_announcement(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
        Json(payload): Json<CreateAnnouncementDto>,
    ) -> Response<Announcement> {
        require!(check_superuser(data, user_token.id).await, "Unauthorized", ErrorCode::Forbidden);
        match payload.r#type{
            AnnouncementType::Rich => {
                let Some(title) = &payload.title else {
                    return response!(err "Rich announcements require a title", ErrorCode::BadRequest);
                };
                if title.trim().is_empty(){
                    return response!(err "Rich announcements require a title", ErrorCode::BadRequest);
                }
            }
            _ => {}
        }
        if let Some(title) = &payload.title {
            if !(5..=200).contains(&title.chars().count()) {
                return response!(err "Title must be 5-200 characters", ErrorCode::BadRequest);
            }
        }
        if !(10..=10_000).contains(&payload.text.chars().count()) {
            return response!(err "Content must be 10-10000 characters", ErrorCode::BadRequest);
        }
        if let (Some(pub_at), Some(exp_at)) = (&payload.published_at, &payload.expires_at) {
            if pub_at > exp_at {
                return response!(err "published_at must be before expires_at", ErrorCode::BadRequest);
            }
        }

        let published_at = payload.published_at
            .unwrap_or_else(|| Utc::now())
            .to_db_time();

        let ptype: AnnouncementTypeState = payload.r#type.into();
        let announcement = or_ise!(sqlx::query_as!(
            DbAnnouncement,
            r#"
            INSERT INTO website.announce (title, type, text, published_at, expires_at, show)
            VALUES ($1, $2, $3, $4, COALESCE($5::TIMESTAMPTZ, NULL), $6)
            RETURNING id, type AS "type: AnnouncementTypeState", title, text, created_at, published_at, expires_at, show
            "#,
            payload.title,
            ptype as AnnouncementTypeState,
            payload.text,
            published_at,
            payload.expires_at.map(|s| s.to_db_time()),
            payload.show
        )
        .fetch_one(&*data.pool)
        .await, e => "Failed to create announcement: {}", e);
        drop_cached_response(&data.cache, ANNOUNCEMENTS_CACHE_KEY).await;

        response!(ok announcement.into())
    }

    /// Update an announcement's fields. Requires the `superuser` role. Same validation as
    /// creating one.
    #[oai(path="/admin/announcements/:id", method="put", tag = "ApiTags::Announcements")]
    async fn update_announcement(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
        Path(id): Path<String>,
        Json(payload): Json<UpdateAnnouncementDto>,
    ) -> Response<Announcement> {
        require!(check_superuser(data, user_token.id).await, "Unauthorized", ErrorCode::Forbidden);

        if let MaybeUndefined::Value(ref title) = payload.title {
            if !(5..=200).contains(&title.chars().count()) {
                return response!(err "Title must be 5-200 characters", ErrorCode::BadRequest);
            }
        }
        if let Some(ref text) = payload.text {
            if !(10..=10_000).contains(&text.chars().count()) {
                return response!(err "Content must be 10-10000 characters", ErrorCode::BadRequest);
            }
        }
        let Some(current) = or_ise!(sqlx::query_as!(
            DbAnnouncement,
            "SELECT id, type AS \"type: AnnouncementTypeState\", title, text, created_at, published_at, expires_at, show
             FROM website.announce WHERE id = $1::TEXT::UUID",
            id
        )
        .fetch_optional(&*data.pool)
        .await, e => "Failed to fetch announcement: {}", e) else {
            return response!(err "Announcement not found", ErrorCode::NotFound);
        };

        let new_type: AnnouncementTypeState = payload.r#type.map(|e| e.into()).unwrap_or(current.r#type);
        let new_title = match payload.title {
            MaybeUndefined::Value(title) => Some(title),
            MaybeUndefined::Null => None,
            MaybeUndefined::Undefined => current.title,
        };
        let new_text = payload.text.unwrap_or(current.text);
        let new_published_at = payload.published_at.map(|e| e.to_db_time()).unwrap_or(current.published_at);
        let new_expires_at = match payload.expires_at {
            MaybeUndefined::Value(expires_at) => Some(expires_at.to_db_time()),
            MaybeUndefined::Null => None,
            MaybeUndefined::Undefined => current.expires_at,
        };
        let new_show = payload.show.unwrap_or(current.show);

        if new_type == AnnouncementTypeState::Rich && new_title.as_deref().map_or(true, |t| t.trim().is_empty()) {
            return response!(err "Rich announcements require a title", ErrorCode::BadRequest);
        }
        if new_expires_at.is_some_and(|exp_at| new_published_at > exp_at) {
            return response!(err "published_at must be before expires_at", ErrorCode::BadRequest);
        }

        let updated = or_ise!(sqlx::query_as!(
            DbAnnouncement,
            r#"
            UPDATE website.announce
            SET type = $2, title = $3, text = $4, published_at = $5, expires_at = $6, show= $7
            WHERE id = $1::TEXT::UUID
            RETURNING id, type AS "type: AnnouncementTypeState", title, text, created_at, published_at, expires_at, show
            "#,
            id,
            new_type as AnnouncementTypeState,
            new_title,
            new_text,
            new_published_at,
            new_expires_at,
            new_show
        )
        .fetch_one(&*data.pool)
        .await, e => "Failed to update announcement: {}", e);
        drop_cached_response(&data.cache, ANNOUNCEMENTS_CACHE_KEY).await;

        response!(ok updated.into())
    }

    /// Delete an announcement. Requires the `superuser` role.
    #[oai(path="/admin/announcements/:id", method="delete", tag = "ApiTags::Announcements")]
    async fn delete_announcement(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
        Path(id): Path<String>,
    ) -> Response<String> {
        require!(check_superuser(data, user_token.id).await, "Unauthorized", ErrorCode::Forbidden);

        let result = or_ise!(sqlx::query!(
            "DELETE FROM website.announce WHERE id = $1::TEXT::UUID",
            id
        )
        .execute(&*data.pool)
        .await, e => "Failed to delete announcement: {}", e);

        if result.rows_affected() == 0 {
            return response!(err "Announcement not found", ErrorCode::NotFound);
        }
        drop_cached_response(&data.cache, ANNOUNCEMENTS_CACHE_KEY).await;

        response!(ok "Announcement deleted successfully".to_string())
    }

    /// Upload an image, GIF or video for use inside an announcement. Requires the `superuser`
    /// role.
    ///
    /// Multipart form with a `file` field: PNG, JPEG, WebP or GIF up to 15 MB, or MP4/WebM up to
    /// 50 MB. Returns the public URL to reference from the announcement's markdown.
    #[oai(path="/admin/announcements/media", method="post", tag = "ApiTags::Announcements")]
    async fn upload_announcement_media(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
        multipart: poem::web::Multipart,
    ) -> Response<AnnouncementMedia> {
        require!(check_superuser(data, user_token.id).await, "Unauthorized", ErrorCode::Forbidden);

        let mut multipart = multipart;
        let mut upload: Option<(Vec<u8>, &'static str, MediaKind)> = None;

        while let Ok(Some(field)) = multipart.next_field().await {
            if field.name() != Some("file") {
                continue;
            }
            let content_type = field.content_type().unwrap_or_default().to_string();
            let Some((ext, kind)) = media_ext_from_content_type(&content_type) else {
                return response!(err "File must be a PNG, JPEG, WebP or GIF image, or an MP4/WebM video", ErrorCode::BadRequest);
            };
            let limit = announcement_media_limit(kind);
            let read_cap = announcement_media_limit(MediaKind::Video);
            let mut reader = field.into_async_read().take(read_cap + 1);
            let mut bytes = Vec::new();
            if let Err(e) = reader.read_to_end(&mut bytes).await {
                tracing::error!("Failed to read announcement media upload: {}", e);
                return response!(err "Failed to read upload", ErrorCode::BadRequest);
            }
            if bytes.len() as u64 > limit {
                let message = format!("File is larger than {} MB", limit / (1024 * 1024));
                return response!(err &message, ErrorCode::BadRequest);
            }
            upload = Some((bytes, ext, kind));
            break;
        }

        let Some((bytes, ext, kind)) = upload else {
            return response!(err "Missing file field", ErrorCode::BadRequest);
        };
        if bytes.is_empty() {
            return response!(err "File is empty", ErrorCode::BadRequest);
        }
        if sniff_media_ext(&bytes) != Some(ext) {
            return response!(err "File contents don't match its file type", ErrorCode::BadRequest);
        }

        let url = or_ise!(data.announcement_storage.store_media(&Uuid::new_v4().to_string(), ext, &bytes).await, e => "Failed to store announcement media: {}", e);

        let kind = match kind {
            MediaKind::Image => AnnouncementMediaKind::Image,
            MediaKind::Video => AnnouncementMediaKind::Video,
        };
        response!(ok AnnouncementMedia { url, kind })
    }

    /// Register a Web Push subscription for the signed-in user.
    ///
    /// Body is a standard Web Push subscription object (`endpoint` + `p256dh`/`auth` keys, both
    /// base64url-encoded); `endpoint` must be HTTPS. Upserts on (user, endpoint).
    #[oai(path = "/accounts/me/push/subscribe", method = "post", tag = "ApiTags::PushNotifications")]
    async fn subscribe_push_notifications(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
        Json(subscription): Json<PushSubscriptionDto>,
    ) -> Response<PushSubscription> {
        if let Err(e) = validate_push_subscription(&subscription) {
            let _err = format!("Err {e}");
            return response!(err "Error validate push subscription", ErrorCode::BadRequest);
        }

        let result = sqlx::query_as!(
            DbPushSubscription,
            r#"
            INSERT INTO website.push_subscriptions(user_id, endpoint, p256dh_key, auth_key, user_agent)
            VALUES ($1, $2, $3, $4, NULL)
            ON CONFLICT (user_id, endpoint)
            DO UPDATE SET
                p256dh_key = EXCLUDED.p256dh_key,
                auth_key = EXCLUDED.auth_key,
                last_used_at = CURRENT_TIMESTAMP
            RETURNING id, user_id, endpoint, p256dh_key, auth_key, user_agent, created_at, last_used_at
            "#,
            user_token.id,
            subscription.endpoint,
            subscription.keys.p256dh,
            subscription.keys.auth,
        )
        .fetch_one(&*data.pool)
        .await;

        let sub = or_ise!(result, e => "Failed to subscribe to push notifications: {}", e);
        response!(ok sub.into())
    }

    /// Remove a Web Push subscription for the signed-in user, identified by its `endpoint`.
    #[oai(path = "/accounts/me/push/unsubscribe", method = "post", tag = "ApiTags::PushNotifications")]
    async fn unsubscribe_push_notifications(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
        Json(subscription): Json<PushSubscriptionDto>,
    ) -> Response<String> {
        let result = sqlx::query!(
            "DELETE FROM website.push_subscriptions WHERE user_id = $1 AND endpoint = $2",
            user_token.id,
            subscription.endpoint,
        )
        .execute(&*data.pool)
        .await;

        or_ise!(result, e => "Failed to unsubscribe from push notifications: {}", e);
        response!(ok "Unsubscribed successfully".to_string())
    }

    /// The server's VAPID public key, needed by the browser to create a push subscription.
    #[oai(path = "/accounts/me/push/vapid-public-key", method = "get", tag = "ApiTags::PushNotifications")]
    async fn get_vapid_public_key(
        &self,
        Data(data): Data<&AppData>,
    ) -> Response<String> {
        let public_key = data.push_service.get_public_key().to_string();
        response!(ok public_key)
    }

    /// The signed-in user's registered push subscriptions (devices/browsers).
    #[oai(path = "/accounts/me/push/subscriptions", method = "get", tag = "ApiTags::PushNotifications")]
    async fn get_my_push_subscriptions(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
    ) -> Response<Vec<PushSubscription>> {
        let result = sqlx::query_as!(
            DbPushSubscription,
            r#"
            SELECT id, user_id, endpoint, p256dh_key, auth_key, user_agent, created_at, last_used_at
            FROM website.push_subscriptions
            WHERE user_id = $1
            ORDER BY last_used_at DESC
            "#,
            user_token.id
        )
        .fetch_all(&*data.pool)
        .await;

        let subs = or_ise!(result, e => "Failed to get push subscriptions: {}", e);
        let subs: Vec<PushSubscription> = subs.into_iter().map(|s| s.into()).collect();
        response!(ok subs)
    }

    /// The signed-in user's notification preferences, creating the default row if absent.
    #[oai(path = "/accounts/me/push/preferences", method = "get", tag = "ApiTags::PushNotifications")]
    async fn get_notification_preferences(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
    ) -> Response<NotificationPreferences> {
        let result = sqlx::query_as!(
            DbNotificationPreferences,
            r#"
            SELECT user_id, announcements_enabled, system_enabled, map_specific_enabled, updated_at
            FROM website.notification_preferences
            WHERE user_id = $1
            "#,
            user_token.id,
        )
        .fetch_optional(&*data.pool)
        .await;

        match result {
            Ok(Some(prefs)) => response!(ok prefs.into()),
            Ok(None) => {
                let default_prefs = sqlx::query_as!(
                    DbNotificationPreferences,
                    r#"
                    INSERT INTO website.notification_preferences (user_id)
                    VALUES ($1)
                    RETURNING user_id, announcements_enabled, system_enabled, map_specific_enabled, updated_at
                    "#,
                    user_token.id,
                )
                .fetch_one(&*data.pool)
                .await;

                match default_prefs {
                    Ok(prefs) => response!(ok prefs.into()),
                    Err(e) => {
                        tracing::error!("Failed to create default preferences: {}", e);
                        response!(internal_server_error)
                    }
                }
            }
            Err(e) => {
                tracing::error!("Failed to get notification preferences: {}", e);
                response!(internal_server_error)
            }
        }
    }

    /// Update one or more of the signed-in user's notification preference flags.
    ///
    /// At least one of `announcements_enabled`/`system_enabled`/`map_specific_enabled` must be
    /// present; unset fields are left unchanged.
    #[oai(path = "/accounts/me/push/preferences", method = "put", tag = "ApiTags::PushNotifications")]
    async fn update_notification_preferences(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
        Json(preferences): Json<NotificationPreferencesDto>,
    ) -> Response<NotificationPreferences> {
        if preferences.announcements_enabled.is_none()
            && preferences.system_enabled.is_none()
            && preferences.map_specific_enabled.is_none()
        {
            return response!(err "No preferences to update", ErrorCode::BadRequest);
        }

        let result = sqlx::query_as!(
            DbNotificationPreferences,
            r#"
            INSERT INTO website.notification_preferences (user_id, announcements_enabled, system_enabled, map_specific_enabled)
            VALUES ($1, COALESCE($2, TRUE), COALESCE($3, TRUE), COALESCE($4, FALSE))
            ON CONFLICT (user_id) DO UPDATE SET
                announcements_enabled = COALESCE($2, notification_preferences.announcements_enabled),
                system_enabled = COALESCE($3, notification_preferences.system_enabled),
                map_specific_enabled = COALESCE($4, notification_preferences.map_specific_enabled),
                updated_at = CURRENT_TIMESTAMP
            RETURNING user_id, announcements_enabled, system_enabled, map_specific_enabled, updated_at
            "#,
            user_token.id,
            preferences.announcements_enabled,
            preferences.system_enabled,
            preferences.map_specific_enabled
        )
        .fetch_one(&*data.pool)
        .await;

        let db_prefs = or_ise!(result, e => "Failed to update notification preferences: {}", e);
        response!(ok db_prefs.into())
    }

    /// Subscribe an existing push subscription to one-time notifications when a server's map
    /// changes.
    ///
    /// `subscription_id` must belong to the signed-in user (from `push/subscribe`). Re-subscribing
    /// clears a subscription that already fired.
    #[oai(path = "/accounts/me/push/map-change/subscribe", method = "post", tag = "ApiTags::PushNotifications")]
    async fn subscribe_map_change(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
        Json(dto): Json<CreateMapChangeSubscriptionDto>,
    ) -> Response<MapChangeSubscription> {
        let subscription_id = match owned_push_subscription(data, user_token.id, &dto.subscription_id, Some(&dto.server_id)).await {
            Ok(id) => id,
            Err(resp) => return resp,
        };

        let result = sqlx::query_as!(
            DbMapChangeSubscription,
            r#"
            INSERT INTO website.map_change_subscriptions (user_id, server_id, subscription_id)
            VALUES ($1, $2, $3)
            ON CONFLICT (user_id, server_id, subscription_id)
            DO UPDATE SET triggered = FALSE, triggered_at = NULL
            RETURNING id, user_id, server_id, subscription_id, created_at, triggered, triggered_at
            "#,
            user_token.id,
            dto.server_id,
            subscription_id
        )
        .fetch_one(&*data.pool)
        .await;

        let sub = or_ise!(result, e => "Failed to create map change subscription: {}", e);
        response!(ok sub.into())
    }

    /// Cancel the signed-in user's not-yet-triggered map-change subscription for a server.
    #[oai(path = "/accounts/me/push/map-change/:server_id", method = "delete", tag = "ApiTags::PushNotifications")]
    async fn unsubscribe_map_change(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
        Path(server_id): Path<String>,
    ) -> Response<String> {
        let result = sqlx::query!(
            "DELETE FROM website.map_change_subscriptions WHERE user_id = $1 AND server_id = $2 AND triggered = FALSE",
            user_token.id,
            &server_id,
        )
        .execute(&*data.pool)
        .await;

        or_ise!(result, e => "Failed to unsubscribe from map change notifications: {}", e);
        response!(ok "Unsubscribed from map change notifications".to_string())
    }

    /// The signed-in user's pending (not-yet-triggered) map-change subscriptions.
    #[oai(path = "/accounts/me/push/map-change", method = "get", tag = "ApiTags::PushNotifications")]
    async fn get_map_change_subscriptions(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
    ) -> Response<Vec<MapChangeSubscription>> {
        let result = sqlx::query_as!(
            DbMapChangeSubscription,
            r#"
            SELECT id, user_id, server_id, subscription_id, created_at, triggered, triggered_at
            FROM website.map_change_subscriptions
            WHERE user_id = $1 AND triggered = FALSE
            ORDER BY created_at DESC
            "#,
            user_token.id
        )
        .fetch_all(&*data.pool)
        .await;

        let subs = or_ise!(result, e => "Failed to get map change subscriptions: {}", e);
        let subs: Vec<MapChangeSubscription> = subs.into_iter().map(|s| s.into()).collect();
        response!(ok subs)
    }

    /// Subscribe an existing push subscription to one-time notifications when a specific map is
    /// next played.
    ///
    /// `subscription_id` must belong to the signed-in user. `server_id` scopes the watch to one
    /// server; omit it to watch the map across every server.
    #[oai(path = "/accounts/me/push/map-notify/subscribe", method = "post", tag = "ApiTags::PushNotifications")]
    async fn subscribe_map_notify(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
        Json(dto): Json<CreateMapNotifySubscriptionDto>,
    ) -> Response<MapNotifySubscription> {
        let subscription_id = match owned_push_subscription(data, user_token.id, &dto.subscription_id, dto.server_id.as_ref()).await {
            Ok(id) => id,
            Err(resp) => return resp,
        };

        let result = sqlx::query_as!(
            DbMapNotifySubscription,
            r#"
            INSERT INTO website.map_notify_subscriptions (user_id, map_name, server_id, subscription_id)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (user_id, map_name, server_id, subscription_id)
            DO UPDATE SET triggered = FALSE, triggered_at = NULL
            RETURNING id, user_id, map_name, server_id, subscription_id, created_at, triggered, triggered_at
            "#,
            user_token.id,
            dto.map_name,
            dto.server_id,
            subscription_id
        )
        .fetch_one(&*data.pool)
        .await;

        let sub = or_ise!(result, e => "Failed to create map notify subscription: {}", e);
        response!(ok sub.into())
    }

    /// The signed-in user's pending (not-yet-triggered) map-notify subscriptions.
    #[oai(path = "/accounts/me/push/map-notify", method = "get", tag = "ApiTags::PushNotifications")]
    async fn get_map_notify_subscriptions(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
    ) -> Response<Vec<MapNotifySubscription>> {
        let result = sqlx::query_as!(
            DbMapNotifySubscription,
            r#"
            SELECT id, user_id, map_name, server_id, subscription_id, created_at, triggered, triggered_at
            FROM website.map_notify_subscriptions
            WHERE user_id = $1 AND triggered = FALSE
            ORDER BY created_at DESC
            "#,
            user_token.id
        )
        .fetch_all(&*data.pool)
        .await;

        let subs = or_ise!(result, e => "Failed to get map notify subscriptions: {}", e);
        let subs: Vec<MapNotifySubscription> = subs.into_iter().map(|s| s.into()).collect();
        response!(ok subs)
    }

    /// Cancel the signed-in user's map-notify subscription for a map.
    ///
    /// `server_id` selects the server-specific subscription; omit it to target the
    /// all-servers subscription instead.
    #[oai(path = "/accounts/me/push/map-notify/:map_name", method = "delete", tag = "ApiTags::PushNotifications")]
    async fn unsubscribe_map_notify(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
        Path(map_name): Path<String>,
        Query(server_id): Query<Option<String>>,
    ) -> Response<String> {
        let result = if let Some(sid) = server_id {
            sqlx::query!(
                "DELETE FROM website.map_notify_subscriptions WHERE user_id = $1 AND map_name = $2 AND server_id = $3 AND triggered = FALSE",
                user_token.id,
                &map_name,
                sid,
            )
            .execute(&*data.pool)
            .await
        } else {
            sqlx::query!(
                "DELETE FROM website.map_notify_subscriptions WHERE user_id = $1 AND map_name = $2 AND server_id IS NULL AND triggered = FALSE",
                user_token.id,
                &map_name,
            )
            .execute(&*data.pool)
            .await
        };

        or_ise!(result, e => "Failed to unsubscribe from map notification: {}", e);
        response!(ok "Unsubscribed from map notification".to_string())
    }

    /// Whether the signed-in user has a pending map-notify subscription for a map, and whether
    /// it's server-specific or all-servers.
    #[oai(path = "/accounts/me/push/map-notify/status", method = "get", tag = "ApiTags::PushNotifications")]
    async fn get_map_notify_status(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
        Query(map_name): Query<String>,
        Query(server_id): Query<Option<String>>,
    ) -> Response<MapNotifyStatusResponse> {
        let server_sub = if let Some(ref sid) = server_id {
            sqlx::query_scalar!(
                "SELECT id FROM website.map_notify_subscriptions WHERE user_id = $1 AND map_name = $2 AND server_id = $3 AND triggered = FALSE",
                user_token.id,
                &map_name,
                sid,
            )
            .fetch_optional(&*data.pool)
            .await
            .ok()
            .flatten()
        } else {
            None
        };

        let all_sub = sqlx::query_scalar!(
            "SELECT id FROM website.map_notify_subscriptions WHERE user_id = $1 AND map_name = $2 AND server_id IS NULL AND triggered = FALSE",
            user_token.id,
            &map_name,
        )
        .fetch_optional(&*data.pool)
        .await
        .ok()
        .flatten();

        let (subscribed, subscription_type) = if server_sub.is_some() {
            (true, Some("server".to_string()))
        } else if all_sub.is_some() {
            (true, Some("all".to_string()))
        } else {
            (false, None)
        };

        response!(ok MapNotifyStatusResponse {
            subscribed,
            subscription_type,
        })
    }

    /// Send a test push notification, to one user or broadcast to everyone. Requires the
    /// `superuser` role.
    #[oai(path = "/admin/push/test", method = "post", tag = "ApiTags::PushNotifications")]
    async fn send_test_notification(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
        Json(test_notif): Json<TestNotificationDto>,
    ) -> Response<NotificationSendResult> {
        require!(check_superuser(data, user_token.id).await, "Unauthorized", ErrorCode::Forbidden);

        let result = if let Some(target_user_id_str) = test_notif.user_id {
            let target_user_id = match target_user_id_str.parse::<i64>() {
                Ok(id) => id,
                Err(_) => return response!(err "Invalid user_id format", ErrorCode::BadRequest),
            };
            data.push_service.send_notification(
                target_user_id,
                test_notif.title,
                test_notif.body,
                NotificationType::System,
            ).await
        } else {
            data.push_service.send_notification_broadcast(
                test_notif.title,
                test_notif.body,
                NotificationType::System,
            ).await
        };

        let send_result = or_ise!(result, e => "Failed to send test notification: {}", e);
        let api_result = NotificationSendResult {
            success: send_result.success,
            failed: send_result.failed,
            total: send_result.total,
            errors: send_result.errors,
        };
        response!(ok api_result)
    }

    /// Paginated list of every push subscription across all users. Requires the `superuser`
    /// role. Pages are 50 each.
    #[oai(path = "/admin/push/subscriptions", method = "get", tag = "ApiTags::PushNotifications")]
    async fn get_all_subscriptions(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
        Query(page): Query<Option<i64>>,
    ) -> Response<PushSubscriptionsPaginated> {
        require!(check_superuser(data, user_token.id).await, "Unauthorized", ErrorCode::Forbidden);

        let page = page.unwrap_or(1).max(1);
        let limit = 50;
        let offset = (page - 1) * limit;

        let total = sqlx::query_scalar!(
            "SELECT COUNT(*) FROM website.push_subscriptions "
        )
        .fetch_one(&*data.pool)
        .await
        .unwrap_or(Some(0))
        .unwrap_or(0);

        let subscriptions = sqlx::query_as!(
            DbPushSubscription,
            r#"
            SELECT id, user_id, endpoint, p256dh_key, auth_key, user_agent, created_at, last_used_at
            FROM website.push_subscriptions
            ORDER BY created_at DESC
            LIMIT $1 OFFSET $2
            "#,
            limit,
            offset,
        )
        .fetch_all(&*data.pool)
        .await;

        let subs = or_ise!(subscriptions, e => "Failed to get subscriptions: {}", e);
        let api_subs: Vec<PushSubscription> =
            subs.into_iter().map(|s| s.into()).collect();
        response!(ok PushSubscriptionsPaginated {
            total,
            subscriptions: api_subs,
        })
    }

    /// Submit a community request to have a new server tracked.
    ///
    /// Requires at least one server entry (each with a non-empty `ip` and a 1-20 character
    /// `readable_link`), and `game_type` of `cs2` or `csgo`. Goes into a review queue rather
    /// than being tracked immediately.
    #[oai(path="/accounts/server-requests", method="post", tag = "ApiTags::ServerRequests")]
    async fn submit_server_request(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
        Json(dto): Json<ServerRequestDto>,
    ) -> Response<String> {
        if dto.servers.is_empty() {
            return response!(err "At least one server entry is required", ErrorCode::BadRequest);
        }
        for entry in &dto.servers {
            if entry.ip.trim().is_empty() {
                return response!(err "Server IP cannot be empty", ErrorCode::BadRequest);
            }
            if entry.readable_link.trim().is_empty() || entry.readable_link.len() > 20 {
                return response!(err "Readable link must be 1-20 characters", ErrorCode::BadRequest);
            }
        }
        if dto.game_type != "cs2" && dto.game_type != "csgo" {
            return response!(err "game_type must be 'cs2' or 'csgo'", ErrorCode::BadRequest);
        }

        let servers_json = or_ise!(serde_json::to_value(&dto.servers));

        or_ise!(sqlx::query!(
            r#"
            INSERT INTO website.server_requests
                (user_id, community_name, icon_url, servers, game_type, elaboration)
            VALUES ($1, $2, $3, $4, $5, $6)
            "#,
            user_token.id,
            dto.community_name,
            dto.icon_url,
            servers_json,
            dto.game_type,
            dto.elaboration
        )
        .execute(&*data.pool)
        .await, e => "Failed to insert server request: {}", e);
        response!(ok "OK".to_string())
    }

    /// Paginated list of community server requests. Requires the `superuser` role.
    ///
    /// `status` filters to `pending`/`approved`/`rejected`; pages are 20 each.
    #[oai(path="/admin/server-requests", method="get", tag = "ApiTags::ServerRequests")]
    async fn get_server_requests(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
        Query(page): Query<Option<i64>>,
        Query(status): Query<Option<String>>,
    ) -> Response<ServerRequestsPaginated> {
        require!(check_superuser(data, user_token.id).await, "Unauthorized", ErrorCode::Forbidden);

        let page = page.unwrap_or(1).max(1);
        let limit = 20i64;
        let offset = (page - 1) * limit;
        let status_filter = status.as_deref();

        let requests = or_ise!(sqlx::query_as!(
            DbServerRequest,
            r#"
            SELECT
                r.id,
                r.user_id,
                r.community_name,
                r.icon_url,
                r.servers,
                r.game_type,
                r.elaboration,
                r.status,
                r.reviewed_by,
                r.reviewed_at,
                r.created_at,
                COALESCE(submitter.persona_name, NULL) AS submitter_name,
                COALESCE(reviewer.persona_name, NULL) AS reviewer_name,
                COUNT(*) OVER() AS total_requests
            FROM website.server_requests r
            LEFT JOIN website.steam_user submitter ON r.user_id = submitter.user_id
            LEFT JOIN website.steam_user reviewer ON r.reviewed_by = reviewer.user_id
            WHERE ($1::text IS NULL OR r.status = $1)
            ORDER BY r.created_at DESC
            LIMIT $2 OFFSET $3
            "#,
            status_filter,
            limit,
            offset
        )
        .fetch_all(&*data.pool)
        .await, e => "Failed to fetch server requests: {}", e);

        let total = requests.first().and_then(|r| r.total_requests).unwrap_or(0);

        response!(ok ServerRequestsPaginated {
            total,
            requests: requests.into_iter().map(Into::into).collect(),
        })
    }

    /// Approve or reject a server request. Requires the `superuser` role.
    ///
    /// `status` must be `approved` or `rejected`. Approving creates a `community` row and a
    /// `server_browser` scrape-tracking entry for each requested server.
    #[oai(path="/admin/server-requests/:request_id/status", method="put", tag = "ApiTags::ServerRequests")]
    async fn update_server_request_status(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
        Path(request_id): Path<String>,
        Json(dto): Json<ServerRequestStatusDto>,
    ) -> Response<ServerRequestAdmin> {
        require!(check_superuser(data, user_token.id).await, "Unauthorized", ErrorCode::Forbidden);

        if dto.status != "approved" && dto.status != "rejected" {
            return response!(err "status must be 'approved' or 'rejected'", ErrorCode::BadRequest);
        }

        let request_id = match Uuid::parse_str(&request_id) {
            Ok(id) => id,
            Err(_) => return response!(err "Invalid request ID", ErrorCode::BadRequest),
        };

        if dto.status == "approved" {
            let Some(req) = or_ise!(sqlx::query!(
                r#"SELECT community_name, icon_url, servers FROM website.server_requests WHERE id = $1"#,
                request_id
            )
            .fetch_optional(&*data.pool)
            .await, e => "Failed to fetch server request for approval: {}", e) else {
                return response!(err "Not found", ErrorCode::NotFound);
            };

            let community_id = or_ise!(sqlx::query_scalar!(
                r#"INSERT INTO community (community_name, community_icon_url) VALUES ($1, $2) RETURNING community_id"#,
                req.community_name,
                req.icon_url
            )
            .fetch_one(&*data.pool)
            .await, e => "Failed to insert community on approval: {}", e);

            let entries: Vec<ServerEntryDto> = or_ise!(serde_json::from_value(req.servers), e => "Failed to deserialize servers JSONB: {}", e);

            for entry in entries {
                let port = entry.port as i16;
                or_ise!(sqlx::query!(
                    r#"INSERT INTO server_browser (ip, port) VALUES ($1, $2) ON CONFLICT DO NOTHING"#,
                    entry.ip,
                    port
                )
                .execute(&*data.pool)
                .await, e => "Failed to insert server_browser entry: {}", e);
            }

            tracing::info!("Approved server request {}: new community_id={}", request_id, community_id);
        }

        let rows_affected = or_ise!(sqlx::query!(
            r#"UPDATE website.server_requests SET status = $1, reviewed_by = $2, reviewed_at = NOW() WHERE id = $3"#,
            dto.status,
            user_token.id,
            request_id
        )
        .execute(&*data.pool)
        .await, e => "Failed to update server request status: {}", e).rows_affected();

        if rows_affected == 0 {
            return response!(err "Not found", ErrorCode::NotFound);
        }

        let updated = or_ise!(sqlx::query_as!(
            DbServerRequest,
            r#"
            SELECT
                r.id, r.user_id, r.community_name, r.icon_url, r.servers, r.game_type,
                r.elaboration, r.status, r.reviewed_by, r.reviewed_at, r.created_at,
                COALESCE(submitter.persona_name, NULL) AS submitter_name,
                COALESCE(reviewer.persona_name, NULL) AS reviewer_name,
                NULL::bigint AS total_requests
            FROM website.server_requests r
            LEFT JOIN website.steam_user submitter ON r.user_id = submitter.user_id
            LEFT JOIN website.steam_user reviewer ON r.reviewed_by = reviewer.user_id
            WHERE r.id = $1
            "#,
            request_id
        )
        .fetch_one(&*data.pool)
        .await, e => "Failed to fetch updated server request: {}", e);

        response!(ok updated.into())
    }

    /// Whether this profile can be claimed, and where any claim on it stands.
    ///
    /// A profile is claimable when the server tracks players by name rather than Steam ID, the
    /// profile is a name row rather than a Steam row, and it has not already been linked.
    /// Usable logged out, so the page can render the button before prompting for login.
    #[oai(path="/accounts/player-claims/:server_id/:player_id", method="get", tag = "ApiTags::PlayerClaims")]
    async fn get_player_claim_state(
        &self,
        Data(data): Data<&AppData>,
        OptionalTokenBearer(user_token): OptionalTokenBearer,
        Path(server_id): Path<String>,
        Path(player_id): Path<String>,
    ) -> Response<PlayerClaimState> {
        let viewer_id = user_token.as_ref().map(|u| u.id);

        let Some(row) = or_ise!(sqlx::query!(
            r#"
            SELECT
                COALESCE(sm.source_by_id, FALSE) AS "by_id!",
                p.associated_player_id,
                EXISTS (
                    SELECT 1 FROM website.player_claiming c
                    WHERE c.player_id = p.player_id AND c.status = 'pending'
                ) AS "pending!",
                (
                    SELECT c.status FROM website.player_claiming c
                    WHERE c.player_id = p.player_id AND c.user_id = $3
                    ORDER BY c.created_at DESC LIMIT 1
                ) AS own_status
            FROM player p
            JOIN server s ON s.server_id = $1
            LEFT JOIN server_metadata sm ON sm.server_id = s.server_id
            WHERE p.player_id = $2
            "#,
            server_id,
            player_id,
            viewer_id,
        )
        .fetch_optional(&*data.pool)
        .await, e => "Failed to fetch claim state for {player_id}: {e}") else {
            return response!(err "Player not found", ErrorCode::NotFound);
        };

        let claimable = !row.by_id
            && row.associated_player_id.is_none()
            && !is_steam_id(&player_id);

        response!(ok PlayerClaimState {
            claimable,
            pending: row.pending,
            own_status: row.own_status,
            associated_player_id: row.associated_player_id,
        })
    }

    /// Ask a moderator to link a name-tracked profile to your Steam account.
    ///
    /// Only valid on servers that track players by name, for a profile that is not already
    /// linked. Goes into a review queue; nothing is linked until a superuser approves it.
    #[oai(path="/accounts/player-claims", method="post", tag = "ApiTags::PlayerClaims")]
    async fn submit_player_claim(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
        Json(dto): Json<PlayerClaimDto>,
    ) -> Response<String> {
        if let Some(note) = &dto.note {
            if note.chars().count() > 500 {
                return response!(err "Note must be 500 characters or fewer", ErrorCode::BadRequest);
            }
        }

        if is_steam_id(&dto.player_id) {
            return response!(err "This profile is already a Steam account", ErrorCode::BadRequest);
        }

        let Some(row) = or_ise!(sqlx::query!(
            r#"
            SELECT
                COALESCE(sm.source_by_id, FALSE) AS "by_id!",
                p.associated_player_id,
                EXISTS (
                    SELECT 1 FROM player_server_session pss
                    WHERE pss.server_id = $1 AND pss.player_id = $2
                ) AS "on_server!"
            FROM player p
            JOIN server s ON s.server_id = $1
            LEFT JOIN server_metadata sm ON sm.server_id = s.server_id
            WHERE p.player_id = $2
            "#,
            dto.server_id,
            dto.player_id,
        )
        .fetch_optional(&*data.pool)
        .await, e => "Failed to validate claim for {}: {e}", dto.player_id) else {
            return response!(err "Player not found on this server", ErrorCode::NotFound);
        };

        if row.by_id {
            return response!(err "This server tracks players by Steam ID", ErrorCode::BadRequest);
        }
        require!(row.on_server, "Player not found on this server", ErrorCode::NotFound);
        if row.associated_player_id.is_some() {
            return response!(err "This profile is already linked", ErrorCode::Conflict);
        }

        let note = dto.note.as_deref().map(str::trim).filter(|n| !n.is_empty());

        match sqlx::query!(
            r#"
            INSERT INTO website.player_claiming (player_id, server_id, user_id, note)
            VALUES ($1, $2, $3, $4)
            "#,
            dto.player_id,
            dto.server_id,
            user_token.id,
            note,
        )
        .execute(&*data.pool)
        .await
        {
            Ok(_) => response!(ok "OK".to_string()),
            Err(e) => {
                if e.to_string().contains("uniq_player_claiming_pending") {
                    return response!(err "You already have a pending claim for this profile", ErrorCode::Conflict);
                }
                tracing::error!("Failed to insert player claim: {e}");
                response!(internal_server_error)
            }
        }
    }

    /// Paginated list of profile claim requests. Requires the `superuser` role.
    ///
    /// `status` filters to `pending`/`approved`/`rejected`; pages are 20 each.
    #[oai(path="/admin/player-claims", method="get", tag = "ApiTags::PlayerClaims")]
    async fn get_player_claims(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
        Query(page): Query<Option<i64>>,
        Query(status): Query<Option<String>>,
    ) -> Response<PlayerClaimsPaginated> {
        require!(check_superuser(data, user_token.id).await, "Unauthorized", ErrorCode::Forbidden);

        let page = page.unwrap_or(1).max(1);
        let limit = 20i64;
        let offset = (page - 1) * limit;
        let status_filter = status.as_deref();

        let claims = or_ise!(sqlx::query_as!(
            DbPlayerClaim,
            r#"
            SELECT
                c.id,
                c.user_id,
                c.player_id,
                c.server_id,
                c.note,
                c.status,
                c.reviewed_by,
                c.reviewed_at,
                c.created_at,
                claimer.persona_name AS "claimer_name?",
                p.player_name AS "player_name?",
                s.server_name AS "server_name?",
                reviewer.persona_name AS "reviewer_name?",
                COUNT(*) OVER() AS total_claims
            FROM website.player_claiming c
            LEFT JOIN website.steam_user claimer ON c.user_id = claimer.user_id
            LEFT JOIN website.steam_user reviewer ON c.reviewed_by = reviewer.user_id
            LEFT JOIN player p ON p.player_id = c.player_id
            LEFT JOIN server s ON s.server_id = c.server_id
            WHERE ($1::text IS NULL OR c.status = $1)
            ORDER BY c.created_at DESC
            LIMIT $2 OFFSET $3
            "#,
            status_filter,
            limit,
            offset,
        )
        .fetch_all(&*data.pool)
        .await, e => "Failed to fetch player claims: {e}");

        let total = claims.first().and_then(|c| c.total_claims).unwrap_or(0);

        response!(ok PlayerClaimsPaginated {
            total,
            claims: claims.into_iter().map(Into::into).collect(),
        })
    }

    /// Approve or reject a profile claim. Requires the `superuser` role.
    ///
    /// Approving links the claimed profile to the claimer's Steam account by setting
    /// `player.associated_player_id`, in the same transaction that records the decision, and
    /// queues a playtime recalculation. Rejecting only records the decision.
    #[oai(path="/admin/player-claims/:claim_id/status", method="put", tag = "ApiTags::PlayerClaims")]
    async fn update_player_claim_status(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
        Path(claim_id): Path<String>,
        Json(dto): Json<PlayerClaimStatusDto>,
    ) -> Response<PlayerClaimAdmin> {
        require!(check_superuser(data, user_token.id).await, "Unauthorized", ErrorCode::Forbidden);

        if !["approved", "rejected", "pending"].contains(&dto.status.as_str()) {
            return response!(err "status must be 'approved', 'rejected' or 'pending'", ErrorCode::BadRequest);
        }

        let claim_id = match Uuid::parse_str(&claim_id) {
            Ok(id) => id,
            Err(_) => return response!(err "Invalid claim ID", ErrorCode::BadRequest),
        };

        let Some(claim) = or_ise!(sqlx::query!(
            r#"SELECT player_id, user_id FROM website.player_claiming WHERE id = $1"#,
            claim_id,
        )
        .fetch_optional(&*data.pool)
        .await, e => "Failed to fetch claim {claim_id}: {e}") else {
            return response!(err "Claim not found", ErrorCode::NotFound);
        };
        let steam_id = claim.user_id.to_string();

        let steam_name = if dto.status == "approved" {
            match steam_name_for_link(data, &claim.player_id, &steam_id).await {
                Ok(name) => name,
                Err(msg) => return response!(err &msg, ErrorCode::BadRequest),
            }
        } else {
            None
        };

        let mut tx = or_ise!(data.pool.begin().await, e => "Failed to open transaction for claim {claim_id}: {e}");

        let mut link_change: Option<LinkChange> = None;
        if dto.status == "approved" {
            match set_associated_player(
                &mut tx,
                &claim.player_id,
                Some(&steam_id),
                Some(user_token.id),
                Some(claim_id),
                steam_name.as_ref(),
            ).await {
                Ok(change) => link_change = Some(change),
                Err(LinkError::User(msg)) => return response!(err &msg, ErrorCode::BadRequest),
                Err(LinkError::Internal) => return response!(internal_server_error),
            }
        }

        or_ise!(sqlx::query!(
            r#"UPDATE website.player_claiming
               SET status = $1, reviewed_by = $2, reviewed_at = NOW()
               WHERE id = $3"#,
            dto.status,
            user_token.id,
            claim_id,
        )
        .execute(&mut *tx)
        .await, e => "Failed to update claim {claim_id}: {e}");

        or_ise!(tx.commit().await, e => "Failed to commit claim {claim_id}: {e}");

        // The merged numbers live behind the worker cache and in
        // `website.player_global_playtime`; neither notices the new link on its own. Caches have
        // to be dropped before the refresh, or it reads its own stale entries straight back.
        if let Some(change) = &link_change {
            tracing::info!(
                "Claim {claim_id}: merged {} -> {:?} ({} sessions)",
                claim.player_id, change.current, change.sessions_moved,
            );
            apply_link_side_effects(data, &claim.player_id, change).await;
        }

        match fetch_player_claim(&data.pool, claim_id).await {
            Ok(Some(updated)) => response!(ok updated.into()),
            Ok(None) => response!(err "Claim not found", ErrorCode::NotFound),
            Err(e) => {
                tracing::error!("Failed to fetch updated claim {claim_id}: {e}");
                response!(internal_server_error)
            }
        }
    }

    /// Link a profile to a Steam account directly, or unlink it. Requires the `superuser` role.
    ///
    /// This is the manual override behind the selector on the player page; approving a claim
    /// takes the same path. Passing a `null` `associated_player_id` unlinks the profile.
    #[oai(path="/admin/players/:player_id/associated", method="put", tag = "ApiTags::PlayerClaims")]
    async fn set_player_associated(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
        Path(player_id): Path<String>,
        Json(dto): Json<AssociatePlayerDto>,
    ) -> Response<String> {
        require!(check_superuser(data, user_token.id).await, "Unauthorized", ErrorCode::Forbidden);

        let target = dto.associated_player_id.as_deref().map(str::trim).filter(|t| !t.is_empty());

        let steam_name = match target {
            Some(target) => match steam_name_for_link(data, &player_id, target).await {
                Ok(name) => name,
                Err(msg) => return response!(err &msg, ErrorCode::BadRequest),
            },
            None => None,
        };

        let mut tx = or_ise!(data.pool.begin().await, e => "Failed to open transaction for linking {player_id}: {e}");

        let change = match set_associated_player(
            &mut tx, &player_id, target, Some(user_token.id), None, steam_name.as_ref(),
        ).await {
            Ok(c) => c,
            Err(LinkError::User(msg)) => return response!(err &msg, ErrorCode::BadRequest),
            Err(LinkError::Internal) => return response!(internal_server_error),
        };

        or_ise!(tx.commit().await, e => "Failed to commit link for {player_id}: {e}");

        tracing::info!(
            "Superuser {} set {player_id} -> {:?} ({} sessions)",
            user_token.id, change.current, change.sessions_moved,
        );

        apply_link_side_effects(data, &player_id, &change).await;

        if change.name_conflict {
            return response!(ok "NAME_CONFLICT".to_string());
        }
        response!(ok "OK".to_string())
    }

    /// Merge the name-tracked profiles already linked to your Steam account into it.
    ///
    /// Their sessions move onto the Steam account and each profile is renamed
    /// `[merged_<uuid>] <name>`. `server_id` limits this to profiles seen on that server.
    #[oai(path="/accounts/me/merge", method="post", tag = "ApiTags::PlayerClaims")]
    async fn merge_my_accounts(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
        Json(dto): Json<MergeAccountsDto>,
    ) -> Response<MergeAccountsResult> {
        let steam_id = user_token.id.to_string();
        let canonical = resolve_canonical_player_id(&data.pool, &steam_id)
            .await
            .unwrap_or(steam_id);

        let steam_name = match fetch_steam_name(data, &canonical).await {
            Ok(name) => name,
            Err(msg) => return response!(err &msg, ErrorCode::BadRequest),
        };

        let mut tx = or_ise!(data.pool.begin().await, e => "Failed to open transaction for merging {canonical}: {e}");

        let fakes = or_ise!(sqlx::query_scalar!(
            "SELECT p.player_id FROM player p
             WHERE p.associated_player_id = $1
               AND p.merged_at IS NULL
               AND p.player_id !~ '^[0-9]+$'
               AND ($2::text IS NULL OR EXISTS (
                   SELECT 1 FROM player_server_session pss
                   WHERE pss.player_id = p.player_id AND pss.server_id = $2
               ))
             ORDER BY p.player_id",
            canonical,
            dto.server_id,
        )
        .fetch_all(&mut *tx)
        .await, e => "Failed to list mergeable profiles of {canonical}: {e}");

        let mut sessions_moved = 0;
        for fake in &fakes {
            match merge_player(
                &mut tx, fake, &canonical, Some(user_token.id), None, steam_name.as_ref(),
            ).await {
                Ok(outcome) => sessions_moved += outcome.sessions_moved,
                Err(LinkError::User(msg)) => return response!(err &msg, ErrorCode::BadRequest),
                Err(LinkError::Internal) => return response!(internal_server_error),
            }
        }

        or_ise!(tx.commit().await, e => "Failed to commit merge for {canonical}: {e}");

        if !fakes.is_empty() {
            tracing::info!(
                "User {} merged {} profile(s) into {canonical} ({sessions_moved} sessions)",
                user_token.id, fakes.len(),
            );
            let mut touched = fakes.clone();
            touched.push(canonical.clone());
            data.player_worker.invalidate_players(&touched).await;
            data.player_worker.enqueue_global_refresh(&canonical).await;
        }

        response!(ok MergeAccountsResult {
            merged_profiles: fakes.len() as i64,
            sessions_moved,
        })
    }
}
