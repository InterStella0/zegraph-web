pub mod graphs;
pub mod players;
pub mod maps;
pub mod misc;
pub mod radars;
pub mod servers;
pub mod accounts;
pub mod characters;
pub mod donations;
pub mod special_thanks;
pub mod ze_community_links;
pub mod admin_maps;
pub mod admin_audit;
pub mod admin_servers;

use poem_openapi::Tags;

/// Groups used to organize endpoints in the Swagger UI sidebar.
#[derive(Tags)]
pub enum ApiTags {
    /// Communities and the servers within them.
    Servers,
    /// Player search, profiles, sessions and playtime stats.
    Players,
    /// Time-series graph data for the frontend's charts.
    Graphs,
    /// Map listings, sessions, analysis and 3D model metadata.
    Maps,
    /// 3D model uploads and downloads for maps.
    Models3D,
    /// Live and historical geographic player distribution.
    Radars,
    /// Health checks, sitemaps, thumbnails and misc utility endpoints.
    Misc,
    /// Steam/Discord-authenticated user account settings.
    Accounts,
    /// Moderation review queues for reported music.
    AdminReports,
    /// Site-wide announcement management.
    Announcements,
    /// Web push notification subscriptions and preferences.
    PushNotifications,
    /// Requests from the community to add a new server.
    ServerRequests,
    /// ZE character/class metadata.
    Characters,
    /// Donation/supporter information.
    Donations,
    /// Special thanks / credits listing.
    SpecialThanks,
    /// Curated external community links.
    CommunityLinks,
    /// Admin management of map metadata.
    AdminMaps,
    /// Admin audit log of moderation actions.
    AdminAudit,
    /// Admin management of server metadata.
    AdminServers,
}