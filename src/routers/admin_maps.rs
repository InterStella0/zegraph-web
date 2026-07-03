use poem::web::Data;
use poem_openapi::payload::Json;
use poem_openapi::{Object, OpenApi};
use poem_openapi::param::Query;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::core::api_models::*;
use crate::core::utils::*;
use crate::{response, AppData};

pub struct AdminMapsApi;

// ─── Response types ───────────────────────────────────────────────────────────

#[derive(Object, Serialize)]
pub struct AdminMapServerEntry {
    pub server_id: String,
    pub server_name: String,
    pub is_tryhard: Option<bool>,
    pub is_casual: Option<bool>,
    pub workshop_id: Option<i64>,
    pub resolved_workshop_id: Option<i64>,
    pub no_noms: bool,
    pub min_players: Option<i16>,
    pub max_players: Option<i16>,
}

#[derive(Object, Serialize)]
pub struct AdminMapEntry {
    pub map_name: String,
    pub global_is_tryhard: Option<bool>,
    pub global_is_casual: Option<bool>,
    pub global_has_lasers: Option<bool>,
    pub global_workshop_id: Option<i64>,
    pub global_resolved_workshop_id: Option<i64>,
    pub servers: Vec<AdminMapServerEntry>,
}

#[derive(Object, Serialize)]
pub struct AdminMapMetadataResponse {
    pub total: i64,
    pub maps: Vec<AdminMapEntry>,
}

// ─── Request DTOs ─────────────────────────────────────────────────────────────

#[derive(Object, Deserialize)]
pub struct UpdateGlobalMapMetadataDto {
    pub map_name: String,
    pub is_tryhard: Option<bool>,
    pub is_casual: Option<bool>,
    pub has_lasers: Option<bool>,
    pub workshop_id: Option<i64>,
    pub resolved_workshop_id: Option<i64>,
}

#[derive(Object, Deserialize)]
pub struct UpdateServerMapMetadataDto {
    pub server_id: String,
    pub map_name: String,
    /// null = clear override (inherit from global)
    pub is_tryhard: Option<bool>,
    /// null = clear override (inherit from global)
    pub is_casual: Option<bool>,
    /// null = clear override (inherit from global)
    pub workshop_id: Option<i64>,
    /// null = clear override (inherit from global)
    pub resolved_workshop_id: Option<i64>,
    /// null = keep existing value
    pub no_noms: Option<bool>,
    /// null = keep existing value
    pub min_players: Option<i16>,
    /// null = no player limit
    pub max_players: Option<i16>,
}

// ─── Internal DB row types ────────────────────────────────────────────────────

struct DbAdminMapRow {
    map_name: String,
    total: Option<i64>,
    global_is_tryhard: Option<bool>,
    global_is_casual: Option<bool>,
    global_has_lasers: Option<bool>,
    global_workshop_id: Option<i64>,  // nullable because LEFT JOIN (no map_metadata row)
    global_resolved_workshop_id: Option<i64>,
}

struct DbAdminMapServerRow {
    map_name: String,
    server_id: String,
    server_name: Option<String>,  // server.server_name
    is_tryhard: Option<bool>,
    is_casual: Option<bool>,
    workshop_id: Option<i64>,
    resolved_workshop_id: Option<i64>,
    no_noms: bool,
    min_players: Option<i16>,
    max_players: Option<i16>,
}

// ─── API ──────────────────────────────────────────────────────────────────────

#[OpenApi]
impl AdminMapsApi {
    /// Get paginated map metadata: global overrides + per-server settings
    #[oai(path = "/admin/maps/metadata", method = "get")]
    async fn get_maps_metadata(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
        Query(page): Query<Option<i64>>,
        Query(limit): Query<Option<i64>>,
        Query(search): Query<Option<String>>,
    ) -> Response<AdminMapMetadataResponse> {
        if !check_superuser_or_map_manager(data, user_token.id).await {
            return response!(err "Unauthorized", ErrorCode::Forbidden);
        }

        let page = page.unwrap_or(1).max(1);
        let limit = limit.unwrap_or(50).min(200).max(1);
        let offset = (page - 1) * limit;
        let search_str = search.unwrap_or_default();

        let map_rows = match sqlx::query_as!(
            DbAdminMapRow,
            r#"
            WITH distinct_maps AS (
                SELECT DISTINCT map
                FROM server_map
                WHERE ($1 = '' OR map ILIKE '%' || $1 || '%')
            )
            SELECT
                dm.map AS map_name,
                COUNT(*) OVER() AS total,
                mam.is_tryhard AS global_is_tryhard,
                mam.is_casual AS global_is_casual,
                mam.has_lasers AS global_has_lasers,
                mam.workshop_id AS "global_workshop_id?",
                mam.resolved_workshop_id AS global_resolved_workshop_id
            FROM distinct_maps dm
            LEFT JOIN map_metadata mam ON mam.name = dm.map
            ORDER BY dm.map
            LIMIT $2 OFFSET $3
            "#,
            search_str,
            limit,
            offset
        )
        .fetch_all(&*data.pool)
        .await
        {
            Ok(r) => r,
            Err(e) => {
                tracing::error!("Failed to fetch admin map metadata: {}", e);
                return response!(internal_server_error);
            }
        };

        let total = map_rows.first().and_then(|r| r.total).unwrap_or(0);
        let map_names: Vec<String> = map_rows.iter().map(|r| r.map_name.clone()).collect();

        let server_rows = if map_names.is_empty() {
            vec![]
        } else {
            match sqlx::query_as!(
                DbAdminMapServerRow,
                r#"
                SELECT
                    sm.map AS map_name,
                    sm.server_id,
                    s.server_name,
                    sm.is_tryhard,
                    sm.is_casual,
                    sm.workshop_id,
                    sm.resolved_workshop_id,
                    sm.no_noms,
                    sm.min_players,
                    sm.max_players
                FROM server_map sm
                LEFT JOIN server s ON s.server_id = sm.server_id
                WHERE sm.map = ANY($1)
                ORDER BY sm.map, sm.server_id
                "#,
                &map_names as &[String]
            )
            .fetch_all(&*data.pool)
            .await
            {
                Ok(r) => r,
                Err(e) => {
                    tracing::error!("Failed to fetch admin map server entries: {}", e);
                    return response!(internal_server_error);
                }
            }
        };

        let mut servers_by_map: HashMap<String, Vec<AdminMapServerEntry>> = HashMap::new();
        for row in server_rows {
            servers_by_map
                .entry(row.map_name.clone())
                .or_default()
                .push(AdminMapServerEntry {
                    server_id: row.server_id,
                    server_name: row.server_name.unwrap_or_default(),
                    is_tryhard: row.is_tryhard,
                    is_casual: row.is_casual,
                    workshop_id: row.workshop_id,
                    resolved_workshop_id: row.resolved_workshop_id,
                    no_noms: row.no_noms,
                    min_players: row.min_players,
                    max_players: row.max_players,
                });
        }

        let maps = map_rows
            .into_iter()
            .map(|row| AdminMapEntry {
                map_name: row.map_name.clone(),
                global_is_tryhard: row.global_is_tryhard,
                global_is_casual: row.global_is_casual,
                global_has_lasers: row.global_has_lasers,
                global_workshop_id: row.global_workshop_id,
                global_resolved_workshop_id: row.global_resolved_workshop_id,
                servers: servers_by_map.remove(&row.map_name).unwrap_or_default(),
            })
            .collect();

        response!(ok AdminMapMetadataResponse { total, maps })
    }

    /// Update global map metadata (applies to all servers unless overridden)
    #[oai(path = "/admin/maps/metadata/global", method = "put")]
    async fn update_global_map_metadata(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
        Json(dto): Json<UpdateGlobalMapMetadataDto>,
    ) -> Response<bool> {
        if !check_superuser_or_map_manager(data, user_token.id).await {
            return response!(err "Unauthorized", ErrorCode::Forbidden);
        }

        match sqlx::query!(
            r#"
            INSERT INTO map_metadata (name, workshop_id, is_tryhard, is_casual, resolved_workshop_id, has_lasers)
            VALUES ($1, COALESCE($4::BIGINT, 0), $2, $3, $5, $6)
            ON CONFLICT (name) DO UPDATE SET
                is_tryhard           = EXCLUDED.is_tryhard,
                is_casual            = EXCLUDED.is_casual,
                workshop_id          = COALESCE($4::BIGINT, map_metadata.workshop_id),
                resolved_workshop_id = EXCLUDED.resolved_workshop_id,
                has_lasers           = EXCLUDED.has_lasers
            "#,
            dto.map_name,
            dto.is_tryhard,
            dto.is_casual,
            dto.workshop_id,
            dto.resolved_workshop_id,
            dto.has_lasers,
        )
        .execute(&*data.pool)
        .await
        {
            Ok(_) => response!(ok true),
            Err(e) => {
                tracing::error!("Failed to update global map metadata for {}: {}", dto.map_name, e);
                response!(internal_server_error)
            }
        }
    }

    /// Delete a map and all associated data (play history, per-server config, metadata)
    #[oai(path = "/admin/maps/:map_name", method = "delete")]
    async fn delete_map(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
        poem_openapi::param::Path(map_name): poem_openapi::param::Path<String>,
    ) -> Response<bool> {
        if !check_superuser_or_map_manager(data, user_token.id).await {
            return response!(err "Unauthorized", ErrorCode::Forbidden);
        }

        let mut tx = match data.pool.begin().await {
            Ok(t) => t,
            Err(e) => {
                tracing::error!("Failed to begin transaction for map deletion: {}", e);
                return response!(internal_server_error);
            }
        };

        macro_rules! exec {
            ($query:expr) => {
                if let Err(e) = $query.execute(&mut *tx).await {
                    tracing::error!("Failed to delete map data for {}: {}", map_name, e);
                    let _ = tx.rollback().await;
                    return response!(internal_server_error);
                }
            };
        }

        exec!(sqlx::query!("DELETE FROM website.player_map_time WHERE map = $1", map_name));
        exec!(sqlx::query!("DELETE FROM server_map_played WHERE map = $1", map_name));
        exec!(sqlx::query!("DELETE FROM server_map WHERE map = $1", map_name));
        exec!(sqlx::query!("DELETE FROM map_metadata WHERE name = $1", map_name));

        if let Err(e) = tx.commit().await {
            tracing::error!("Failed to commit map deletion for {}: {}", map_name, e);
            return response!(internal_server_error);
        }

        response!(ok true)
    }

    /// Update server-specific map metadata overrides
    #[oai(path = "/admin/maps/metadata/server", method = "put")]
    async fn update_server_map_metadata(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
        Json(dto): Json<UpdateServerMapMetadataDto>,
    ) -> Response<bool> {
        if !check_superuser_or_map_manager(data, user_token.id).await {
            return response!(err "Unauthorized", ErrorCode::Forbidden);
        }

        let exists = sqlx::query_scalar!(
            "SELECT EXISTS(SELECT 1 FROM server_map WHERE server_id = $1 AND map = $2)",
            dto.server_id,
            dto.map_name
        )
        .fetch_one(&*data.pool)
        .await
        .unwrap_or(Some(false))
        .unwrap_or(false);

        if !exists {
            return response!(err "Map not found for this server", ErrorCode::NotFound);
        }

        match sqlx::query!(
            r#"
            UPDATE server_map SET
                is_tryhard           = $3,
                is_casual            = $4,
                workshop_id          = $5,
                resolved_workshop_id = $6,
                no_noms              = COALESCE($7, no_noms),
                min_players          = COALESCE($8, min_players),
                max_players          = $9
            WHERE server_id = $1 AND map = $2
            "#,
            dto.server_id,
            dto.map_name,
            dto.is_tryhard,
            dto.is_casual,
            dto.workshop_id,
            dto.resolved_workshop_id,
            dto.no_noms,
            dto.min_players,
            dto.max_players,
        )
        .execute(&*data.pool)
        .await
        {
            Ok(_) => response!(ok true),
            Err(e) => {
                tracing::error!(
                    "Failed to update server map metadata for {} / {}: {}",
                    dto.server_id, dto.map_name, e
                );
                response!(internal_server_error)
            }
        }
    }
}

impl UriPatternExt for AdminMapsApi {
    fn get_all_patterns(&self) -> Vec<RoutePattern<'_>> {
        vec![
            "/admin/maps/metadata",
            "/admin/maps/metadata/global",
            "/admin/maps/metadata/server",
            "/admin/maps/:map_name",
        ].iter_into()
    }
}
