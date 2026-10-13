use poem::web::Data;
use poem_openapi::payload::Json;
use poem_openapi::OpenApi;
use poem_openapi::param::Path;
use uuid::Uuid;

use crate::core::utils::*;
use crate::{or_ise, require, response, AppData};
use crate::api_models::admins::*;
use crate::api_models::common::*;
use crate::models::misc::*;
use crate::routers::ApiTags;

pub struct ZeCommunityLinksApi;


fn is_valid_url(url: &str) -> bool {
    let url = url.trim();
    url.starts_with("http://") || url.starts_with("https://")
}

#[OpenApi(tag = "ApiTags::CommunityLinks")]
impl ZeCommunityLinksApi {
    /// List curated external ZE community links, in display order.
    #[oai(path = "/community-links", method = "get")]
    async fn get_links(
        &self,
        Data(data): Data<&AppData>,
    ) -> Response<Vec<CommunityLinkResponse>> {
        let links = or_ise!(sqlx::query_as!(
            DbCommunityLink,
            r#"
            SELECT id, name, url, description, sort_order, created_at
            FROM website.ze_community_links
            ORDER BY sort_order ASC, created_at ASC
            "#
        )
        .fetch_all(&*data.pool)
        .await, e => "Failed to fetch community links: {}", e);

        response!(ok links.into_iter().map(Into::into).collect())
    }

    /// Add a community link. Requires the `superuser` role; `url` must be http(s).
    #[oai(path = "/community-links", method = "post")]
    async fn create_link(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
        Json(payload): Json<CreateCommunityLinkPayload>,
    ) -> Response<CommunityLinkResponse> {
        require!(check_superuser(data, user_token.id).await, "Unauthorized", ErrorCode::Forbidden);

        if payload.name.trim().is_empty() {
            return response!(err "Name cannot be empty", ErrorCode::BadRequest);
        }
        if payload.name.len() > 100 {
            return response!(err "Name must be 100 characters or fewer", ErrorCode::BadRequest);
        }
        require!(is_valid_url(&payload.url), "URL must start with http:// or https://", ErrorCode::BadRequest);
        if payload.url.len() > 500 {
            return response!(err "URL must be 500 characters or fewer", ErrorCode::BadRequest);
        }

        let link = or_ise!(sqlx::query_as!(
            DbCommunityLink,
            r#"
            INSERT INTO website.ze_community_links (name, url, description, sort_order)
            VALUES ($1, $2, $3, COALESCE($4, 0))
            RETURNING id, name, url, description, sort_order, created_at
            "#,
            payload.name,
            payload.url,
            payload.description,
            payload.sort_order,
        )
        .fetch_one(&*data.pool)
        .await, e => "Failed to create community link: {}", e);

        response!(ok link.into())
    }

    /// Update a community link's fields. Requires the `superuser` role.
    #[oai(path = "/community-links/:id", method = "put")]
    async fn update_link(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
        Path(id): Path<String>,
        Json(payload): Json<UpdateCommunityLinkPayload>,
    ) -> Response<CommunityLinkResponse> {
        let id = match Uuid::parse_str(&id) {
            Ok(u) => u,
            Err(_) => return response!(err "Invalid id", ErrorCode::BadRequest),
        };
        require!(check_superuser(data, user_token.id).await, "Unauthorized", ErrorCode::Forbidden);

        if let Some(ref name) = payload.name {
            if name.trim().is_empty() {
                return response!(err "Name cannot be empty", ErrorCode::BadRequest);
            }
            if name.len() > 100 {
                return response!(err "Name must be 100 characters or fewer", ErrorCode::BadRequest);
            }
        }
        if let Some(ref url) = payload.url {
            require!(is_valid_url(url), "URL must start with http:// or https://", ErrorCode::BadRequest);
            if url.len() > 500 {
                return response!(err "URL must be 500 characters or fewer", ErrorCode::BadRequest);
            }
        }

        let Some(link) = or_ise!(sqlx::query_as!(
            DbCommunityLink,
            r#"
            UPDATE website.ze_community_links
            SET
                name        = COALESCE($2, name),
                url         = COALESCE($3, url),
                description = CASE WHEN $4 THEN $5 ELSE description END,
                sort_order  = COALESCE($6, sort_order)
            WHERE id = $1
            RETURNING id, name, url, description, sort_order, created_at
            "#,
            id,
            payload.name,
            payload.url,
            payload.description.is_some(),
            payload.description,
            payload.sort_order,
        )
        .fetch_optional(&*data.pool)
        .await, e => "Failed to update community link: {}", e) else {
            return response!(err "Community link not found", ErrorCode::NotFound);
        };

        response!(ok link.into())
    }

    /// Delete a community link. Requires the `superuser` role.
    #[oai(path = "/community-links/:id", method = "delete")]
    async fn delete_link(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
        Path(id): Path<String>,
    ) -> Response<bool> {
        let id = match Uuid::parse_str(&id) {
            Ok(u) => u,
            Err(_) => return response!(err "Invalid id", ErrorCode::BadRequest),
        };
        require!(check_superuser(data, user_token.id).await, "Unauthorized", ErrorCode::Forbidden);

        let result = or_ise!(sqlx::query!(
            "DELETE FROM website.ze_community_links WHERE id = $1",
            id,
        )
        .execute(&*data.pool)
        .await, e => "Failed to delete community link: {}", e);

        if result.rows_affected() == 0 {
            return response!(err "Community link not found", ErrorCode::NotFound);
        }

        response!(ok true)
    }
}
