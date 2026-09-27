//! `get_radar_map`, the one hand-written tool. Every other tool is derived from an `ApiTags::Mcp`
//! route, but this one renders from the QGIS server rather than an API route, so it has no spec
//! entry to derive from.
//!
//! It requests a WMS `GetMap` from `QGIS_WMS_URL` (nginx's FastCGI pass-through to QGIS) and
//! returns the PNG as MCP image content. The whole WMS request is built here: only `GetMap`, and a
//! `FILTER` built from the server's database ID, so a caller can narrow to one server but never to
//! one player.

use std::time::Duration;
use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64;
use chrono::{DateTime, SecondsFormat, TimeDelta, Utc};
use serde_json::{json, Map, Value};
use crate::AppData;
use crate::core::utils::{get_env_default, get_server, http_client};

pub const NAME: &str = "get_radar_map";

const DEFAULT_WIDTH: u64 = 1024;
const MIN_SIDE: u64 = 64;
const MAX_SIDE: u64 = 2048;
/// Same cap as the radar page's time slider, which refuses windows longer than a day.
const MAX_WINDOW: TimeDelta = TimeDelta::days(1);
const RENDER_TIMEOUT: Duration = Duration::from_secs(30);
const WORLD: [f64; 4] = [-180.0, -90.0, 180.0, 90.0];

const ARGS: &[&str] = &["server_id", "start", "end", "bbox", "width", "theme"];

pub fn tool_json() -> Value {
    json!({
        "name": NAME,
        "description": "A rendered PNG map of where a server's players are, drawn by the QGIS WMS \
            radar.\n\nWith neither `start` nor `end` it shows players connected right now. With \
            both it shows everyone who played during that window, which must span at most 1 day: \
            the same data as the radar page's time slider. Each dot is one player's approximate \
            (IP-based) location.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "server_id": {
                    "type": "string",
                    "description": "Server ID or the server's readable_link, as returned by list_servers.",
                },
                "start": { "type": "string", "format": "date-time", "description": "Window start (RFC 3339)." },
                "end": { "type": "string", "format": "date-time", "description": "Window end (RFC 3339), at most 1 day after `start`." },
                "bbox": {
                    "type": "string",
                    "description": "Area to show as `min_lon,min_lat,max_lon,max_lat` in WGS84 degrees. Defaults to the whole world.",
                },
                "width": {
                    "type": "integer", "minimum": MIN_SIDE, "maximum": MAX_SIDE,
                    "description": "Image width in pixels; the height follows the bbox's aspect ratio. Defaults to 1024.",
                },
                "theme": { "type": "string", "enum": ["light", "dark"], "description": "Defaults to light." },
            },
            "required": ["server_id"],
            "additionalProperties": false,
        },
        "annotations": {
            "title": "Render Player Radar Map",
            "readOnlyHint": true,
            "openWorldHint": false,
        },
    })
}

#[derive(Debug, PartialEq)]
struct RadarRequest {
    server_id: String,
    window: Option<(DateTime<Utc>, DateTime<Utc>)>,
    bbox: [f64; 4],
    width: u64,
    height: u64,
    dark: bool,
}

/// `Err` is a protocol-level invalid-params message; everything past argument parsing is reported
/// as a tool error so the model can correct itself.
pub async fn call(app: &AppData, args: &Map<String, Value>) -> Result<Value, String> {
    let request = match parse_args(args)? {
        Ok(request) => request,
        Err(message) => return Ok(tool_error(&message)),
    };
    let Some(server) = get_server(&app.pool, &app.cache, &request.server_id).await else {
        return Ok(tool_error("Server not found"));
    };
    let Some(wms_url) = get_env_default("QGIS_WMS_URL").filter(|u| !u.trim().is_empty()) else {
        return Ok(tool_error("Radar maps are not configured on this server"));
    };

    let query = wms_query(&server.server_id, &request);
    let resp = match http_client().get(&wms_url).query(&query).timeout(RENDER_TIMEOUT).send().await {
        Ok(resp) => resp,
        Err(e) => return Ok(render_failed(&server.server_id, e.to_string())),
    };
    // QGIS reports errors as a 200 XML ServiceException, so the content type is what tells.
    let is_png = resp.headers().get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.starts_with("image/png"));
    let status = resp.status();
    Ok(match resp.bytes().await {
        Ok(bytes) if status.is_success() && is_png => json!({
            "content": [{ "type": "image", "data": BASE64.encode(&bytes), "mimeType": "image/png" }],
            "isError": false,
        }),
        Ok(bytes) => render_failed(
            &server.server_id,
            format!("HTTP {status}: {}", String::from_utf8_lossy(&bytes).chars().take(300).collect::<String>()),
        ),
        Err(e) => render_failed(&server.server_id, e.to_string()),
    })
}

fn tool_error(message: &str) -> Value {
    json!({ "content": [{ "type": "text", "text": message }], "isError": true })
}

fn render_failed(server_id: &str, detail: String) -> Value {
    tracing::warn!("Radar map render failed for {server_id}: {detail}");
    tool_error("The map renderer failed; try again shortly.")
}

/// Outer `Err`: malformed arguments (JSON-RPC invalid params). Inner `Err`: well-formed but
/// unacceptable values, reported as a tool error.
fn parse_args(args: &Map<String, Value>) -> Result<Result<RadarRequest, String>, String> {
    if let Some(unknown) = args.keys().find(|k| !ARGS.contains(&k.as_str())) {
        return Err(format!("Unknown argument `{unknown}` for tool {NAME}"));
    }
    let str_arg = |name: &str| match args.get(name) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(s)) => Ok(Some(s.as_str())),
        Some(_) => Err(format!("`{name}` must be a string")),
    };
    let time_arg = |name: &str| str_arg(name)?
        .map(|s| DateTime::parse_from_rfc3339(s)
            .map(|t| t.to_utc())
            .map_err(|_| format!("`{name}` must be an RFC 3339 timestamp")))
        .transpose();

    let server_id = str_arg("server_id")?
        .filter(|s| !s.is_empty())
        .ok_or("Missing required argument `server_id`")?
        .to_string();
    let (start, end) = (time_arg("start")?, time_arg("end")?);
    let bbox = str_arg("bbox")?;
    let width = match args.get("width") {
        None | Some(Value::Null) => DEFAULT_WIDTH,
        Some(v) => v.as_u64().ok_or("`width` must be a non-negative integer")?,
    };
    let dark = match str_arg("theme")? {
        None | Some("light") => false,
        Some("dark") => true,
        Some(_) => return Err("`theme` must be one of: light, dark".to_string()),
    };

    Ok((|| {
        let window = match (start, end) {
            (None, None) => None,
            (Some(start), Some(end)) if end <= start => return Err("`end` must be after `start`".to_string()),
            (Some(start), Some(end)) if end - start > MAX_WINDOW => {
                return Err("`start`/`end` must span at most 1 day".to_string())
            }
            (Some(start), Some(end)) => Some((start, end)),
            _ => return Err("Pass both `start` and `end` for a time window, or neither for live players".to_string()),
        };
        let bbox = bbox.map(parse_bbox).transpose()?.unwrap_or(WORLD);
        if !(MIN_SIDE..=MAX_SIDE).contains(&width) {
            return Err(format!("`width` must be between {MIN_SIDE} and {MAX_SIDE}"));
        }
        let aspect = (bbox[3] - bbox[1]) / (bbox[2] - bbox[0]);
        let height = ((width as f64 * aspect).round() as u64).clamp(MIN_SIDE, MAX_SIDE);
        Ok(RadarRequest { server_id, window, bbox, width, height, dark })
    })())
}

/// `min_lon,min_lat,max_lon,max_lat` in WGS84 degrees.
fn parse_bbox(bbox: &str) -> Result<[f64; 4], String> {
    const SHAPE: &str = "`bbox` must be four numbers: min_lon,min_lat,max_lon,max_lat";
    let values: Vec<f64> = bbox.split(',')
        .map(|v| v.trim().parse::<f64>())
        .collect::<Result<_, _>>()
        .map_err(|_| SHAPE.to_string())?;
    let [min_lon, min_lat, max_lon, max_lat] = values[..] else {
        return Err(SHAPE.to_string());
    };
    if !(-180.0..=180.0).contains(&min_lon) || !(-180.0..=180.0).contains(&max_lon)
        || !(-90.0..=90.0).contains(&min_lat) || !(-90.0..=90.0).contains(&max_lat) {
        return Err("`bbox` longitudes must be within ±180 and latitudes within ±90".to_string());
    }
    if min_lon >= max_lon || min_lat >= max_lat {
        return Err("`bbox` minimums must be below its maximums".to_string());
    }
    Ok([min_lon, min_lat, max_lon, max_lat])
}

fn wms_query(server_id: &str, request: &RadarRequest) -> Vec<(&'static str, String)> {
    // Live players come from the plain view; a time window needs the temporal layer, which is the
    // only one QGIS applies `TIME` to.
    let layer = if request.window.is_some() { "player_server_timed" } else { "player_server_mapped" };
    let [min_lon, min_lat, max_lon, max_lat] = request.bbox;
    let mut query = vec![
        ("SERVICE", "WMS".to_string()),
        ("VERSION", "1.1.1".to_string()),
        ("REQUEST", "GetMap".to_string()),
        // countries_dark's `dark` style is the only one drawing outlines at world scale; the
        // background colour carries the theme.
        ("LAYERS", format!("countries_dark,{layer}")),
        ("STYLES", "dark,default".to_string()),
        // 1.1.1 keeps EPSG:4326 in lon/lat order; 1.3.0 would flip it to lat/lon.
        ("SRS", "EPSG:4326".to_string()),
        ("BBOX", format!("{min_lon},{min_lat},{max_lon},{max_lat}")),
        ("WIDTH", request.width.to_string()),
        ("HEIGHT", request.height.to_string()),
        ("FORMAT", "image/png".to_string()),
        ("TRANSPARENT", "FALSE".to_string()),
        ("BGCOLOR", if request.dark { "0x1E1E24" } else { "0xF4F4F0" }.to_string()),
        ("FILTER", format!("{layer}:\"server_id\" = '{}'", server_id.replace('\'', "''"))),
    ];
    if let Some((start, end)) = request.window {
        // The frontend sends the same UTC ISO form; see formatDateWMS in TemporalController.tsx.
        let fmt = |t: DateTime<Utc>| t.to_rfc3339_opts(SecondsFormat::Millis, true);
        query.push(("TIME", format!("{}/{}", fmt(start), fmt(end))));
    }
    query
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(value: Value) -> Map<String, Value> {
        value.as_object().cloned().unwrap()
    }

    fn get(query: &[(&str, String)], key: &str) -> Option<String> {
        query.iter().find(|(k, _)| *k == key).map(|(_, v)| v.clone())
    }

    #[test]
    fn bbox_is_validated() {
        assert_eq!(parse_bbox("-10, 35, 40, 70").unwrap(), [-10.0, 35.0, 40.0, 70.0]);
        for bad in ["1,2,3", "a,b,c,d", "10,0,-10,5", "0,0,200,10", "0,-95,10,10", "0,0,10,10,10"] {
            assert!(parse_bbox(bad).is_err(), "{bad} should be rejected");
        }
    }

    #[test]
    fn defaults_to_a_live_world_map() {
        let request = parse_args(&args(json!({ "server_id": "gfl" }))).unwrap().unwrap();
        assert_eq!(request, RadarRequest {
            server_id: "gfl".into(), window: None, bbox: WORLD, width: 1024, height: 512, dark: false,
        });
    }

    #[test]
    fn malformed_arguments_are_protocol_errors() {
        for bad in [
            json!({}),
            json!({ "server_id": 1 }),
            json!({ "server_id": "gfl", "theme": "neon" }),
            json!({ "server_id": "gfl", "width": -5 }),
            json!({ "server_id": "gfl", "start": "yesterday" }),
            json!({ "server_id": "gfl", "layers": "player_server_timed" }),
        ] {
            assert!(parse_args(&args(bad.clone())).is_err(), "{bad} should be invalid params");
        }
    }

    #[test]
    fn unacceptable_values_are_tool_errors() {
        for (bad, expected) in [
            (json!({ "server_id": "gfl", "start": "2026-03-10T00:00:00Z" }), "both"),
            (json!({ "server_id": "gfl", "start": "2026-03-10T00:00:00Z", "end": "2026-03-15T00:00:00Z" }), "1 day"),
            (json!({ "server_id": "gfl", "start": "2026-03-10T00:00:00Z", "end": "2026-03-09T00:00:00Z" }), "after"),
            (json!({ "server_id": "gfl", "bbox": "10,0,-10,5" }), "bbox"),
            (json!({ "server_id": "gfl", "width": 5000 }), "width"),
        ] {
            let err = parse_args(&args(bad.clone())).unwrap().unwrap_err();
            assert!(err.contains(expected), "{bad} gave {err:?}");
        }
    }

    #[test]
    fn query_filters_to_the_server_and_only_sends_time_for_a_window() {
        let mut request = parse_args(&args(json!({ "server_id": "gfl" }))).unwrap().unwrap();
        let live = wms_query("abc'd", &request);
        assert_eq!(get(&live, "REQUEST").unwrap(), "GetMap");
        assert_eq!(get(&live, "FILTER").unwrap(), "player_server_mapped:\"server_id\" = 'abc''d'");
        assert!(get(&live, "TIME").is_none());

        let start = DateTime::parse_from_rfc3339("2026-03-14T00:00:00Z").unwrap().to_utc();
        request.window = Some((start, start + TimeDelta::hours(6)));
        request.dark = true;
        let timed = wms_query("s", &request);
        assert!(get(&timed, "LAYERS").unwrap().ends_with("player_server_timed"));
        assert_eq!(get(&timed, "TIME").unwrap(), "2026-03-14T00:00:00.000Z/2026-03-14T06:00:00.000Z");
        assert_eq!(get(&timed, "BGCOLOR").unwrap(), "0x1E1E24");
    }

    #[test]
    fn bbox_sets_the_height() {
        let request = parse_args(&args(json!({ "server_id": "gfl", "bbox": "-15,30,45,72", "width": 900 }))).unwrap().unwrap();
        assert_eq!((request.width, request.height), (900, 630));
    }
}
