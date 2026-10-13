use poem::web::Data;
use poem_openapi::payload::Json;
use poem_openapi::OpenApi;
use poem_openapi::param::Query;
use std::collections::HashMap;

use serde_json::{json, Value};

use crate::core::audit::{
    diff_changes, insert_audit_log, ACTION_DELETE_MAP, ACTION_UPDATE_GLOBAL,
    ACTION_UPDATE_SERVER, CATEGORY_MAP_METADATA,
};
use crate::core::utils::*;
use crate::{response, AppData};
use crate::api_models::admins::*;
use crate::api_models::common::*;
use crate::models::admins::*;
use crate::routers::ApiTags;

pub struct AdminMapsApi;


#[OpenApi(tag = "ApiTags::AdminMaps")]
impl AdminMapsApi {
    /// Paginated map metadata: global overrides plus per-server settings.
    ///
    /// Requires the `superuser` or `map_manager` role. `search` filters by map name substring;
    /// `page` is 1-indexed, `limit` capped at 200.
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

    /// Update a map's global metadata (applies across every server).
    ///
    /// Requires the `superuser` or `map_manager` role. Any field changed is recorded to the
    /// audit log.
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

        let mut tx = match data.pool.begin().await {
            Ok(t) => t,
            Err(e) => {
                tracing::error!("Failed to begin transaction for global map metadata update: {}", e);
                return response!(internal_server_error);
            }
        };

        macro_rules! exec {
            ($query:expr) => {
                match $query.await {
                    Ok(r) => r,
                    Err(e) => {
                        tracing::error!("Failed to update global map metadata for {}: {}", dto.map_name, e);
                        let _ = tx.rollback().await;
                        return response!(internal_server_error);
                    }
                }
            };
        }

        let old_row = exec!(sqlx::query!(
            r#"
            SELECT is_tryhard, is_casual, has_lasers, workshop_id, resolved_workshop_id
            FROM map_metadata WHERE name = $1
            "#,
            dto.map_name
        )
        .fetch_optional(&mut *tx));

        exec!(sqlx::query!(
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
        .execute(&mut *tx));

        let new_row = exec!(sqlx::query!(
            r#"
            SELECT is_tryhard, is_casual, has_lasers, workshop_id, resolved_workshop_id
            FROM map_metadata WHERE name = $1
            "#,
            dto.map_name
        )
        .fetch_one(&mut *tx));

        let (old_tryhard, old_casual, old_lasers, old_workshop, old_resolved) = match &old_row {
            Some(r) => (
                json!(r.is_tryhard),
                json!(r.is_casual),
                json!(r.has_lasers),
                json!(r.workshop_id),
                json!(r.resolved_workshop_id),
            ),
            None => (Value::Null, Value::Null, Value::Null, Value::Null, Value::Null),
        };
        let changes = diff_changes(vec![
            ("is_tryhard", old_tryhard, json!(new_row.is_tryhard)),
            ("is_casual", old_casual, json!(new_row.is_casual)),
            ("has_lasers", old_lasers, json!(new_row.has_lasers)),
            ("workshop_id", old_workshop, json!(new_row.workshop_id)),
            ("resolved_workshop_id", old_resolved, json!(new_row.resolved_workshop_id)),
        ]);

        if changes.as_object().is_some_and(|o| !o.is_empty()) {
            exec!(insert_audit_log(
                &mut *tx,
                CATEGORY_MAP_METADATA,
                ACTION_UPDATE_GLOBAL,
                Some(&dto.map_name),
                None,
                user_token.id,
                &changes,
            ));
        }

        if let Err(e) = tx.commit().await {
            tracing::error!("Failed to commit global map metadata update for {}: {}", dto.map_name, e);
            return response!(internal_server_error);
        }

        response!(ok true)
    }

    /// Permanently delete a map and all of its recorded data.
    ///
    /// Requires the `superuser` or `map_manager` role. Removes the map's global metadata,
    /// per-server settings, play sessions and player playtime records; a snapshot is written to
    /// the audit log first. This cannot be undone.
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

        macro_rules! fetch {
            ($query:expr) => {
                match $query.await {
                    Ok(r) => r,
                    Err(e) => {
                        tracing::error!("Failed to snapshot map data for {}: {}", map_name, e);
                        let _ = tx.rollback().await;
                        return response!(internal_server_error);
                    }
                }
            };
        }

        let metadata_snapshot = fetch!(sqlx::query_scalar!(
            "SELECT to_jsonb(m) FROM map_metadata m WHERE name = $1",
            map_name
        )
        .fetch_optional(&mut *tx))
        .flatten()
        .unwrap_or(Value::Null);

        let server_ids = fetch!(sqlx::query_scalar!(
            r#"SELECT array_agg(server_id) AS "server_ids" FROM server_map WHERE map = $1"#,
            map_name
        )
        .fetch_one(&mut *tx))
        .unwrap_or_default();

        let changes = json!({
            "map": {
                "old": { "metadata": metadata_snapshot, "servers": server_ids },
                "new": null
            }
        });
        fetch!(insert_audit_log(
            &mut *tx,
            CATEGORY_MAP_METADATA,
            ACTION_DELETE_MAP,
            Some(&map_name),
            None,
            user_token.id,
            &changes,
        ));

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

    /// Update a map's per-server override settings.
    ///
    /// Requires the `superuser` or `map_manager` role. Any field changed is recorded to the
    /// audit log.
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

        let mut tx = match data.pool.begin().await {
            Ok(t) => t,
            Err(e) => {
                tracing::error!("Failed to begin transaction for server map metadata update: {}", e);
                return response!(internal_server_error);
            }
        };

        macro_rules! exec {
            ($query:expr) => {
                match $query.await {
                    Ok(r) => r,
                    Err(e) => {
                        tracing::error!(
                            "Failed to update server map metadata for {} / {}: {}",
                            dto.server_id, dto.map_name, e
                        );
                        let _ = tx.rollback().await;
                        return response!(internal_server_error);
                    }
                }
            };
        }

        let old_row = exec!(sqlx::query!(
            r#"
            SELECT is_tryhard, is_casual, workshop_id, resolved_workshop_id, no_noms, min_players, max_players
            FROM server_map WHERE server_id = $1 AND map = $2
            "#,
            dto.server_id,
            dto.map_name
        )
        .fetch_optional(&mut *tx));

        let Some(old_row) = old_row else {
            let _ = tx.rollback().await;
            return response!(err "Map not found for this server", ErrorCode::NotFound);
        };

        exec!(sqlx::query!(
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
        .execute(&mut *tx));

        let new_row = exec!(sqlx::query!(
            r#"
            SELECT is_tryhard, is_casual, workshop_id, resolved_workshop_id, no_noms, min_players, max_players
            FROM server_map WHERE server_id = $1 AND map = $2
            "#,
            dto.server_id,
            dto.map_name
        )
        .fetch_one(&mut *tx));

        let changes = diff_changes(vec![
            ("is_tryhard", json!(old_row.is_tryhard), json!(new_row.is_tryhard)),
            ("is_casual", json!(old_row.is_casual), json!(new_row.is_casual)),
            ("workshop_id", json!(old_row.workshop_id), json!(new_row.workshop_id)),
            ("resolved_workshop_id", json!(old_row.resolved_workshop_id), json!(new_row.resolved_workshop_id)),
            ("no_noms", json!(old_row.no_noms), json!(new_row.no_noms)),
            ("min_players", json!(old_row.min_players), json!(new_row.min_players)),
            ("max_players", json!(old_row.max_players), json!(new_row.max_players)),
        ]);

        if changes.as_object().is_some_and(|o| !o.is_empty()) {
            exec!(insert_audit_log(
                &mut *tx,
                CATEGORY_MAP_METADATA,
                ACTION_UPDATE_SERVER,
                Some(&dto.map_name),
                Some(&dto.server_id),
                user_token.id,
                &changes,
            ));
        }

        if let Err(e) = tx.commit().await {
            tracing::error!(
                "Failed to commit server map metadata update for {} / {}: {}",
                dto.server_id, dto.map_name, e
            );
            return response!(internal_server_error);
        }

        response!(ok true)
    }
}

impl UriPatternExt for AdminMapsApi {
    fn get_all_patterns(&self) -> Vec<RoutePattern> {
        vec![
            "/admin/maps/metadata",
            "/admin/maps/metadata/global",
            "/admin/maps/metadata/server",
            "/admin/maps/{map_name}",
        ].iter_into()
    }
}
