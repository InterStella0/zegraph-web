use poem::web::{Data, Json};
use poem_openapi::OpenApi;
use poem_openapi::param::Path;
use crate::{response, AppData, FastCache};
use crate::api_models::common::*;
use crate::api_models::misc::*;
use crate::core::storage::image_ext_from_content_type;
use crate::core::utils::*;
use crate::models::admins::*;

pub struct CharacterApi;

#[OpenApi]
impl CharacterApi {
    #[oai(path = "/servers/:server_id/characters", method = "get")]
    async fn list_character_3d_models(
        &self,
        Data(app): Data<&AppData>,
        Path(server_id): Path<String>,
    ) -> Response<Vec<Character3DModel>> {
        let models = sqlx::query_as!(
            DbCharacter3DModel,
            r#"
            SELECT id, model_id, name, server_id, credit, link_path,
                   uploaded_by, thumbnail_path, file_size, created_at, updated_at
            FROM website.character_3d_model
            WHERE server_id = $1
            ORDER BY COALESCE(name, model_id)
            "#,
            server_id
        )
        .fetch_all(&*app.pool)
        .await;

        match models {
            Ok(rows) => {
                let mut result: Vec<Character3DModel> = Vec::with_capacity(rows.len());
                for row in rows {
                    let uploader_name = if let Some(uid) = row.uploaded_by {
                        sqlx::query_scalar!(
                            "SELECT persona_name FROM website.steam_user WHERE user_id = $1",
                            uid
                        )
                        .fetch_optional(&*app.pool)
                        .await
                        .ok()
                        .flatten()
                    } else {
                        None
                    };
                    let mut m: Character3DModel = row.into();
                    m.link_path = app.character_storage.normalize_link_path(&m.link_path, &m.model_id);
                    m.uploader_name = uploader_name;
                    result.push(m);
                }
                response!(ok result)
            }
            Err(_) => response!(internal_server_error),
        }
    }

    #[oai(path = "/servers/:server_id/characters/:model_id/3d", method = "get")]
    async fn get_character_3d_model(
        &self,
        Data(app): Data<&AppData>,
        Path(server_id): Path<String>,
        Path(model_id): Path<String>,
    ) -> Response<Character3DModel> {
        let row = sqlx::query_as!(
            DbCharacter3DModel,
            r#"
            SELECT id, model_id, name, server_id, credit, link_path,
                   uploaded_by, thumbnail_path, file_size, created_at, updated_at
            FROM website.character_3d_model
            WHERE server_id = $1 AND model_id = $2
            "#,
            server_id,
            model_id
        )
        .fetch_optional(&*app.pool)
        .await;

        match row {
            Ok(Some(row)) => {
                let uploader_name = if let Some(uid) = row.uploaded_by {
                    sqlx::query_scalar!(
                        "SELECT persona_name FROM website.steam_user WHERE user_id = $1",
                        uid
                    )
                    .fetch_optional(&*app.pool)
                    .await
                    .ok()
                    .flatten()
                } else {
                    None
                };
                let mut m: Character3DModel = row.into();
                m.link_path = app.character_storage.normalize_link_path(&m.link_path, &m.model_id);
                m.uploader_name = uploader_name;
                response!(ok m)
            }
            Ok(None) => response!(err "Model not found", ErrorCode::NotFound),
            Err(_) => response!(internal_server_error),
        }
    }

    #[oai(path = "/servers/:server_id/characters/:model_id/3d/upload", method = "post")]
    async fn upload_character_3d_model(
        &self,
        Data(app): Data<&AppData>,
        Path(server_id): Path<String>,
        Path(model_id): Path<String>,
        TokenBearer(user_token): TokenBearer,
        multipart: poem::web::Multipart,
    ) -> Response<Character3DModel> {
        // Max 500MB per
        if !check_superuser(&app, user_token.id).await {
            return response!(err "Forbidden", ErrorCode::Forbidden);
        }

        let mut multipart = multipart;
        let mut file_data: Option<Vec<u8>> = None;
        let mut credit: Option<String> = None;
        let mut display_name: Option<String> = None;

        while let Ok(Some(field)) = multipart.next_field().await {
            let field_name = field.name().map(|s| s.to_string());
            match field_name.as_deref() {
                Some("file") => {
                    if let Ok(bytes) = field.bytes().await {
                        file_data = Some(bytes.to_vec());
                    }
                }
                Some("credit") => {
                    if let Ok(text) = field.text().await {
                        if !text.trim().is_empty() {
                            credit = Some(text);
                        }
                    }
                }
                Some("name") => {
                    if let Ok(text) = field.text().await {
                        if !text.trim().is_empty() {
                            display_name = Some(text);
                        }
                    }
                }
                _ => {}
            }
        }

        let Some(file_bytes) = file_data else {
            return response!(err "Missing file", ErrorCode::BadRequest);
        };

        const MAX_FILE_SIZE: usize = 500 * 1024 * 1024;
        if file_bytes.len() > MAX_FILE_SIZE {
            return response!(err "File too large (max 500MB)", ErrorCode::BadRequest);
        }

        let link_path = match app.character_storage.store_bytes(&model_id, &file_bytes).await {
            Ok(path) => path,
            Err(e) => {
                tracing::error!("Failed to store character 3D model: {}", e);
                return response!(internal_server_error);
            }
        };

        let result = sqlx::query_as!(
            DbCharacter3DModel,
            r#"
            INSERT INTO website.character_3d_model
            (server_id, model_id, name, credit, link_path, uploaded_by, file_size)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (server_id, model_id)
            DO UPDATE SET
                name = EXCLUDED.name,
                credit = EXCLUDED.credit,
                link_path = EXCLUDED.link_path,
                uploaded_by = EXCLUDED.uploaded_by,
                file_size = EXCLUDED.file_size,
                updated_at = NOW()
            RETURNING *
            "#,
            server_id,
            model_id,
            display_name,
            credit,
            link_path,
            user_token.id,
            file_bytes.len() as i64,
        )
        .fetch_one(&*app.pool)
        .await;

        match result {
            Ok(model) => {
                let uploader_name = sqlx::query_scalar!(
                    "SELECT persona_name FROM website.steam_user WHERE user_id = $1",
                    user_token.id
                )
                .fetch_optional(&*app.pool)
                .await
                .ok()
                .flatten();

                let mut api_model: Character3DModel = model.into();
                api_model.link_path = app.character_storage.normalize_link_path(
                    &api_model.link_path,
                    &api_model.model_id,
                );
                api_model.uploader_name = uploader_name;
                response!(ok api_model)
            }
            Err(e) => {
                tracing::error!("Database error: {}", e);
                response!(internal_server_error)
            }
        }
    }

    #[oai(path = "/servers/:server_id/characters/:model_id/3d/upload/initiate", method = "post")]
    async fn initiate_character_chunked_upload(
        &self,
        Data(app): Data<&AppData>,
        Path(server_id): Path<String>,
        Path(model_id): Path<String>,
        TokenBearer(user_token): TokenBearer,
        Json(req): Json<serde_json::Value>,
    ) -> Response<InitiateUploadResponse> {
        if !check_superuser(&app, user_token.id).await {
            return response!(err "Forbidden", ErrorCode::Forbidden);
        }

        let credit = req.get("credit").and_then(|v| v.as_str()).map(|s| s.to_string());
        let display_name = req.get("name").and_then(|v| v.as_str()).map(|s| s.to_string());

        let file_size = match req.get("file_size").and_then(|v| v.as_u64()) {
            Some(size) => size,
            None => return response!(err "file_size is required", ErrorCode::BadRequest),
        };

        let session_id = uuid::Uuid::new_v4().to_string();

        const CHUNK_SIZE: usize = 10_485_760; // 10MB
        let total_chunks = ((file_size as f64) / (CHUNK_SIZE as f64)).ceil() as u32;

        let session = CharacterUploadSession {
            session_id: session_id.clone(),
            model_id: model_id.clone(),
            name: display_name,
            server_id: server_id.clone(),
            credit,
            total_chunks,
            chunk_size: CHUNK_SIZE,
            total_size: file_size,
            uploaded_by: user_token.id,
            created_at: chrono::Utc::now().to_rfc3339(),
            chunks_received: Vec::new(),
        };

        let session_key = format!("char_upload_session:{}", session_id);
        match serde_json::to_string(&session) {
            Ok(session_json) => {
                if let Ok(mut conn) = app.cache.redis_pool.get().await {
                    use redis::AsyncCommands;
                    let _: redis::RedisResult<()> = conn.set_ex(&session_key, &session_json, 86400).await;
                } else {
                    tracing::error!("Failed to get Redis connection");
                    return response!(err "Failed to create upload session", ErrorCode::InternalServerError);
                }
            }
            Err(e) => {
                tracing::error!("Failed to serialize upload session: {}", e);
                return response!(err "Failed to create upload session", ErrorCode::InternalServerError);
            }
        }

        let store_upload = std::env::var("CHARACTER_STORE_UPLOAD")
            .unwrap_or_else(|_| "./characters".to_string());
        let temp_dir = format!("{}/.tmp/{}", store_upload, session_id);
        if let Err(e) = tokio::fs::create_dir_all(&temp_dir).await {
            tracing::error!("Failed to create temp directory: {}", e);
            return response!(err "Failed to create upload session", ErrorCode::InternalServerError);
        }

        tracing::info!("Character upload session initiated: {}, model: {}, server: {}, size: {}", session_id, model_id, server_id, file_size);

        response!(ok InitiateUploadResponse {
            session_id,
            chunk_size: CHUNK_SIZE,
            total_chunks,
        })
    }

    #[oai(path = "/servers/:server_id/characters/:model_id/3d/upload/chunk/:session_id", method = "post")]
    async fn upload_character_chunk(
        &self,
        Data(app): Data<&AppData>,
        Path(server_id): Path<String>,
        Path(model_id): Path<String>,
        Path(session_id): Path<String>,
        TokenBearer(user_token): TokenBearer,
        upload: poem::web::Multipart,
    ) -> Response<ChunkUploadResponse> {
        if !check_superuser(&app, user_token.id).await {
            return response!(err "Forbidden", ErrorCode::Forbidden);
        }

        let session = match Self::get_char_upload_session(&app.cache, &session_id).await {
            Ok(s) => s,
            Err(e) => return response!(err e, ErrorCode::NotFound),
        };

        if session.uploaded_by != user_token.id {
            return response!(err "Forbidden", ErrorCode::Forbidden);
        }

        if session.model_id != model_id {
            return response!(err "Model ID mismatch", ErrorCode::BadRequest);
        }

        if session.server_id != server_id {
            return response!(err "Server ID mismatch", ErrorCode::BadRequest);
        }

        let mut chunk_index: Option<u32> = None;
        let mut chunk_data: Option<Vec<u8>> = None;

        let mut upload = upload;
        while let Ok(Some(field)) = upload.next_field().await {
            let field_name = field.name().map(|s| s.to_string());
            match field_name.as_deref() {
                Some("chunk_index") => {
                    if let Ok(text) = field.text().await {
                        chunk_index = text.parse::<u32>().ok();
                    }
                }
                Some("chunk_data") => {
                    if let Ok(bytes) = field.bytes().await {
                        chunk_data = Some(bytes.to_vec());
                    }
                }
                _ => {}
            }
        }

        let chunk_index = match chunk_index {
            Some(idx) => idx,
            None => return response!(err "chunk_index is required", ErrorCode::BadRequest),
        };
        let chunk_data = match chunk_data {
            Some(data) => data,
            None => return response!(err "chunk_data is required", ErrorCode::BadRequest),
        };

        if chunk_index >= session.total_chunks {
            return response!(err "Invalid chunk_index", ErrorCode::BadRequest);
        }

        let already_received = session.chunks_received.contains(&chunk_index);

        let store_upload = std::env::var("CHARACTER_STORE_UPLOAD")
            .unwrap_or_else(|_| "./characters".to_string());
        let chunk_path = format!("{}/.tmp/{}/chunk_{}", store_upload, session_id, chunk_index);

        if !already_received {
            if let Err(e) = tokio::fs::write(&chunk_path, &chunk_data).await {
                tracing::error!("Failed to write chunk {}: {}", chunk_index, e);
                return response!(err "Failed to write chunk", ErrorCode::InternalServerError);
            }

            let mut updated_session = session.clone();
            updated_session.chunks_received.push(chunk_index);
            updated_session.chunks_received.sort_unstable();

            if let Err(e) = Self::update_char_upload_session(&app.cache, &updated_session).await {
                tracing::error!("Failed to update upload session: {}", e);
                return response!(err "Failed to update session", ErrorCode::InternalServerError);
            }
        }

        let chunks_remaining = session.total_chunks
            - (session.chunks_received.len() as u32)
            - if already_received { 0 } else { 1 };

        response!(ok ChunkUploadResponse {
            chunk_index,
            received: true,
            chunks_remaining,
        })
    }

    #[oai(path = "/servers/:server_id/characters/:model_id/3d/upload/complete/:session_id", method = "post")]
    async fn complete_character_chunked_upload(
        &self,
        Data(app): Data<&AppData>,
        Path(server_id): Path<String>,
        Path(model_id): Path<String>,
        Path(session_id): Path<String>,
        TokenBearer(user_token): TokenBearer,
    ) -> Response<Character3DModel> {
        if !check_superuser(&app, user_token.id).await {
            return response!(err "Forbidden", ErrorCode::Forbidden);
        }

        let session = match Self::get_char_upload_session(&app.cache, &session_id).await {
            Ok(s) => s,
            Err(e) => return response!(err e, ErrorCode::NotFound),
        };

        if session.uploaded_by != user_token.id {
            return response!(err "Forbidden", ErrorCode::Forbidden);
        }

        if session.model_id != model_id {
            return response!(err "Model ID mismatch", ErrorCode::BadRequest);
        }

        if session.server_id != server_id {
            return response!(err "Server ID mismatch", ErrorCode::BadRequest);
        }

        if session.chunks_received.len() != session.total_chunks as usize {
            let msg = format!("Missing chunks: {}/{}", session.chunks_received.len(), session.total_chunks);
            return response!(err &msg, ErrorCode::BadRequest);
        }

        let store_upload = std::env::var("CHARACTER_STORE_UPLOAD")
            .unwrap_or_else(|_| "./characters".to_string());

        let target_path = if app.character_storage.is_local() {
            match app.character_storage.local_path(&session.model_id) {
                Some(path) => path.to_string_lossy().to_string(),
                None => {
                    tracing::error!("Local character storage path is not configured");
                    return response!(err "Storage misconfigured", ErrorCode::InternalServerError);
                }
            }
        } else {
            format!("{}/.tmp/{}/assembled.glb", store_upload, session_id)
        };

        let final_path = match Self::assemble_char_chunks(&session, &store_upload, &target_path).await {
            Ok(path) => path,
            Err(e) => {
                tracing::error!("Chunk assembly failed: {}, error: {}", session_id, e);
                let _ = Self::cleanup_char_temp_dir(&session_id, &store_upload).await;
                return response!(err "Failed to assemble chunks", ErrorCode::InternalServerError);
            }
        };

        match tokio::fs::metadata(&final_path).await {
            Ok(metadata) => {
                if metadata.len() != session.total_size {
                    tracing::error!("File size mismatch: expected {}, got {}", session.total_size, metadata.len());
                    let _ = tokio::fs::remove_file(&final_path).await;
                    let _ = Self::cleanup_char_temp_dir(&session_id, &store_upload).await;
                    return response!(err "File size mismatch", ErrorCode::InternalServerError);
                }
            }
            Err(e) => {
                tracing::error!("Failed to verify assembled file: {}", e);
                let _ = Self::cleanup_char_temp_dir(&session_id, &store_upload).await;
                return response!(err "Failed to verify file", ErrorCode::InternalServerError);
            }
        }

        let file_size = session.total_size as i64;
        let link_path = match app.character_storage
            .store_file(&session.model_id, std::path::Path::new(&final_path))
            .await
        {
            Ok(path) => path,
            Err(e) => {
                tracing::error!("Failed to store assembled character model: {}", e);
                let _ = Self::cleanup_char_temp_dir(&session_id, &store_upload).await;
                return response!(err "Failed to store file", ErrorCode::InternalServerError);
            }
        };

        let result = sqlx::query_as!(
            DbCharacter3DModel,
            r#"
            INSERT INTO website.character_3d_model (server_id, model_id, name, credit, link_path, uploaded_by, file_size)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (server_id, model_id)
            DO UPDATE SET
                name = EXCLUDED.name,
                credit = EXCLUDED.credit,
                link_path = EXCLUDED.link_path,
                uploaded_by = EXCLUDED.uploaded_by,
                file_size = EXCLUDED.file_size,
                updated_at = NOW()
            RETURNING *
            "#,
            session.server_id,
            session.model_id,
            session.name,
            session.credit,
            link_path,
            session.uploaded_by,
            file_size,
        )
        .fetch_one(&*app.pool)
        .await;

        let _ = Self::cleanup_char_temp_dir(&session_id, &store_upload).await;
        let _ = Self::delete_char_upload_session(&app.cache, &session_id).await;

        match result {
            Ok(model) => {
                tracing::info!("Character upload completed: {}, final size: {}", session_id, file_size);

                let uploader_name = sqlx::query_scalar!(
                    "SELECT persona_name FROM website.steam_user WHERE user_id = $1",
                    model.uploaded_by
                )
                .fetch_optional(&*app.pool)
                .await
                .ok()
                .flatten();

                let mut api_model: Character3DModel = model.into();
                api_model.link_path = app.character_storage.normalize_link_path(
                    &api_model.link_path,
                    &api_model.model_id,
                );
                api_model.uploader_name = uploader_name;
                response!(ok api_model)
            }
            Err(e) => {
                tracing::error!("Database error: {}", e);
                response!(err "Database error", ErrorCode::InternalServerError)
            }
        }
    }

    #[oai(path = "/servers/:server_id/characters/:model_id/3d/upload/cancel/:session_id", method = "delete")]
    async fn cancel_character_chunked_upload(
        &self,
        Data(app): Data<&AppData>,
        Path(server_id): Path<String>,
        Path(model_id): Path<String>,
        Path(session_id): Path<String>,
        TokenBearer(user_token): TokenBearer,
    ) -> Response<String> {
        if !check_superuser(&app, user_token.id).await {
            return response!(err "Forbidden", ErrorCode::Forbidden);
        }

        let store_upload = std::env::var("CHARACTER_STORE_UPLOAD")
            .unwrap_or_else(|_| "./characters".to_string());

        let session = match Self::get_char_upload_session(&app.cache, &session_id).await {
            Ok(s) => s,
            Err(_) => {
                let _ = Self::cleanup_char_temp_dir(&session_id, &store_upload).await;
                return response!(ok "Upload cancelled".to_string());
            }
        };

        if session.uploaded_by != user_token.id {
            return response!(err "Forbidden", ErrorCode::Forbidden);
        }

        if session.model_id != model_id {
            return response!(err "Model ID mismatch", ErrorCode::BadRequest);
        }

        if session.server_id != server_id {
            return response!(err "Server ID mismatch", ErrorCode::BadRequest);
        }

        let _ = Self::cleanup_char_temp_dir(&session_id, &store_upload).await;
        let _ = Self::delete_char_upload_session(&app.cache, &session_id).await;

        response!(ok "Upload cancelled".to_string())
    }

    #[oai(path = "/servers/:server_id/characters/:model_id/3d", method = "delete")]
    async fn delete_character_3d_model(
        &self,
        Data(app): Data<&AppData>,
        Path(server_id): Path<String>,
        Path(model_id): Path<String>,
        TokenBearer(user_token): TokenBearer,
    ) -> Response<String> {
        if !check_superuser(&app, user_token.id).await {
            return response!(err "Forbidden", ErrorCode::Forbidden);
        }

        let model = sqlx::query_as!(
            DbCharacter3DModel,
            "SELECT id, model_id, name, server_id, credit, link_path, uploaded_by, thumbnail_path, file_size, created_at, updated_at FROM website.character_3d_model WHERE server_id = $1 AND model_id = $2",
            server_id,
            model_id
        )
        .fetch_optional(&*app.pool)
        .await;

        let Ok(Some(model)) = model else {
            return response!(err "Model not found", ErrorCode::NotFound);
        };

        if let Err(e) = app.character_storage.delete(&model_id).await {
            tracing::warn!("Failed to delete character model from storage: {}", e);
        }

        if let Some(thumb) = &model.thumbnail_path {
            if let Err(e) = app.character_storage.delete_thumbnail(&model_id, thumb).await {
                tracing::warn!("Failed to delete character thumbnail: {}", e);
            }
        }

        let result = sqlx::query!(
            "DELETE FROM website.character_3d_model WHERE server_id = $1 AND model_id = $2",
            server_id,
            model_id
        )
        .execute(&*app.pool)
        .await;

        match result {
            Ok(_) => response!(ok "3D model deleted successfully".to_string()),
            Err(e) => {
                tracing::error!("Database error: {}", e);
                response!(internal_server_error)
            }
        }
    }

    #[oai(path = "/servers/:server_id/characters/:model_id/3d/thumbnail", method = "post")]
    async fn upload_character_thumbnail(
        &self,
        Data(app): Data<&AppData>,
        Path(server_id): Path<String>,
        Path(model_id): Path<String>,
        TokenBearer(user_token): TokenBearer,
        multipart: poem::web::Multipart,
    ) -> Response<Character3DModel> {
        if !check_superuser(&app, user_token.id).await {
            return response!(err "Forbidden", ErrorCode::Forbidden);
        }

        let mut multipart = multipart;
        let mut thumbnail_data: Option<(Vec<u8>, String)> = None;

        while let Ok(Some(field)) = multipart.next_field().await {
            if field.name().map(|n| n == "thumbnail").unwrap_or(false) {
                let content_type = field.content_type()
                    .map(|ct| ct.to_string())
                    .unwrap_or_default();
                let Some(ext) = image_ext_from_content_type(&content_type) else {
                    return response!(err "Thumbnail must be a PNG, WebP or JPEG image", ErrorCode::BadRequest);
                };
                match field.bytes().await {
                    Ok(bytes) => thumbnail_data = Some((bytes.to_vec(), ext.to_string())),
                    Err(e) => {
                        tracing::error!("Failed to read character thumbnail upload: {}", e);
                        return response!(err "Failed to read thumbnail upload", ErrorCode::BadRequest);
                    }
                }
            }
        }

        let Some((thumb_bytes, ext)) = thumbnail_data else {
            return response!(err "Missing thumbnail field", ErrorCode::BadRequest);
        };

        let previous_thumbnail = sqlx::query_scalar!(
            "SELECT thumbnail_path FROM website.character_3d_model WHERE server_id = $1 AND model_id = $2",
            server_id,
            model_id
        )
        .fetch_optional(&*app.pool)
        .await
        .ok()
        .flatten()
        .flatten();

        let filename = match app.character_storage.store_thumbnail(&model_id, &ext, &thumb_bytes).await {
            Ok(path) => path,
            Err(e) => {
                tracing::error!("Failed to store character thumbnail: {}", e);
                return response!(internal_server_error);
            }
        };

        if let Some(previous) = previous_thumbnail {
            if let Err(e) = app.character_storage.delete_previous_thumbnail(&model_id, &previous, &ext).await {
                tracing::warn!("Failed to delete previous character thumbnail: {}", e);
            }
        }

        let updated = sqlx::query_as!(
            DbCharacter3DModel,
            r#"
            UPDATE website.character_3d_model
            SET thumbnail_path = $1, updated_at = NOW()
            WHERE server_id = $2 AND model_id = $3
            RETURNING id, model_id, name, server_id, credit, link_path,
                      uploaded_by, thumbnail_path, file_size, created_at, updated_at
            "#,
            filename,
            server_id,
            model_id
        )
        .fetch_optional(&*app.pool)
        .await;

        match updated {
            Ok(Some(model)) => {
                let uploader_name = if let Some(uid) = model.uploaded_by {
                    sqlx::query_scalar!(
                        "SELECT persona_name FROM website.steam_user WHERE user_id = $1",
                        uid
                    )
                    .fetch_optional(&*app.pool)
                    .await
                    .ok()
                    .flatten()
                } else {
                    None
                };
                let mut api_model: Character3DModel = model.into();
                api_model.link_path = app.character_storage.normalize_link_path(
                    &api_model.link_path,
                    &api_model.model_id,
                );
                api_model.uploader_name = uploader_name;
                response!(ok api_model)
            }
            Ok(None) => response!(err "Model not found", ErrorCode::NotFound),
            Err(e) => {
                tracing::error!("Database error: {}", e);
                response!(internal_server_error)
            }
        }
    }

    async fn get_char_upload_session(
        cache: &FastCache,
        session_id: &str,
    ) -> Result<CharacterUploadSession, &'static str> {
        use redis::AsyncCommands;
        let key = format!("char_upload_session:{}", session_id);
        let mut conn = cache.redis_pool.get().await
            .map_err(|_| "Failed to get Redis connection")?;
        let json: String = conn.get(&key).await
            .map_err(|_| "Session not found or expired")?;
        serde_json::from_str(&json)
            .map_err(|_| "Failed to parse session")
    }

    async fn update_char_upload_session(
        cache: &FastCache,
        session: &CharacterUploadSession,
    ) -> Result<(), &'static str> {
        use redis::AsyncCommands;
        let key = format!("char_upload_session:{}", session.session_id);
        let json = serde_json::to_string(session)
            .map_err(|_| "Failed to serialize session")?;
        let mut conn = cache.redis_pool.get().await
            .map_err(|_| "Failed to get Redis connection")?;
        let _: redis::RedisResult<()> = conn.set_ex(&key, &json, 86400).await;
        Ok(())
    }

    async fn delete_char_upload_session(
        cache: &FastCache,
        session_id: &str,
    ) -> Result<(), ()> {
        use redis::AsyncCommands;
        let key = format!("char_upload_session:{}", session_id);
        if let Ok(mut conn) = cache.redis_pool.get().await {
            let _: redis::RedisResult<()> = conn.del(&key).await;
        }
        Ok(())
    }

    async fn assemble_char_chunks(
        session: &CharacterUploadSession,
        store_upload: &str,
        target_path: &str,
    ) -> Result<String, std::io::Error> {
        if let Some(parent) = std::path::Path::new(target_path).parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        let mut target_file = tokio::fs::File::create(target_path).await?;
        for chunk_index in 0..session.total_chunks {
            let chunk_path = format!("{}/.tmp/{}/chunk_{}", store_upload, session.session_id, chunk_index);
            let mut chunk_file = tokio::fs::File::open(&chunk_path).await?;
            tokio::io::copy(&mut chunk_file, &mut target_file).await?;
        }
        Ok(target_path.to_string())
    }

    async fn cleanup_char_temp_dir(
        session_id: &str,
        store_upload: &str,
    ) -> Result<(), std::io::Error> {
        let temp_dir = format!("{}/.tmp/{}", store_upload, session_id);
        tokio::fs::remove_dir_all(&temp_dir).await
    }
}

impl UriPatternExt for CharacterApi {
    fn get_all_patterns(&self) -> Vec<RoutePattern<'_>> {
        vec![
            "/servers/{server_id}/characters",
            "/servers/{server_id}/characters/{model_id}/3d",
            "/servers/{server_id}/characters/{model_id}/3d/upload",
            "/servers/{server_id}/characters/{model_id}/3d/upload/initiate",
            "/servers/{server_id}/characters/{model_id}/3d/upload/chunk/{session_id}",
            "/servers/{server_id}/characters/{model_id}/3d/upload/complete/{session_id}",
            "/servers/{server_id}/characters/{model_id}/3d/upload/cancel/{session_id}",
            "/servers/{server_id}/characters/{model_id}/3d/thumbnail",
        ].iter_into()
    }
}
