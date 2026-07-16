use serde::{Deserialize, Serialize};
use serde_macros::{auto_serde_with, DbInto};
use sqlx::postgres::types::PgInterval;
use crate::api_models::radars::*;
use crate::core::utils::*;
use crate::global_serializer::*;

#[derive(Serialize, Deserialize, DbInto)]
#[db_into(CountryStatistic)]
pub struct DbCountryStatistic{
    #[rename(code)]
    #[default("Unknown".into())]
    pub country_code: Option<String>,
    #[rename(name)]
    #[default("Unknown".into())]
    pub country_name: Option<String>,
    #[rename(count)]
    #[default(0)]
    pub players_per_country: Option<i64>,
    #[skip]
    pub total_players: Option<i64>,
}
#[derive(Serialize, Deserialize, DbInto)]
#[db_into(ContinentStatistic)]
pub struct DbContinentStatistic{
    #[rename(name)]
    #[default("Unknown".into())]
    pub continent: Option<String>,
    #[rename(count)]
    #[default(0)]
    pub players_per_continent: Option<i64>,
    #[skip]
    pub total_players: Option<i64>,
}

#[derive(DbInto)]
#[auto_serde_with]
#[db_into(CountryPlayer)]
pub struct DbCountryPlayer{
    #[rename(id)]
    #[default("Unknown".into())]
    pub player_id: Option<String>,
    #[rename(name)]
    #[default("Unknown".into())]
    pub player_name: Option<String>,
    #[default(0)]
    pub session_count: Option<i64>,
    #[skip]
    pub location_country: Option<String>,
    pub total_playtime: Option<PgInterval>,
    #[default(0)]
    pub total_player_count: Option<i64>,
    pub is_anonymous: bool,
}

#[derive(Serialize, Deserialize)]
pub struct DbCountryGeometry{
    pub country_name: Option<String>,
    pub geometry: Option<String>,
    pub country_code: Option<String>,
}
