//! Builds the MCP tool list from the generated OpenAPI spec and the checked-in MCP documentation.
//!
//! A route becomes a tool by carrying `tag = "ApiTags::Mcp"` and an `operation_id` in its
//! `#[oai(...)]`; the operation ID is the tool name. Routing and the argument schema still come
//! from OpenAPI. Human-facing titles, descriptions and argument descriptions come from
//! `tool_docs.json`, which is synchronized explicitly with
//! `SQLX_OFFLINE=true cargo run -- generate-mcp-docs` and can then be edited (or rewritten by an
//! AI) without changing the API documentation.

use serde_json::{json, Map, Value};
use std::collections::BTreeSet;

/// Name of `ApiTags::Mcp` as it appears in the spec.
const MCP_TAG: &str = "Mcp";
const TOOL_DOCS: &str = include_str!("tool_docs.json");

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum ParamLoc {
    Path,
    Query,
}

#[derive(Clone, PartialEq, Debug)]
pub enum ParamKind {
    Str,
    Int {
        unsigned: bool,
    },
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
    pub title: String,
    pub description: String,
    /// Route path in OpenAPI form, e.g. `/servers/{server_id}/maps`.
    pub path: String,
    pub params: Vec<Param>,
}

impl ToolDef {
    pub fn input_schema(&self) -> Value {
        let properties: Map<String, Value> = self
            .params
            .iter()
            .map(|p| (p.name.clone(), p.schema.clone()))
            .collect();
        let required: Vec<&str> = self
            .params
            .iter()
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
            "annotations": {
                "title": self.title,
                "readOnlyHint": true,
                "openWorldHint": false,
            },
        })
    }
}

/// Every `Mcp`-tagged operation in `spec` as a tool, sorted by name. Operations that cannot be
/// turned into a tool are skipped and reported in the second vector rather than failing startup;
/// `mcp_tagged_routes_all_become_tools` asserts it is empty.
pub fn tools_from_spec(spec: &Value) -> (Vec<ToolDef>, Vec<String>) {
    let docs: Value = match serde_json::from_str(TOOL_DOCS) {
        Ok(docs) => docs,
        Err(error) => {
            return (
                vec![],
                vec![format!("invalid src/mcp/tool_docs.json: {error}")],
            )
        }
    };
    tools_from_spec_and_docs(spec, &docs)
}

fn tools_from_spec_and_docs(spec: &Value, docs: &Value) -> (Vec<ToolDef>, Vec<String>) {
    let mut tools: Vec<ToolDef> = vec![];
    let mut errors = vec![];
    let Some(paths) = spec["paths"].as_object() else {
        return (tools, vec!["spec has no paths".to_string()]);
    };
    let Some(tool_docs) = docs["tools"].as_object() else {
        return (
            tools,
            vec!["src/mcp/tool_docs.json has no `tools` object".to_string()],
        );
    };
    let mut used_docs = BTreeSet::new();

    for (path, item) in paths {
        for (method, op) in item.as_object().into_iter().flatten() {
            let tagged = op["tags"]
                .as_array()
                .is_some_and(|tags| tags.iter().any(|t| t == MCP_TAG));
            if !tagged {
                continue;
            }
            if method != "get" {
                errors.push(format!(
                    "{} {path} is tagged Mcp, but only GET routes can be tools",
                    method.to_uppercase()
                ));
                continue;
            }
            let Some(name) = op["operationId"].as_str() else {
                errors.push(format!(
                    "GET {path}: missing operation_id, which names the tool"
                ));
                continue;
            };
            let Some(doc) = tool_docs.get(name) else {
                errors.push(format!("GET {path}: tool `{name}` is missing from src/mcp/tool_docs.json; run `SQLX_OFFLINE=true cargo run -- generate-mcp-docs`"));
                continue;
            };
            used_docs.insert(name);
            match tool_from_operation(spec, path, op, doc) {
                Ok(tool) if tools.iter().any(|t| t.name == tool.name) => {
                    errors.push(format!(
                        "GET {path}: tool name `{}` is used twice",
                        tool.name
                    ));
                }
                Ok(tool) => tools.push(tool),
                Err(e) => errors.push(format!("GET {path}: {e}")),
            }
        }
    }
    for name in tool_docs
        .keys()
        .filter(|name| !used_docs.contains(name.as_str()))
    {
        errors.push(format!("src/mcp/tool_docs.json contains stale tool `{name}`; run `SQLX_OFFLINE=true cargo run -- generate-mcp-docs`"));
    }
    tools.sort_by(|a, b| a.name.cmp(&b.name));
    (tools, errors)
}

fn tool_from_operation(
    spec: &Value,
    path: &str,
    op: &Value,
    docs: &Value,
) -> Result<ToolDef, String> {
    let name = op["operationId"]
        .as_str()
        .ok_or("missing operation_id, which names the tool")?;
    let title = required_doc_string(docs, "title")?;
    let description = required_doc_string(docs, "description")?;
    let argument_docs = docs["arguments"]
        .as_object()
        .ok_or("documentation has no `arguments` object")?;

    let spec_params: &[Value] = op["parameters"]
        .as_array()
        .map(Vec::as_slice)
        .unwrap_or_default();
    let mut params = vec![];

    for placeholder in path
        .split('/')
        .filter_map(|s| s.strip_prefix('{')?.strip_suffix('}'))
    {
        let declared = spec_params
            .iter()
            .find(|p| p["in"] == "path" && p["name"] == placeholder);
        let param = match declared {
            Some(declared) => param_from_spec(spec, declared, ParamLoc::Path)?,
            // Read by a custom extractor through `raw_path_param`, so absent from the spec.
            None => Param {
                name: placeholder.to_string(),
                loc: ParamLoc::Path,
                kind: ParamKind::Str,
                required: true,
                schema: json!({ "type": "string" }),
            },
        };
        params.push(with_argument_doc(param, argument_docs)?);
    }

    for declared in spec_params {
        match declared["in"].as_str() {
            Some("query") => {
                let param = param_from_spec(spec, declared, ParamLoc::Query)?;
                params.push(with_argument_doc(param, argument_docs)?);
            }
            Some("path") => {}
            other => {
                if declared["required"].as_bool().unwrap_or(false) {
                    return Err(format!(
                        "requires a {other:?} parameter, which tools cannot send"
                    ));
                }
            }
        }
    }

    let actual: BTreeSet<&str> = params.iter().map(|param| param.name.as_str()).collect();
    if let Some(stale) = argument_docs
        .keys()
        .find(|name| !actual.contains(name.as_str()))
    {
        return Err(format!("documentation contains stale argument `{stale}`"));
    }

    Ok(ToolDef {
        name: name.to_string(),
        title,
        description,
        path: path.to_string(),
        params,
    })
}

fn required_doc_string(docs: &Value, field: &str) -> Result<String, String> {
    docs[field]
        .as_str()
        .filter(|value| !value.trim().is_empty())
        .map(str::to_string)
        .ok_or_else(|| format!("documentation has no non-empty `{field}`"))
}

fn with_argument_doc(
    mut param: Param,
    argument_docs: &Map<String, Value>,
) -> Result<Param, String> {
    let description = argument_docs
        .get(&param.name)
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| format!("documentation is missing argument `{}`", param.name))?;
    param.schema["description"] = Value::from(description);
    Ok(param)
}

fn param_from_spec(spec: &Value, declared: &Value, loc: ParamLoc) -> Result<Param, String> {
    let name = declared["name"].as_str().ok_or("a parameter has no name")?;
    let mut schema = resolve(spec, &declared["schema"]);
    let kind = kind_of(&schema).map_err(|e| format!("parameter `{name}`: {e}"))?;

    if let ParamKind::Int { unsigned: true } = kind {
        schema["minimum"] = json!(0);
    }
    if let Some(schema) = schema.as_object_mut() {
        // API schema descriptions are deliberately not leaked into the separately maintained MCP
        // docs. `with_argument_doc` installs the MCP-specific description after this returns.
        schema.remove("description");
    }

    Ok(Param {
        name: name.to_string(),
        loc,
        kind,
        required: loc == ParamLoc::Path || declared["required"].as_bool().unwrap_or(false),
        schema,
    })
}

/// Creates the editable documentation catalog from the current OpenAPI document. This is only
/// called by the explicit generator command; the server reads the checked-in result.
pub fn generated_docs_from_spec(spec: &Value) -> Result<Value, Vec<String>> {
    let Some(paths) = spec["paths"].as_object() else {
        return Err(vec!["spec has no paths".to_string()]);
    };
    let mut generated = Map::new();
    let mut errors = vec![];

    for (path, item) in paths {
        for (method, op) in item.as_object().into_iter().flatten() {
            let tagged = op["tags"]
                .as_array()
                .is_some_and(|tags| tags.iter().any(|tag| tag == MCP_TAG));
            if !tagged {
                continue;
            }
            if method != "get" {
                errors.push(format!(
                    "{} {path} is tagged Mcp, but only GET routes can be tools",
                    method.to_uppercase()
                ));
                continue;
            }
            let Some(name) = op["operationId"].as_str() else {
                errors.push(format!(
                    "GET {path}: missing operation_id, which names the tool"
                ));
                continue;
            };
            let description = ["summary", "description"]
                .iter()
                .filter_map(|field| op[*field].as_str())
                .collect::<Vec<_>>()
                .join("\n\n");
            if description.is_empty() {
                errors.push(format!(
                    "GET {path}: has no doc comment to seed the MCP description"
                ));
                continue;
            }

            let spec_params: &[Value] = op["parameters"]
                .as_array()
                .map(Vec::as_slice)
                .unwrap_or_default();
            let mut arguments = Map::new();
            for placeholder in path_placeholders(path) {
                let description = spec_params
                    .iter()
                    .find(|param| param["in"] == "path" && param["name"] == placeholder)
                    .and_then(|param| param["description"].as_str())
                    .unwrap_or_else(|| placeholder_description(placeholder));
                arguments.insert(placeholder.to_string(), Value::from(description));
            }
            for param in spec_params.iter().filter(|param| param["in"] == "query") {
                let Some(param_name) = param["name"].as_str() else {
                    errors.push(format!("GET {path}: a query parameter has no name"));
                    continue;
                };
                let description = param["description"]
                    .as_str()
                    .map(str::to_string)
                    .unwrap_or_else(|| default_argument_description(param_name));
                arguments.insert(param_name.to_string(), Value::from(description));
            }

            generated.insert(
                name.to_string(),
                json!({
                    "title": title_from_name(name),
                    "description": description,
                    "arguments": arguments,
                }),
            );
        }
    }

    if errors.is_empty() {
        Ok(json!({
            "_comment": "Synchronized from OpenAPI by `SQLX_OFFLINE=true cargo run -- generate-mcp-docs`. Existing MCP wording is preserved; use `--force` to regenerate everything.",
            "tools": generated,
        }))
    } else {
        Err(errors)
    }
}

/// Merges a freshly generated catalog into an existing one. OpenAPI owns which tools and
/// arguments exist, while the existing catalog owns the wording for entries that still exist.
/// Consequently this adds new entries, removes stale entries, and leaves curated text alone.
pub fn merge_generated_docs(mut generated: Value, existing: &Value) -> Value {
    let Some(generated_tools) = generated["tools"].as_object_mut() else {
        return generated;
    };
    let Some(existing_tools) = existing["tools"].as_object() else {
        return generated;
    };

    for (name, generated_doc) in generated_tools {
        let Some(existing_doc) = existing_tools.get(name) else {
            continue;
        };

        for field in ["title", "description"] {
            if let Some(value) = existing_doc[field]
                .as_str()
                .filter(|value| !value.trim().is_empty())
            {
                generated_doc[field] = Value::from(value);
            }
        }

        let Some(generated_arguments) = generated_doc["arguments"].as_object_mut() else {
            continue;
        };
        let Some(existing_arguments) = existing_doc["arguments"].as_object() else {
            continue;
        };
        for (argument, generated_description) in generated_arguments {
            if let Some(description) = existing_arguments
                .get(argument)
                .and_then(Value::as_str)
                .filter(|value| !value.trim().is_empty())
            {
                *generated_description = Value::from(description);
            }
        }
    }

    generated
}

fn path_placeholders(path: &str) -> impl Iterator<Item = &str> {
    path.split('/')
        .filter_map(|part| part.strip_prefix('{')?.strip_suffix('}'))
}

fn title_from_name(name: &str) -> String {
    name.split('_')
        .filter(|word| !word.is_empty())
        .map(|word| {
            let mut chars = word.chars();
            chars
                .next()
                .map(char::to_uppercase)
                .into_iter()
                .flatten()
                .chain(chars)
                .collect::<String>()
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn default_argument_description(name: &str) -> String {
    format!("{}.", title_from_name(name))
}

/// Inlines a `#/components/schemas/...` reference; clients only ever see a self-contained schema.
fn resolve(spec: &Value, schema: &Value) -> Value {
    match schema["$ref"]
        .as_str()
        .and_then(|r| r.strip_prefix("#/components/schemas/"))
    {
        Some(name) => spec["components"]["schemas"][name].clone(),
        None => schema.clone(),
    }
}

fn kind_of(schema: &Value) -> Result<ParamKind, String> {
    if let Some(values) = schema["enum"].as_array() {
        return Ok(ParamKind::Enum(
            values
                .iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect(),
        ));
    }
    match (schema["type"].as_str(), schema["format"].as_str()) {
        (Some("string"), Some("date-time")) => Ok(ParamKind::DateTime),
        (Some("string"), _) => Ok(ParamKind::Str),
        (Some("integer"), format) => Ok(ParamKind::Int {
            unsigned: format.is_some_and(|f| f.starts_with("uint")),
        }),
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

    fn docs_with(name: &str, arguments: Value) -> Value {
        json!({ "tools": { name: {
            "title": title_from_name(name),
            "description": "MCP-specific description.",
            "arguments": arguments,
        } } })
    }

    #[test]
    fn untagged_routes_are_not_tools() {
        let spec = spec_with(
            "/a",
            "get",
            json!({ "operationId": "a", "summary": "A", "tags": ["Maps"] }),
        );
        let (tools, errors) = tools_from_spec_and_docs(&spec, &json!({ "tools": {} }));
        assert!(tools.is_empty() && errors.is_empty());
    }

    #[test]
    fn tagged_routes_must_be_gets_with_names_and_mcp_docs() {
        for (method, op, docs, expected) in [
            (
                "post",
                json!({ "operationId": "a", "summary": "A", "tags": ["Mcp"] }),
                docs_with("a", json!({})),
                "only GET",
            ),
            (
                "get",
                json!({ "summary": "A", "tags": ["Mcp"] }),
                json!({ "tools": {} }),
                "operation_id",
            ),
            (
                "get",
                json!({ "operationId": "a", "summary": "API docs", "tags": ["Mcp"] }),
                json!({ "tools": {} }),
                "missing from src/mcp/tool_docs.json",
            ),
        ] {
            let spec = spec_with("/a", method, op);
            let (tools, errors) = tools_from_spec_and_docs(&spec, &docs);
            assert!(tools.is_empty());
            assert!(
                errors.iter().any(|error| error.contains(expected)),
                "{errors:?}"
            );
        }
    }

    #[test]
    fn placeholders_missing_from_the_spec_become_string_params() {
        let spec = spec_with(
            "/servers/{server_id}/sessions/{session_id}",
            "get",
            json!({
                "operationId": "t", "summary": "T", "tags": ["Mcp"],
                "parameters": [
                    { "name": "session_id", "in": "path", "required": true, "schema": { "type": "integer", "format": "int64" } },
                    { "name": "page", "in": "query", "required": false, "schema": { "type": "integer", "format": "uint64" } },
                ],
            }),
        );
        let docs = docs_with(
            "t",
            json!({
                "server_id": "Server.", "session_id": "Session.", "page": "Page.",
            }),
        );
        let (tools, errors) = tools_from_spec_and_docs(&spec, &docs);
        assert!(errors.is_empty(), "{errors:?}");
        let kinds: Vec<_> = tools[0]
            .params
            .iter()
            .map(|p| (p.name.as_str(), p.loc, p.kind.clone(), p.required))
            .collect();
        assert_eq!(
            kinds,
            [
                ("server_id", ParamLoc::Path, ParamKind::Str, true),
                (
                    "session_id",
                    ParamLoc::Path,
                    ParamKind::Int { unsigned: false },
                    true
                ),
                (
                    "page",
                    ParamLoc::Query,
                    ParamKind::Int { unsigned: true },
                    false
                ),
            ]
        );
        assert_eq!(tools[0].input_schema()["properties"]["page"]["minimum"], 0);
        assert_eq!(tools[0].to_json()["annotations"]["title"], "T");
    }

    #[test]
    fn generator_seeds_docs_but_runtime_uses_the_catalog() {
        let spec = spec_with(
            "/a/{server_id}",
            "get",
            json!({
                "operationId": "get_a", "summary": "API summary", "description": "API detail", "tags": ["Mcp"],
            }),
        );
        let generated = generated_docs_from_spec(&spec).unwrap();
        assert_eq!(generated["tools"]["get_a"]["title"], "Get A");
        assert_eq!(
            generated["tools"]["get_a"]["description"],
            "API summary\n\nAPI detail"
        );

        let docs = docs_with("get_a", json!({ "server_id": "Curated argument docs." }));
        let (tools, errors) = tools_from_spec_and_docs(&spec, &docs);
        assert!(errors.is_empty(), "{errors:?}");
        assert_eq!(tools[0].description, "MCP-specific description.");
        assert_eq!(
            tools[0].input_schema()["properties"]["server_id"]["description"],
            "Curated argument docs."
        );
    }

    #[test]
    fn generator_merge_preserves_wording_and_updates_the_catalog_shape() {
        let spec = spec_with(
            "/a/{server_id}",
            "get",
            json!({
                "operationId": "get_a", "summary": "New API summary", "tags": ["Mcp"],
                "parameters": [
                    { "name": "page", "in": "query", "required": false, "schema": { "type": "integer", "format": "uint64" } },
                ],
            }),
        );
        let generated = generated_docs_from_spec(&spec).unwrap();
        let existing = json!({
            "tools": {
                "get_a": {
                    "title": "Curated title",
                    "description": "Curated description",
                    "arguments": {
                        "server_id": "Curated server argument",
                        "removed_argument": "This should disappear"
                    }
                },
                "removed_tool": {
                    "title": "Removed",
                    "description": "This should disappear",
                    "arguments": {}
                }
            }
        });

        let merged = merge_generated_docs(generated, &existing);
        let tool = &merged["tools"]["get_a"];
        assert_eq!(tool["title"], "Curated title");
        assert_eq!(tool["description"], "Curated description");
        assert_eq!(tool["arguments"]["server_id"], "Curated server argument");
        assert_eq!(tool["arguments"]["page"], "Page.");
        assert!(tool["arguments"].get("removed_argument").is_none());
        assert!(merged["tools"].get("removed_tool").is_none());
    }
}
