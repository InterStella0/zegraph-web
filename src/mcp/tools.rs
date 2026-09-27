//! Builds the MCP tool list from the generated OpenAPI spec.
//!
//! A route becomes a tool by carrying `tag = "ApiTags::Mcp"` and an `operation_id` in its
//! `#[oai(...)]`; the operation ID is the tool name. Everything else (description, parameters,
//! required flags, types and enum values) is read from the spec, so nothing here has to be kept in
//! sync with the routers.

use serde_json::{json, Map, Value};

/// Name of `ApiTags::Mcp` as it appears in the spec.
const MCP_TAG: &str = "Mcp";

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum ParamLoc {
    Path,
    Query,
}

#[derive(Clone, PartialEq, Debug)]
pub enum ParamKind {
    Str,
    Int { unsigned: bool },
    Number,
    Bool,
    Enum(Vec<String>),
    /// RFC 3339 timestamp, passed through as a string.
    DateTime,
}

#[derive(Debug)]
pub struct Param {
    pub name: String,
    pub loc: ParamLoc,
    pub kind: ParamKind,
    pub required: bool,
    /// JSON Schema advertised to clients, with any `$ref` already inlined.
    schema: Value,
}

#[derive(Debug)]
pub struct ToolDef {
    pub name: String,
    pub description: String,
    /// Route path in OpenAPI form, e.g. `/servers/{server_id}/maps`.
    pub path: String,
    pub params: Vec<Param>,
}

impl ToolDef {
    pub fn input_schema(&self) -> Value {
        let properties: Map<String, Value> = self.params.iter()
            .map(|p| (p.name.clone(), p.schema.clone()))
            .collect();
        let required: Vec<&str> = self.params.iter()
            .filter(|p| p.required)
            .map(|p| p.name.as_str())
            .collect();
        json!({
            "type": "object",
            "properties": properties,
            "required": required,
            "additionalProperties": false,
        })
    }

    pub fn to_json(&self) -> Value {
        json!({
            "name": self.name,
            "description": self.description,
            "inputSchema": self.input_schema(),
            "annotations": { "readOnlyHint": true, "openWorldHint": false },
        })
    }
}

/// Every `Mcp`-tagged operation in `spec` as a tool, sorted by name. Operations that cannot be
/// turned into a tool are skipped and reported in the second vector rather than failing startup;
/// `mcp_tagged_routes_all_become_tools` asserts it is empty.
pub fn tools_from_spec(spec: &Value) -> (Vec<ToolDef>, Vec<String>) {
    let mut tools: Vec<ToolDef> = vec![];
    let mut errors = vec![];
    let Some(paths) = spec["paths"].as_object() else {
        return (tools, vec!["spec has no paths".to_string()]);
    };

    for (path, item) in paths {
        for (method, op) in item.as_object().into_iter().flatten() {
            let tagged = op["tags"].as_array()
                .is_some_and(|tags| tags.iter().any(|t| t == MCP_TAG));
            if !tagged {
                continue;
            }
            if method != "get" {
                errors.push(format!("{} {path} is tagged Mcp, but only GET routes can be tools", method.to_uppercase()));
                continue;
            }
            match tool_from_operation(spec, path, op) {
                Ok(tool) if tools.iter().any(|t| t.name == tool.name) => {
                    errors.push(format!("GET {path}: tool name `{}` is used twice", tool.name));
                }
                Ok(tool) => tools.push(tool),
                Err(e) => errors.push(format!("GET {path}: {e}")),
            }
        }
    }
    tools.sort_by(|a, b| a.name.cmp(&b.name));
    (tools, errors)
}

fn tool_from_operation(spec: &Value, path: &str, op: &Value) -> Result<ToolDef, String> {
    let name = op["operationId"].as_str()
        .ok_or("missing operation_id, which names the tool")?;
    let description = ["summary", "description"].iter()
        .filter_map(|k| op[*k].as_str())
        .collect::<Vec<_>>()
        .join("\n\n");
    if description.is_empty() {
        return Err("has no doc comment to describe the tool".to_string());
    }

    let spec_params: &[Value] = op["parameters"].as_array().map(Vec::as_slice).unwrap_or_default();
    let mut params = vec![];

    for placeholder in path.split('/').filter_map(|s| s.strip_prefix('{')?.strip_suffix('}')) {
        let declared = spec_params.iter().find(|p| p["in"] == "path" && p["name"] == placeholder);
        let param = match declared {
            Some(declared) => param_from_spec(spec, declared, ParamLoc::Path)?,
            // Read by a custom extractor through `raw_path_param`, so absent from the spec.
            None => Param {
                name: placeholder.to_string(),
                loc: ParamLoc::Path,
                kind: ParamKind::Str,
                required: true,
                schema: json!({ "type": "string", "description": placeholder_description(placeholder) }),
            },
        };
        params.push(param);
    }

    for declared in spec_params {
        match declared["in"].as_str() {
            Some("query") => params.push(param_from_spec(spec, declared, ParamLoc::Query)?),
            Some("path") => {}
            other => {
                if declared["required"].as_bool().unwrap_or(false) {
                    return Err(format!("requires a {other:?} parameter, which tools cannot send"));
                }
            }
        }
    }

    Ok(ToolDef { name: name.to_string(), description, path: path.to_string(), params })
}

fn param_from_spec(spec: &Value, declared: &Value, loc: ParamLoc) -> Result<Param, String> {
    let name = declared["name"].as_str().ok_or("a parameter has no name")?;
    let mut schema = resolve(spec, &declared["schema"]);
    let kind = kind_of(&schema).map_err(|e| format!("parameter `{name}`: {e}"))?;

    if let ParamKind::Int { unsigned: true } = kind {
        schema["minimum"] = json!(0);
    }
    let description = declared["description"].as_str()
        .or_else(|| (loc == ParamLoc::Path).then(|| placeholder_description(name)));
    if let Some(description) = description {
        schema["description"] = Value::from(description);
    }

    Ok(Param {
        name: name.to_string(),
        loc,
        kind,
        required: loc == ParamLoc::Path || declared["required"].as_bool().unwrap_or(false),
        schema,
    })
}

/// Inlines a `#/components/schemas/...` reference; clients only ever see a self-contained schema.
fn resolve(spec: &Value, schema: &Value) -> Value {
    match schema["$ref"].as_str().and_then(|r| r.strip_prefix("#/components/schemas/")) {
        Some(name) => spec["components"]["schemas"][name].clone(),
        None => schema.clone(),
    }
}

fn kind_of(schema: &Value) -> Result<ParamKind, String> {
    if let Some(values) = schema["enum"].as_array() {
        return Ok(ParamKind::Enum(values.iter().filter_map(|v| v.as_str().map(String::from)).collect()));
    }
    match (schema["type"].as_str(), schema["format"].as_str()) {
        (Some("string"), Some("date-time")) => Ok(ParamKind::DateTime),
        (Some("string"), _) => Ok(ParamKind::Str),
        (Some("integer"), format) => Ok(ParamKind::Int { unsigned: format.is_some_and(|f| f.starts_with("uint")) }),
        (Some("number"), _) => Ok(ParamKind::Number),
        (Some("boolean"), _) => Ok(ParamKind::Bool),
        _ => Err(format!("unsupported schema {schema}")),
    }
}

fn placeholder_description(name: &str) -> &'static str {
    match name {
        "server_id" => "Server ID or the server's readable_link, as returned by list_servers.",
        "player_id" => "Player ID (usually a Steam64 ID), as returned by the player search tools.",
        "map_name" => "Exact map name, e.g. ze_example_v1. Use search_maps to resolve partial names.",
        "community_id" => "Community ID (the `id` of a community in list_servers), or \"all\" for every community combined.",
        "session_id" => "Session ID: a map session's time_id (get_map_sessions) or a player session's id (get_player_sessions), matching the tool.",
        _ => "Path parameter.",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn spec_with(path: &str, method: &str, op: Value) -> Value {
        json!({ "paths": { path: { method: op } }, "components": { "schemas": {} } })
    }

    #[test]
    fn untagged_routes_are_not_tools() {
        let spec = spec_with("/a", "get", json!({ "operationId": "a", "summary": "A", "tags": ["Maps"] }));
        let (tools, errors) = tools_from_spec(&spec);
        assert!(tools.is_empty() && errors.is_empty());
    }

    #[test]
    fn tagged_routes_must_be_named_documented_gets() {
        for (method, op, expected) in [
            ("post", json!({ "operationId": "a", "summary": "A", "tags": ["Mcp"] }), "only GET"),
            ("get", json!({ "summary": "A", "tags": ["Mcp"] }), "operation_id"),
            ("get", json!({ "operationId": "a", "tags": ["Mcp"] }), "doc comment"),
        ] {
            let (tools, errors) = tools_from_spec(&spec_with("/a", method, op));
            assert!(tools.is_empty());
            assert!(errors.len() == 1 && errors[0].contains(expected), "{errors:?}");
        }
    }

    #[test]
    fn placeholders_missing_from_the_spec_become_string_params() {
        let spec = spec_with("/servers/{server_id}/sessions/{session_id}", "get", json!({
            "operationId": "t", "summary": "T", "tags": ["Mcp"],
            "parameters": [
                { "name": "session_id", "in": "path", "required": true, "schema": { "type": "integer", "format": "int64" } },
                { "name": "page", "in": "query", "required": false, "schema": { "type": "integer", "format": "uint64" } },
            ],
        }));
        let (tools, errors) = tools_from_spec(&spec);
        assert!(errors.is_empty(), "{errors:?}");
        let kinds: Vec<_> = tools[0].params.iter().map(|p| (p.name.as_str(), p.loc, p.kind.clone(), p.required)).collect();
        assert_eq!(kinds, [
            ("server_id", ParamLoc::Path, ParamKind::Str, true),
            ("session_id", ParamLoc::Path, ParamKind::Int { unsigned: false }, true),
            ("page", ParamLoc::Query, ParamKind::Int { unsigned: true }, false),
        ]);
        assert_eq!(tools[0].input_schema()["properties"]["page"]["minimum"], 0);
    }
}
