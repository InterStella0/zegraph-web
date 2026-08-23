
use poem::web::Data;
use poem_openapi::param::Query;
use poem_openapi::OpenApi;
use serde_json::Value;

use crate::core::audit::CATEGORY_MAP_METADATA;
use crate::core::utils::*;
use crate::{response, AppData};
use crate::api_models::admins::*;
use crate::api_models::common::*;
use crate::models::admins::DbAuditLogRow;
use crate::routers::ApiTags;

pub struct AdminAuditApi;


fn json_to_display(value: &Value) -> Option<String> {
    match value {
        Value::Null => None,
        Value::String(s) => Some(s.clone()),
        v => Some(v.to_string()),
    }
}

fn changes_to_fields(changes: &Value) -> Vec<AuditFieldChange> {
    let Some(obj) = changes.as_object() else {
        return vec![];
    };
    obj.iter()
        .map(|(field, change)| AuditFieldChange {
            field: field.clone(),
            old_value: change.get("old").map(json_to_display).unwrap_or(None),
            new_value: change.get("new").map(json_to_display).unwrap_or(None),
        })
        .collect()
}

#[OpenApi(tag = "ApiTags::AdminAudit")]
impl AdminAuditApi {
    /// Paginated audit logs.
    ///
    /// Requires the `superuser` or `map_manager` role. Superusers see every category and may
    /// filter by `category`/`map_name`/`action`; map managers are hard-scoped to map-metadata
    /// changes regardless of query params. `page` is 1-indexed, `limit` capped at 200.
    #[oai(path = "/admin/audit-logs", method = "get")]
    async fn get_audit_logs(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
        Query(page): Query<Option<i64>>,
        Query(limit): Query<Option<i64>>,
        Query(map_name): Query<Option<String>>,
        Query(action): Query<Option<String>>,
    ) -> Response<AuditLogsResponse> {
        let is_superuser = check_superuser(data, user_token.id).await;
        if !is_superuser && !check_map_manager(data, user_token.id).await {
            return response!(err "Unauthorized", ErrorCode::Forbidden);
        }

        // Non-superusers are hard-scoped to map metadata regardless of query params
        let category_filter = (!is_superuser).then(|| CATEGORY_MAP_METADATA.to_string());

        let page = page.unwrap_or(1).max(1);
        let limit = limit.unwrap_or(50).min(200).max(1);
        let offset = (page - 1) * limit;

        let rows = match sqlx::query_as!(
            DbAuditLogRow,
            r#"
            SELECT
                a.id,
                a.category,
                a.action,
                a.map_name,
                a.server_id,
                s.server_name,
                a.user_id,
                u.persona_name AS "user_name?",
                u.avatar AS "user_avatar?",
                a.changes,
                a.created_at,
                COUNT(*) OVER() AS total
            FROM website.audit_logs a
            LEFT JOIN website.steam_user u ON u.user_id = a.user_id
            LEFT JOIN server s ON s.server_id = a.server_id
            WHERE ($1::TEXT IS NULL OR a.category = $1)
              AND ($2::TEXT IS NULL OR a.map_name = $2)
              AND ($3::TEXT IS NULL OR a.action = $3)
            ORDER BY a.created_at DESC, a.id DESC
            LIMIT $4 OFFSET $5
            "#,
            category_filter,
            map_name,
            action,
            limit,
            offset
        )
        .fetch_all(&*data.pool)
        .await
        {
            Ok(r) => r,
            Err(e) => {
                tracing::error!("Failed to fetch audit logs: {}", e);
                return response!(internal_server_error);
            }
        };

        let total = rows.first().and_then(|r| r.total).unwrap_or(0);
        let logs = rows
            .into_iter()
            .map(|row| AuditLogEntry {
                id: row.id,
                category: row.category,
                action: row.action,
                map_name: row.map_name,
                server_id: row.server_id,
                server_name: row.server_name,
                user_id: row.user_id.to_string(),
                user_name: row.user_name,
                user_avatar: row.user_avatar,
                changes: changes_to_fields(&row.changes),
                created_at: row.created_at.to_utc_time(),
            })
            .collect();

        response!(ok AuditLogsResponse { total, logs })
    }
}

impl UriPatternExt for AdminAuditApi {
    fn get_all_patterns(&self) -> Vec<RoutePattern> {
        vec!["/admin/audit-logs"].iter_into()
    }
}
