/// MCP (Model Context Protocol) server — JSON-RPC 2.0 over HTTP POST.
///
/// Exposes circuit file access and simulation as MCP tools so that
/// Claude Code users can connect their local `claude` instance to eerie:
///
///   claude mcp add eerie http://localhost:<PORT>/mcp
///
/// Tools exposed:
///   get_project_info  — project name, directory, list of circuit files
///   read_circuit      — read a .eerie circuit file (YAML)
///   write_circuit     — write / overwrite a .eerie circuit file
///   simulate_spice    — parse and run a SPICE netlist, return .op results

use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::path::PathBuf;

// ── JSON-RPC 2.0 envelope ─────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct JsonRpcRequest {
    pub jsonrpc: String,
    pub id: Option<Value>,
    pub method: String,
    pub params: Option<Value>,
}

#[derive(Serialize)]
pub struct JsonRpcResponse {
    pub jsonrpc: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<JsonRpcError>,
}

#[derive(Serialize)]
pub struct JsonRpcError {
    pub code: i32,
    pub message: String,
}

impl JsonRpcResponse {
    fn ok(id: Option<Value>, result: Value) -> Self {
        Self { jsonrpc: "2.0".into(), id, result: Some(result), error: None }
    }

    fn err(id: Option<Value>, code: i32, message: impl Into<String>) -> Self {
        Self {
            jsonrpc: "2.0".into(),
            id,
            result: None,
            error: Some(JsonRpcError { code, message: message.into() }),
        }
    }
}

// ── Tool definitions ──────────────────────────────────────────────────────

fn tool_definitions() -> Value {
    json!([
        {
            "name": "get_project_info",
            "description": "Get project metadata: name, project directory, and list of circuit files (.eerie) and other files.",
            "inputSchema": {
                "type": "object",
                "properties": {},
                "required": []
            }
        },
        {
            "name": "read_circuit",
            "description": "Read a .eerie circuit file from the project directory and return its YAML content. The YAML contains components (with type, label, properties) and nets (electrical connections between component pins). Ignore the position/rotation/segment fields — they are layout data for the visual editor.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "filename": {
                        "type": "string",
                        "description": "Filename relative to project directory, e.g. \"voltage_divider.eerie\""
                    }
                },
                "required": ["filename"]
            }
        },
        {
            "name": "write_circuit",
            "description": "Write (create or overwrite) a .eerie circuit file in the project directory. Provide valid YAML that follows the eerie circuit format. Open the file in the browser after writing to see it visually.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "filename": {
                        "type": "string",
                        "description": "Filename relative to project directory, e.g. \"my_filter.eerie\""
                    },
                    "content": {
                        "type": "string",
                        "description": "Full YAML content of the circuit file"
                    }
                },
                "required": ["filename", "content"]
            }
        },
        {
            "name": "simulate_spice",
            "description": "Parse a SPICE netlist and run a DC operating point (.op) simulation. Returns node voltages and branch currents. Use this to verify a circuit design numerically.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "netlist": {
                        "type": "string",
                        "description": "SPICE netlist text (ngspice dialect). Must include a .op directive and end with .end. Example:\n  My Circuit\n  V1 in 0 DC 5\n  R1 in out 1k\n  R2 out 0 2k\n  .op\n  .end"
                    }
                },
                "required": ["netlist"]
            }
        }
    ])
}

// ── Tool implementations ──────────────────────────────────────────────────

fn tool_content(text: impl Into<String>) -> Value {
    json!({ "content": [{ "type": "text", "text": text.into() }], "isError": false })
}

fn tool_error(text: impl Into<String>) -> Value {
    json!({ "content": [{ "type": "text", "text": text.into() }], "isError": true })
}

async fn call_tool(project_dir: &PathBuf, name: &str, args: &Value) -> Value {
    match name {
        "get_project_info" => {
            let manifest_path = project_dir.join("eerie.yaml");
            let project_name = std::fs::read_to_string(&manifest_path)
                .ok()
                .and_then(|yaml| {
                    // Extract name: field with simple line scan (no YAML parser needed)
                    yaml.lines()
                        .find(|l| l.starts_with("name:"))
                        .map(|l| l["name:".len()..].trim().to_string())
                })
                .unwrap_or_else(|| {
                    project_dir
                        .file_name()
                        .map(|n| n.to_string_lossy().into_owned())
                        .unwrap_or_else(|| "unknown".into())
                });

            let mut circuits = Vec::new();
            let mut other_files = Vec::new();
            if let Ok(entries) = std::fs::read_dir(project_dir) {
                for entry in entries.flatten() {
                    if entry.file_type().map_or(true, |ft| ft.is_dir()) {
                        continue;
                    }
                    let fname = entry.file_name().to_string_lossy().into_owned();
                    if fname.ends_with(".eerie") {
                        circuits.push(fname);
                    } else if fname != "eerie.yaml" {
                        other_files.push(fname);
                    }
                }
            }
            circuits.sort();
            other_files.sort();

            let text = format!(
                "Project: {project_name}\nDirectory: {dir}\nCircuits: {circuits}\nOther files: {other}",
                dir = project_dir.display(),
                circuits = if circuits.is_empty() { "(none)".into() } else { circuits.join(", ") },
                other = if other_files.is_empty() { "(none)".into() } else { other_files.join(", ") },
            );
            tool_content(text)
        }

        "read_circuit" => {
            let filename = match args.get("filename").and_then(Value::as_str) {
                Some(f) => f,
                None => return tool_error("missing argument: filename"),
            };
            // Safety: only allow filenames within the project directory
            let path = project_dir.join(filename);
            if !path.starts_with(project_dir) {
                return tool_error("path traversal not allowed");
            }
            match std::fs::read_to_string(&path) {
                Ok(content) => tool_content(content),
                Err(e) => tool_error(format!("cannot read {filename}: {e}")),
            }
        }

        "write_circuit" => {
            let filename = match args.get("filename").and_then(Value::as_str) {
                Some(f) => f,
                None => return tool_error("missing argument: filename"),
            };
            let content = match args.get("content").and_then(Value::as_str) {
                Some(c) => c,
                None => return tool_error("missing argument: content"),
            };
            let path = project_dir.join(filename);
            if !path.starts_with(project_dir) {
                return tool_error("path traversal not allowed");
            }
            match std::fs::write(&path, content) {
                Ok(()) => tool_content(format!("Written {filename} ({} bytes)", content.len())),
                Err(e) => tool_error(format!("cannot write {filename}: {e}")),
            }
        }

        "simulate_spice" => {
            let netlist_text = match args.get("netlist").and_then(Value::as_str) {
                Some(s) => s,
                None => return tool_error("missing argument: netlist"),
            };
            let netlist = match thevenin_types::parse::parse(netlist_text) {
                Ok(n) => n,
                Err(e) => return tool_error(format!("SPICE parse error: {e}")),
            };
            match thevenin::simulate_op(&netlist) {
                Ok(sim_result) => {
                    let mut lines = Vec::new();
                    for plot in &sim_result.plots {
                        for vec in &plot.vecs {
                            if vec.real.len() == 1 {
                                lines.push(format!("  {} = {:.6}", vec.name, vec.real[0]));
                            } else if !vec.real.is_empty() {
                                lines.push(format!(
                                    "  {} = [{} .. {}] ({} points)",
                                    vec.name,
                                    vec.real[0],
                                    vec.real[vec.real.len() - 1],
                                    vec.real.len()
                                ));
                            }
                        }
                    }
                    let text = if lines.is_empty() {
                        "Simulation complete (no scalar results)".into()
                    } else {
                        format!("Simulation results:\n{}", lines.join("\n"))
                    };
                    tool_content(text)
                }
                Err(e) => tool_error(format!("Simulation error: {e}")),
            }
        }

        _ => tool_error(format!("unknown tool: {name}")),
    }
}

// ── Axum handler ─────────────────────────────────────────────────────────

#[derive(Clone)]
pub struct McpState {
    pub project_dir: PathBuf,
}

pub async fn mcp_handler(
    State(state): State<McpState>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    // MCP uses POST for all requests; handle CORS preflight
    if headers
        .get("access-control-request-method")
        .is_some()
    {
        return (
            StatusCode::NO_CONTENT,
            [
                ("Access-Control-Allow-Origin", "*"),
                ("Access-Control-Allow-Methods", "POST, OPTIONS"),
                ("Access-Control-Allow-Headers", "Content-Type"),
            ],
            axum::body::Body::empty(),
        )
            .into_response();
    }

    let req: JsonRpcRequest = match serde_json::from_slice(&body) {
        Ok(r) => r,
        Err(e) => {
            let resp = JsonRpcResponse::err(None, -32700, format!("Parse error: {e}"));
            return json_response(resp);
        }
    };

    let id = req.id.clone();

    // Notifications have no id and must not receive a response
    let is_notification = id.is_none();

    let result = handle_method(&state, &req.method, req.params).await;

    if is_notification {
        // Return 202 Accepted with empty body for notifications
        return (StatusCode::ACCEPTED, axum::body::Body::empty()).into_response();
    }

    match result {
        Ok(value) => json_response(JsonRpcResponse::ok(id, value)),
        Err(msg) => json_response(JsonRpcResponse::err(id, -32603, msg)),
    }
}

async fn handle_method(
    state: &McpState,
    method: &str,
    params: Option<Value>,
) -> Result<Value, String> {
    match method {
        "initialize" => Ok(json!({
            "protocolVersion": "2024-11-05",
            "capabilities": { "tools": {} },
            "serverInfo": { "name": "eerie", "version": env!("CARGO_PKG_VERSION") }
        })),

        "notifications/initialized" | "ping" => Ok(json!({})),

        "tools/list" => Ok(json!({ "tools": tool_definitions() })),

        "tools/call" => {
            let params = params.unwrap_or_default();
            let name = params
                .get("name")
                .and_then(Value::as_str)
                .ok_or("missing tool name")?;
            let args = params.get("arguments").cloned().unwrap_or_default();
            Ok(call_tool(&state.project_dir, name, &args).await)
        }

        other => Err(format!("method not found: {other}")),
    }
}

fn json_response(resp: JsonRpcResponse) -> axum::response::Response {
    let body = serde_json::to_vec(&resp).unwrap_or_default();
    axum::response::Response::builder()
        .status(200)
        .header("Content-Type", "application/json")
        .header("Access-Control-Allow-Origin", "*")
        .body(axum::body::Body::from(body))
        .unwrap()
}
