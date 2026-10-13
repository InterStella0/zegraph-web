use poem::web::{Data, Json};
use poem_openapi::OpenApi;
use poem_openapi::param::Path;
use crate::{or_ise, require, response, AppData};
use crate::api_models::common::*;
use crate::api_models::misc::*;
use crate::core::chunked_upload;
use crate::core::storage::image_ext_from_content_type;
use crate::core::utils::*;
use crate::models::admins::*;
use crate::routers::ApiTags;

pub struct CharacterApi;

#[OpenApi(tag = "ApiTags::Characters")]
impl CharacterApi {
    /// List a server's uploaded 3D character models.
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

        let rows = or_ise!(models);
        let mut result: Vec<Character3DModel> = Vec::with_capacity(rows.len());
        for row in rows {
            result.push(chunked_upload::character_model_api(app, row).await);
        }
        response!(ok result)
    }

    /// Get a single 3D character model by its model ID.
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
            Ok(Some(row)) => response!(ok chunked_upload::character_model_api(app, row).await),
            Ok(None) => response!(err "Model not found", ErrorCode::NotFound),
            Err(_) => response!(internal_server_error),
        }
    }

    /// Upload a 3D character model in one request (max 500MB).
    ///
    /// Requires the `superuser` role. Multipart form with a required `file` field and optional
    /// `credit`/`name` fields. Replaces any existing model with the same `model_id` on the same
    /// server. For larger files, use the chunked upload endpoints instead.
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
        require!(check_superuser(&app, user_token.id).await, "Forbidden", ErrorCode::Forbidden);

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

        let link_path = or_ise!(app.character_storage.store_bytes(&model_id, &file_bytes).await, e => "Failed to store character 3D model: {}", e);

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

        let model = or_ise!(result, e => "Database error: {}", e);
        response!(ok chunked_upload::character_model_api(app, model).await)
    }

    /// Start a chunked upload session for a large 3D character model.
    ///
    /// Requires the `superuser` role. Body must include `file_size`; optional `credit`/`name`.
    /// Splits the file into 10MB chunks and returns a `session_id` (valid 24 hours) to upload
    /// them against with `upload/chunk/:session_id`, then finish with `upload/complete`.
    #[oai(path = "/servers/:server_id/characters/:model_id/3d/upload/initiate", method = "post")]
    async fn initiate_character_chunked_upload(
        &self,
        Data(app): Data<&AppData>,
        Path(server_id): Path<String>,
        Path(model_id): Path<String>,
        TokenBearer(user_token): TokenBearer,
        Json(req): Json<serde_json::Value>,
    ) -> Response<InitiateUploadResponse> {
        require!(check_superuser(&app, user_token.id).await, "Forbidden", ErrorCode::Forbidden);

        let credit = req.get("credit").and_then(|v| v.as_str()).map(|s| s.to_string());
        let display_name = req.get("name").and_then(|v| v.as_str()).map(|s| s.to_string());

        chunked_upload::initiate(&app.cache, &req, |session_id, total_chunks, file_size| CharacterUploadSession {
            session_id,
            model_id,
            name: display_name,
            server_id,
            credit,
            total_chunks,
            chunk_size: chunked_upload::CHUNK_SIZE,
            total_size: file_size,
            uploaded_by: user_token.id,
            created_at: chrono::Utc::now().to_rfc3339(),
            chunks_received: Vec::new(),
        }).await
    }

    /// Upload a single chunk of a chunked 3D character model upload.
    ///
    /// Requires the `superuser` role and ownership of the upload session. Multipart form with
    /// `chunk_index` and `chunk_data`. Re-uploading an already-received chunk is a no-op.
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
        require!(check_superuser(&app, user_token.id).await, "Forbidden", ErrorCode::Forbidden);

        chunked_upload::upload_chunk(&app.cache, &session_id, user_token.id, char_mismatch(&server_id, &model_id), upload).await
    }

    /// Finish a chunked 3D character model upload once every chunk has arrived.
    ///
    /// Requires the `superuser` role and ownership of the upload session. Assembles the chunks,
    /// verifies the resulting file size, stores it, and upserts the model row (replacing any
    /// existing model with the same `model_id`). Cleans up the session and temp files either way.
    #[oai(path = "/servers/:server_id/characters/:model_id/3d/upload/complete/:session_id", method = "post")]
    async fn complete_character_chunked_upload(
        &self,
        Data(app): Data<&AppData>,
        Path(server_id): Path<String>,
        Path(model_id): Path<String>,
        Path(session_id): Path<String>,
        TokenBearer(user_token): TokenBearer,
    ) -> Response<Character3DModel> {
        require!(check_superuser(&app, user_token.id).await, "Forbidden", ErrorCode::Forbidden);

        let (session, link_path) = match chunked_upload::assemble_and_store::<CharacterUploadSession, _>(
            app, &session_id, user_token.id, char_mismatch(&server_id, &model_id),
        ).await {
            Ok(stored) => stored,
            Err(resp) => return resp,
        };
        let file_size = session.total_size as i64;

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

        chunked_upload::discard::<CharacterUploadSession>(&app.cache, &session_id).await;

        match result {
            Ok(model) => {
                tracing::info!("Character upload completed: {}, final size: {}", session_id, file_size);
                response!(ok chunked_upload::character_model_api(app, model).await)
            }
            Err(e) => {
                tracing::error!("Database error: {}", e);
                response!(err "Database error", ErrorCode::InternalServerError)
            }
        }
    }

    /// Cancel an in-progress chunked 3D character model upload.
    ///
    /// Requires the `superuser` role and ownership of the upload session. Deletes any received
    /// chunks and the session; safe to call even if the session already expired.
    #[oai(path = "/servers/:server_id/characters/:model_id/3d/upload/cancel/:session_id", method = "delete")]
    async fn cancel_character_chunked_upload(
        &self,
        Data(app): Data<&AppData>,
        Path(server_id): Path<String>,
        Path(model_id): Path<String>,
        Path(session_id): Path<String>,
        TokenBearer(user_token): TokenBearer,
    ) -> Response<String> {
        require!(check_superuser(&app, user_token.id).await, "Forbidden", ErrorCode::Forbidden);

        chunked_upload::cancel(&app.cache, &session_id, user_token.id, char_mismatch(&server_id, &model_id)).await
    }

    /// Delete a 3D character model, its stored file and its thumbnail.
    ///
    /// Requires the `superuser` role.
    #[oai(path = "/servers/:server_id/characters/:model_id/3d", method = "delete")]
    async fn delete_character_3d_model(
        &self,
        Data(app): Data<&AppData>,
        Path(server_id): Path<String>,
        Path(model_id): Path<String>,
        TokenBearer(user_token): TokenBearer,
    ) -> Response<String> {
        require!(check_superuser(&app, user_token.id).await, "Forbidden", ErrorCode::Forbidden);

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

        or_ise!(result, e => "Database error: {}", e);
        response!(ok "3D model deleted successfully".to_string())
    }

    /// Upload or replace a 3D character model's thumbnail image.
    ///
    /// Requires the `superuser` role. Multipart form with a `thumbnail` field (PNG, WebP or
    /// JPEG). Replaces and deletes the previous thumbnail if one existed.
    #[oai(path = "/servers/:server_id/characters/:model_id/3d/thumbnail", method = "post")]
    async fn upload_character_thumbnail(
        &self,
        Data(app): Data<&AppData>,
        Path(server_id): Path<String>,
        Path(model_id): Path<String>,
        TokenBearer(user_token): TokenBearer,
        multipart: poem::web::Multipart,
    ) -> Response<Character3DModel> {
        require!(check_superuser(&app, user_token.id).await, "Forbidden", ErrorCode::Forbidden);

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

        let filename = or_ise!(app.character_storage.store_thumbnail(&model_id, &ext, &thumb_bytes).await, e => "Failed to store character thumbnail: {}", e);

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
            Ok(Some(model)) => response!(ok chunked_upload::character_model_api(app, model).await),
            Ok(None) => response!(err "Model not found", ErrorCode::NotFound),
            Err(e) => {
                tracing::error!("Database error: {}", e);
                response!(internal_server_error)
            }
        }
    }
}

fn char_mismatch<'a>(server_id: &'a str, model_id: &'a str) -> impl Fn(&CharacterUploadSession) -> Option<&'static str> + 'a {
    move |s| if s.model_id != model_id {
        Some("Model ID mismatch")
    } else if s.server_id != server_id {
        Some("Server ID mismatch")
    } else {
        None
    }
}
