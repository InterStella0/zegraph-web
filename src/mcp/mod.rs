//! MCP (Model Context Protocol) endpoint exposing player, map and server data as tools.
//!
//! Speaks stateless Streamable HTTP: every message is a single JSON-RPC `POST /mcp` answered with
//! `application/json`. There are no sessions and no SSE stream, so `GET`/`DELETE` are 405.
//!
//! Tools do not run queries of their own. Every GET route tagged `ApiTags::Mcp` becomes one (see
//! [`tools`]); a call builds that route's request in memory and dispatches it to the API service
//! in-process. The one exception is [`radar`], hand-written because it renders from QGIS rather
//! than an API route. Caching, the worker "calculating" fallback and anonymization therefore behave
//! exactly as they do for the website, and the caller's `Authorization` header is forwarded so a
//! signed-in user sees what they would see there.

mod radar;
pub mod tools;

use poem::http::{header, HeaderValue, Method, StatusCode, Uri};
use poem::{Endpoint, EndpointExt, Request, Response};
use poem::endpoint::BoxEndpoint;
use serde_json::{json, Map, Value};
use url::Url;
use crate::AppData;
use crate::api_models::common::{RoutePattern, UriPatternExt};
use crate::core::utils::IterConvert;
use tools::{tools_from_spec, ParamKind, ParamLoc, ToolDef};

/// Newest first; the first entry is what an unrecognised client version falls back to.
pub const SUPPORTED_PROTOCOL_VERSIONS: &[&str] = &["2025-11-25", "2025-06-18", "2025-03-26"];

const PARSE_ERROR: i32 = -32700;
const INVALID_REQUEST: i32 = -32600;
const METHOD_NOT_FOUND: i32 = -32601;
const INVALID_PARAMS: i32 = -32602;

const INSTRUCTIONS: &str = "Read-only data from zegraph.xyz, which tracks CS Zombie Escape \
    servers across the western community. Call list_servers first to resolve a server_id (a \
    server's readable_link works too). Player and map tools are scoped to one server. Graph tools \
    return pre-bucketed series sized for charting. Players who anonymized themselves are hidden unless the request carries their own, or an admin's, bearer \
    token.";

pub struct McpApi;

impl UriPatternExt for McpApi {
    fn get_all_patterns(&self) -> Vec<RoutePattern> {
        vec!["/mcp"].iter_into()
    }
}

pub struct McpEndpoint {
    api: BoxEndpoint<'static>,
    /// For the radar tool, which has no route to dispatch to.
    app: AppData,
    tools: Vec<ToolDef>,
    tools_json: Value,
}

impl McpEndpoint {
    /// `api` is the route tree tools dispatch to and must already carry `AppData`; `spec` is its
    /// OpenAPI document, which the tools are built from.
    pub fn new(api: impl Endpoint<Output = Response> + 'static, spec: &str, app: AppData) -> Self {
        let spec: Value = serde_json::from_str(spec).expect("poem-openapi emits valid JSON");
        let (tools, errors) = tools_from_spec(&spec);
        for error in errors {
            tracing::error!("Skipping MCP tool: {error}");
        }
        let mut listed: Vec<Value> = tools.iter().map(ToolDef::to_json).collect();
        listed.push(radar::tool_json());
        listed.sort_by(|a, b| a["name"].as_str().cmp(&b["name"].as_str()));
        Self { api: api.boxed(), app, tools, tools_json: json!({ "tools": listed }) }
    }

    async fn dispatch(&self, method: &str, params: &Value, auth: Option<&HeaderValue>) -> Result<Value, RpcError> {
        match method {
            "initialize" => Ok(initialize_result(params)),
            "ping" => Ok(json!({})),
            "tools/list" => Ok(self.tools_json.clone()),
            "tools/call" => self.call_tool(params, auth).await,
            other => Err(RpcError::new(METHOD_NOT_FOUND, format!("Method not found: {other}"))),
        }
    }

    async fn call_tool(&self, params: &Value, auth: Option<&HeaderValue>) -> Result<Value, RpcError> {
        let name = params.get("name").and_then(Value::as_str)
            .ok_or_else(|| RpcError::invalid_params("Missing tool name"))?;
        let empty = Map::new();
        let args = match params.get("arguments") {
            None | Some(Value::Null) => &empty,
            Some(Value::Object(args)) => args,
            Some(_) => return Err(RpcError::invalid_params("`arguments` must be an object")),
        };
        if name == radar::NAME {
            return radar::call(&self.app, args).await.map_err(RpcError::invalid_params);
        }
        let tool = self.tools.iter().find(|t| t.name == name)
            .ok_or_else(|| RpcError::invalid_params(format!("Unknown tool: {name}")))?;

        let uri = build_uri(tool, args).map_err(RpcError::invalid_params)?;
        let uri: Uri = uri.parse()
            .map_err(|_| RpcError::invalid_params("Arguments produced an invalid request path"))?;
        let mut builder = Request::builder().method(Method::GET).uri(uri);
        if let Some(auth) = auth {
            builder = builder.header(header::AUTHORIZATION, auth.clone());
        }

        let resp = self.api.get_response(builder.finish()).await;
        let status = resp.status();
        let body = resp.into_body().into_string().await.unwrap_or_default();
        Ok(tool_result(status, &body))
    }
}

impl Endpoint for McpEndpoint {
    type Output = Response;

    async fn call(&self, mut req: Request) -> poem::Result<Self::Output> {
        if req.method() != Method::POST {
            return Ok(Response::builder()
                .status(StatusCode::METHOD_NOT_ALLOWED)
                .header(header::ALLOW, "POST")
                .finish());
        }
        let auth = req.headers().get(header::AUTHORIZATION).cloned();
        let body = req.take_body().into_bytes().await?;

        let Ok(message) = serde_json::from_slice::<Value>(&body) else {
            return Ok(rpc_response(Value::Null, Err(RpcError::new(PARSE_ERROR, "Parse error"))));
        };
        if message.is_array() {
            return Ok(rpc_response(Value::Null, Err(RpcError::new(
                INVALID_REQUEST, "Batch requests are not supported",
            ))));
        }
        let Some(message) = message.as_object() else {
            return Ok(rpc_response(Value::Null, Err(RpcError::new(INVALID_REQUEST, "Invalid request"))));
        };
        let id = message.get("id").cloned();
        if message.get("jsonrpc").and_then(Value::as_str) != Some("2.0") {
            return Ok(rpc_response(id.unwrap_or(Value::Null), Err(RpcError::new(
                INVALID_REQUEST, "`jsonrpc` must be \"2.0\"",
            ))));
        }

        // A message without a method is the client answering a server request; one without an id
        // is a notification. Neither expects a reply, and nothing here needs to act on them.
        let (Some(method), Some(id)) = (message.get("method").and_then(Value::as_str), id) else {
            return Ok(Response::builder().status(StatusCode::ACCEPTED).finish());
        };
        let params = message.get("params").cloned().unwrap_or(Value::Null);
        let result = self.dispatch(method, &params, auth.as_ref()).await;
        Ok(rpc_response(id, result))
    }
}

#[derive(Debug)]
struct RpcError {
    code: i32,
    message: String,
}

impl RpcError {
    fn new(code: i32, message: impl Into<String>) -> Self {
        Self { code, message: message.into() }
    }

    fn invalid_params(message: impl Into<String>) -> Self {
        Self::new(INVALID_PARAMS, message)
    }
}

fn rpc_response(id: Value, result: Result<Value, RpcError>) -> Response {
    let body = match result {
        Ok(result) => json!({ "jsonrpc": "2.0", "id": id, "result": result }),
        Err(err) => json!({
            "jsonrpc": "2.0",
            "id": id,
            "error": { "code": err.code, "message": err.message },
        }),
    };
    Response::builder()
        .content_type("application/json")
        .body(body.to_string())
}

fn initialize_result(params: &Value) -> Value {
    let requested = params.get("protocolVersion").and_then(Value::as_str);
    let version = requested
        .filter(|v| SUPPORTED_PROTOCOL_VERSIONS.contains(v))
        .unwrap_or(SUPPORTED_PROTOCOL_VERSIONS[0]);
    json!({
        "protocolVersion": version,
        "capabilities": { "tools": {} },
        "serverInfo": { "name": "zegraph", "version": env!("CARGO_PKG_VERSION") },
        "instructions": INSTRUCTIONS,
    })
}

/// Renders a tool's arguments into the request path and query of the route it maps onto.
fn build_uri(tool: &ToolDef, args: &Map<String, Value>) -> Result<String, String> {
    if let Some(unknown) = args.keys().find(|k| !tool.params.iter().any(|p| p.name == k.as_str())) {
        return Err(format!("Unknown argument `{unknown}` for tool {}", tool.name));
    }

    let mut path_values = Vec::new();
    let mut query = Vec::new();
    for param in &tool.params {
        let value = match args.get(&param.name) {
            None | Some(Value::Null) if param.required => {
                return Err(format!("Missing required argument `{}`", param.name));
            }
            None | Some(Value::Null) => continue,
            Some(value) => argument_to_string(&param.name, &param.kind, value)?,
        };
        match param.loc {
            ParamLoc::Path => {
                if value.is_empty() {
                    return Err(format!("`{}` must not be empty", param.name));
                }
                path_values.push((param.name.as_str(), value));
            }
            ParamLoc::Query => query.push((param.name.as_str(), value)),
        }
    }

    let mut url = Url::parse("http://mcp.internal/").expect("static base URL is valid");
    {
        let mut segments = url.path_segments_mut().expect("http URLs have a path");
        segments.clear();
        for segment in tool.path.trim_start_matches('/').split('/') {
            match segment.strip_prefix('{').and_then(|s| s.strip_suffix('}')) {
                Some(name) => {
                    let (_, value) = path_values.iter().find(|(n, _)| *n == name)
                        .ok_or_else(|| format!("Tool {} has no path argument `{name}`", tool.name))?;
                    segments.push(value);
                }
                None => {
                    segments.push(segment);
                }
            }
        }
    }
    if !query.is_empty() {
        url.query_pairs_mut().extend_pairs(query);
    }

    let mut uri = url.path().to_string();
    if let Some(query) = url.query() {
        uri.push('?');
        uri.push_str(query);
    }
    Ok(uri)
}

fn argument_to_string(name: &str, kind: &ParamKind, value: &Value) -> Result<String, String> {
    match kind {
        // Numbers are refused rather than stringified: a Steam64 player ID sent as a JSON number
        // has already lost precision by the time it arrives.
        ParamKind::Str => value.as_str()
            .map(str::to_string)
            .ok_or_else(|| format!("`{name}` must be a string")),
        ParamKind::Int { unsigned } => match value {
            Value::Number(n) => n.as_i64(),
            Value::String(s) => s.trim().parse::<i64>().ok(),
            _ => None,
        }
            .filter(|n| !unsigned || *n >= 0)
            .map(|n| n.to_string())
            .ok_or_else(|| if *unsigned {
                format!("`{name}` must be a non-negative integer")
            } else {
                format!("`{name}` must be an integer")
            }),
        ParamKind::Number => match value {
            Value::Number(n) => n.as_f64(),
            Value::String(s) => s.trim().parse::<f64>().ok(),
            _ => None,
        }
            .filter(|n| n.is_finite())
            .map(|n| n.to_string())
            .ok_or_else(|| format!("`{name}` must be a number")),
        ParamKind::Bool => value.as_bool()
            .map(|b| b.to_string())
            .ok_or_else(|| format!("`{name}` must be a boolean")),
        ParamKind::Enum(values) => value.as_str()
            .filter(|v| values.iter().any(|allowed| allowed == v))
            .map(str::to_string)
            .ok_or_else(|| format!("`{name}` must be one of: {}", values.join(", "))),
        ParamKind::DateTime => value.as_str()
            .filter(|v| chrono::DateTime::parse_from_rfc3339(v).is_ok())
            .map(str::to_string)
            .ok_or_else(|| format!("`{name}` must be an RFC 3339 timestamp")),
    }
}

/// Maps a route's response onto an MCP tool result. Failures the model can act on (not found,
/// private, still calculating) are tool errors rather than protocol errors, per the MCP spec.
fn tool_result(status: StatusCode, body: &str) -> Value {
    let (text, is_error) = match status {
        StatusCode::OK => match serde_json::from_str::<Value>(body) {
            Ok(envelope) => match envelope.get("code").and_then(Value::as_i64) {
                Some(0) => {
                    let data = envelope.get("data").unwrap_or(&Value::Null);
                    (serde_json::to_string_pretty(data).unwrap_or_default(), false)
                }
                Some(202) => ("Still calculating, retry in a few seconds.".to_string(), true),
                _ => {
                    let msg = envelope.get("msg").and_then(Value::as_str).unwrap_or("Request failed");
                    (msg.to_string(), true)
                }
            },
            Err(_) => ("The API returned an unexpected response.".to_string(), true),
        },
        StatusCode::FORBIDDEN => ("This player's activity is private (anonymized).".to_string(), true),
        status => {
            let body = body.trim();
            let text = if body.is_empty() { status.to_string() } else { format!("{status}: {body}") };
            (text, true)
        }
    };
    json!({
        "content": [{ "type": "text", "text": text }],
        "isError": is_error,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(value: Value) -> Map<String, Value> {
        value.as_object().cloned().expect("test args are an object")
    }

    /// Tools as built from the real spec, so these tests also cover the derivation.
    fn spec_tools() -> Vec<ToolDef> {
        let spec: Value = serde_json::from_str(&crate::build_api_service().spec()).unwrap();
        tools_from_spec(&spec).0
    }

    fn tool(name: &str) -> ToolDef {
        spec_tools().into_iter().find(|t| t.name == name)
            .unwrap_or_else(|| panic!("no `{name}` tool; is its route still tagged ApiTags::Mcp?"))
    }

    #[test]
    fn build_uri_encodes_path_segments_and_query_values() {
        let tool = &tool("get_map_top_players");
        let uri = build_uri(tool, &args(json!({
            "server_id": "a/b",
            "map_name": "ze 100%",
            "player_name": "x&y=z",
        }))).unwrap();
        assert_eq!(uri, "/servers/a%2Fb/maps/ze%20100%25/top_players?player_name=x%26y%3Dz");
    }

    #[test]
    fn build_uri_omits_absent_optional_params() {
        let tool = &tool("list_maps");
        let uri = build_uri(tool, &args(json!({
            "server_id": "gfl", "page": 2, "sorted_by": "LastPlayed", "filter": null,
        }))).unwrap();
        assert_eq!(uri, "/servers/gfl/maps/last/sessions?page=2&sorted_by=LastPlayed");
    }

    #[test]
    fn build_uri_rejects_bad_arguments() {
        let tool = &tool("get_player_leaderboard");
        let base = json!({ "server_id": "gfl", "page": 0, "mode": "Total" });
        assert!(build_uri(tool, &args(base.clone())).is_ok());

        for (key, bad) in [
            ("mode", json!("Everything")),
            ("page", json!(-1)),
            ("page", json!("one")),
            ("server_id", json!(123)),
            ("server_id", json!("")),
        ] {
            let mut a = args(base.clone());
            a.insert(key.to_string(), bad.clone());
            assert!(build_uri(tool, &a).is_err(), "{key}={bad} should be rejected");
        }

        let mut missing = args(base.clone());
        missing.remove("mode");
        assert!(build_uri(tool, &missing).unwrap_err().contains("mode"));

        let mut extra = args(base);
        extra.insert("limit".to_string(), json!(5));
        assert!(build_uri(tool, &extra).unwrap_err().contains("limit"));
    }

    #[test]
    fn datetime_must_be_rfc3339() {
        let tool = &tool("get_player_sessions");
        let base = json!({ "server_id": "gfl", "player_id": "1", "page": 0 });
        let mut ok = args(base.clone());
        ok.insert("datetime".into(), json!("2025-01-02T00:00:00Z"));
        assert!(build_uri(tool, &ok).unwrap().contains("datetime=2025-01-02T00%3A00%3A00Z"));

        let mut bad = args(base);
        bad.insert("datetime".into(), json!("yesterday"));
        assert!(build_uri(tool, &bad).is_err());
    }

    #[test]
    fn input_schema_marks_required_and_enums() {
        let schema = tool("list_maps").input_schema();
        assert_eq!(schema["type"], "object");
        let required: Vec<&str> = schema["required"].as_array().unwrap()
            .iter().filter_map(Value::as_str).collect();
        assert_eq!(required, ["server_id", "page", "sorted_by"]);
        assert_eq!(schema["properties"]["filter"]["enum"][4], "HasLaser");
        assert_eq!(schema["properties"]["page"]["type"], "integer");
    }

    #[test]
    fn tool_result_unwraps_the_envelope() {
        let ok = tool_result(StatusCode::OK, r#"{"code":0,"msg":"OK","data":{"a":1}}"#);
        assert_eq!(ok["isError"], false);
        assert_eq!(ok["content"][0]["text"], "{\n  \"a\": 1\n}");

        let calculating = tool_result(StatusCode::OK, r#"{"code":202,"msg":"Still calculating","data":null}"#);
        assert_eq!(calculating["isError"], true);
        assert!(calculating["content"][0]["text"].as_str().unwrap().contains("retry"));

        let failed = tool_result(StatusCode::OK, r#"{"code":404,"msg":"No map found","data":null}"#);
        assert_eq!(failed["content"][0]["text"], "No map found");

        let private = tool_result(StatusCode::FORBIDDEN, "Access forbidden");
        assert!(private["content"][0]["text"].as_str().unwrap().contains("private"));

        let missing = tool_result(StatusCode::NOT_FOUND, "Player not found");
        assert_eq!(missing["content"][0]["text"], "404 Not Found: Player not found");
        assert_eq!(missing["isError"], true);
    }

    #[test]
    fn initialize_negotiates_protocol_version() {
        assert_eq!(initialize_result(&json!({ "protocolVersion": "2025-06-18" }))["protocolVersion"], "2025-06-18");
        assert_eq!(initialize_result(&json!({ "protocolVersion": "1999-01-01" }))["protocolVersion"], SUPPORTED_PROTOCOL_VERSIONS[0]);
        assert_eq!(initialize_result(&Value::Null)["protocolVersion"], SUPPORTED_PROTOCOL_VERSIONS[0]);
    }
}
