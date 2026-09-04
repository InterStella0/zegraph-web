use poem_openapi::Object;

/// Player count for one country.
#[derive(Object)]
pub struct CountryStatistic{
    /// ISO 3166-1 alpha-2 country code.
    pub code: String,
    pub name: String,
    pub count: i64
}

/// Country-level breakdown of a server's players.
#[derive(Object)]
pub struct CountriesStatistics{
    /// Number of players whose country was resolved and is included in `countries`.
    pub in_view_count: i64,
    /// Total players considered, including those with no resolved country.
    pub total_count: i64,
    pub countries: Vec<CountryStatistic>,
}

/// Player count for one continent.
#[derive(Object)]
pub struct ContinentStatistic{
    pub name: String,
    pub count: i64
}

/// Continent-level breakdown of a server's players.
#[derive(Object)]
pub struct ContinentStatistics{
    /// Number of players whose country (and therefore continent) was resolved.
    pub contain_countries: i64,
    /// Total players considered, including those with no resolved country.
    pub total_count: i64,
    pub continents: Vec<ContinentStatistic>,
}

/// A player located within a queried country.
#[derive(Object)]
pub struct CountryPlayer{
    pub id: String,
    pub name: String,
    pub total_playtime: f64,
    /// Total players found in this country, across all pages.
    pub total_player_count: i64,
    pub session_count: i64,
    pub is_anonymous: bool,
    /// `true` when this player opted into anonymization for this community, regardless of whether
    /// the requester is allowed to see the real name. `is_anonymous` says "this row is masked for
    /// you"; this says "the public sees Anonymous here". The frontend renders a `(Hidden)` marker
    /// off it so a privileged viewer isn't fooled into thinking their toggle did nothing.
    pub hidden_from_others: bool,
}

/// A country's boundary and the players found within it, for the map radar view.
#[derive(Object)]
pub struct CountryPlayers{
    /// The country's boundary as a GeoJSON string. Limited to `String` instead of a dynamic
    /// object since poem-openapi does not support dynamically-shaped schemas.
    pub geojson: String,
    pub count: i64,
    pub name: String,
    /// ISO 3166-1 alpha-2 country code.
    pub code: String,
    pub players: Vec<CountryPlayer>
}
