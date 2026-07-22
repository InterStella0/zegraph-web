use poem::web::Data;
use poem_openapi::payload::Json;
use poem_openapi::OpenApi;
use poem_openapi::param::{Path, Query};
use uuid::Uuid;

use crate::core::storage::image_ext_from_content_type;
use crate::core::utils::*;
use crate::{response, AppData};
use crate::api_models::common::*;
use crate::models::admins::*;
use crate::api_models::admins::*;
use crate::routers::ApiTags;

pub struct AdminServersApi;

const VALID_COOLDOWN_TYPES: &[&str] = &["unknown", "datetime", "map_count"];


#[OpenApi(tag = "ApiTags::AdminServers")]
impl AdminServersApi {

    /// List every community with its server count. Requires the `superuser` role.
    #[oai(path = "/admin/communities", method = "get")]
    async fn list_communities(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
    ) -> Response<Vec<AdminCommunity>> {
        if !check_superuser(data, user_token.id).await {
            return response!(err "Unauthorized", ErrorCode::Forbidden);
        }

        struct DbRow {
            community_id: Uuid,
            community_name: Option<String>,
            community_shorten_name: Option<String>,
            community_icon_url: Option<String>,
            server_count: Option<i64>,
        }

        let rows = match sqlx::query_as!(
            DbRow,
            r#"
            SELECT c.community_id, c.community_name, c.community_shorten_name, c.community_icon_url,
                   COUNT(s.server_id) AS server_count
            FROM community c
            LEFT JOIN server s ON s.community_id = c.community_id
            GROUP BY c.community_id
            ORDER BY c.community_name NULLS LAST
            "#
        )
        .fetch_all(&*data.pool)
        .await
        {
            Ok(r) => r,
            Err(e) => {
                tracing::error!("Failed to list communities: {}", e);
                return response!(internal_server_error);
            }
        };

        response!(ok rows.into_iter().map(|r| AdminCommunity {
            id: r.community_id.to_string(),
            name: r.community_name,
            shorten_name: r.community_shorten_name,
            icon_url: r.community_icon_url,
            server_count: r.server_count.unwrap_or(0),
        }).collect())
    }

    /// Create a new community. Requires the `superuser` role.
    #[oai(path = "/admin/communities", method = "post")]
    async fn create_community(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
        Json(payload): Json<CreateCommunityPayload>,
    ) -> Response<AdminCommunity> {
        if !check_superuser(data, user_token.id).await {
            return response!(err "Unauthorized", ErrorCode::Forbidden);
        }
        if payload.name.trim().is_empty() {
            return response!(err "Name is required", ErrorCode::BadRequest);
        }
        if let Some(ref s) = payload.shorten_name {
            if s.len() > 20 {
                return response!(err "Short name must be 20 characters or fewer", ErrorCode::BadRequest);
            }
        }

        let row = match sqlx::query!(
            r#"
            INSERT INTO community (community_name, community_shorten_name, community_icon_url)
            VALUES ($1, $2, $3)
            RETURNING community_id
            "#,
            payload.name,
            payload.shorten_name,
            payload.icon_url,
        )
        .fetch_one(&*data.pool)
        .await
        {
            Ok(r) => r,
            Err(e) => {
                tracing::error!("Failed to create community: {}", e);
                return response!(internal_server_error);
            }
        };

        response!(ok AdminCommunity {
            id: row.community_id.to_string(),
            name: Some(payload.name),
            shorten_name: payload.shorten_name,
            icon_url: payload.icon_url,
            server_count: 0,
        })
    }

    /// Update a community's name/short name/icon URL. Requires the `superuser` role.
    #[oai(path = "/admin/communities/:id", method = "put")]
    async fn update_community(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
        Path(id): Path<String>,
        Json(payload): Json<UpdateCommunityPayload>,
    ) -> Response<AdminCommunity> {
        if !check_superuser(data, user_token.id).await {
            return response!(err "Unauthorized", ErrorCode::Forbidden);
        }
        let id = match Uuid::parse_str(&id) {
            Ok(u) => u,
            Err(_) => return response!(err "Invalid community ID", ErrorCode::BadRequest),
        };
        if let Some(ref s) = payload.shorten_name {
            if s.len() > 20 {
                return response!(err "Short name must be 20 characters or fewer", ErrorCode::BadRequest);
            }
        }

        struct DbRow {
            community_id: Uuid,
            community_name: Option<String>,
            community_shorten_name: Option<String>,
            community_icon_url: Option<String>,
        }

        let row = match sqlx::query_as!(
            DbRow,
            r#"
            UPDATE community SET
                community_name         = COALESCE($2, community_name),
                community_shorten_name = CASE WHEN $3 THEN $4 ELSE community_shorten_name END,
                community_icon_url     = CASE WHEN $5 THEN $6 ELSE community_icon_url END
            WHERE community_id = $1
            RETURNING community_id, community_name, community_shorten_name, community_icon_url
            "#,
            id,
            payload.name,
            payload.shorten_name.is_some(),
            payload.shorten_name,
            payload.icon_url.is_some(),
            payload.icon_url,
        )
        .fetch_optional(&*data.pool)
        .await
        {
            Ok(Some(r)) => r,
            Ok(None) => return response!(err "Community not found", ErrorCode::NotFound),
            Err(e) => {
                tracing::error!("Failed to update community: {}", e);
                return response!(internal_server_error);
            }
        };

        let server_count = sqlx::query_scalar!(
            "SELECT COUNT(*) FROM server WHERE community_id = $1",
            id
        )
        .fetch_one(&*data.pool)
        .await
        .unwrap_or(Some(0))
        .unwrap_or(0);

        response!(ok AdminCommunity {
            id: row.community_id.to_string(),
            name: row.community_name,
            shorten_name: row.community_shorten_name,
            icon_url: row.community_icon_url,
            server_count,
        })
    }

    /// Upload or replace a community's icon image.
    ///
    /// Requires the `superuser` role. Multipart form with an `icon` field (PNG, WebP or JPEG).
    /// Deletes the previous icon if one existed.
    #[oai(path = "/admin/communities/:id/icon", method = "post")]
    async fn upload_community_icon(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
        Path(id): Path<String>,
        multipart: poem::web::Multipart,
    ) -> Response<AdminCommunity> {
        if !check_superuser(data, user_token.id).await {
            return response!(err "Unauthorized", ErrorCode::Forbidden);
        }
        let id = match Uuid::parse_str(&id) {
            Ok(u) => u,
            Err(_) => return response!(err "Invalid community ID", ErrorCode::BadRequest),
        };

        let existing_icon_url = match sqlx::query_scalar!(
            "SELECT community_icon_url FROM community WHERE community_id = $1",
            id
        )
        .fetch_optional(&*data.pool)
        .await
        {
            Ok(Some(icon)) => icon,
            Ok(None) => return response!(err "Community not found", ErrorCode::NotFound),
            Err(e) => {
                tracing::error!("Failed to look up community: {}", e);
                return response!(internal_server_error);
            }
        };

        let mut multipart = multipart;
        let mut icon_data: Option<(Vec<u8>, String)> = None;

        while let Ok(Some(field)) = multipart.next_field().await {
            if field.name().map(|n| n == "icon").unwrap_or(false) {
                let content_type = field.content_type()
                    .map(|ct| ct.to_string())
                    .unwrap_or_default();
                let Some(ext) = image_ext_from_content_type(&content_type) else {
                    return response!(err "Icon must be a PNG, WebP or JPEG image", ErrorCode::BadRequest);
                };
                match field.bytes().await {
                    Ok(bytes) => icon_data = Some((bytes.to_vec(), ext.to_string())),
                    Err(e) => {
                        tracing::error!("Failed to read community icon upload: {}", e);
                        return response!(err "Failed to read icon upload", ErrorCode::BadRequest);
                    }
                }
            }
        }

        let Some((icon_bytes, ext)) = icon_data else {
            return response!(err "Missing icon field", ErrorCode::BadRequest);
        };

        let icon_url = match data.community_storage.store_icon(&id.to_string(), &ext, &icon_bytes).await {
            Ok(url) => url,
            Err(e) => {
                tracing::error!("Failed to store community icon: {}", e);
                return response!(internal_server_error);
            }
        };

        if let Some(old_icon) = existing_icon_url {
            match data.community_storage.delete_previous_icon(&id.to_string(), &old_icon, &ext).await {
                Ok(true) => (),
                Ok(false) => tracing::debug!("Kept previous community icon {}: same key as the new upload, or not ours", old_icon),
                Err(e) => tracing::warn!("Failed to delete previous community icon: {}", e),
            }
        }

        struct DbRow {
            community_id: Uuid,
            community_name: Option<String>,
            community_shorten_name: Option<String>,
            community_icon_url: Option<String>,
        }

        let row = match sqlx::query_as!(
            DbRow,
            r#"
            UPDATE community SET community_icon_url = $2
            WHERE community_id = $1
            RETURNING community_id, community_name, community_shorten_name, community_icon_url
            "#,
            id,
            icon_url,
        )
        .fetch_optional(&*data.pool)
        .await
        {
            Ok(Some(r)) => r,
            Ok(None) => return response!(err "Community not found", ErrorCode::NotFound),
            Err(e) => {
                tracing::error!("Failed to update community icon: {}", e);
                return response!(internal_server_error);
            }
        };

        let server_count = sqlx::query_scalar!(
            "SELECT COUNT(*) FROM server WHERE community_id = $1",
            id
        )
        .fetch_one(&*data.pool)
        .await
        .unwrap_or(Some(0))
        .unwrap_or(0);

        response!(ok AdminCommunity {
            id: row.community_id.to_string(),
            name: row.community_name,
            shorten_name: row.community_shorten_name,
            icon_url: row.community_icon_url,
            server_count,
        })
    }

    /// Delete a community and its icon. Requires the `superuser` role.
    ///
    /// Does not delete the community's servers; they are left with no community assigned.
    #[oai(path = "/admin/communities/:id", method = "delete")]
    async fn delete_community(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
        Path(id): Path<String>,
    ) -> Response<bool> {
        if !check_superuser(data, user_token.id).await {
            return response!(err "Unauthorized", ErrorCode::Forbidden);
        }
        let id = match Uuid::parse_str(&id) {
            Ok(u) => u,
            Err(_) => return response!(err "Invalid community ID", ErrorCode::BadRequest),
        };

        if let Ok(Some(icon_url)) = sqlx::query_scalar!(
            "SELECT community_icon_url FROM community WHERE community_id = $1",
            id
        )
        .fetch_optional(&*data.pool)
        .await
        {
            if let Some(icon_url) = icon_url {
                if let Err(e) = data.community_storage.delete_icon(&id.to_string(), &icon_url).await {
                    tracing::warn!("Failed to delete community icon on community delete: {}", e);
                }
            }
        }

        let result = match sqlx::query!("DELETE FROM community WHERE community_id = $1", id)
            .execute(&*data.pool)
            .await
        {
            Ok(r) => r,
            Err(e) => {
                tracing::error!("Failed to delete community: {}", e);
                return response!(internal_server_error);
            }
        };

        if result.rows_affected() == 0 {
            return response!(err "Community not found", ErrorCode::NotFound);
        }
        response!(ok true)
    }

    /// List the scraper's tracked IP:port entries and their cooldown behavior.
    ///
    /// Requires the `superuser` role. This configures the separate, unpublished data scraper,
    /// not the servers exposed by this API.
    #[oai(path = "/admin/server-browsers", method = "get")]
    async fn list_server_browsers(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
    ) -> Response<Vec<AdminServerBrowser>> {
        if !check_superuser(data, user_token.id).await {
            return response!(err "Unauthorized", ErrorCode::Forbidden);
        }

        let rows = match sqlx::query!(
            "SELECT ip, port, tracking, cooldown_type FROM server_browser ORDER BY ip, port"
        )
        .fetch_all(&*data.pool)
        .await
        {
            Ok(r) => r,
            Err(e) => {
                tracing::error!("Failed to list server_browsers: {}", e);
                return response!(internal_server_error);
            }
        };

        response!(ok rows.into_iter().map(|r| AdminServerBrowser {
            ip: r.ip,
            port: r.port,
            tracking: r.tracking,
            cooldown_type: r.cooldown_type,
        }).collect())
    }

    /// Add (or update, on IP:port conflict) a scraper tracking entry.
    ///
    /// Requires the `superuser` role. `cooldown_type` must be `unknown`, `datetime` or
    /// `map_count`.
    #[oai(path = "/admin/server-browsers", method = "post")]
    async fn create_server_browser(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
        Json(payload): Json<CreateServerBrowserPayload>,
    ) -> Response<AdminServerBrowser> {
        if !check_superuser(data, user_token.id).await {
            return response!(err "Unauthorized", ErrorCode::Forbidden);
        }
        if payload.ip.trim().is_empty() {
            return response!(err "IP is required", ErrorCode::BadRequest);
        }
        let cooldown_type = payload.cooldown_type.unwrap_or_else(|| "unknown".to_string());
        if !VALID_COOLDOWN_TYPES.contains(&cooldown_type.as_str()) {
            return response!(err "cooldown_type must be unknown, datetime, or map_count", ErrorCode::BadRequest);
        }
        let tracking = payload.tracking.unwrap_or(true);

        let row = match sqlx::query!(
            r#"
            INSERT INTO server_browser (ip, port, tracking, cooldown_type)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (ip, port) DO UPDATE
                SET tracking = EXCLUDED.tracking, cooldown_type = EXCLUDED.cooldown_type
            RETURNING ip, port, tracking, cooldown_type
            "#,
            payload.ip,
            payload.port,
            tracking,
            cooldown_type,
        )
        .fetch_one(&*data.pool)
        .await
        {
            Ok(r) => r,
            Err(e) => {
                tracing::error!("Failed to create server_browser: {}", e);
                return response!(internal_server_error);
            }
        };

        response!(ok AdminServerBrowser {
            ip: row.ip,
            port: row.port,
            tracking: row.tracking,
            cooldown_type: row.cooldown_type,
        })
    }

    /// Update a scraper tracking entry's `tracking`/`cooldown_type` flags, identified by
    /// `ip`+`port` query params. Requires the `superuser` role.
    #[oai(path = "/admin/server-browsers", method = "put")]
    async fn update_server_browser(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
        Query(ip): Query<String>,
        Query(port): Query<i16>,
        Json(payload): Json<UpdateServerBrowserPayload>,
    ) -> Response<AdminServerBrowser> {
        if !check_superuser(data, user_token.id).await {
            return response!(err "Unauthorized", ErrorCode::Forbidden);
        }
        if let Some(ref ct) = payload.cooldown_type {
            if !VALID_COOLDOWN_TYPES.contains(&ct.as_str()) {
                return response!(err "cooldown_type must be unknown, datetime, or map_count", ErrorCode::BadRequest);
            }
        }

        let row = match sqlx::query!(
            r#"
            UPDATE server_browser SET
                tracking     = COALESCE($3, tracking),
                cooldown_type = COALESCE($4, cooldown_type)
            WHERE ip = $1 AND port = $2
            RETURNING ip, port, tracking, cooldown_type
            "#,
            ip,
            port,
            payload.tracking,
            payload.cooldown_type,
        )
        .fetch_optional(&*data.pool)
        .await
        {
            Ok(Some(r)) => r,
            Ok(None) => return response!(err "Entry not found", ErrorCode::NotFound),
            Err(e) => {
                tracing::error!("Failed to update server_browser: {}", e);
                return response!(internal_server_error);
            }
        };

        response!(ok AdminServerBrowser {
            ip: row.ip,
            port: row.port,
            tracking: row.tracking,
            cooldown_type: row.cooldown_type,
        })
    }

    /// Remove a scraper tracking entry, identified by `ip`+`port` query params. Requires the
    /// `superuser` role.
    #[oai(path = "/admin/server-browsers", method = "delete")]
    async fn delete_server_browser(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
        Query(ip): Query<String>,
        Query(port): Query<i16>,
    ) -> Response<bool> {
        if !check_superuser(data, user_token.id).await {
            return response!(err "Unauthorized", ErrorCode::Forbidden);
        }

        let result = match sqlx::query!(
            "DELETE FROM server_browser WHERE ip = $1 AND port = $2",
            ip,
            port,
        )
        .execute(&*data.pool)
        .await
        {
            Ok(r) => r,
            Err(e) => {
                tracing::error!("Failed to delete server_browser: {}", e);
                return response!(internal_server_error);
            }
        };

        if result.rows_affected() == 0 {
            return response!(err "Entry not found", ErrorCode::NotFound);
        }
        response!(ok true)
    }

    /// List every tracked server with its full admin-only metadata. Requires the `superuser`
    /// role.
    #[oai(path = "/admin/servers-list", method = "get")]
    async fn list_servers_admin(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
    ) -> Response<Vec<AdminServer>> {
        if !check_superuser(data, user_token.id).await {
            return response!(err "Unauthorized", ErrorCode::Forbidden);
        }

        let rows = match sqlx::query_as!(
            AdminServerRow,
            r#"
            SELECT s.server_id, s.server_name, s.server_fullname, s.server_ip, s.server_port,
                   s.community_id, s.online, s.readable_link,
                   sm.server_website, sm.server_discord_link, sm.server_source,
                   sm.timezone, sm.game, sm.source_by_id
            FROM server s
            LEFT JOIN server_metadata sm ON sm.server_id = s.server_id
            ORDER BY s.server_fullname NULLS LAST, s.server_name NULLS LAST
            "#
        )
        .fetch_all(&*data.pool)
        .await
        {
            Ok(r) => r,
            Err(e) => {
                tracing::error!("Failed to list servers: {}", e);
                return response!(internal_server_error);
            }
        };

        response!(ok rows.into_iter().map(AdminServer::from).collect())
    }

    /// Rename a server or change its public readable link (used in vanity URLs).
    ///
    /// Requires the `superuser` role. `readable_link` must be 20 characters or fewer and unique.
    #[oai(path = "/admin/servers-list/:server_id", method = "put")]
    async fn update_server_admin(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
        Path(server_id): Path<String>,
        Json(payload): Json<UpdateServerPayload>,
    ) -> Response<AdminServer> {
        if !check_superuser(data, user_token.id).await {
            return response!(err "Unauthorized", ErrorCode::Forbidden);
        }

        let readable_link = payload.readable_link.as_ref().map(|l| l.trim().to_string());
        if let Some(link) = &readable_link {
            if link.len() > 20 {
                return response!(err "Readable link must be 20 characters or fewer", ErrorCode::BadRequest);
            }
        }
        let set_readable_link = readable_link.is_some();
        let readable_link = readable_link.filter(|l| !l.is_empty());

        let row = match sqlx::query_as!(
            AdminServerRow,
            r#"
            WITH updated AS (
                UPDATE server SET
                    server_name   = COALESCE($2, server_name),
                    readable_link = CASE WHEN $3 THEN $4 ELSE readable_link END
                WHERE server_id = $1
                RETURNING server_id, server_name, server_fullname, server_ip, server_port,
                          community_id, online, readable_link
            )
            SELECT u.server_id AS "server_id!", u.server_name, u.server_fullname, u.server_ip, u.server_port,
                   u.community_id, u.online, u.readable_link,
                   sm.server_website, sm.server_discord_link, sm.server_source,
                   sm.timezone, sm.game, sm.source_by_id
            FROM updated u
            LEFT JOIN server_metadata sm ON sm.server_id = u.server_id
            "#,
            server_id,
            payload.server_name,
            set_readable_link,
            readable_link,
        )
        .fetch_optional(&*data.pool)
        .await
        {
            Ok(Some(r)) => r,
            Ok(None) => return response!(err "Server not found", ErrorCode::NotFound),
            Err(e) => {
                if e.as_database_error().is_some_and(|d| d.is_unique_violation()) {
                    return response!(err "That readable link is already in use", ErrorCode::BadRequest);
                }
                tracing::error!("Failed to update server: {}", e);
                return response!(internal_server_error);
            }
        };

        response!(ok AdminServer::from(row))
    }

    /// Assign or clear a server's community. Requires the `superuser` role.
    #[oai(path = "/admin/servers-list/:server_id/community", method = "put")]
    async fn set_server_community(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
        Path(server_id): Path<String>,
        Json(payload): Json<SetServerCommunityPayload>,
    ) -> Response<AdminServer> {
        if !check_superuser(data, user_token.id).await {
            return response!(err "Unauthorized", ErrorCode::Forbidden);
        }

        let community_id: Option<Uuid> = match payload.community_id.as_deref() {
            Some(id) if !id.is_empty() => match Uuid::parse_str(id) {
                Ok(u) => Some(u),
                Err(_) => return response!(err "Invalid community_id", ErrorCode::BadRequest),
            },
            _ => None,
        };

        let row = match sqlx::query_as!(
            AdminServerRow,
            r#"
            WITH updated AS (
                UPDATE server SET community_id = $2
                WHERE server_id = $1
                RETURNING server_id, server_name, server_fullname, server_ip, server_port,
                          community_id, online, readable_link
            )
            SELECT u.server_id AS "server_id!", u.server_name, u.server_fullname, u.server_ip, u.server_port,
                   u.community_id, u.online, u.readable_link,
                   sm.server_website, sm.server_discord_link, sm.server_source,
                   sm.timezone, sm.game, sm.source_by_id
            FROM updated u
            LEFT JOIN server_metadata sm ON sm.server_id = u.server_id
            "#,
            server_id,
            community_id,
        )
        .fetch_optional(&*data.pool)
        .await
        {
            Ok(Some(r)) => r,
            Ok(None) => return response!(err "Server not found", ErrorCode::NotFound),
            Err(e) => {
                tracing::error!("Failed to set server community: {}", e);
                return response!(internal_server_error);
            }
        };

        response!(ok AdminServer::from(row))
    }

    /// Update (or create, if absent) a server's metadata: website, Discord link, source, time
    /// zone and game type. Requires the `superuser` role.
    #[oai(path = "/admin/servers-list/:server_id/metadata", method = "put")]
    async fn update_server_metadata(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
        Path(server_id): Path<String>,
        Json(payload): Json<UpdateServerMetadataPayload>,
    ) -> Response<AdminServer> {
        if !check_superuser(data, user_token.id).await {
            return response!(err "Unauthorized", ErrorCode::Forbidden);
        }
        if let Some(ref g) = payload.game {
            if !GAME_TYPES.contains(&g.as_str()) {
                return response!(err "Invalid game type", ErrorCode::BadRequest);
            }
        }

        let mut tx = match data.pool.begin().await {
            Ok(t) => t,
            Err(e) => {
                tracing::error!("Failed to start transaction: {}", e);
                return response!(internal_server_error);
            }
        };

        let exists = match sqlx::query_scalar!(
            "SELECT 1 FROM server WHERE server_id = $1",
            server_id,
        )
        .fetch_optional(&mut *tx)
        .await
        {
            Ok(r) => r.is_some(),
            Err(e) => {
                tracing::error!("Failed to check server existence: {}", e);
                return response!(internal_server_error);
            }
        };
        if !exists {
            return response!(err "Server not found", ErrorCode::NotFound);
        }

        let updated = match sqlx::query!(
            r#"
            UPDATE server_metadata SET
                server_website      = CASE WHEN $2 THEN $3 ELSE server_website END,
                server_discord_link = CASE WHEN $4 THEN $5 ELSE server_discord_link END,
                server_source       = CASE WHEN $6 THEN $7 ELSE server_source END,
                timezone            = CASE WHEN $8 THEN $9 ELSE timezone END,
                game                = COALESCE($10, game),
                source_by_id        = COALESCE($11, source_by_id)
            WHERE server_id = $1
            "#,
            server_id,
            payload.server_website.is_some(),
            payload.server_website,
            payload.server_discord_link.is_some(),
            payload.server_discord_link,
            payload.server_source.is_some(),
            payload.server_source,
            payload.timezone.is_some(),
            payload.timezone,
            payload.game,
            payload.source_by_id,
        )
        .execute(&mut *tx)
        .await
        {
            Ok(r) => r,
            Err(e) => {
                tracing::error!("Failed to update server_metadata: {}", e);
                return response!(internal_server_error);
            }
        };

        if updated.rows_affected() == 0 {
            if let Err(e) = sqlx::query!(
                r#"
                INSERT INTO server_metadata
                    (server_id, server_website, server_discord_link, server_source,
                     timezone, game, source_by_id)
                VALUES ($1, $2, $3, $4, $5, COALESCE($6, '730_cs2'), COALESCE($7, FALSE))
                "#,
                server_id,
                payload.server_website,
                payload.server_discord_link,
                payload.server_source,
                payload.timezone,
                payload.game,
                payload.source_by_id,
            )
            .execute(&mut *tx)
            .await
            {
                tracing::error!("Failed to insert server_metadata: {}", e);
                return response!(internal_server_error);
            }
        }

        let row = match sqlx::query_as!(
            AdminServerRow,
            r#"
            SELECT s.server_id, s.server_name, s.server_fullname, s.server_ip, s.server_port,
                   s.community_id, s.online, s.readable_link,
                   sm.server_website, sm.server_discord_link, sm.server_source,
                   sm.timezone, sm.game, sm.source_by_id
            FROM server s
            LEFT JOIN server_metadata sm ON sm.server_id = s.server_id
            WHERE s.server_id = $1
            "#,
            server_id,
        )
        .fetch_one(&mut *tx)
        .await
        {
            Ok(r) => r,
            Err(e) => {
                tracing::error!("Failed to reload server: {}", e);
                return response!(internal_server_error);
            }
        };

        if let Err(e) = tx.commit().await {
            tracing::error!("Failed to commit metadata update: {}", e);
            return response!(internal_server_error);
        }

        response!(ok AdminServer::from(row))
    }

    /// Permanently delete a server and its data. Requires the `superuser` role.
    ///
    /// Cascades to every row referencing this `server_id` (sessions, maps played, fetch status,
    /// etc.); this cannot be undone.
    #[oai(path = "/admin/servers-list/:server_id", method = "delete")]
    async fn delete_server_admin(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
        Path(server_id): Path<String>,
    ) -> Response<bool> {
        if !check_superuser(data, user_token.id).await {
            return response!(err "Unauthorized", ErrorCode::Forbidden);
        }

        let result = match sqlx::query!("DELETE FROM server WHERE server_id = $1", server_id)
            .execute(&*data.pool)
            .await
        {
            Ok(r) => r,
            Err(e) => {
                tracing::error!("Failed to delete server: {}", e);
                return response!(internal_server_error);
            }
        };

        if result.rows_affected() == 0 {
            return response!(err "Server not found", ErrorCode::NotFound);
        }
        response!(ok true)
    }
}

impl UriPatternExt for AdminServersApi {
    fn get_all_patterns(&self) -> Vec<RoutePattern> {
        vec![
            "/admin/communities",
            "/admin/communities/{id}",
            "/admin/communities/{id}/icon",
            "/admin/server-browsers",
            "/admin/servers-list",
            "/admin/servers-list/{server_id}",
            "/admin/servers-list/{server_id}/community",
            "/admin/servers-list/{server_id}/metadata",
        ]
        .iter_into()
    }
}
