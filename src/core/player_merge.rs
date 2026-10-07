use sqlx::PgConnection;
use uuid::Uuid;

/// Whether a `player_id` is a Steam ID rather than a name-tracked row.
///
/// Name-tracked servers give each name its own UUID-shaped row; Steam-tracked ones use the
/// numeric Steam ID as the primary key. The same distinction is drawn in SQL elsewhere with
/// `player_id ~ '^[0-9]+$'`.
pub(crate) fn is_steam_id(player_id: &str) -> bool {
    !player_id.is_empty() && player_id.bytes().all(|b| b.is_ascii_digit())
}

/// Why a link could not be made. `User` carries wording meant for the moderator.
pub(crate) enum LinkError {
    User(String),
    Internal,
}

pub(crate) fn merged_name(merge_id: Uuid, name: &str) -> String {
    format!("[merged_{merge_id}] {name}")
}

pub(crate) struct MergeOutcome {
    pub sessions_moved: i64,
}

pub(crate) struct RevertOutcome {
    pub original_name: String,
    pub sessions_restored: i64,
    pub name_conflict: bool,
}

fn internal(context: String) -> impl FnOnce(sqlx::Error) -> LinkError {
    move |e| {
        tracing::error!("{context}: {e}");
        LinkError::Internal
    }
}

/// Moves every session of the name-tracked `fake_id` onto `steam_id` and leaves the fake behind
/// as a renamed tombstone pointing at it.
///
/// Must run inside the caller's transaction. Creates the Steam `player` row from
/// `website.steam_user`, or from `steam_name` when the account has never logged in, and records
/// each moved session so `revert_merge` can put it back.
pub(crate) async fn merge_player(
    conn: &mut PgConnection,
    fake_id: &str,
    steam_id: &str,
    merged_by: Option<i64>,
    claim_id: Option<Uuid>,
    steam_name: Option<&str>,
) -> Result<MergeOutcome, LinkError> {
    if is_steam_id(fake_id) {
        return Err(LinkError::User(format!(
            "{fake_id} is a Steam account; only name-tracked profiles can be merged."
        )));
    }
    let Ok(steam_user_id) = steam_id.parse::<i64>() else {
        return Err(LinkError::User(format!("{steam_id} is not a valid Steam ID.")));
    };

    let fake = sqlx::query!(
        "SELECT player_name, created_at, associated_player_id, merged_at
         FROM player WHERE player_id = $1 FOR UPDATE",
        fake_id,
    )
    .fetch_optional(&mut *conn)
    .await
    .map_err(internal(format!("Failed to lock {fake_id} for merging")))?;

    let Some(fake) = fake else {
        return Err(LinkError::User("Player not found".to_string()));
    };

    let mut original = fake.player_name;
    if fake.merged_at.is_some() {
        if fake.associated_player_id.as_deref() == Some(steam_id) {
            return Ok(MergeOutcome { sessions_moved: 0 });
        }
        if let Some(reverted) = revert_merge(conn, fake_id).await? {
            original = reverted.original_name;
        }
    }

    sqlx::query!(
        "INSERT INTO player (player_id, player_name, location_code, location)
         SELECT su.user_id::text, su.persona_name, f.location_code, f.location
         FROM website.steam_user su
         JOIN player f ON f.player_id = $2
         WHERE su.user_id = $1
         ON CONFLICT (player_id) DO UPDATE SET
            player_name = EXCLUDED.player_name,
            location_code = COALESCE(player.location_code, EXCLUDED.location_code),
            location = COALESCE(player.location, EXCLUDED.location)",
        steam_user_id,
        fake_id,
    )
    .execute(&mut *conn)
    .await
    .map_err(internal(format!("Failed to upsert Steam player {steam_id}")))?;

    if let Some(name) = steam_name {
        sqlx::query!(
            "INSERT INTO player (player_id, player_name, location_code, location)
             SELECT $1, $2, f.location_code, f.location FROM player f WHERE f.player_id = $3
             ON CONFLICT (player_id) DO NOTHING",
            steam_id,
            name,
            fake_id,
        )
        .execute(&mut *conn)
        .await
        .map_err(internal(format!("Failed to create Steam player {steam_id}")))?;
    }

    let steam_exists = sqlx::query_scalar!(
        r#"SELECT EXISTS (SELECT 1 FROM player WHERE player_id = $1) AS "exists!""#,
        steam_id,
    )
    .fetch_one(&mut *conn)
    .await
    .map_err(internal(format!("Failed to check Steam player {steam_id}")))?;

    if !steam_exists {
        return Err(LinkError::User(format!("Couldn't find a Steam name for {steam_id}.")));
    }

    sqlx::query!(
        "UPDATE player_server_session
         SET ended_at = GREATEST(started_at, COALESCE(last_verified, started_at))
         WHERE player_id = $1 AND ended_at IS NULL",
        fake_id,
    )
    .execute(&mut *conn)
    .await
    .map_err(internal(format!("Failed to close open sessions of {fake_id}")))?;

    let merge_id = sqlx::query_scalar!(
        "INSERT INTO website.player_merges
            (from_player_id, into_player_id, original_name, claim_id, merged_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id",
        fake_id,
        steam_id,
        original,
        claim_id,
        merged_by,
    )
    .fetch_one(&mut *conn)
    .await
    .map_err(internal(format!("Failed to record merge {fake_id} -> {steam_id}")))?;

    sqlx::query!(
        "INSERT INTO website.player_merge_sessions (merge_id, session_id)
         SELECT $1, session_id FROM player_server_session WHERE player_id = $2",
        merge_id,
        fake_id,
    )
    .execute(&mut *conn)
    .await
    .map_err(internal(format!("Failed to record sessions of {fake_id}")))?;

    let servers = sqlx::query_scalar!(
        "UPDATE player_server_session SET player_id = $1 WHERE player_id = $2 RETURNING server_id",
        steam_id,
        fake_id,
    )
    .fetch_all(&mut *conn)
    .await
    .map_err(internal(format!("Failed to move sessions {fake_id} -> {steam_id}")))?;

    let sessions_moved = servers.len() as i64;
    let servers = dedup(servers);

    clear_derived(conn, &[fake_id, steam_id], &servers).await?;

    sqlx::query!(
        "DELETE FROM website.player_global_playtime WHERE player_id = $1",
        fake_id,
    )
    .execute(&mut *conn)
    .await
    .map_err(internal(format!("Failed to clear global playtime of {fake_id}")))?;

    sqlx::query!(
        "INSERT INTO player_activity (player_id, event_name, event_value, created_at)
         VALUES ($1, 'name', $2, $3)",
        steam_id,
        original,
        fake.created_at,
    )
    .execute(&mut *conn)
    .await
    .map_err(internal(format!("Failed to add alias {original} to {steam_id}")))?;

    sqlx::query!(
        "UPDATE player
         SET player_name = $1, merged_at = NOW(), associated_player_id = $2
         WHERE player_id = $3",
        merged_name(merge_id, &original),
        steam_id,
        fake_id,
    )
    .execute(&mut *conn)
    .await
    .map_err(internal(format!("Failed to tombstone {fake_id}")))?;

    Ok(MergeOutcome { sessions_moved })
}

/// Undoes the active merge of `fake_id`: its recorded sessions go back, the alias added to the
/// Steam account is removed and the original name is restored.
///
/// Leaves `associated_player_id` alone; the caller decides whether the profile is unlinked or
/// merged somewhere else next. Returns `None` when the profile has no active merge.
pub(crate) async fn revert_merge(
    conn: &mut PgConnection,
    fake_id: &str,
) -> Result<Option<RevertOutcome>, LinkError> {
    let merge = sqlx::query!(
        "SELECT m.id, m.into_player_id, m.original_name, p.created_at
         FROM website.player_merges m
         JOIN player p ON p.player_id = m.from_player_id
         WHERE m.from_player_id = $1 AND m.reverted_at IS NULL
         FOR UPDATE OF m",
        fake_id,
    )
    .fetch_optional(&mut *conn)
    .await
    .map_err(internal(format!("Failed to read the merge of {fake_id}")))?;

    let Some(merge) = merge else {
        return Ok(None);
    };

    let servers = sqlx::query_scalar!(
        "UPDATE player_server_session pss SET player_id = $1
         FROM website.player_merge_sessions ms
         WHERE ms.merge_id = $2 AND ms.session_id = pss.session_id
         RETURNING pss.server_id",
        fake_id,
        merge.id,
    )
    .fetch_all(&mut *conn)
    .await
    .map_err(internal(format!("Failed to restore sessions of {fake_id}")))?;

    let sessions_restored = servers.len() as i64;
    let servers = dedup(servers);

    sqlx::query!(
        "DELETE FROM website.player_merge_sessions WHERE merge_id = $1",
        merge.id,
    )
    .execute(&mut *conn)
    .await
    .map_err(internal(format!("Failed to clear merge sessions of {fake_id}")))?;

    sqlx::query!(
        "DELETE FROM player_activity WHERE ctid = (
            SELECT ctid FROM player_activity
            WHERE player_id = $1 AND event_name = 'name' AND event_value = $2 AND created_at = $3
            LIMIT 1
         )",
        merge.into_player_id,
        merge.original_name,
        merge.created_at,
    )
    .execute(&mut *conn)
    .await
    .map_err(internal(format!("Failed to remove alias from {}", merge.into_player_id)))?;

    let name_conflict = sqlx::query_scalar!(
        r#"SELECT EXISTS (
            SELECT 1 FROM player
            WHERE player_name = $1 AND player_id <> $2 AND merged_at IS NULL
        ) AS "exists!""#,
        merge.original_name,
        fake_id,
    )
    .fetch_one(&mut *conn)
    .await
    .map_err(internal(format!("Failed to check name collisions for {fake_id}")))?;

    sqlx::query!(
        "UPDATE player SET player_name = $1, merged_at = NULL WHERE player_id = $2",
        merge.original_name,
        fake_id,
    )
    .execute(&mut *conn)
    .await
    .map_err(internal(format!("Failed to restore {fake_id}")))?;

    sqlx::query!(
        "UPDATE website.player_merges SET reverted_at = NOW() WHERE id = $1",
        merge.id,
    )
    .execute(&mut *conn)
    .await
    .map_err(internal(format!("Failed to close merge record of {fake_id}")))?;

    clear_derived(conn, &[fake_id, &merge.into_player_id], &servers).await?;

    Ok(Some(RevertOutcome {
        original_name: merge.original_name,
        sessions_restored,
        name_conflict,
    }))
}

async fn clear_derived(
    conn: &mut PgConnection,
    player_ids: &[&str],
    servers: &[String],
) -> Result<(), LinkError> {
    if servers.is_empty() {
        return Ok(());
    }
    let player_ids: Vec<String> = player_ids.iter().map(|id| id.to_string()).collect();
    let context = || format!("Failed to clear derived rows of {player_ids:?}");

    sqlx::query!(
        "DELETE FROM website.player_map_time WHERE player_id = ANY($1) AND server_id = ANY($2)",
        &player_ids,
        servers,
    )
    .execute(&mut *conn)
    .await
    .map_err(internal(context()))?;

    sqlx::query!(
        "DELETE FROM website.player_playtime WHERE player_id = ANY($1) AND server_id = ANY($2)",
        &player_ids,
        servers,
    )
    .execute(&mut *conn)
    .await
    .map_err(internal(context()))?;

    sqlx::query!(
        "DELETE FROM website.player_server_worker WHERE player_id = ANY($1) AND server_id = ANY($2)",
        &player_ids,
        servers,
    )
    .execute(&mut *conn)
    .await
    .map_err(internal(context()))?;

    sqlx::query!(
        "DELETE FROM website.player_server_relationship
         WHERE server_id = ANY($2) AND (player_id = ANY($1) OR meet_player_id = ANY($1))",
        &player_ids,
        servers,
    )
    .execute(&mut *conn)
    .await
    .map_err(internal(context()))?;

    Ok(())
}

fn dedup(mut servers: Vec<String>) -> Vec<String> {
    servers.sort();
    servers.dedup();
    servers
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn merged_name_carries_the_merge_id() {
        let id = Uuid::parse_str("3f0c2a4e-1b2c-4d5e-8f90-123456789abc").unwrap();
        assert_eq!(merged_name(id, "Foo"), "[merged_3f0c2a4e-1b2c-4d5e-8f90-123456789abc] Foo");
    }

    #[test]
    fn merged_names_never_collide() {
        assert_ne!(merged_name(Uuid::new_v4(), "Foo"), merged_name(Uuid::new_v4(), "Foo"));
    }

    #[test]
    fn steam_ids_are_numeric() {
        assert!(is_steam_id("76561198009315681"));
        assert!(!is_steam_id("3f0c2a4e-1b2c-4d5e-8f90-123456789abc"));
        assert!(!is_steam_id(""));
    }
}
