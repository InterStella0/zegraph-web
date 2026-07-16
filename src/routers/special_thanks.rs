use poem::web::Data;
use poem_openapi::payload::Json;
use poem_openapi::OpenApi;
use poem_openapi::param::Path;
use uuid::Uuid;

use crate::core::utils::*;
use crate::{response, AppData};
use crate::api_models::admins::*;
use crate::api_models::common::*;
use crate::models::misc::DbSpecialThanks;

pub struct SpecialThanksApi;


#[OpenApi]
impl SpecialThanksApi {
    #[oai(path = "/special-thanks", method = "get")]
    async fn get_special_thanks(
        &self,
        Data(data): Data<&AppData>,
    ) -> Response<Vec<SpecialThanksResponse>> {
        let entries = match sqlx::query_as!(
            DbSpecialThanks,
            r#"
            SELECT id, display_name, description
            FROM website.special_thanks
            ORDER BY created_at ASC
            "#
        )
        .fetch_all(&*data.pool)
        .await
        {
            Ok(rows) => rows,
            Err(e) => {
                tracing::error!("Failed to fetch special thanks: {}", e);
                return response!(internal_server_error);
            }
        };

        response!(ok entries.into_iter().map(Into::into).collect())
    }

    #[oai(path = "/special-thanks", method = "post")]
    async fn create_special_thanks(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
        Json(payload): Json<CreateSpecialThanksPayload>,
    ) -> Response<SpecialThanksResponse> {
        if !check_superuser(data, user_token.id).await {
            return response!(err "Unauthorized", ErrorCode::Forbidden);
        }

        if payload.display_name.trim().is_empty() {
            return response!(err "Display name cannot be empty", ErrorCode::BadRequest);
        }
        if payload.display_name.len() > 100 {
            return response!(err "Display name must be 100 characters or fewer", ErrorCode::BadRequest);
        }
        if payload.description.trim().is_empty() {
            return response!(err "Description cannot be empty", ErrorCode::BadRequest);
        }

        let entry = match sqlx::query_as!(
            DbSpecialThanks,
            r#"
            INSERT INTO website.special_thanks (display_name, description)
            VALUES ($1, $2)
            RETURNING id, display_name, description
            "#,
            payload.display_name,
            payload.description,
        )
        .fetch_one(&*data.pool)
        .await
        {
            Ok(row) => row,
            Err(e) => {
                tracing::error!("Failed to create special thanks entry: {}", e);
                return response!(internal_server_error);
            }
        };

        response!(ok entry.into())
    }

    #[oai(path = "/special-thanks/:id", method = "put")]
    async fn update_special_thanks(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
        Path(id): Path<String>,
        Json(payload): Json<UpdateSpecialThanksPayload>,
    ) -> Response<SpecialThanksResponse> {
        let id = match Uuid::parse_str(&id) {
            Ok(u) => u,
            Err(_) => return response!(err "Invalid id", ErrorCode::BadRequest),
        };
        if !check_superuser(data, user_token.id).await {
            return response!(err "Unauthorized", ErrorCode::Forbidden);
        }

        if let Some(ref name) = payload.display_name {
            if name.trim().is_empty() {
                return response!(err "Display name cannot be empty", ErrorCode::BadRequest);
            }
            if name.len() > 100 {
                return response!(err "Display name must be 100 characters or fewer", ErrorCode::BadRequest);
            }
        }
        if let Some(ref description) = payload.description {
            if description.trim().is_empty() {
                return response!(err "Description cannot be empty", ErrorCode::BadRequest);
            }
        }

        let entry = match sqlx::query_as!(
            DbSpecialThanks,
            r#"
            UPDATE website.special_thanks
            SET
                display_name = COALESCE($2, display_name),
                description  = COALESCE($3, description)
            WHERE id = $1
            RETURNING id, display_name, description
            "#,
            id,
            payload.display_name,
            payload.description,
        )
        .fetch_optional(&*data.pool)
        .await
        {
            Ok(Some(row)) => row,
            Ok(None) => return response!(err "Entry not found", ErrorCode::NotFound),
            Err(e) => {
                tracing::error!("Failed to update special thanks entry: {}", e);
                return response!(internal_server_error);
            }
        };

        response!(ok entry.into())
    }

    #[oai(path = "/special-thanks/:id", method = "delete")]
    async fn delete_special_thanks(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
        Path(id): Path<String>,
    ) -> Response<bool> {
        let id = match Uuid::parse_str(&id) {
            Ok(u) => u,
            Err(_) => return response!(err "Invalid id", ErrorCode::BadRequest),
        };
        if !check_superuser(data, user_token.id).await {
            return response!(err "Unauthorized", ErrorCode::Forbidden);
        }

        let result = match sqlx::query!(
            "DELETE FROM website.special_thanks WHERE id = $1",
            id,
        )
        .execute(&*data.pool)
        .await
        {
            Ok(r) => r,
            Err(e) => {
                tracing::error!("Failed to delete special thanks entry: {}", e);
                return response!(internal_server_error);
            }
        };

        if result.rows_affected() == 0 {
            return response!(err "Entry not found", ErrorCode::NotFound);
        }

        response!(ok true)
    }
}

impl UriPatternExt for SpecialThanksApi {
    fn get_all_patterns(&self) -> Vec<RoutePattern<'_>> {
        vec![
            "/special-thanks",
            "/special-thanks/{id}",
        ].iter_into()
    }
}
