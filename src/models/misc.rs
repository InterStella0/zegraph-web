use time::OffsetDateTime;
use uuid::Uuid;
use crate::api_models::admins::{CommunityLinkResponse, SpecialThanksResponse};
use crate::core::utils::db_to_utc;
use crate::models::admins::DonorResponse;

pub struct DbCommunityLink {
    pub id: Uuid,
    pub name: String,
    pub url: String,
    pub description: Option<String>,
    pub sort_order: i32,
    pub created_at: OffsetDateTime,
}

impl From<DbCommunityLink> for CommunityLinkResponse {
    fn from(l: DbCommunityLink) -> Self {
        CommunityLinkResponse {
            id: l.id.to_string(),
            name: l.name,
            url: l.url,
            description: l.description,
            sort_order: l.sort_order,
            created_at: db_to_utc(l.created_at),
        }
    }
}

pub struct DbSpecialThanks {
    pub id: Uuid,
    pub display_name: String,
    pub description: String,
}

impl From<DbSpecialThanks> for SpecialThanksResponse {
    fn from(d: DbSpecialThanks) -> Self {
        SpecialThanksResponse {
            id: d.id.to_string(),
            display_name: d.display_name,
            description: d.description,
        }
    }
}

pub struct DbDonor {
    pub id: Uuid,
    pub display_name: String,
    pub amount: f64,
    pub message: Option<String>,
    pub donated_at: OffsetDateTime,
}

impl From<DbDonor> for DonorResponse {
    fn from(d: DbDonor) -> Self {
        DonorResponse {
            id: d.id.to_string(),
            display_name: d.display_name,
            amount: d.amount,
            message: d.message,
            donated_at: db_to_utc(d.donated_at),
        }
    }
}
