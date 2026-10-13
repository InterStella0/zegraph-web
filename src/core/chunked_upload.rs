use std::future::Future;
use std::path::{Path, PathBuf};
use poem_openapi::types::{ParseFromJSON, ToJSON};
use redis::AsyncCommands;
use serde::de::DeserializeOwned;
use serde::Serialize;
use sqlx::{Pool, Postgres};
use crate::api_models::common::*;
use crate::api_models::maps::Map3DModel;
use crate::api_models::misc::*;
use crate::models::admins::DbCharacter3DModel;
use crate::models::maps::DbMap3DModel;
use crate::{response, AppData, FastCache};

pub const CHUNK_SIZE: usize = 10_485_760;

pub trait ChunkedUpload: Serialize + DeserializeOwned + Clone + Send + Sync {
    const KEY_PREFIX: &'static str;
    const STORE_ENV: &'static str;
    const STORE_DEFAULT: &'static str;
    const NO_LOCAL_PATH: &'static str;
    const VERIFY_FAILED: &'static str;
    const STORE_FAILED: &'static str;

    fn id(&self) -> &str;
    fn owner(&self) -> i64;
    fn total_chunks(&self) -> u32;
    fn total_size(&self) -> u64;
    fn received(&self) -> &Vec<u32>;
    fn received_mut(&mut self) -> &mut Vec<u32>;
    fn local_path(&self, app: &AppData) -> Option<Option<PathBuf>>;
    fn store_file(&self, app: &AppData, path: &Path) -> impl Future<Output = Result<String, String>> + Send;
    fn log_initiated(&self);
    fn log_chunk(&self, _chunk_index: u32) {}
    fn log_cancelled(&self) {}
}

macro_rules! session_fields {
    () => {
        fn id(&self) -> &str { &self.session_id }
        fn owner(&self) -> i64 { self.uploaded_by }
        fn total_chunks(&self) -> u32 { self.total_chunks }
        fn total_size(&self) -> u64 { self.total_size }
        fn received(&self) -> &Vec<u32> { &self.chunks_received }
        fn received_mut(&mut self) -> &mut Vec<u32> { &mut self.chunks_received }
    };
}

impl ChunkedUpload for UploadSession {
    const KEY_PREFIX: &'static str = "upload_session:";
    const STORE_ENV: &'static str = "STORE_UPLOAD";
    const STORE_DEFAULT: &'static str = "./maps";
    const NO_LOCAL_PATH: &'static str = "Local storage path is not configured";
    const VERIFY_FAILED: &'static str = "Failed to verify file";
    const STORE_FAILED: &'static str = "Failed to store assembled file";
    session_fields!();

    fn local_path(&self, app: &AppData) -> Option<Option<PathBuf>> {
        app.map_storage.is_local().then(|| app.map_storage.local_path(&self.map_name, &self.res_type))
    }
    fn store_file(&self, app: &AppData, path: &Path) -> impl Future<Output = Result<String, String>> + Send {
        app.map_storage.store_file(&self.map_name, &self.res_type, path)
    }
    fn log_initiated(&self) {
        tracing::info!("Upload session initiated: {}, map: {}, size: {}", self.session_id, self.map_name, self.total_size);
    }
    fn log_chunk(&self, chunk_index: u32) {
        tracing::debug!("Chunk {}/{} received for session {}", chunk_index, self.total_chunks, self.session_id);
    }
    fn log_cancelled(&self) {
        tracing::warn!("Upload cancelled: {}, chunks: {}/{}", self.session_id, self.chunks_received.len(), self.total_chunks);
    }
}

impl ChunkedUpload for CharacterUploadSession {
    const KEY_PREFIX: &'static str = "char_upload_session:";
    const STORE_ENV: &'static str = "CHARACTER_STORE_UPLOAD";
    const STORE_DEFAULT: &'static str = "./characters";
    const NO_LOCAL_PATH: &'static str = "Local character storage path is not configured";
    const VERIFY_FAILED: &'static str = "Failed to verify assembled file";
    const STORE_FAILED: &'static str = "Failed to store assembled character model";
    session_fields!();

    fn local_path(&self, app: &AppData) -> Option<Option<PathBuf>> {
        app.character_storage.is_local().then(|| app.character_storage.local_path(&self.model_id))
    }
    fn store_file(&self, app: &AppData, path: &Path) -> impl Future<Output = Result<String, String>> + Send {
        app.character_storage.store_file(&self.model_id, path)
    }
    fn log_initiated(&self) {
        tracing::info!(
            "Character upload session initiated: {}, model: {}, server: {}, size: {}",
            self.session_id, self.model_id, self.server_id, self.total_size
        );
    }
}

fn store_dir<S: ChunkedUpload>() -> String {
    std::env::var(S::STORE_ENV).unwrap_or_else(|_| S::STORE_DEFAULT.to_string())
}

async fn get_session<S: ChunkedUpload>(cache: &FastCache, session_id: &str) -> Result<S, &'static str> {
    let key = format!("{}{}", S::KEY_PREFIX, session_id);
    let mut conn = cache.redis_pool.get().await
        .map_err(|_| "Failed to get Redis connection")?;
    let json: String = conn.get(&key).await
        .map_err(|_| "Session not found or expired")?;
    serde_json::from_str(&json)
        .map_err(|_| "Failed to parse session")
}

async fn update_session<S: ChunkedUpload>(cache: &FastCache, session: &S) -> Result<(), &'static str> {
    let key = format!("{}{}", S::KEY_PREFIX, session.id());
    let json = serde_json::to_string(session)
        .map_err(|_| "Failed to serialize session")?;
    let mut conn = cache.redis_pool.get().await
        .map_err(|_| "Failed to get Redis connection")?;
    conn.set_ex::<_, _, ()>(&key, &json, 86400).await
        .map_err(|_| "Failed to store session")
}

async fn cleanup_temp_dir(session_id: &str, store_upload: &str) -> Result<(), std::io::Error> {
    let temp_dir = format!("{}/.tmp/{}", store_upload, session_id);
    tokio::fs::remove_dir_all(&temp_dir).await
}

pub async fn discard<S: ChunkedUpload>(cache: &FastCache, session_id: &str) {
    let _ = cleanup_temp_dir(session_id, &store_dir::<S>()).await;
    if let Ok(mut conn) = cache.redis_pool.get().await {
        let _: redis::RedisResult<()> = conn.del(format!("{}{}", S::KEY_PREFIX, session_id)).await;
    }
}

async fn assemble_chunks<S: ChunkedUpload>(
    session: &S,
    store_upload: &str,
    target_path: &str,
) -> Result<String, std::io::Error> {
    if let Some(parent) = Path::new(target_path).parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    let mut target_file = tokio::fs::File::create(target_path).await?;
    for chunk_index in 0..session.total_chunks() {
        let chunk_path = format!("{}/.tmp/{}/chunk_{}", store_upload, session.id(), chunk_index);
        let mut chunk_file = tokio::fs::File::open(&chunk_path).await?;
        tokio::io::copy(&mut chunk_file, &mut target_file).await?;
    }
    Ok(target_path.to_string())
}

fn verify<S: ChunkedUpload, T: ParseFromJSON + ToJSON + Send + Sync>(
    session: &S, user_id: i64, mismatch: impl Fn(&S) -> Option<&'static str>,
) -> Result<(), Response<T>> {
    if session.owner() != user_id {
        return Err(response!(err "Forbidden", ErrorCode::Forbidden));
    }
    match mismatch(session) {
        Some(msg) => Err(response!(err msg, ErrorCode::BadRequest)),
        None => Ok(()),
    }
}

async fn owned_session<S: ChunkedUpload, T: ParseFromJSON + ToJSON + Send + Sync>(
    cache: &FastCache, session_id: &str, user_id: i64, mismatch: impl Fn(&S) -> Option<&'static str>,
) -> Result<S, Response<T>> {
    let session = match get_session::<S>(cache, session_id).await {
        Ok(s) => s,
        Err(e) => return Err(response!(err e, ErrorCode::NotFound)),
    };
    verify(&session, user_id, mismatch)?;
    Ok(session)
}

pub async fn initiate<S: ChunkedUpload>(
    cache: &FastCache, req: &serde_json::Value, build: impl FnOnce(String, u32, u64) -> S,
) -> Response<InitiateUploadResponse> {
    let file_size = match req.get("file_size").and_then(|v| v.as_u64()) {
        Some(size) => size,
        None => return response!(err "file_size is required", ErrorCode::BadRequest),
    };

    let session_id = uuid::Uuid::new_v4().to_string();
    let total_chunks = ((file_size as f64) / (CHUNK_SIZE as f64)).ceil() as u32;
    let session = build(session_id.clone(), total_chunks, file_size);

    if let Err(e) = update_session(cache, &session).await {
        tracing::error!("Failed to create upload session: {}", e);
        return response!(err "Failed to create upload session", ErrorCode::InternalServerError);
    }

    let temp_dir = format!("{}/.tmp/{}", store_dir::<S>(), session_id);
    if let Err(e) = tokio::fs::create_dir_all(&temp_dir).await {
        tracing::error!("Failed to create temp directory: {}", e);
        return response!(err "Failed to create upload session", ErrorCode::InternalServerError);
    }

    session.log_initiated();

    response!(ok InitiateUploadResponse {
        session_id,
        chunk_size: CHUNK_SIZE,
        total_chunks,
    })
}

pub async fn upload_chunk<S: ChunkedUpload>(
    cache: &FastCache, session_id: &str, user_id: i64,
    mismatch: impl Fn(&S) -> Option<&'static str>, mut upload: poem::web::Multipart,
) -> Response<ChunkUploadResponse> {
    let session = match owned_session::<S, _>(cache, session_id, user_id, mismatch).await {
        Ok(s) => s,
        Err(resp) => return resp,
    };

    let mut chunk_index: Option<u32> = None;
    let mut chunk_data: Option<Vec<u8>> = None;

    loop {
        let field = match upload.next_field().await {
            Ok(Some(field)) => field,
            Ok(None) => break,
            Err(_) => return response!(err "Malformed multipart body", ErrorCode::BadRequest),
        };
        let name = field.name().map(|s| s.to_string());
        match name.as_deref() {
            Some("chunk_index") => match field.text().await {
                Ok(text) => chunk_index = text.parse::<u32>().ok(),
                Err(_) => return response!(err "Failed to read chunk_index", ErrorCode::BadRequest),
            },
            Some("chunk_data") => match field.bytes().await {
                Ok(bytes) => chunk_data = Some(bytes.to_vec()),
                Err(_) => return response!(err "Failed to read chunk_data", ErrorCode::BadRequest),
            },
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

    if chunk_index >= session.total_chunks() {
        return response!(err "Invalid chunk_index", ErrorCode::BadRequest);
    }

    let already_received = session.received().contains(&chunk_index);
    let chunk_path = format!("{}/.tmp/{}/chunk_{}", store_dir::<S>(), session_id, chunk_index);

    if !already_received {
        if let Err(e) = tokio::fs::write(&chunk_path, &chunk_data).await {
            tracing::error!("Failed to write chunk {}: {}", chunk_index, e);
            return response!(err "Failed to write chunk", ErrorCode::InternalServerError);
        }

        let mut updated_session = session.clone();
        updated_session.received_mut().push(chunk_index);
        updated_session.received_mut().sort_unstable();

        if let Err(e) = update_session(cache, &updated_session).await {
            tracing::error!("Failed to update upload session: {}", e);
            return response!(err "Failed to update session", ErrorCode::InternalServerError);
        }

        session.log_chunk(chunk_index);
    }

    let chunks_remaining = session.total_chunks()
        - (session.received().len() as u32)
        - if already_received { 0 } else { 1 };

    response!(ok ChunkUploadResponse {
        chunk_index,
        received: true,
        chunks_remaining,
    })
}

pub async fn assemble_and_store<S: ChunkedUpload, T: ParseFromJSON + ToJSON + Send + Sync>(
    app: &AppData, session_id: &str, user_id: i64, mismatch: impl Fn(&S) -> Option<&'static str>,
) -> Result<(S, String), Response<T>> {
    let session = owned_session::<S, T>(&app.cache, session_id, user_id, mismatch).await?;

    if session.received().len() != session.total_chunks() as usize {
        let msg = format!("Missing chunks: {}/{}", session.received().len(), session.total_chunks());
        return Err(response!(err &msg, ErrorCode::BadRequest));
    }

    let store_upload = store_dir::<S>();
    let target_path = match session.local_path(app) {
        Some(Some(path)) => path.to_string_lossy().to_string(),
        Some(None) => {
            tracing::error!("{}", S::NO_LOCAL_PATH);
            return Err(response!(err "Storage misconfigured", ErrorCode::InternalServerError));
        }
        None => format!("{}/.tmp/{}/assembled.glb", store_upload, session_id),
    };

    let final_path = match assemble_chunks(&session, &store_upload, &target_path).await {
        Ok(path) => path,
        Err(e) => {
            tracing::error!("Chunk assembly failed: {}, error: {}", session_id, e);
            let _ = cleanup_temp_dir(session_id, &store_upload).await;
            return Err(response!(err "Failed to assemble chunks", ErrorCode::InternalServerError));
        }
    };

    match tokio::fs::metadata(&final_path).await {
        Ok(metadata) => {
            if metadata.len() != session.total_size() {
                tracing::error!("File size mismatch: expected {}, got {}", session.total_size(), metadata.len());
                let _ = tokio::fs::remove_file(&final_path).await;
                let _ = cleanup_temp_dir(session_id, &store_upload).await;
                return Err(response!(err "File size mismatch", ErrorCode::InternalServerError));
            }
        }
        Err(e) => {
            tracing::error!("{}: {}", S::VERIFY_FAILED, e);
            let _ = cleanup_temp_dir(session_id, &store_upload).await;
            return Err(response!(err "Failed to verify file", ErrorCode::InternalServerError));
        }
    }

    match session.store_file(app, Path::new(&final_path)).await {
        Ok(link_path) => Ok((session, link_path)),
        Err(e) => {
            tracing::error!("{}: {}", S::STORE_FAILED, e);
            let _ = cleanup_temp_dir(session_id, &store_upload).await;
            Err(response!(err "Failed to store file", ErrorCode::InternalServerError))
        }
    }
}

pub async fn cancel<S: ChunkedUpload>(
    cache: &FastCache, session_id: &str, user_id: i64, mismatch: impl Fn(&S) -> Option<&'static str>,
) -> Response<String> {
    let session = match get_session::<S>(cache, session_id).await {
        Ok(s) => s,
        Err(_) => {
            let _ = cleanup_temp_dir(session_id, &store_dir::<S>()).await;
            return response!(ok "Upload cancelled".to_string());
        }
    };
    if let Err(resp) = verify(&session, user_id, mismatch) {
        return resp;
    }
    session.log_cancelled();
    discard::<S>(cache, session_id).await;
    response!(ok "Upload cancelled".to_string())
}

async fn uploader_name(pool: &Pool<Postgres>, uploaded_by: Option<i64>) -> Option<String> {
    let uid = uploaded_by?;
    sqlx::query_scalar!(
        "SELECT persona_name FROM website.steam_user WHERE user_id = $1",
        uid
    )
    .fetch_optional(pool)
    .await
    .ok()
    .flatten()
}

pub async fn map_model_api(app: &AppData, model: DbMap3DModel) -> Map3DModel {
    let uploader_name = uploader_name(&app.pool, model.uploaded_by).await;
    let mut api_model: Map3DModel = model.into();
    api_model.link_path = app.map_storage.normalize_link_path(
        &api_model.link_path,
        &api_model.map_name,
        &api_model.res_type,
    );
    api_model.uploader_name = uploader_name;
    api_model
}

pub async fn character_model_api(app: &AppData, model: DbCharacter3DModel) -> Character3DModel {
    let uploader_name = uploader_name(&app.pool, model.uploaded_by).await;
    let mut api_model: Character3DModel = model.into();
    api_model.link_path = app.character_storage.normalize_link_path(&api_model.link_path, &api_model.model_id);
    api_model.uploader_name = uploader_name;
    api_model
}
