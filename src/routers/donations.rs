use chrono::Utc;
use poem::web::Data;
use poem_openapi::payload::Json;
use poem_openapi::OpenApi;
use poem_openapi::param::Path;
use uuid::Uuid;

use crate::core::utils::*;
use crate::{response, AppData};
use crate::api_models::common::*;
use crate::models::admins::*;
use crate::models::misc::DbDonor;
use crate::routers::ApiTags;

pub struct DonationsApi;

#[OpenApi(tag = "ApiTags::Donations")]
impl DonationsApi {
    /// List donors, highest amount first.
    #[oai(path = "/donations", method = "get")]
    async fn get_donors(
        &self,
        Data(data): Data<&AppData>,
    ) -> Response<Vec<DonorResponse>> {
        let pool = &*data.pool.clone();
        let func = || sqlx::query_as!(
            DbDonor,
            r#"
            SELECT id, display_name, amount::float8 as "amount!: f64", message, donated_at
            FROM website.kofi_donors
            ORDER BY amount DESC, donated_at ASC
            "#
        )
        .fetch_all(pool);

        let Ok(value) = cached_response("donors", &data.cache, HOUR, func).await else {
            tracing::error!("Failed to fetch donors");
            return response!(internal_server_error);
        };

        response!(ok value.result.into_iter().map(Into::into).collect())
    }

    /// Add a donor entry. Requires the `superuser` role.
    #[oai(path = "/donations", method = "post")]
    async fn create_donor(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
        Json(payload): Json<CreateDonorPayload>,
    ) -> Response<DonorResponse> {
        if !check_superuser(data, user_token.id).await {
            return response!(err "Unauthorized", ErrorCode::Forbidden);
        }

        if payload.display_name.trim().is_empty() {
            return response!(err "Display name cannot be empty", ErrorCode::BadRequest);
        }
        if payload.display_name.len() > 100 {
            return response!(err "Display name must be 100 characters or fewer", ErrorCode::BadRequest);
        }

        let donated_at = payload.donated_at.unwrap_or_else(Utc::now).to_db_time();

        let donor = match sqlx::query_as!(
            DbDonor,
            r#"
            INSERT INTO website.kofi_donors (display_name, amount, message, donated_at)
            VALUES ($1, $2::float8::numeric(10,2), $3, $4)
            RETURNING id, display_name, amount::float8 as "amount!: f64", message, donated_at
            "#,
            payload.display_name,
            payload.amount,
            payload.message,
            donated_at,
        )
        .fetch_one(&*data.pool)
        .await
        {
            Ok(row) => row,
            Err(e) => {
                tracing::error!("Failed to create donor: {}", e);
                return response!(internal_server_error);
            }
        };

        response!(ok donor.into())
    }

    /// Update a donor entry's fields. Requires the `superuser` role.
    #[oai(path = "/donations/:id", method = "put")]
    async fn update_donor(
        &self,
        Data(data): Data<&AppData>,
        TokenBearer(user_token): TokenBearer,
        Path(id): Path<String>,
        Json(payload): Json<UpdateDonorPayload>,
    ) -> Response<DonorResponse> {
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

        let donated_at = payload.donated_at.map(|d| d.to_db_time());

        let donor = match sqlx::query_as!(
            DbDonor,
            r#"
            UPDATE website.kofi_donors
            SET
                display_name = COALESCE($2, display_name),
                amount       = COALESCE($3::float8::numeric(10,2), amount),
                message      = CASE WHEN $4 THEN $5 ELSE message END,
                donated_at   = COALESCE($6, donated_at)
            WHERE id = $1
            RETURNING id, display_name, amount::float8 as "amount!: f64", message, donated_at
            "#,
            id,
            payload.display_name,
            payload.amount,
            payload.message.is_some(),
            payload.message,
            donated_at,
        )
        .fetch_optional(&*data.pool)
        .await
        {
            Ok(Some(row)) => row,
            Ok(None) => return response!(err "Donor not found", ErrorCode::NotFound),
            Err(e) => {
                tracing::error!("Failed to update donor: {}", e);
                return response!(internal_server_error);
            }
        };

        response!(ok donor.into())
    }

    /// Delete a donor entry. Requires the `superuser` role.
    #[oai(path = "/donations/:id", method = "delete")]
    async fn delete_donor(
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
            "DELETE FROM website.kofi_donors WHERE id = $1",
            id,
        )
        .execute(&*data.pool)
        .await
        {
            Ok(r) => r,
            Err(e) => {
                tracing::error!("Failed to delete donor: {}", e);
                return response!(internal_server_error);
            }
        };

        if result.rows_affected() == 0 {
            return response!(err "Donor not found", ErrorCode::NotFound);
        }

        response!(ok true)
    }
}

impl UriPatternExt for DonationsApi {
    fn get_all_patterns(&self) -> Vec<RoutePattern> {
        vec![
            "/donations",
            "/donations/{id}",
        ].iter_into()
    }
}
