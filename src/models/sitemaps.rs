use time::OffsetDateTime;

pub struct DbPlayerSitemap{
    pub server_id: Option<String>,
    pub server_readable_link: Option<String>,
    pub player_id: Option<String>,
    pub recent_online: Option<OffsetDateTime>,
}

pub struct DbMapSitemap{
    pub server_id: Option<String>,
    pub server_readable_link: Option<String>,
    pub map_name: Option<String>,
    pub last_played: Option<OffsetDateTime>,
}

pub struct DbServerSitemap{
    pub server_id: Option<String>,
    pub readable_link: Option<String>,
}

pub struct DbGuideSitemap{
    pub map_name: String,
    pub server_id: Option<String>,
    pub server_readable_link: Option<String>,
    pub slug: String,
    pub updated_at: OffsetDateTime,
}
