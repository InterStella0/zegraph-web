
type SitemapServer = {
    server_id: string
    readable_link: string | null
}

type SitemapMap = {
    server_id: string
    server_readable_link: string | null
    map_name: string
    last_played: string | null
}

type SitemapPlayer = {
    server_id: string
    server_readable_link: string | null
    player_id: string
    recent_online: string | null
}
type SitemapData = {
    servers: SitemapServer[]
    maps: SitemapMap[]
    players: SitemapPlayer[]
}
