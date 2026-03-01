//! RPC dispatch. serde_json used only for the dynamic envelope (`params: Value`).
//! All typed data (Circuit, SimulationResult, …) goes through facet-json.
//! TODO: replace this entire file with a roam service definition (issue #003).

use serde_json::Value;
use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};

use eerie_core::circuit::Circuit;
use eerie_core::io::yaml::{circuit_from_json, circuit_from_yaml, circuit_to_yaml};
use eerie_core::simulation::mna::dc_analysis;

#[derive(Debug, serde::Deserialize)]
pub struct Request {
    pub id: Value,
    pub method: String,
    #[serde(default)]
    pub params: Value,
}

pub fn dispatch(req: Request) -> String {
    let id = &req.id;
    let result = match req.method.as_str() {
        "ping"               => Ok(Value::String("pong".into())),
        "file.read"          => rpc_file_read(&req.params),
        "file.write"         => rpc_file_write(&req.params),
        "circuit.parse_yaml" => rpc_parse_yaml(&req.params),
        "circuit.to_yaml"    => rpc_to_yaml(&req.params),
        "circuit.new"        => rpc_new_circuit(&req.params),
        "sim.dc"             => rpc_sim_dc(&req.params),
        other                => Err(format!("unknown method: {other}")),
    };

    match result {
        Ok(val)  => serde_json::to_string(&serde_json::json!({ "id": id, "result": val }))
                        .unwrap_or_default(),
        Err(msg) => serde_json::to_string(&serde_json::json!({ "id": id, "error": msg }))
                        .unwrap_or_default(),
    }
}

// ── Handlers ──────────────────────────────────────────────────────────────────

fn rpc_file_read(params: &Value) -> Result<Value, String> {
    let path = params["path"].as_str().ok_or("missing 'path'")?;
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    Ok(Value::String(content))
}

fn rpc_file_write(params: &Value) -> Result<Value, String> {
    let path    = params["path"].as_str().ok_or("missing 'path'")?;
    let content = params["content"].as_str().ok_or("missing 'content'")?;
    fs::write(path, content).map_err(|e| e.to_string())?;
    Ok(Value::Bool(true))
}

fn rpc_parse_yaml(params: &Value) -> Result<Value, String> {
    let yaml    = params["yaml"].as_str().ok_or("missing 'yaml'")?;
    let circuit = circuit_from_yaml(yaml).map_err(|e| e.to_string())?;
    // Re-serialize through facet-json so the result is a proper JSON object
    let json_str = facet_json::to_string(&circuit).map_err(|e| e.to_string())?;
    serde_json::from_str(&json_str).map_err(|e| e.to_string())
}

fn rpc_to_yaml(params: &Value) -> Result<Value, String> {
    // params.circuit is a JSON object — round-trip through facet-json
    let circuit_json = serde_json::to_string(&params["circuit"]).map_err(|e| e.to_string())?;
    let mut circuit  = circuit_from_json(&circuit_json).map_err(|e| e.to_string())?;
    circuit.metadata.modified_at = iso_now();
    let yaml = circuit_to_yaml(&circuit).map_err(|e| e.to_string())?;
    Ok(Value::String(yaml))
}

fn rpc_new_circuit(params: &Value) -> Result<Value, String> {
    let name    = params["name"].as_str().unwrap_or("Untitled");
    let mut c   = Circuit::new(name);
    c.metadata.created_at  = iso_now();
    c.metadata.modified_at = iso_now();
    let json_str = facet_json::to_string(&c).map_err(|e| e.to_string())?;
    serde_json::from_str(&json_str).map_err(|e| e.to_string())
}

fn rpc_sim_dc(params: &Value) -> Result<Value, String> {
    let circuit_json = serde_json::to_string(&params["circuit"]).map_err(|e| e.to_string())?;
    let circuit      = circuit_from_json(&circuit_json).map_err(|e| e.to_string())?;
    let result       = dc_analysis(&circuit).map_err(|e| e.to_string())?;
    let json_str     = facet_json::to_string(&result).map_err(|e| e.to_string())?;
    serde_json::from_str(&json_str).map_err(|e| e.to_string())
}

fn iso_now() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let s    = secs % 60;
    let m    = (secs / 60) % 60;
    let h    = (secs / 3600) % 24;
    let days = secs / 86400;
    format!("epoch+{days}d {h:02}:{m:02}:{s:02}Z")
}
