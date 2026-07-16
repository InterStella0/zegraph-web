use poem_openapi::Object;

#[derive(Object)]
pub struct CountryStatistic{
    pub code: String,
    pub name: String,
    pub count: i64
}

#[derive(Object)]
pub struct CountriesStatistics{
    pub in_view_count: i64,
    pub total_count: i64,
    pub countries: Vec<CountryStatistic>,
}

#[derive(Object)]
pub struct ContinentStatistic{
    pub name: String,
    pub count: i64
}

#[derive(Object)]
pub struct ContinentStatistics{
    pub contain_countries: i64,
    pub total_count: i64,
    pub continents: Vec<ContinentStatistic>,
}

#[derive(Object)]
pub struct CountryPlayer{
    pub id: String,
    pub name: String,
    pub total_playtime: f64,
    pub total_player_count: i64,
    pub session_count: i64,
    pub is_anonymous: bool,
}

#[derive(Object)]
pub struct CountryPlayers{
    pub geojson: String,  // Limited to String instead of hashmaps due to poem not allowing dynamic.
    pub count: i64,
    pub name: String,
    pub code: String,
    pub players: Vec<CountryPlayer>
}
