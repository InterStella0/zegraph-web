use poem::http::StatusCode;
use poem::web::Data;
use poem::Request;
use poem_openapi::OpenApi;
use poem_openapi::param::Path;
use poem_openapi::payload::Json;
use crate::{or_ise, require, response, AppData, FastCache};
use crate::api_models::common::*;
use crate::api_models::misc::*;
use crate::core::utils::*;
use crate::routers::ApiTags;
use crate::routers::global_maps::get_global_map;

const VIEW_SECRET_HEADER: &str = "X-View-Secret";
const VIEW_DEDUP_SECS: i64 = 24 * 60 * 60;

/// Lowercase user-agent fragments of crawlers, link unfurlers and scripted clients.
const CRAWLER_AGENTS: &[&str] = &[
    "bot", "crawl", "spider", "slurp", "facebookexternalhit", "embedly", "preview", "headless",
    "python", "curl", "wget", "go-http", "httpclient", "trigger-robot",
];

/// Admits only the frontend's server, which shares `VIEW_COUNTER_SECRET` with the backend. With the
/// variable unset nothing is admitted, so a deploy missing it counts no views rather than any.
pub struct ViewSecret;

impl<'a> poem::FromRequest<'a> for ViewSecret {
    async fn from_request(req: &'a Request, _body: &mut poem::RequestBody) -> poem::Result<Self> {
        let forbidden = || poem::Error::from_string("Forbidden", StatusCode::FORBIDDEN);
        let expected = get_env_default("VIEW_COUNTER_SECRET")
            .filter(|secret| !secret.is_empty())
            .ok_or_else(forbidden)?;
        let given = req.header(VIEW_SECRET_HEADER).ok_or_else(forbidden)?;
        if !constant_time_eq(given.as_bytes(), expected.as_bytes()) {
            return Err(forbidden());
        }
        Ok(Self)
    }
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

fn is_crawler(user_agent: &str) -> bool {
    let user_agent = user_agent.trim().to_ascii_lowercase();
    user_agent.is_empty() || CRAWLER_AGENTS.iter().any(|agent| user_agent.contains(agent))
}

/// Who a view is deduplicated by: the logged-in user, otherwise a hash of the IP and user-agent so
/// raw IPs never reach redis. `None` means the view is not counted at all.
fn visitor_id(user: Option<&UserToken>, view: &ViewRequest) -> Option<String> {
    if is_crawler(&view.user_agent) {
        return None
    }
    if let Some(user) = user {
        return Some(format!("u:{}", user.id))
    }
    let ip = view.ip.trim();
    if ip.is_empty() {
        return None
    }
    Some(format!("a:{}", sha256::digest(format!("{ip}|{}", view.user_agent))))
}

#[derive(Clone, Copy)]
enum ViewKind {
    Player,
    Map,
}

impl ViewKind {
    fn as_str(&self) -> &'static str {
        match self {
            ViewKind::Player => "player",
            ViewKind::Map => "map",
        }
    }
}

fn view_key(kind: ViewKind, entity: &str, visitor: &str) -> String {
    format!("view:{}:{entity}:{visitor}", kind.as_str())
}

/// Claims the visitor's view for the next 24 hours. A redis failure claims nothing, so an outage
/// stops views from being counted instead of counting every one of them.
async fn claim_view(cache: &FastCache, key: &str) -> bool {
    let Ok(mut conn) = cache.redis_pool.get().await else {
        return false
    };
    let claimed: redis::RedisResult<Option<String>> = redis::cmd("SET")
        .arg(key)
        .arg(1)
        .arg("NX")
        .arg("EX")
        .arg(VIEW_DEDUP_SECS)
        .query_async(&mut conn)
        .await;
    matches!(claimed, Ok(Some(_)))
}

async fn record_view(app: &AppData, kind: ViewKind, entity: &str, visitor: Option<String>) -> Result<i64, sqlx::Error> {
    let pool = &*app.pool;
    let claimed = match &visitor {
        Some(visitor) => claim_view(&app.cache, &view_key(kind, entity, visitor)).await,
        None => false,
    };
    if claimed {
        return match kind {
            ViewKind::Player => sqlx::query_scalar!("
                INSERT INTO website.player_views (player_id, views) VALUES ($1, 1)
                ON CONFLICT (player_id) DO UPDATE SET views = website.player_views.views + 1
                RETURNING views
            ", entity).fetch_one(pool).await,
            ViewKind::Map => sqlx::query_scalar!("
                INSERT INTO website.map_views (map, views) VALUES ($1, 1)
                ON CONFLICT (map) DO UPDATE SET views = website.map_views.views + 1
                RETURNING views
            ", entity).fetch_one(pool).await,
        }
    }
    let views = match kind {
        ViewKind::Player => sqlx::query_scalar!(
            "SELECT views FROM website.player_views WHERE player_id = $1", entity
        ).fetch_optional(pool).await?,
        ViewKind::Map => sqlx::query_scalar!(
            "SELECT views FROM website.map_views WHERE map = $1", entity
        ).fetch_optional(pool).await?,
    };
    Ok(views.unwrap_or(0))
}

pub struct ViewsApi;

#[OpenApi(tag = "ApiTags::Views")]
impl ViewsApi {
    /// Records a view of a player's profile and returns the player's view count.
    ///
    /// Internal: only the frontend's server may call this, authenticated by the `X-View-Secret`
    /// header, and nginx refuses it from outside. Counted once per visitor per player every 24
    /// hours, across every server; crawlers are never counted but still get the current count.
    #[oai(path = "/views/players/:player_id", method = "post")]
    async fn record_player_view(
        &self, _secret: ViewSecret, Data(app): Data<&AppData>, Path(player_id): Path<String>,
        OptionalTokenBearer(user): OptionalTokenBearer, Json(view): Json<ViewRequest>,
    ) -> Response<ViewCount> {
        let exists = or_ise!(sqlx::query_scalar!(
            r#"SELECT EXISTS(SELECT 1 FROM player WHERE player_id = $1) "exists!""#, player_id
        ).fetch_one(&*app.pool).await, e => "Error checking player {player_id} for a view: {e}");
        require!(exists, "Player not found", ErrorCode::NotFound);

        let visitor = visitor_id(user.as_ref(), &view);
        let views = or_ise!(
            record_view(app, ViewKind::Player, &player_id, visitor).await,
            e => "Error recording view of player {player_id}: {e}"
        );
        response!(ok ViewCount { views })
    }

    /// Records a view of a map and returns the map's view count.
    ///
    /// Internal, like the player view. Counted by map name, so a server's map page and the global
    /// map page share one count.
    #[oai(path = "/views/maps/:map_name", method = "post")]
    async fn record_map_view(
        &self, _secret: ViewSecret, Data(app): Data<&AppData>, Path(map_name): Path<String>,
        OptionalTokenBearer(user): OptionalTokenBearer, Json(view): Json<ViewRequest>,
    ) -> Response<ViewCount> {
        let Some(map) = get_global_map(&app.pool, &app.cache, &map_name).await else {
            return response!(err "Map not found", ErrorCode::NotFound)
        };

        let visitor = visitor_id(user.as_ref(), &view);
        let views = or_ise!(
            record_view(app, ViewKind::Map, &map, visitor).await,
            e => "Error recording view of map {map}: {e}"
        );
        response!(ok ViewCount { views })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn view(ip: &str, user_agent: &str) -> ViewRequest {
        ViewRequest { ip: ip.to_string(), user_agent: user_agent.to_string() }
    }

    const BROWSER: &str = "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0";

    #[test]
    fn crawlers_and_scripts_are_detected() {
        for agent in [
            "", "   ", "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
            "facebookexternalhit/1.1", "Mozilla/5.0 (compatible; bingbot/2.0)", "curl/8.5.0",
            "python-requests/2.31", "Go-http-client/2.0", "Mozilla/5.0 HeadlessChrome/120.0",
            "trigger-robot/1.0 (Rust)", "Discordbot/2.0",
        ] {
            assert!(is_crawler(agent), "{agent:?} should count as a crawler");
        }
        assert!(!is_crawler(BROWSER));
    }

    #[test]
    fn visitors_are_the_user_or_a_hash_of_ip_and_agent() {
        let user = UserToken { id: 76561198000000001, global_name: "viewer".to_string() };
        assert_eq!(visitor_id(Some(&user), &view("1.2.3.4", BROWSER)).as_deref(), Some("u:76561198000000001"));
        assert_eq!(visitor_id(Some(&user), &view("", BROWSER)).as_deref(), Some("u:76561198000000001"));

        let anonymous = visitor_id(None, &view("1.2.3.4", BROWSER)).expect("a browser is counted");
        assert!(anonymous.starts_with("a:") && !anonymous.contains("1.2.3.4"), "got {anonymous}");
        assert_eq!(visitor_id(None, &view(" 1.2.3.4 ", BROWSER)).as_deref(), Some(anonymous.as_str()));
        assert_ne!(visitor_id(None, &view("1.2.3.5", BROWSER)).as_deref(), Some(anonymous.as_str()));
        assert_ne!(visitor_id(None, &view("1.2.3.4", "Mozilla/5.0 Other")).as_deref(), Some(anonymous.as_str()));
    }

    #[test]
    fn uncountable_views_have_no_visitor() {
        let user = UserToken { id: 1, global_name: "viewer".to_string() };
        assert_eq!(visitor_id(None, &view("", BROWSER)), None, "no IP means nothing to dedup on");
        assert_eq!(visitor_id(None, &view("1.2.3.4", "curl/8.5.0")), None);
        assert_eq!(visitor_id(Some(&user), &view("1.2.3.4", "Googlebot")), None);
    }

    #[test]
    fn view_keys_separate_kinds() {
        assert_eq!(view_key(ViewKind::Player, "123", "u:1"), "view:player:123:u:1");
        assert_ne!(view_key(ViewKind::Player, "x", "u:1"), view_key(ViewKind::Map, "x", "u:1"));
    }

    #[test]
    fn secret_compare_needs_an_exact_match() {
        assert!(constant_time_eq(b"secret", b"secret"));
        assert!(!constant_time_eq(b"secret", b"secreT"));
        assert!(!constant_time_eq(b"secret", b"secret2"));
        assert!(!constant_time_eq(b"", b"secret"));
    }
}
