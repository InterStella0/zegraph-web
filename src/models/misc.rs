use serde_macros::DbInto;
use time::OffsetDateTime;
use uuid::Uuid;
use crate::api_models::admins::{CommunityLinkResponse, SpecialThanksResponse};
use crate::core::utils::TimeToChrono;

#[derive(DbInto)]
#[db_into(CommunityLinkResponse)]
pub struct DbCommunityLink {
    #[method(to_string)]
    pub id: Uuid,
    pub name: String,
    pub url: String,
    pub description: Option<String>,
    pub sort_order: i32,
    pub created_at: OffsetDateTime,
}

#[derive(DbInto)]
#[db_into(SpecialThanksResponse)]
pub struct DbSpecialThanks {
    #[method(to_string)]
    pub id: Uuid,
    pub display_name: String,
    pub description: String,
}

