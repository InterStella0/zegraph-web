use serde_json::Value;

pub const CATEGORY_MAP_METADATA: &str = "map_metadata";
pub const ACTION_UPDATE_GLOBAL: &str = "update_global";
pub const ACTION_UPDATE_SERVER: &str = "update_server";
pub const ACTION_DELETE_MAP: &str = "delete_map";

/// Build `{"field": {"old": ..., "new": ...}}` keeping only changed fields.
pub fn diff_changes(pairs: Vec<(&str, Value, Value)>) -> Value {
    let mut map = serde_json::Map::new();
    for (field, old, new) in pairs {
        if old != new {
            map.insert(field.to_string(), serde_json::json!({ "old": old, "new": new }));
        }
    }
    Value::Object(map)
}

pub async fn insert_audit_log<'e>(
    executor: impl sqlx::PgExecutor<'e>,
    category: &str,
    action: &str,
    map_name: Option<&str>,
    server_id: Option<&str>,
    user_id: i64,
    changes: &Value,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"
        INSERT INTO website.audit_logs (category, action, map_name, server_id, user_id, changes)
        VALUES ($1, $2, $3, $4, $5, $6)
        "#,
        category,
        action,
        map_name,
        server_id,
        user_id,
        changes,
    )
    .execute(executor)
    .await
    .map(|_| ())
}
