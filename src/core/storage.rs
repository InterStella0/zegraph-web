use std::path::{Path, PathBuf};
use std::sync::Arc;

use aws_credential_types::Credentials;
use aws_sdk_s3::config::BehaviorVersion;
use aws_sdk_s3::primitives::ByteStream;
use aws_sdk_s3::{Client, config::Region};

use crate::core::utils::get_env_default;

#[derive(Clone)]
pub(crate) enum StorageBackend {
    Local { root: String },
    R2 { client: Client, bucket: String, public_base_url: String },
}

impl StorageBackend {
    pub(crate) async fn from_env() -> Result<Arc<Self>, String> {
        let backend = get_env_default("STORAGE_BACKEND")
            .unwrap_or_else(|| "local".to_string())
            .to_lowercase();

        match backend.as_str() {
            "local" => {
                let root = get_env_default("STORE_UPLOAD")
                    .unwrap_or_else(|| "./storage".to_string());
                Ok(Arc::new(StorageBackend::Local { root }))
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
                let public_base_url = get_env_default("R2_PUBLIC_BASE_URL")
                    .ok_or("R2_PUBLIC_BASE_URL is required")?;

                let credentials = Credentials::new(access_key, secret_key, None, None, "r2");
                let config = aws_sdk_s3::Config::builder()
                    .behavior_version(BehaviorVersion::v2026_01_12())
                    .region(Region::new("auto"))
                    .endpoint_url(endpoint)
                    .credentials_provider(credentials)
                    .build();
                let client = Client::from_conf(config);

                Ok(Arc::new(StorageBackend::R2 { client, bucket, public_base_url }))
            }
            other => Err(format!("Unsupported STORAGE_BACKEND: {other}")),
        }
    }

    fn is_local(&self) -> bool {
        matches!(self, StorageBackend::Local { .. })
    }

    fn public_base_url(&self) -> &str {
        match self {
            StorageBackend::Local { .. } => "/models",
            StorageBackend::R2 { public_base_url, .. } => public_base_url,
        }
    }

    fn local_root(&self) -> Option<&str> {
        match self {
            StorageBackend::Local { root } => Some(root),
            _ => None,
        }
    }

    fn local_path(&self, key: &str) -> Option<PathBuf> {
        self.local_root().map(|root| Path::new(root).join(key))
    }

    async fn store_bytes(&self, key: &str, bytes: &[u8], content_type: &str) -> Result<(), String> {
        match self {
            StorageBackend::Local { root } => {
                let path = Path::new(root).join(key);
                if let Some(parent) = path.parent() {
                    tokio::fs::create_dir_all(parent)
                        .await
                        .map_err(|e| format!("Failed to create directory: {e}"))?;
                }
                tokio::fs::write(&path, bytes)
                    .await
                    .map_err(|e| format!("Failed to write file: {e}"))
            }
            StorageBackend::R2 { client, bucket, .. } => {
                let body = ByteStream::from(bytes.to_vec());
                client
                    .put_object()
                    .bucket(bucket)
                    .key(key)
                    .content_type(content_type)
                    .body(body)
                    .send()
                    .await
                    .map_err(|e| format!("R2 upload failed: {e}"))?;
                Ok(())
            }
        }
    }

    async fn store_file(&self, key: &str, file_path: &Path, content_type: &str) -> Result<(), String> {
        match self {
            StorageBackend::Local { root } => {
                let target_path = Path::new(root).join(key);
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
                Ok(())
            }
            StorageBackend::R2 { client, bucket, .. } => {
                let body = ByteStream::from_path(file_path)
                    .await
                    .map_err(|e| format!("Failed to read file for upload: {e}"))?;
                client
                    .put_object()
                    .bucket(bucket)
                    .key(key)
                    .content_type(content_type)
                    .body(body)
                    .send()
                    .await
                    .map_err(|e| format!("R2 upload failed: {e}"))?;
                Ok(())
            }
        }
    }

    async fn delete(&self, key: &str) -> Result<(), String> {
        match self {
            StorageBackend::Local { root } => {
                let path = Path::new(root).join(key);
                tokio::fs::remove_file(&path)
                    .await
                    .map_err(|e| format!("Failed to delete file {path:?}: {e}"))
            }
            StorageBackend::R2 { client, bucket, .. } => {
                client
                    .delete_object()
                    .bucket(bucket)
                    .key(key)
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

#[derive(Clone)]
struct StorageNamespace {
    backend: Arc<StorageBackend>,
    object_prefix: &'static str,
}

impl StorageNamespace {
    fn build_key(&self, path: &str) -> String {
        format!("{}/{path}", self.object_prefix)
    }

    fn public_url(&self, path: &str) -> String {
        join_url(self.backend.public_base_url(), &self.build_key(path))
    }

    fn normalize_link_path(&self, existing: &str, path: &str) -> String {
        let existing = existing.trim();
        if existing.starts_with("http://") || existing.starts_with("https://") {
            return existing.to_string();
        }
        self.public_url(path)
    }

    fn is_local(&self) -> bool {
        self.backend.is_local()
    }

    fn local_path(&self, path: &str) -> Option<PathBuf> {
        self.backend.local_path(&self.build_key(path))
    }

    async fn store_bytes(&self, path: &str, bytes: &[u8], content_type: &str) -> Result<String, String> {
        self.backend.store_bytes(&self.build_key(path), bytes, content_type).await?;
        Ok(self.public_url(path))
    }

    async fn store_file(&self, path: &str, file_path: &Path, content_type: &str) -> Result<String, String> {
        self.backend.store_file(&self.build_key(path), file_path, content_type).await?;
        Ok(self.public_url(path))
    }

    async fn delete(&self, path: &str) -> Result<(), String> {
        self.backend.delete(&self.build_key(path)).await
    }
}

#[derive(Clone)]
pub struct MapStorage {
    ns: StorageNamespace,
}

impl MapStorage {
    pub fn new(backend: Arc<StorageBackend>) -> Self {
        Self {
            ns: StorageNamespace { backend, object_prefix: "maps" },
        }
    }

    fn resource_path(map_name: &str, res_type: &str) -> String {
        format!("{map_name}/{map_name}_d_c_{res_type}.glb")
    }

    pub fn is_local(&self) -> bool {
        self.ns.is_local()
    }

    pub fn local_root(&self) -> Option<&str> {
        self.ns.backend.local_root()
    }

    pub fn object_key(&self, map_name: &str, res_type: &str) -> String {
        self.ns.build_key(&Self::resource_path(map_name, res_type))
    }

    pub fn public_url(&self, map_name: &str, res_type: &str) -> String {
        self.ns.public_url(&Self::resource_path(map_name, res_type))
    }

    pub fn normalize_link_path(&self, existing: &str, map_name: &str, res_type: &str) -> String {
        self.ns.normalize_link_path(existing, &Self::resource_path(map_name, res_type))
    }

    pub fn local_path(&self, map_name: &str, res_type: &str) -> Option<PathBuf> {
        self.ns.local_path(&Self::resource_path(map_name, res_type))
    }

    pub async fn store_bytes(&self, map_name: &str, res_type: &str, bytes: &[u8]) -> Result<String, String> {
        self.ns.store_bytes(&Self::resource_path(map_name, res_type), bytes, "model/gltf-binary").await
    }

    pub async fn store_file(&self, map_name: &str, res_type: &str, file_path: &Path) -> Result<String, String> {
        self.ns.store_file(&Self::resource_path(map_name, res_type), file_path, "model/gltf-binary").await
    }

    pub async fn delete(&self, map_name: &str, res_type: &str) -> Result<(), String> {
        self.ns.delete(&Self::resource_path(map_name, res_type)).await
    }
}

#[derive(Clone)]
pub struct CharacterStorage {
    ns: StorageNamespace,
}

impl CharacterStorage {
    pub fn new(backend: Arc<StorageBackend>) -> Self {
        Self {
            ns: StorageNamespace { backend, object_prefix: "characters" },
        }
    }

    fn resource_path(model_id: &str) -> String {
        format!("{model_id}/{model_id}_char.glb")
    }

    fn thumbnail_path(model_id: &str, ext: &str) -> String {
        format!("{model_id}/thumbnail.{ext}")
    }

    pub fn is_local(&self) -> bool {
        self.ns.is_local()
    }

    pub fn local_root(&self) -> Option<&str> {
        self.ns.backend.local_root()
    }

    pub fn object_key(&self, model_id: &str) -> String {
        self.ns.build_key(&Self::resource_path(model_id))
    }

    pub fn public_url(&self, model_id: &str) -> String {
        self.ns.public_url(&Self::resource_path(model_id))
    }

    pub fn normalize_link_path(&self, existing: &str, model_id: &str) -> String {
        self.ns.normalize_link_path(existing, &Self::resource_path(model_id))
    }

    pub fn local_path(&self, model_id: &str) -> Option<PathBuf> {
        self.ns.local_path(&Self::resource_path(model_id))
    }

    pub async fn store_bytes(&self, model_id: &str, bytes: &[u8]) -> Result<String, String> {
        self.ns.store_bytes(&Self::resource_path(model_id), bytes, "model/gltf-binary").await
    }

    pub async fn store_file(&self, model_id: &str, file_path: &Path) -> Result<String, String> {
        self.ns.store_file(&Self::resource_path(model_id), file_path, "model/gltf-binary").await
    }

    pub async fn delete(&self, model_id: &str) -> Result<(), String> {
        self.ns.delete(&Self::resource_path(model_id)).await
    }

    pub async fn store_thumbnail(&self, model_id: &str, ext: &str, bytes: &[u8]) -> Result<String, String> {
        let content_type = match ext {
            "png" => "image/png",
            "webp" => "image/webp",
            _ => "image/jpeg",
        };
        self.ns.store_bytes(&Self::thumbnail_path(model_id, ext), bytes, content_type).await
    }

    pub async fn delete_thumbnail(&self, model_id: &str, stored: &str) -> Result<(), String> {
        let ext = stored.rsplit('.').next().unwrap_or("jpg");
        self.ns.delete(&Self::thumbnail_path(model_id, ext)).await
    }
}

#[derive(Clone)]
pub struct CommunityStorage {
    ns: StorageNamespace,
}
// TODO: Rename prefix from models to uploads
impl CommunityStorage {
    pub fn new(backend: Arc<StorageBackend>) -> Self {
        Self {
            ns: StorageNamespace { backend, object_prefix: "communities" },
        }
    }

    fn icon_path(community_id: &str, ext: &str) -> String {
        format!("{community_id}/icon.{ext}")
    }

    pub async fn store_icon(&self, community_id: &str, ext: &str, bytes: &[u8]) -> Result<String, String> {
        let content_type = match ext {
            "png" => "image/png",
            "webp" => "image/webp",
            _ => "image/jpeg",
        };
        self.ns.store_bytes(&Self::icon_path(community_id, ext), bytes, content_type).await
    }

    pub async fn delete_icon(&self, community_id: &str, stored_url: &str) -> Result<(), String> {
        let ext = stored_url.rsplit('.').next().unwrap_or("jpg");
        self.ns.delete(&Self::icon_path(community_id, ext)).await
    }
}
