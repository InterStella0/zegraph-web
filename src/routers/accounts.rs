use chrono::{DateTime, TimeDelta, Utc};
use indexmap::IndexMap;
use poem::web::Data;
use poem_openapi::payload::Json;
use poem_openapi::{Object, OpenApi};
use poem_openapi::param::{Path, Query};
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use sqlx::types::time::OffsetDateTime;
use tokio::time::sleep;
use uuid::Uuid;

use crate::core::utils::*;
use crate::workers::PlayerContext;
use crate::{response, AppData};
use crate::api_models::admins::*;
use crate::api_models::common::*;
use crate::api_models::misc::*;
use crate::api_models::players::*;
use crate::core::push_service::NotificationType;
use crate::routers::players::{get_player, get_player_cache_key};
use crate::FastCache;
use crate::models::admins::*;
use crate::models::maps::{DbMapChangeSubscription, DbMapNotifySubscription};
use crate::models::players::*;
use crate::routers::ApiTags;

pub struct AccountsApi;

#[derive(Debug, Serialize, Deserialize, Object, Clone)]
pub struct AnonymizationRequest {
    pub community_id: String,
    pub anonymize: Option<bool>,
    pub hide_location: Option<bool>,
}

fn extract_youtube_id(url: &str) -> Option<String> {
    // Handle different YouTube URL formats:
    // - https://www.youtube.com/watch?v=VIDEO_ID
    // - https://youtu.be/VIDEO_ID
    // - Just VIDEO_ID (if user pastes only the ID)

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
        // Assume it's already a video ID
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

async fn get_global_best_rank(
    pool: &sqlx::Pool<sqlx::Postgres>,
    cache: &FastCache,
    steam_id: &str,
) -> Option<GlobalMapRank> {
    let func = || sqlx::query_as!(
        DbGlobalMapRankEntry,
        "WITH qualifying AS (
            SELECT pmr.player_id, pmr.map, pmr.map_rank
            FROM website.player_map_rank pmr
            JOIN website.player_map_time pmt
                ON pmt.player_id = pmr.player_id
                AND pmt.map = pmr.map
                AND pmt.server_id = pmr.server_id
            WHERE pmt.total_playtime > interval '1 hour'
        ),
        best AS (
            SELECT player_id, MIN(map_rank) AS best_rank
            FROM qualifying
            GROUP BY player_id
        ),
        positioned AS (
            SELECT player_id, best_rank, RANK() OVER (ORDER BY best_rank ASC) AS global_position
            FROM best
        )
        SELECT DISTINCT ON (q.player_id)
            q.player_id AS \"player_id!\",
            p.global_position AS \"global_position\",
            q.map AS \"map\",
            q.map_rank AS \"rank\"
        FROM positioned p
        JOIN qualifying q ON q.player_id = p.player_id AND q.map_rank = p.best_rank
        ORDER BY q.player_id, q.map_rank"
    ).fetch_all(pool);

    let entries = cached_response("global-best-map-rank-table", cache, 900, func).await.ok()?.result;

    let merged_ids: HashSet<String> = sqlx::query_scalar!(
        "SELECT player_id FROM player WHERE player_id = $1 OR associated_player_id = $1",
        steam_id
    ).fetch_all(pool).await.unwrap_or_default().into_iter().collect();

    let best = entries.into_iter()
        .filter(|e| merged_ids.contains(&e.player_id))
        .min_by_key(|e| e.global_position.unwrap_or(i64::MAX))?;

    let map = best.map?;
    Some(GlobalMapRank {
        position: best.global_position.unwrap_or_default(),
        map,
        rank: best.rank.unwrap_or_default(),
    })
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

#[derive(Debug, Clone)]
enum UserRole {
    Superuser,
    CommunityAdmin(Uuid),
    Regular,
}


async fn get_user_role(data: &AppData, user_id: i64) -> Result<UserRole, ErrorCode> {
    // Check if superuser
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
    let client = reqwest::Client::new();
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
        let Ok(cvs) = CommunityVisibilityState::try_from(steam_profile.communityvisibilitystate.unwrap_or(1) as i32) else {
            return response!(internal_server_error)
        };
        let Ok(ps) = PersonaState::try_from(steam_profile.personastate.unwrap_or(0) as i32) else {
            return response!(internal_server_error)
        };
        let Ok(steam_id) = steam_profile.steamid.parse::<i64>() else {
            return response!(internal_server_error)
        };
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
        let steam_profile_db = match sqlx::query_as!(DbSteam,
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
                comment_permission)
             VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING
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
        ).fetch_one(&*data.pool).await {
            Ok(k) => k,
            Err(e) => {
                tracing::error!("ERROR {e}");
                return response!(internal_server_error)
            }
        };
        response!(ok steam_profile_db.into())

    }
    /// The signed-in user's own Steam profile, including their superuser/map-manager role flags.
    #[oai(path="/accounts/me", method="get")]
    async fn get_user_info(&self, Data(data): Data<&AppData>, TokenBearer(user_token): TokenBearer) -> Response<SteamProfile>{
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
            )
            SELECT DISTINCT ON (s.server_id)
                s.server_id,
                pss.player_id,
                c.community_id,
                c.community_name,
                c.community_shorten_name,
                c.community_icon_url
            FROM player_server_session pss
            JOIN user_players up ON up.player_id = pss.player_id
            JOIN server s ON s.server_id = pss.server_id
            JOIN community c ON c.community_id = s.community_id
            ORDER BY s.server_id",
            steam_id
        ).fetch_all(pool).await;

        let Ok(servers_played) = servers_played else {
            return response!(internal_server_error);
        };

        let mut results: IndexMap<String, CommunityPlayerDetail> = IndexMap::new();

        for entry in servers_played {
            let server_id = &entry.server_id;
            let player_id = &entry.player_id;

            let Some(server) = get_server(pool, &app.cache, server_id).await else { continue };
            let Some(player) = get_player(pool, &app.cache, player_id).await else { continue };

            let cache_key = get_player_cache_key(pool, &app.cache, server_id, player_id).await;
            let ctx = PlayerContext { player, server: server.clone(), cache_key };

            let Ok(detail) = app.player_worker.get_detail(&ctx).await else { continue };
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
        let is_owner = requester.map(|t| t.id) == Some(target_user_id);

        let servers_played = sqlx::query_as!(
            DbCommunityServerEntry,
            "WITH user_players AS (
                SELECT DISTINCT player_id
                FROM player
                WHERE player_id = $1 OR associated_player_id = $1
            )
            SELECT DISTINCT ON (s.server_id)
                s.server_id,
                pss.player_id,
                c.community_id,
                c.community_name,
                c.community_shorten_name,
                c.community_icon_url
            FROM player_server_session pss
            JOIN user_players up ON up.player_id = pss.player_id
            JOIN server s ON s.server_id = pss.server_id
            JOIN community c ON c.community_id = s.community_id
            ORDER BY s.server_id",
            steam_id
        ).fetch_all(pool).await;

        let Ok(servers_played) = servers_played else {
            return response!(internal_server_error);
        };

        let anonymization_settings = sqlx::query_as!(
            DbUserAnonymization,
            "SELECT user_id, community_id, anonymized, hide_location FROM website.user_anonymization WHERE user_id = $1",
            target_user_id
        ).fetch_all(pool).await.unwrap_or_default();

        let anonymized_community_ids: HashSet<Uuid> = anonymization_settings.iter()
            .filter(|s| s.anonymized)
            .filter_map(|s| s.community_id)
            .collect();

        let all_community_ids: HashSet<Uuid> = servers_played.iter().map(|e| e.community_id).collect();
        let has_visible_community = all_community_ids.iter().any(|c| !anonymized_community_ids.contains(c));

        let current_name = get_player(pool, &app.cache, &steam_id).await.map(|p| p.player_name);

        let persona_name = sqlx::query_scalar!(
            "SELECT persona_name FROM website.steam_user WHERE user_id = $1",
            target_user_id
        ).fetch_optional(pool).await.ok().flatten();

        let mut results: IndexMap<String, ProfileCommunityDetail> = IndexMap::new();
        let mut total_playtime = 0f64;
        let mut is_online = false;
        let mut last_online: Option<DateTime<Utc>> = None;
        let mut last_session_duration: Option<f64> = None;
        let mut latest_started_at: Option<OffsetDateTime> = None;

        for entry in servers_played {
            if !is_owner && anonymized_community_ids.contains(&entry.community_id) {
                continue;
            }

            let server_id = &entry.server_id;
            let player_id = &entry.player_id;

            let Some(server) = get_server(pool, &app.cache, server_id).await else { continue };
            let Some(player) = get_player(pool, &app.cache, player_id).await else { continue };

            let cache_key = get_player_cache_key(pool, &app.cache, server_id, player_id).await;
            let ctx = PlayerContext { player, server: server.clone(), cache_key };

            let Ok(mut detail) = app.player_worker.get_detail_stored(&ctx).await else { continue };

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
                steam_id
            ).fetch_all(pool).await.unwrap_or_default();

            let by_id = server.source_by_id.unwrap_or(false);
            let mut linked_names: Vec<LinkedName> = vec![];
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
                    steam_id
                ).fetch_all(pool).await.unwrap_or_default();

                linked_names = names.into_iter().map(|n| LinkedName {
                    is_current: Some(&n.player_name) == current_name.as_ref(),
                    name: n.player_name,
                    total_playtime: n.total_playtime.map(|i| i.to_f64()).unwrap_or(0.0),
                }).collect();

                if !linked_names.is_empty() {
                    detail.total_playtime = linked_names.iter().map(|n| n.total_playtime).sum();
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

            if server_online {
                is_online = true;
            }
            if let Some(started) = sessions.first().map(|s| s.started_at) {
                let is_newer = match latest_started_at {
                    Some(latest) => started > latest,
                    None => true,
                };
                if is_newer {
                    latest_started_at = Some(started);
                    last_online = server_last_played;
                    last_session_duration = server_duration;
                }
            }

            total_playtime += detail.total_playtime;

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
                recent_sessions,
            };

            let community_id = entry.community_id.to_string();
            let com = results.entry(community_id.clone()).or_insert(ProfileCommunityDetail {
                id: community_id.clone(),
                name: entry.community_name.clone().unwrap_or_default(),
                shorten_name: entry.community_shorten_name.clone(),
                icon_url: entry.community_icon_url.clone(),
                servers: vec![]
            });
            com.servers.push(server_entry);
        }

        let communities: Vec<ProfileCommunityDetail> = results.into_values().collect();
        let community_count = communities.len() as i64;
        let server_count = communities.iter().map(|c| c.servers.len() as i64).sum();

        let best_rank = get_global_best_rank(pool, &app.cache, &steam_id).await;

        let global = match resolve_canonical_player_id(pool, &steam_id).await {
            Some(canonical_id) => app.player_worker
                .get_global_playtime(&canonical_id).await
                .unwrap_or_default(),
            None => GlobalPlaytimeSummary::default(),
        };

        let anonymization = if is_owner {
            Some(anonymization_settings.iter_into())
        } else {
            None
        };

        let profile_name = if is_owner || all_community_ids.is_empty() || has_visible_community {
            persona_name.or(current_name)
        } else {
            Some("Anonymous".to_string())
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
                global,
            },
            communities,
            is_owner,
            anonymization,
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

    /// A player's playtime broken down per community. `player_id` may be `"me"` or a numeric Steam ID.
    #[oai(path="/players/:player_id/communities_playtime", method="get", tag = "ApiTags::Players")]
    async fn get_user_communities_playtime(
        &self,
        Data(app): Data<&AppData>,
        OptionalTokenBearer(requester): OptionalTokenBearer,
        Path(player_id): Path<String>,
    ) -> Response<Vec<PlayerCommunityPlaytime>> {
        let pool = &*app.pool;
        let target_user_id = match resolve_user_id(&player_id, &requester) {
            Ok(id) => id,
            Err(e) => return e,
        };

        let Some(canonical_id) = resolve_canonical_player_id(pool, &target_user_id.to_string()).await else {
            return response!(ok vec![]);
        };

        let result = app.player_worker.get_community_playtime(&canonical_id).await;
        handle_worker_result(result, "Player not found")
    }

    /// A player's playtime by day, summed across every server they've played on.
    ///
    /// `player_id` may be `"me"` or a numeric Steam ID. Communities where the target anonymized
    /// themselves are excluded for non-owners.
    #[oai(path="/players/:player_id/playtime-heatmap", method="get", tag = "ApiTags::Players")]
    async fn get_user_playtime_heatmap(
        &self,
        Data(app): Data<&AppData>,
        OptionalTokenBearer(requester): OptionalTokenBearer,
        Path(player_id): Path<String>,
    ) -> Response<Vec<PlayerSessionTime>> {
        let pool = &*app.pool;
        let target_user_id = match resolve_user_id(&player_id, &requester) {
            Ok(id) => id,
            Err(e) => return e,
        };
        let steam_id = target_user_id.to_string();
        let is_owner = requester.map(|t| t.id) == Some(target_user_id);

        let anonymization_settings = sqlx::query_as!(
            DbUserAnonymization,
            "SELECT user_id, community_id, anonymized, hide_location FROM website.user_anonymization WHERE user_id = $1",
            target_user_id
        ).fetch_all(pool).await.unwrap_or_default();

        let excluded_community_ids: Vec<Uuid> = if is_owner {
            vec![]
        } else {
            anonymization_settings.iter()
                .filter(|s| s.anonymized)
                .filter_map(|s| s.community_id)
                .collect()
        };

        let result = sqlx::query_as!(
            DbPlayerSessionTime,
            "WITH user_players AS (
                SELECT player_id FROM player WHERE player_id = $1 OR associated_player_id = $1
            )
            SELECT
                DATE_TRUNC('day', pss.started_at) AS bucket_time,
                ROUND((
                    SUM(EXTRACT(EPOCH FROM (pss.ended_at - pss.started_at))) / 3600
                )::numeric, 2)::double precision AS hour_duration
            FROM player_server_session pss
            JOIN user_players up ON up.player_id = pss.player_id
            JOIN server s ON s.server_id = pss.server_id
            WHERE NOT (s.community_id = ANY($2))
            GROUP BY bucket_time
            ORDER BY bucket_time",
            steam_id,
            &excluded_community_ids
        ).fetch_all(pool).await;

        let Ok(result) = result else {
            return response!(internal_server_error);
        };

        response!(ok result.iter_into())
    }
    /// Paginated list of a player's sessions across every server they have played on.
    ///
    /// `player_id` may be `"me"` (requires auth) or a numeric Steam ID. `datetime` narrows the list
    /// to the single UTC day it falls in; omitted, every session is listed. `page` is zero-based and
    /// pages are 10 rows. Communities where the target anonymized themselves are omitted for
    /// non-owners, matching `/players/{player_id}/profile`.
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
        let target_user_id = match resolve_user_id(&player_id, &requester) {
            Ok(id) => id,
            Err(e) => return e,
        };
        let steam_id = target_user_id.to_string();
        let is_owner = requester.map(|t| t.id) == Some(target_user_id);

        let anonymization_settings = sqlx::query_as!(
            DbUserAnonymization,
            "SELECT user_id, community_id, anonymized, hide_location FROM website.user_anonymization WHERE user_id = $1",
            target_user_id
        ).fetch_all(pool).await.unwrap_or_default();

        let excluded_community_ids: Vec<Uuid> = if is_owner {
            vec![]
        } else {
            anonymization_settings.iter()
                .filter(|s| s.anonymized)
                .filter_map(|s| s.community_id)
                .collect()
        };

        let offset = PAGE_SIZE * page.unwrap_or(0) as i64;
        // NULL bounds mean "no filter", so the whole history is listed rather than the per-server
        // endpoint's hardcoded 2024-02-01 floor.
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
            steam_id,
            &excluded_community_ids,
            start,
            end,
            PAGE_SIZE,
            offset
        ).fetch_all(pool).await;

        let Ok(result) = result else {
            return response!(internal_server_error);
        };

        let total_rows = result.first().and_then(|e| e.total_rows).unwrap_or_default();
        let total_pages = (total_rows + PAGE_SIZE - 1) / PAGE_SIZE;

        response!(ok GlobalPlayerSessionPage{ total_pages, rows: result.iter_into() })
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

        match result {
            Ok(setting) => {
                response!(ok setting.into())
            }
            Err(e) => {
                tracing::error!("Failed to set anonymization: {}", e);
                response!(internal_server_error)
            }
        }
    }

    /// The signed-in user's anonymization settings across every community they've configured.
    #[oai(path="/accounts/me/anonymize", method="get")]
    async fn get_user_anonymization(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
    ) -> Response<Vec<UserAnonymization>> {
        let user_id = user_token.id;

        let settings = match sqlx::query_as!(
            DbUserAnonymization,
            "SELECT user_id, community_id, anonymized, hide_location FROM website.user_anonymization
             WHERE user_id = $1",
            user_id
        )
        .fetch_all(&*data.pool)
        .await {
            Ok(s) => s,
            Err(e) => {
                tracing::error!("Failed to fetch anonymization settings: {}", e);
                return response!(internal_server_error);
            }
        };

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

        let has_permission = match check_permission(data, requester_id, user_id, uuid).await {
            Ok(p) => p,
            Err(_) => return response!(internal_server_error)
        };

        if !has_permission {
            return response!(err "Insufficient permissions", ErrorCode::Forbidden);
        }

        let user_exists = match sqlx::query_scalar!(
            "SELECT EXISTS(SELECT 1 FROM website.steam_user WHERE user_id = $1)",
            user_id
        )
        .fetch_one(&*data.pool)
        .await {
            Ok(e) => e,
            Err(_) => return response!(internal_server_error)
        };

        if user_exists != Some(true) {
            return response!(err "Target user not found", ErrorCode::NotFound);
        }

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

        match result {
            Ok(setting) => {
                response!(ok  setting.into())
            }
            Err(e) => {
                tracing::error!("Failed to set anonymization: {}", e);
                response!(internal_server_error)
            }
        }
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

        match sqlx::query_as!(
            DbUserAnonymization,
            "SELECT community_id, anonymized, hide_location, user_id FROM website.user_anonymization
             WHERE user_id = $1",
            target_user_id
        )
        .fetch_all(&*data.pool)
        .await {
            Ok(s) => response!(ok s.iter_into()),
            Err(e) => {
                tracing::error!("Failed to fetch anonymization settings: {}", e);
                response!(internal_server_error)
            }
        }
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
        if !check_superuser(data, user_token.id).await {
            return response!(err "Unauthorized", ErrorCode::Forbidden);
        }

        let page = page.unwrap_or(1).max(1);
        let limit = 20i64;
        let offset = (page - 1) * limit;

        let status_filter = status.as_deref();

        let reports = match sqlx::query_as!(
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
        .await
        {
            Ok(r) => r,
            Err(e) => {
                tracing::error!("Failed to fetch music reports: {}", e);
                return response!(internal_server_error);
            }
        };

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
        if !check_superuser(data, user_token.id).await {
            return response!(err "Unauthorized", ErrorCode::Forbidden);
        }

        let Ok(report_uuid) = Uuid::parse_str(&report_id) else {
            return response!(err "Invalid report ID", ErrorCode::BadRequest);
        };

        if !["resolved", "dismissed", "pending"].contains(&payload.status.as_str()) {
            return response!(err "Invalid status. Must be 'resolved', 'dismissed', or 'pending'", ErrorCode::BadRequest);
        }

        let resolved_by = if payload.status == "pending" { None } else { Some(user_token.id) };

        let report = match sqlx::query_as!(
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
        .await
        {
            Ok(Some(r)) => r,
            Ok(None) => return response!(err "Report not found", ErrorCode::NotFound),
            Err(e) => {
                tracing::error!("Failed to update music report: {}", e);
                return response!(internal_server_error);
            }
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
        if !check_superuser(data, user_token.id).await {
            return response!(err "Unauthorized", ErrorCode::Forbidden);
        }

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

        match result {
            Ok(result) => {
                if result.rows_affected() == 0 {
                    return response!(err "Music track not found", ErrorCode::NotFound);
                }
                response!(ok "Updated successfully".into())
            }
            Err(e) => {
                tracing::error!("Failed to update music YouTube ID: {}", e);
                response!(internal_server_error)
            }
        }
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
        if !check_superuser(data, user_token.id).await {
            return response!(err "Unauthorized", ErrorCode::Forbidden);
        }

        let page = page.unwrap_or(1).max(1);
        let limit = 20i64;
        let offset = (page - 1) * limit;

        let mut all_announcements = match sqlx::query_as!(
            DbAnnouncement,
            r#"
            SELECT id, type as "type!: AnnouncementTypeState", title, text, created_at, published_at, expires_at, show
            FROM website.announce
            ORDER BY created_at DESC
            "#
        )
        .fetch_all(&*data.pool)
        .await
        {
            Ok(a) => a,
            Err(e) => {
                tracing::error!("Failed to fetch announcements: {}", e);
                return response!(internal_server_error);
            }
        };

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
        if !check_superuser(data, user_token.id).await {
            return response!(err "Unauthorized", ErrorCode::Forbidden);
        }
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
            if title.len() < 5 || title.len() > 200 {
                return response!(err "Title must be 5-200 characters", ErrorCode::BadRequest);
            }
        }
        if payload.text.len() < 10 || payload.text.len() > 10000 {
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
        let announcement = match sqlx::query_as!(
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
        .await
        {
            Ok(a) => a,
            Err(e) => {
                tracing::error!("Failed to create announcement: {}", e);
                return response!(internal_server_error);
            }
        };

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
        if !check_superuser(data, user_token.id).await {
            return response!(err "Unauthorized", ErrorCode::Forbidden);
        }

        // Validation
        if let Some(ref title) = payload.title {
            if title.len() < 5 || title.len() > 200 {
                return response!(err "Title must be 5-200 characters", ErrorCode::BadRequest);
            }
        }
        if let Some(ref text) = payload.text {
            if text.len() < 10 || text.len() > 10_000 {
                return response!(err "Content must be 10-10000 characters", ErrorCode::BadRequest);
            }
        }
        if let (Some(pub_at), Some(exp_at)) = (&payload.published_at, &payload.expires_at) {
            if pub_at > exp_at {
                return response!(err "published_at must be before expires_at", ErrorCode::BadRequest);
            }
        }

        let current = match sqlx::query_as!(
            DbAnnouncement,
            "SELECT id, type AS \"type: AnnouncementTypeState\", title, text, created_at, published_at, expires_at, show
             FROM website.announce WHERE id = $1::TEXT::UUID",
            id
        )
        .fetch_optional(&*data.pool)
        .await
        {
            Ok(Some(a)) => a,
            Ok(None) => return response!(err "Announcement not found", ErrorCode::NotFound),
            Err(e) => {
                tracing::error!("Failed to fetch announcement: {}", e);
                return response!(internal_server_error);
            }
        };

        let new_type: AnnouncementTypeState = payload.r#type.map(|e| e.into()).unwrap_or(current.r#type);
        let new_title = payload.title.or(current.title);
        let new_text = payload.text.unwrap_or(current.text);
        let new_published_at = payload.published_at.map(|e| e.to_db_time()).unwrap_or(current.published_at);
        let new_expires_at = payload.expires_at.map(|e| e.to_db_time()).or(current.expires_at);
        let new_show = payload.show.unwrap_or(current.show);

        let updated = match sqlx::query_as!(
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
        .await
        {
            Ok(a) => a,
            Err(e) => {
                tracing::error!("Failed to update announcement: {}", e);
                return response!(internal_server_error);
            }
        };

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
        if !check_superuser(data, user_token.id).await {
            return response!(err "Unauthorized", ErrorCode::Forbidden);
        }

        let result = match sqlx::query!(
            "DELETE FROM website.announce WHERE id = $1::TEXT::UUID",
            id
        )
        .execute(&*data.pool)
        .await
        {
            Ok(r) => r,
            Err(e) => {
                tracing::error!("Failed to delete announcement: {}", e);
                return response!(internal_server_error);
            }
        };

        if result.rows_affected() == 0 {
            return response!(err "Announcement not found", ErrorCode::NotFound);
        }

        response!(ok "Announcement deleted successfully".to_string())
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

        match result {
            Ok(sub) => response!(ok sub.into()),
            Err(e) => {
                tracing::error!("Failed to subscribe to push notifications: {}", e);
                response!(internal_server_error)
            }
        }
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

        match result {
            Ok(_) => response!(ok "Unsubscribed successfully".to_string()),
            Err(e) => {
                tracing::error!("Failed to unsubscribe from push notifications: {}", e);
                response!(internal_server_error)
            }
        }
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

        match result {
            Ok(subs) => {
                let subs: Vec<PushSubscription> = subs.into_iter().map(|s| s.into()).collect();
                response!(ok subs)
            }
            Err(e) => {
                tracing::error!("Failed to get push subscriptions: {}", e);
                response!(internal_server_error)
            }
        }
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
                // Create default preferences
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

        match result {
            Ok(db_prefs) => {
                response!(ok db_prefs.into())
            }
            Err(e) => {
                tracing::error!("Failed to update notification preferences: {}", e);
                response!(internal_server_error)
            }
        }
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
        let subscription_id = match Uuid::parse_str(&dto.subscription_id) {
            Ok(id) => id,
            Err(_) => return response!(err "Invalid subscription ID format", ErrorCode::BadRequest),
        };

        let subscription_check = sqlx::query_scalar!(
            "SELECT user_id FROM website.push_subscriptions WHERE id = $1",
            subscription_id
        )
        .fetch_optional(&*data.pool)
        .await;

        match subscription_check {
            Ok(Some(user_id)) if user_id == user_token.id => {
                // Subscription exists and belongs to user, proceed
            }
            Ok(Some(_)) => {
                return response!(err "Subscription does not belong to user", ErrorCode::Forbidden);
            }
            Ok(None) => {
                return response!(err "Subscription not found", ErrorCode::NotFound);
            }
            Err(e) => {
                tracing::error!("Failed to verify subscription: {}", e);
                return response!(internal_server_error);
            }
        }

        let server_check = sqlx::query_scalar!(
            "SELECT server_id FROM server WHERE server_id = $1",
            dto.server_id
        )
        .fetch_optional(&*data.pool)
        .await;

        match server_check {
            Ok(Some(_)) => {
                // Server exists, proceed
            }
            Ok(None) => {
                return response!(err "Server not found", ErrorCode::NotFound);
            }
            Err(e) => {
                tracing::error!("Failed to verify server: {}", e);
                return response!(internal_server_error);
            }
        }

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

        match result {
            Ok(sub) => response!(ok sub.into()),
            Err(e) => {
                tracing::error!("Failed to create map change subscription: {}", e);
                response!(internal_server_error)
            }
        }
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

        match result {
            Ok(_) => response!(ok "Unsubscribed from map change notifications".to_string()),
            Err(e) => {
                tracing::error!("Failed to unsubscribe from map change notifications: {}", e);
                response!(internal_server_error)
            }
        }
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

        match result {
            Ok(subs) => {
                let subs: Vec<MapChangeSubscription> = subs.into_iter().map(|s| s.into()).collect();
                response!(ok subs)
            }
            Err(e) => {
                tracing::error!("Failed to get map change subscriptions: {}", e);
                response!(internal_server_error)
            }
        }
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
        let subscription_id = match Uuid::parse_str(&dto.subscription_id) {
            Ok(id) => id,
            Err(_) => return response!(err "Invalid subscription ID format", ErrorCode::BadRequest),
        };
        let subscription_check = sqlx::query_scalar!(
            "SELECT user_id FROM website.push_subscriptions WHERE id = $1",
            subscription_id
        )
        .fetch_optional(&*data.pool)
        .await;

        match subscription_check {
            Ok(Some(user_id)) if user_id == user_token.id => {
                // Subscription exists and belongs to user, proceed
            }
            Ok(Some(_)) => {
                return response!(err "Subscription does not belong to user", ErrorCode::Forbidden);
            }
            Ok(None) => {
                return response!(err "Subscription not found", ErrorCode::NotFound);
            }
            Err(e) => {
                tracing::error!("Failed to verify subscription: {}", e);
                return response!(internal_server_error);
            }
        }

        if let Some(ref server_id) = dto.server_id {
            let server_check = sqlx::query_scalar!(
                "SELECT server_id FROM server WHERE server_id = $1",
                server_id
            )
            .fetch_optional(&*data.pool)
            .await;

            match server_check {
                Ok(Some(_)) => {
                    // Server exists, proceed
                }
                Ok(None) => {
                    return response!(err "Server not found", ErrorCode::NotFound);
                }
                Err(e) => {
                    tracing::error!("Failed to verify server: {}", e);
                    return response!(internal_server_error);
                }
            }
        }

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

        match result {
            Ok(sub) => response!(ok sub.into()),
            Err(e) => {
                tracing::error!("Failed to create map notify subscription: {}", e);
                response!(internal_server_error)
            }
        }
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

        match result {
            Ok(subs) => {
                let subs: Vec<MapNotifySubscription> = subs.into_iter().map(|s| s.into()).collect();
                response!(ok subs)
            }
            Err(e) => {
                tracing::error!("Failed to get map notify subscriptions: {}", e);
                response!(internal_server_error)
            }
        }
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

        match result {
            Ok(_) => response!(ok "Unsubscribed from map notification".to_string()),
            Err(e) => {
                tracing::error!("Failed to unsubscribe from map notification: {}", e);
                response!(internal_server_error)
            }
        }
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
        if !check_superuser(data, user_token.id).await {
            return response!(err "Unauthorized", ErrorCode::Forbidden);
        }

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

        match result {
            Ok(send_result) => {
                let api_result = NotificationSendResult {
                    success: send_result.success,
                    failed: send_result.failed,
                    total: send_result.total,
                    errors: send_result.errors,
                };
                response!(ok api_result)
            }
            Err(e) => {
                tracing::error!("Failed to send test notification: {}", e);
                response!(internal_server_error)
            }
        }
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
        if !check_superuser(data, user_token.id).await {
            return response!(err "Unauthorized", ErrorCode::Forbidden);
        }

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

        match subscriptions {
            Ok(subs) => {
                let api_subs: Vec<PushSubscription> =
                    subs.into_iter().map(|s| s.into()).collect();
                response!(ok PushSubscriptionsPaginated {
                    total,
                    subscriptions: api_subs,
                })
            }
            Err(e) => {
                tracing::error!("Failed to get subscriptions: {}", e);
                response!(internal_server_error)
            }
        }
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

        let servers_json = match serde_json::to_value(&dto.servers) {
            Ok(v) => v,
            Err(_) => return response!(internal_server_error),
        };

        match sqlx::query!(
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
        .await
        {
            Ok(_) => response!(ok "OK".to_string()),
            Err(e) => {
                tracing::error!("Failed to insert server request: {}", e);
                response!(internal_server_error)
            }
        }
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
        if !check_superuser(data, user_token.id).await {
            return response!(err "Unauthorized", ErrorCode::Forbidden);
        }

        let page = page.unwrap_or(1).max(1);
        let limit = 20i64;
        let offset = (page - 1) * limit;
        let status_filter = status.as_deref();

        let requests = match sqlx::query_as!(
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
        .await
        {
            Ok(r) => r,
            Err(e) => {
                tracing::error!("Failed to fetch server requests: {}", e);
                return response!(internal_server_error);
            }
        };

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
        if !check_superuser(data, user_token.id).await {
            return response!(err "Unauthorized", ErrorCode::Forbidden);
        }

        if dto.status != "approved" && dto.status != "rejected" {
            return response!(err "status must be 'approved' or 'rejected'", ErrorCode::BadRequest);
        }

        let request_id = match Uuid::parse_str(&request_id) {
            Ok(id) => id,
            Err(_) => return response!(err "Invalid request ID", ErrorCode::BadRequest),
        };

        if dto.status == "approved" {
            let req = match sqlx::query!(
                r#"SELECT community_name, icon_url, servers FROM website.server_requests WHERE id = $1"#,
                request_id
            )
            .fetch_optional(&*data.pool)
            .await
            {
                Ok(Some(r)) => r,
                Ok(None) => return response!(err "Not found", ErrorCode::NotFound),
                Err(e) => {
                    tracing::error!("Failed to fetch server request for approval: {}", e);
                    return response!(internal_server_error);
                }
            };

            let community_id = match sqlx::query_scalar!(
                r#"INSERT INTO community (community_name, community_icon_url) VALUES ($1, $2) RETURNING community_id"#,
                req.community_name,
                req.icon_url
            )
            .fetch_one(&*data.pool)
            .await
            {
                Ok(id) => id,
                Err(e) => {
                    tracing::error!("Failed to insert community on approval: {}", e);
                    return response!(internal_server_error);
                }
            };

            let entries: Vec<ServerEntryDto> = match serde_json::from_value(req.servers) {
                Ok(v) => v,
                Err(e) => {
                    tracing::error!("Failed to deserialize servers JSONB: {}", e);
                    return response!(internal_server_error);
                }
            };

            for entry in entries {
                let port = entry.port as i16;
                if let Err(e) = sqlx::query!(
                    r#"INSERT INTO server_browser (ip, port) VALUES ($1, $2) ON CONFLICT DO NOTHING"#,
                    entry.ip,
                    port
                )
                .execute(&*data.pool)
                .await
                {
                    tracing::error!("Failed to insert server_browser entry: {}", e);
                    return response!(internal_server_error);
                }
            }

            tracing::info!("Approved server request {}: new community_id={}", request_id, community_id);
        }

        let rows_affected = match sqlx::query!(
            r#"UPDATE website.server_requests SET status = $1, reviewed_by = $2, reviewed_at = NOW() WHERE id = $3"#,
            dto.status,
            user_token.id,
            request_id
        )
        .execute(&*data.pool)
        .await
        {
            Ok(r) => r.rows_affected(),
            Err(e) => {
                tracing::error!("Failed to update server request status: {}", e);
                return response!(internal_server_error);
            }
        };

        if rows_affected == 0 {
            return response!(err "Not found", ErrorCode::NotFound);
        }

        let updated = match sqlx::query_as!(
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
        .await
        {
            Ok(r) => r,
            Err(e) => {
                tracing::error!("Failed to fetch updated server request: {}", e);
                return response!(internal_server_error);
            }
        };

        response!(ok updated.into())
    }
}
impl UriPatternExt for AccountsApi{
    fn get_all_patterns(&self) -> Vec<RoutePattern> {
        vec![
            "/accounts/create",
            "/accounts/me",
            "/accounts/me/communities",
            "/accounts/me/anonymize",
            "/accounts/{user_id}/anonymize",
            "/players/{player_id}/profile",
            "/players/{player_id}/sessions",
            "/players/{player_id}/global-playtime",
            "/players/{player_id}/communities_playtime",
            "/players/{player_id}/playtime-heatmap",
            "/admin/reports/music",
            "/admin/reports/music/{report_id}/status",
            "/admin/music/{music_id}/youtube",
            "/admin/announcements",
            "/admin/announcements/{id}",
            "/accounts/me/push/subscriptions",
            "/accounts/me/push/subscribe",
            "/accounts/me/push/unsubscribe",
            "/accounts/me/push/vapid-public-key",
            "/accounts/me/push/preferences",
            "/accounts/me/push/map-change",
            "/accounts/me/push/map-change/subscribe",
            "/accounts/me/push/map-change/{server_id}",
            "/accounts/me/push/map-notify",
            "/accounts/me/push/map-notify/subscribe",
            "/accounts/me/push/map-notify/status",
            "/accounts/me/push/map-notify/{map_name}",
            "/admin/push/test",
            "/admin/push/subscriptions",
            "/accounts/server-requests",
            "/admin/server-requests",
            "/admin/server-requests/{request_id}/status",
        ].iter_into()
    }
}