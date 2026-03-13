/// MCP (Model Context Protocol) server — JSON-RPC 2.0 over HTTP POST.
///
/// No serde. JSON-RPC parsing is done with a tiny hand-rolled extractor
/// (the protocol is simple enough). Responses are built with format!().
/// YAML parsing for get_circuit_topology uses yaml-rust2 (no serde).
///
/// Tools exposed:
///   get_project_info      — project name, directory, list of circuit files
///   read_circuit          — raw .eerie YAML
///   write_circuit         — write / overwrite a .eerie file
///   get_circuit_topology  — geometry-free topology description
///   simulate_spice        — parse + run SPICE netlist, return .op results
use axum::{
    body::Bytes,
    extract::State,
    http::HeaderMap,
    response::{IntoResponse, Response},
};
use std::path::PathBuf;

// ── Minimal JSON helpers ──────────────────────────────────────────────────

/// Escape a string value for embedding inside a JSON string literal.
fn json_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 4);
    for ch in s.chars() {
        match ch {
            '"' => out.push_str(r#"\""#),
            '\\' => out.push_str(r"\\"),
            '\n' => out.push_str(r"\n"),
            '\r' => out.push_str(r"\r"),
            '\t' => out.push_str(r"\t"),
            c if (c as u32) < 0x20 => {
                use std::fmt::Write as _;
                let _ = write!(out, "\\u{:04x}", c as u32);
            }
            c => out.push(c),
        }
    }
    out
}

/// Extract a JSON string value by key from a flat JSON object.
/// Only handles one level of nesting; sufficient for MCP params.
fn extract_str(json: &str, key: &str) -> Option<String> {
    let needle = format!(r#""{key}":"#);
    let start = json.find(needle.as_str())? + needle.len();
    let rest = json[start..].trim_start();
    if !rest.starts_with('"') {
        return None;
    }
    let rest = &rest[1..];
    let mut result = String::new();
    let mut chars = rest.chars();
    loop {
        match chars.next()? {
            '"' => return Some(result),
            '\\' => match chars.next()? {
                '"' => result.push('"'),
                '\\' => result.push('\\'),
                'n' => result.push('\n'),
                'r' => result.push('\r'),
                't' => result.push('\t'),
                c => result.push(c),
            },
            c => result.push(c),
        }
    }
}

/// Return the raw JSON representation of the `id` field (null / "str" / 123).
/// Returns `"null"` if the field is absent (notification).
fn extract_id(json: &str) -> String {
    let needle = r#""id":"#;
    let Some(start) = json.find(needle) else {
        return "null".into();
    };
    let rest = json[start + needle.len()..].trim_start();
    if rest.starts_with("null") {
        return "null".into();
    }
    if rest.starts_with('"') {
        // Quoted id — find the closing quote (handle escapes)
        let mut i = 1usize;
        let bytes = rest.as_bytes();
        while i < bytes.len() {
            if bytes[i] == b'"' && (i == 0 || bytes[i - 1] != b'\\') {
                return rest[..=i].to_string();
            }
            i += 1;
        }
        return "null".into();
    }
    // Numeric id
    let end = rest
        .find(|c: char| !c.is_ascii_digit() && c != '-' && c != '.')
        .unwrap_or(rest.len());
    rest[..end].to_string()
}

/// Return true if the request has an `id` field (i.e. is not a notification).
fn has_id(json: &str) -> bool {
    json.contains(r#""id":"#)
}

// ── JSON-RPC response builders ────────────────────────────────────────────

fn ok_response(id: &str, result_json: &str) -> Response {
    let body = format!(r#"{{"jsonrpc":"2.0","id":{id},"result":{result_json}}}"#);
    json_body(body)
}

fn err_response(id: &str, code: i32, message: &str) -> Response {
    let body = format!(
        r#"{{"jsonrpc":"2.0","id":{id},"error":{{"code":{code},"message":"{msg}"}}}}"#,
        msg = json_escape(message)
    );
    json_body(body)
}

fn json_body(body: String) -> Response {
    axum::response::Response::builder()
        .status(200)
        .header("Content-Type", "application/json")
        .header("Access-Control-Allow-Origin", "*")
        .body(axum::body::Body::from(body))
        .unwrap()
}

// ── Tool result helpers ───────────────────────────────────────────────────

fn tool_ok(text: &str) -> String {
    format!(
        r#"{{"content":[{{"type":"text","text":"{}"}}],"isError":false}}"#,
        json_escape(text)
    )
}

fn tool_err(text: &str) -> String {
    format!(
        r#"{{"content":[{{"type":"text","text":"{}"}}],"isError":true}}"#,
        json_escape(text)
    )
}

// ── Tool definitions (static JSON string) ────────────────────────────────

fn tools_list_json() -> &'static str {
    r#"{"tools":[
  {"name":"get_project_info","description":"Get project metadata: name, directory, and list of circuit (.eerie) and other files.","inputSchema":{"type":"object","properties":{},"required":[]}},
  {"name":"read_circuit","description":"Read a .eerie circuit file and return its raw YAML content. Ignore position/rotation/segment fields — they are layout data. Use get_circuit_topology for a clean logical view.","inputSchema":{"type":"object","properties":{"filename":{"type":"string","description":"Filename relative to project dir, e.g. \"voltage_divider.eerie\""}},"required":["filename"]}},
  {"name":"write_circuit","description":"Write (create or overwrite) a .eerie circuit file. The content must be valid YAML in eerie format. Minimal example:\\nname: My Circuit\\ncomponents:\\n  - id: R1\\n    type_id: resistor\\n    label: R1\\n    position: {x: 0, y: 0}\\n    rotation: 0\\n    flip_x: false\\n    properties:\\n      resistance: !Float 1000\\nnets: []\\nOnly edit component labels/type_id/properties; preserve id/position/rotation/flip_x from read_circuit.","inputSchema":{"type":"object","properties":{"filename":{"type":"string"},"content":{"type":"string","description":"Full YAML content"}},"required":["filename","content"]}},
  {"name":"get_circuit_topology","description":"Read a .eerie file and return a geometry-free topology summary: component labels, types, values, net connections, design intent, and parameters. Use this to understand the circuit logically.","inputSchema":{"type":"object","properties":{"filename":{"type":"string"}},"required":["filename"]}},
  {"name":"simulate_spice","description":"Parse a SPICE netlist and run a DC operating point simulation. Returns node voltages and branch currents.","inputSchema":{"type":"object","properties":{"netlist":{"type":"string","description":"SPICE netlist text (ngspice dialect). Must include .op and end with .end."}},"required":["netlist"]}}
]}"#
}

// ── Tool implementations ──────────────────────────────────────────────────

fn safe_path(project_dir: &PathBuf, filename: &str) -> Result<PathBuf, String> {
    let path = project_dir.join(filename);
    if !path.starts_with(project_dir) {
        return Err("path traversal not allowed".into());
    }
    Ok(path)
}

async fn call_tool(project_dir: &PathBuf, name: &str, json: &str) -> String {
    match name {
        "get_project_info" => {
            let manifest_path = project_dir.join("eerie.yaml");
            let project_name = std::fs::read_to_string(&manifest_path)
                .ok()
                .and_then(|yaml| {
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
                other   = if other_files.is_empty() { "(none)".into() } else { other_files.join(", ") },
            );
            tool_ok(&text)
        }

        "read_circuit" => {
            let Some(filename) = extract_str(json, "filename") else {
                return tool_err("missing argument: filename");
            };
            match safe_path(project_dir, &filename) {
                Err(e) => tool_err(&e),
                Ok(path) => match std::fs::read_to_string(&path) {
                    Ok(content) => tool_ok(&content),
                    Err(e) => tool_err(&format!("cannot read {filename}: {e}")),
                },
            }
        }

        "write_circuit" => {
            let Some(filename) = extract_str(json, "filename") else {
                return tool_err("missing argument: filename");
            };
            let Some(content) = extract_str(json, "content") else {
                return tool_err("missing argument: content");
            };
            match safe_path(project_dir, &filename) {
                Err(e) => tool_err(&e),
                Ok(path) => match std::fs::write(&path, &content) {
                    Ok(()) => tool_ok(&format!("Written {filename} ({} bytes)", content.len())),
                    Err(e) => tool_err(&format!("cannot write {filename}: {e}")),
                },
            }
        }

        "get_circuit_topology" => {
            let Some(filename) = extract_str(json, "filename") else {
                return tool_err("missing argument: filename");
            };
            match safe_path(project_dir, &filename) {
                Err(e) => tool_err(&e),
                Ok(path) => match std::fs::read_to_string(&path) {
                    Err(e) => tool_err(&format!("cannot read {filename}: {e}")),
                    Ok(content) => match build_topology(&content) {
                        Ok(text) => tool_ok(&text),
                        Err(e) => tool_err(&format!("YAML parse error: {e}")),
                    },
                },
            }
        }

        "simulate_spice" => {
            let Some(netlist_text) = extract_str(json, "netlist") else {
                return tool_err("missing argument: netlist");
            };
            match thevenin_types::parse::parse(&netlist_text) {
                Err(e) => tool_err(&format!("SPICE parse error: {e}")),
                Ok(netlist) => match thevenin::simulate_op(&netlist) {
                    Err(e) => tool_err(&format!("Simulation error: {e}")),
                    Ok(result) => {
                        let mut lines = Vec::new();
                        for plot in &result.plots {
                            for vec in &plot.vecs {
                                if vec.real.len() == 1 {
                                    lines.push(format!("  {} = {:.6}", vec.name, vec.real[0]));
                                } else if !vec.real.is_empty() {
                                    lines.push(format!(
                                        "  {} = [{:.4} .. {:.4}] ({} pts)",
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
                        tool_ok(&text)
                    }
                },
            }
        }

        other => tool_err(&format!("unknown tool: {other}")),
    }
}

// ── Topology builder (yaml-rust2, no serde) ───────────────────────────────

fn eng(f: f64) -> String {
    let a = f.abs();
    if a == 0.0 { return "0".into(); }
    if a >= 1e6 { format!("{:.3}M", f / 1e6) }
    else if a >= 1e3 { format!("{:.3}k", f / 1e3) }
    else if a >= 1.0 { format!("{f:.3}") }
    else if a >= 1e-3 { format!("{:.3}m", f * 1e3) }
    else if a >= 1e-6 { format!("{:.3}µ", f * 1e6) }
    else if a >= 1e-9 { format!("{:.3}n", f * 1e9) }
    else { format!("{:.3}p", f * 1e12) }
}

fn canonical_pin(type_id: &str, pin: &str) -> &'static str {
    match (type_id, pin) {
        ("resistor" | "capacitor" | "inductor", "p") => "a",
        ("resistor" | "capacitor" | "inductor", "n") => "b",
        ("dc_voltage" | "dc_current", "p")           => "positive",
        ("dc_voltage" | "dc_current", "n")           => "negative",
        ("diode",  "p") => "anode",
        ("diode",  "n") => "cathode",
        ("npn" | "pnp", "c") => "collector",
        ("npn" | "pnp", "b") => "base",
        ("npn" | "pnp", "e") => "emitter",
        ("nmos" | "pmos", "d") => "drain",
        ("nmos" | "pmos", "g") => "gate",
        ("nmos" | "pmos", "s") => "source",
        _ => "", // sentinel: use raw value
    }
}

fn build_topology(yaml_src: &str) -> Result<String, String> {
    use yaml_rust2::{Yaml, YamlLoader};

    let docs = YamlLoader::load_from_str(yaml_src).map_err(|e| e.to_string())?;
    let doc = docs.first().ok_or("empty YAML")?;

    let mut lines: Vec<String> = Vec::new();

    let name = doc["name"].as_str().unwrap_or("Untitled");
    lines.push(format!("Circuit: {name}"));

    if let Some(intent) = doc["intent"].as_str() {
        lines.push(String::new());
        lines.push("Intent:".into());
        for l in intent.trim().lines() {
            lines.push(format!("  {l}"));
        }
    }

    if let Yaml::Hash(params) = &doc["parameters"] {
        if !params.is_empty() {
            lines.push(String::new());
            lines.push("Parameters:".into());
            for (k, v) in params {
                let key = k.as_str().unwrap_or("?");
                let val = match v {
                    Yaml::Integer(i) => i.to_string(),
                    Yaml::Real(r)    => r.clone(),
                    Yaml::String(s)  => s.clone(),
                    _ => format!("{v:?}"),
                };
                lines.push(format!("  {key} = {val}"));
            }
        }
    }

    // Build component id → (label, type_id) maps
    let mut comp_label: std::collections::HashMap<&str, &str> = Default::default();
    let mut comp_type:  std::collections::HashMap<&str, &str> = Default::default();

    if let Yaml::Array(comps) = &doc["components"] {
        lines.push(String::new());
        lines.push("Components:".into());
        for comp in comps {
            let id      = comp["id"].as_str().unwrap_or("?");
            let type_id = comp["type_id"].as_str().unwrap_or("?");
            let label   = comp["label"].as_str().unwrap_or(id);
            comp_label.insert(id, label);
            comp_type.insert(id, type_id);

            // Format properties, unwrapping Facet-style {Float: 1000} maps
            let mut props: Vec<String> = Vec::new();
            if let Yaml::Hash(pmap) = &comp["properties"] {
                for (pk, pv) in pmap {
                    let key = pk.as_str().unwrap_or("?");
                    let val = match pv {
                        Yaml::Integer(i) => i.to_string(),
                        Yaml::Real(r)    => r.parse::<f64>().map(eng).unwrap_or_else(|_| r.clone()),
                        Yaml::String(s)  => s.clone(),
                        // Facet external-tagged: {Float: 1000} stored as Hash
                        Yaml::Hash(h) => {
                            let fk = Yaml::String("Float".into());
                            let sk = Yaml::String("String".into());
                            if let Some(Yaml::Integer(i)) = h.get(&fk) {
                                eng(*i as f64)
                            } else if let Some(Yaml::Real(r)) = h.get(&fk) {
                                r.parse::<f64>().map(eng).unwrap_or_else(|_| r.clone())
                            } else if let Some(Yaml::String(s)) = h.get(&sk) {
                                s.clone()
                            } else {
                                format!("{h:?}")
                            }
                        }
                        _ => continue,
                    };
                    props.push(format!("{key}={val}"));
                }
            }
            let props_str = if props.is_empty() {
                String::new()
            } else {
                format!(": {}", props.join(", "))
            };
            lines.push(format!("  {label} ({type_id}){props_str}"));
        }
    }

    if let Yaml::Array(nets) = &doc["nets"] {
        lines.push(String::new());
        lines.push("Connections:".into());
        for net in nets {
            let net_id = net["id"].as_str().unwrap_or("?");

            // Net name: first label text, then explicit name field, then id
            let net_name = net["labels"]
                .as_vec()
                .and_then(|v| v.first())
                .and_then(|l| l["name"].as_str())
                .or_else(|| net["name"].as_str())
                .unwrap_or(net_id);

            let Some(pins) = net["pins"].as_vec() else { continue };
            if pins.is_empty() { continue; }

            let pin_parts: Vec<String> = pins
                .iter()
                .map(|p| {
                    let cid     = p["component_id"].as_str().unwrap_or("?");
                    let raw_pin = p["pin_id"].as_str()
                        .or_else(|| p["pin_name"].as_str())
                        .unwrap_or("?");
                    let type_id = comp_type.get(cid).copied().unwrap_or("");
                    let label   = comp_label.get(cid).copied().unwrap_or(cid);
                    let canon   = canonical_pin(type_id, raw_pin);
                    let pin_str = if canon.is_empty() { raw_pin } else { canon };
                    format!("{label}({pin_str})")
                })
                .collect();
            lines.push(format!("  {net_name}: {}", pin_parts.join(" ↔ ")));
        }
    }

    Ok(lines.join("\n"))
}

// ── Axum handler ─────────────────────────────────────────────────────────

#[derive(Clone)]
pub struct McpState {
    pub project_dir: PathBuf,
}

pub async fn mcp_handler(
    State(state): State<McpState>,
    headers: HeaderMap,
    body: Bytes,
) -> impl IntoResponse {
    // CORS preflight
    if headers.contains_key("access-control-request-method") {
        return axum::response::Response::builder()
            .status(204)
            .header("Access-Control-Allow-Origin", "*")
            .header("Access-Control-Allow-Methods", "POST, OPTIONS")
            .header("Access-Control-Allow-Headers", "Content-Type")
            .body(axum::body::Body::empty())
            .unwrap();
    }

    let json = match std::str::from_utf8(&body) {
        Ok(s) => s,
        Err(_) => return err_response("null", -32700, "invalid UTF-8"),
    };

    let id = extract_id(json);
    let is_notification = !has_id(json);

    let method = extract_str(json, "method").unwrap_or_default();

    let result = dispatch(&state, &method, json).await;

    if is_notification {
        return axum::response::Response::builder()
            .status(202)
            .body(axum::body::Body::empty())
            .unwrap();
    }

    match result {
        Ok(result_json)  => ok_response(&id, &result_json),
        Err(msg) => err_response(&id, -32603, &msg),
    }
}

async fn dispatch(state: &McpState, method: &str, json: &str) -> Result<String, String> {
    match method {
        "initialize" => Ok(format!(
            r#"{{"protocolVersion":"2024-11-05","capabilities":{{"tools":{{}}}},"serverInfo":{{"name":"eerie","version":"{}"}}}}"#,
            env!("CARGO_PKG_VERSION")
        )),

        "notifications/initialized" | "ping" => Ok("{}".into()),

        "tools/list" => Ok(tools_list_json().into()),

        "tools/call" => {
            let tool_name = extract_str(json, "name")
                .ok_or_else(|| "missing tool name".to_string())?;
            Ok(call_tool(&state.project_dir, &tool_name, json).await)
        }

        other => Err(format!("method not found: {other}")),
    }
}
