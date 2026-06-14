use std::path::{Path, PathBuf};

use aws_credential_types::Credentials;
use aws_sdk_s3::config::BehaviorVersion;
use aws_sdk_s3::primitives::ByteStream;
use aws_sdk_s3::{Client, config::Region};

use crate::core::utils::get_env_default;

#[derive(Clone)]
pub struct MapStorage {
    backend: MapStorageBackend,
    object_prefix: String,
    public_base_url: String,
}

#[derive(Clone)]
pub(crate) enum MapStorageBackend {
    Local { root: String },
    R2 { client: Client, bucket: String },
}

impl MapStorage {
    pub async fn from_env() -> Result<Self, String> {
        let backend = get_env_default("MAP_STORAGE_BACKEND")
            .unwrap_or_else(|| "local".to_string())
            .to_lowercase();

        let object_prefix = get_env_default("MAPS_OBJECT_PREFIX")
            .unwrap_or_default()
            .trim_matches('/')
            .to_string();

        let public_base_url = get_env_default("MAPS_PUBLIC_BASE_URL")
            .filter(|s| !s.is_empty())
            .or_else(|| get_env_default("R2_PUBLIC_BASE_URL").filter(|s| !s.is_empty()))
            .unwrap_or_else(|| {
                if backend == "local" {
                    "/models/maps".to_string()
                } else {
                    String::new()
                }
            });

        if public_base_url.is_empty() {
            return Err("MAPS_PUBLIC_BASE_URL (or R2_PUBLIC_BASE_URL) is required".to_string());
        }

        match backend.as_str() {
            "local" => {
                let root = get_env_default("STORE_UPLOAD")
                    .unwrap_or_else(|| "./maps".to_string());
                Ok(Self {
                    backend: MapStorageBackend::Local { root },
                    object_prefix,
                    public_base_url,
                })
            }
            "r2" | "cloudflare" => {
                let endpoint = get_env_default("R2_ENDPOINT")
                    .ok_or("R2_ENDPOINT is required")?;
                let access_key = get_env_default("R2_ACCESS_KEY_ID")
                    .ok_or("R2_ACCESS_KEY_ID is required")?;
                let secret_key = get_env_default("R2_SECRET_ACCESS_KEY")
                    .ok_or("R2_SECRET_ACCESS_KEY is required")?;
                let bucket = get_env_default("R2_BUCKET")
                    .ok_or("R2_BUCKET is required")?;

                let credentials = Credentials::new(access_key, secret_key, None, None, "r2");
                let config = aws_sdk_s3::Config::builder()
                    .behavior_version(BehaviorVersion::v2026_01_12())
                    .region(Region::new("auto"))
                    .endpoint_url(endpoint)
                    .credentials_provider(credentials)
                    .build();
                let client = Client::from_conf(config);

                Ok(Self {
                    backend: MapStorageBackend::R2 { client, bucket },
                    object_prefix,
                    public_base_url,
                })
            }
            other => Err(format!("Unsupported MAP_STORAGE_BACKEND: {other}")),
        }
    }

    pub fn is_local(&self) -> bool {
        matches!(self.backend, MapStorageBackend::Local { .. })
    }

    pub fn local_root(&self) -> Option<&str> {
        match &self.backend {
            MapStorageBackend::Local { root } => Some(root),
            _ => None,
        }
    }

    pub fn object_key(&self, map_name: &str, res_type: &str) -> String {
        let filename = format!("{map_name}_d_c_{res_type}.glb");
        if self.object_prefix.is_empty() {
            format!("{map_name}/{filename}")
        } else {
            format!("{}/{map_name}/{filename}", self.object_prefix)
        }
    }

    pub fn public_url(&self, map_name: &str, res_type: &str) -> String {
        let key = self.object_key(map_name, res_type);
        join_url(&self.public_base_url, &key)
    }

    pub fn normalize_link_path(&self, existing: &str, map_name: &str, res_type: &str) -> String {
        let existing = existing.trim();
        if existing.starts_with("http://") || existing.starts_with("https://") {
            return existing.to_string();
        }
        self.public_url(map_name, res_type)
    }

    pub fn local_path(&self, map_name: &str, res_type: &str) -> Option<PathBuf> {
        let root = self.local_root()?;
        let key = self.object_key(map_name, res_type);
        Some(Path::new(root).join(key))
    }

    pub async fn store_bytes(
        &self,
        map_name: &str,
        res_type: &str,
        bytes: &[u8],
    ) -> Result<String, String> {
        let key = self.object_key(map_name, res_type);
        match &self.backend {
            MapStorageBackend::Local { root } => {
                let path = Path::new(root).join(&key);
                if let Some(parent) = path.parent() {
                    tokio::fs::create_dir_all(parent)
                        .await
                        .map_err(|e| format!("Failed to create directory: {e}"))?;
                }
                tokio::fs::write(&path, bytes)
                    .await
                    .map_err(|e| format!("Failed to write file: {e}"))?;
                Ok(join_url(&self.public_base_url, &key))
            }
            MapStorageBackend::R2 { client, bucket } => {
                let body = ByteStream::from(bytes.to_vec());
                client
                    .put_object()
                    .bucket(bucket)
                    .key(&key)
                    .content_type("model/gltf-binary")
                    .body(body)
                    .send()
                    .await
                    .map_err(|e| format!("R2 upload failed: {e}"))?;
                Ok(join_url(&self.public_base_url, &key))
            }
        }
    }

    pub async fn store_file(
        &self,
        map_name: &str,
        res_type: &str,
        file_path: &Path,
    ) -> Result<String, String> {
        let key = self.object_key(map_name, res_type);
        match &self.backend {
            MapStorageBackend::Local { root } => {
                let target_path = Path::new(root).join(&key);
                if file_path != target_path {
                    if let Some(parent) = target_path.parent() {
                        tokio::fs::create_dir_all(parent)
                            .await
                            .map_err(|e| format!("Failed to create directory: {e}"))?;
                    }
                    tokio::fs::rename(file_path, &target_path)
                        .await
                        .map_err(|e| format!("Failed to move file: {e}"))?;
                }
                Ok(join_url(&self.public_base_url, &key))
            }
            MapStorageBackend::R2 { client, bucket } => {
                let body = ByteStream::from_path(file_path)
                    .await
                    .map_err(|e| format!("Failed to read file for upload: {e}"))?;
                client
                    .put_object()
                    .bucket(bucket)
                    .key(&key)
                    .content_type("model/gltf-binary")
                    .body(body)
                    .send()
                    .await
                    .map_err(|e| format!("R2 upload failed: {e}"))?;
                Ok(join_url(&self.public_base_url, &key))
            }
        }
    }

    pub async fn delete(&self, map_name: &str, res_type: &str) -> Result<(), String> {
        let key = self.object_key(map_name, res_type);
        match &self.backend {
            MapStorageBackend::Local { root } => {
                let path = Path::new(root).join(&key);
                if let Err(e) = tokio::fs::remove_file(&path).await {
                    return Err(format!("Failed to delete file {path:?}: {e}"));
                }
                Ok(())
            }
            MapStorageBackend::R2 { client, bucket } => {
                client
                    .delete_object()
                    .bucket(bucket)
                    .key(&key)
                    .send()
                    .await
                    .map_err(|e| format!("R2 delete failed: {e}"))?;
                Ok(())
            }
        }
    }
}

fn join_url(base: &str, key: &str) -> String {
    let base = base.trim_end_matches('/');
    let key = key.trim_start_matches('/');
    format!("{base}/{key}")
}

// ---------------------------------------------------------------------------
// CharacterStorage — mirrors MapStorage but for character 3D models.
// Env vars: CHARACTER_STORAGE_BACKEND, CHARACTER_OBJECT_PREFIX,
//           CHARACTER_PUBLIC_BASE_URL, CHARACTER_STORE_UPLOAD
// ---------------------------------------------------------------------------

#[derive(Clone)]
pub struct CharacterStorage {
    backend: MapStorageBackend,
    object_prefix: String,
    public_base_url: String,
}

impl CharacterStorage {
    pub async fn from_env() -> Result<Self, String> {
        let backend = get_env_default("CHARACTER_STORAGE_BACKEND")
            .or_else(|| get_env_default("MAP_STORAGE_BACKEND"))
            .unwrap_or_else(|| "local".to_string())
            .to_lowercase();

        let object_prefix = get_env_default("CHARACTER_OBJECT_PREFIX")
            .unwrap_or_default()
            .trim_matches('/')
            .to_string();

        let public_base_url = get_env_default("CHARACTER_PUBLIC_BASE_URL")
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| {
                if backend == "local" {
                    "/models/characters".to_string()
                } else {
                    String::new()
                }
            });

        if public_base_url.is_empty() {
            return Err("CHARACTER_PUBLIC_BASE_URL is required".to_string());
        }

        match backend.as_str() {
            "local" => {
                let root = get_env_default("CHARACTER_STORE_UPLOAD")
                    .unwrap_or_else(|| "./characters".to_string());
                Ok(Self {
                    backend: MapStorageBackend::Local { root },
                    object_prefix,
                    public_base_url,
                })
            }
            "r2" | "cloudflare" => {
                let endpoint = get_env_default("R2_ENDPOINT")
                    .ok_or("R2_ENDPOINT is required")?;
                let access_key = get_env_default("R2_ACCESS_KEY_ID")
                    .ok_or("R2_ACCESS_KEY_ID is required")?;
                let secret_key = get_env_default("R2_SECRET_ACCESS_KEY")
                    .ok_or("R2_SECRET_ACCESS_KEY is required")?;
                let bucket = get_env_default("R2_BUCKET")
                    .ok_or("R2_BUCKET is required")?;

                let credentials = Credentials::new(access_key, secret_key, None, None, "r2");
                let config = aws_sdk_s3::Config::builder()
                    .behavior_version(BehaviorVersion::v2026_01_12())
                    .region(Region::new("auto"))
                    .endpoint_url(endpoint)
                    .credentials_provider(credentials)
                    .build();
                let client = Client::from_conf(config);

                Ok(Self {
                    backend: MapStorageBackend::R2 { client, bucket },
                    object_prefix,
                    public_base_url,
                })
            }
            other => Err(format!("Unsupported CHARACTER_STORAGE_BACKEND: {other}")),
        }
    }

    pub fn is_local(&self) -> bool {
        matches!(self.backend, MapStorageBackend::Local { .. })
    }

    pub fn local_root(&self) -> Option<&str> {
        match &self.backend {
            MapStorageBackend::Local { root } => Some(root),
            _ => None,
        }
    }

    pub fn object_key(&self, model_id: &str) -> String {
        let filename = format!("{model_id}_char.glb");
        if self.object_prefix.is_empty() {
            format!("{model_id}/{filename}")
        } else {
            format!("{}/{model_id}/{filename}", self.object_prefix)
        }
    }

    pub fn public_url(&self, model_id: &str) -> String {
        let key = self.object_key(model_id);
        join_url(&self.public_base_url, &key)
    }

    pub fn normalize_link_path(&self, existing: &str, model_id: &str) -> String {
        let existing = existing.trim();
        if existing.starts_with("http://") || existing.starts_with("https://") {
            return existing.to_string();
        }
        self.public_url(model_id)
    }

    pub fn local_path(&self, model_id: &str) -> Option<PathBuf> {
        let root = self.local_root()?;
        let key = self.object_key(model_id);
        Some(Path::new(root).join(key))
    }

    pub async fn store_bytes(
        &self,
        model_id: &str,
        bytes: &[u8],
    ) -> Result<String, String> {
        let key = self.object_key(model_id);
        match &self.backend {
            MapStorageBackend::Local { root } => {
                let path = Path::new(root).join(&key);
                if let Some(parent) = path.parent() {
                    tokio::fs::create_dir_all(parent)
                        .await
                        .map_err(|e| format!("Failed to create directory: {e}"))?;
                }
                tokio::fs::write(&path, bytes)
                    .await
                    .map_err(|e| format!("Failed to write file: {e}"))?;
                Ok(join_url(&self.public_base_url, &key))
            }
            MapStorageBackend::R2 { client, bucket } => {
                let body = ByteStream::from(bytes.to_vec());
                client
                    .put_object()
                    .bucket(bucket)
                    .key(&key)
                    .content_type("model/gltf-binary")
                    .body(body)
                    .send()
                    .await
                    .map_err(|e| format!("R2 upload failed: {e}"))?;
                Ok(join_url(&self.public_base_url, &key))
            }
        }
    }

    pub async fn store_file(
        &self,
        model_id: &str,
        file_path: &Path,
    ) -> Result<String, String> {
        let key = self.object_key(model_id);
        match &self.backend {
            MapStorageBackend::Local { root } => {
                let target_path = Path::new(root).join(&key);
                if file_path != target_path {
                    if let Some(parent) = target_path.parent() {
                        tokio::fs::create_dir_all(parent)
                            .await
                            .map_err(|e| format!("Failed to create directory: {e}"))?;
                    }
                    tokio::fs::rename(file_path, &target_path)
                        .await
                        .map_err(|e| format!("Failed to move file: {e}"))?;
                }
                Ok(join_url(&self.public_base_url, &key))
            }
            MapStorageBackend::R2 { client, bucket } => {
                let body = ByteStream::from_path(file_path)
                    .await
                    .map_err(|e| format!("Failed to read file for upload: {e}"))?;
                client
                    .put_object()
                    .bucket(bucket)
                    .key(&key)
                    .content_type("model/gltf-binary")
                    .body(body)
                    .send()
                    .await
                    .map_err(|e| format!("R2 upload failed: {e}"))?;
                Ok(join_url(&self.public_base_url, &key))
            }
        }
    }

    pub async fn delete(&self, model_id: &str) -> Result<(), String> {
        let key = self.object_key(model_id);
        match &self.backend {
            MapStorageBackend::Local { root } => {
                let path = Path::new(root).join(&key);
                if let Err(e) = tokio::fs::remove_file(&path).await {
                    return Err(format!("Failed to delete file {path:?}: {e}"));
                }
                Ok(())
            }
            MapStorageBackend::R2 { client, bucket } => {
                client
                    .delete_object()
                    .bucket(bucket)
                    .key(&key)
                    .send()
                    .await
                    .map_err(|e| format!("R2 delete failed: {e}"))?;
                Ok(())
            }
        }
    }

    fn thumbnail_object_key(&self, model_id: &str, ext: &str) -> String {
        if self.object_prefix.is_empty() {
            format!("{model_id}/thumbnail.{ext}")
        } else {
            format!("{}/{model_id}/thumbnail.{ext}", self.object_prefix)
        }
    }

    pub async fn store_thumbnail(
        &self,
        model_id: &str,
        ext: &str,
        bytes: &[u8],
    ) -> Result<String, String> {
        match &self.backend {
            MapStorageBackend::Local { .. } => {
                let cache_dir = get_env_default("CACHE_THUMBNAIL").unwrap_or_default();
                let dir_path = Path::new(&cache_dir).join("characters");
                tokio::fs::create_dir_all(&dir_path)
                    .await
                    .map_err(|e| format!("Failed to create thumbnail directory: {e}"))?;
                let filename = format!("{model_id}.{ext}");
                tokio::fs::write(dir_path.join(&filename), bytes)
                    .await
                    .map_err(|e| format!("Failed to write thumbnail: {e}"))?;
                Ok(filename)
            }
            MapStorageBackend::R2 { client, bucket } => {
                let key = self.thumbnail_object_key(model_id, ext);
                let content_type = match ext {
                    "png" => "image/png",
                    "webp" => "image/webp",
                    _ => "image/jpeg",
                };
                let body = ByteStream::from(bytes.to_vec());
                client
                    .put_object()
                    .bucket(bucket)
                    .key(&key)
                    .content_type(content_type)
                    .body(body)
                    .send()
                    .await
                    .map_err(|e| format!("R2 thumbnail upload failed: {e}"))?;
                Ok(join_url(&self.public_base_url, &key))
            }
        }
    }

    pub async fn delete_thumbnail(&self, model_id: &str, stored: &str) -> Result<(), String> {
        match &self.backend {
            MapStorageBackend::Local { .. } => {
                let cache_dir = get_env_default("CACHE_THUMBNAIL").unwrap_or_default();
                let path = Path::new(&cache_dir).join("characters").join(stored);
                if let Err(e) = tokio::fs::remove_file(&path).await {
                    return Err(format!("Failed to delete thumbnail {path:?}: {e}"));
                }
                Ok(())
            }
            MapStorageBackend::R2 { client, bucket } => {
                let ext = stored.rsplit('.').next().unwrap_or("jpg");
                let key = self.thumbnail_object_key(model_id, ext);
                client
                    .delete_object()
                    .bucket(bucket)
                    .key(&key)
                    .send()
                    .await
                    .map_err(|e| format!("R2 thumbnail delete failed: {e}"))?;
                Ok(())
            }
        }
    }
}
