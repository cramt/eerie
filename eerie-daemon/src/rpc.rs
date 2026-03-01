use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};

use eerie_core::io::yaml::{circuit_from_json, circuit_from_yaml, circuit_to_json, circuit_to_yaml};
use eerie_core::simulation::mna::dc_analysis;
use eerie_core::circuit::Circuit;

#[derive(Debug, Deserialize)]
pub struct Request {
    pub id: Value,
    pub method: String,
    #[serde(default)]
    pub params: Value,
}

pub fn dispatch(req: Request) -> String {
    let id = req.id.clone();
    let result = match req.method.as_str() {
        "ping" => Ok(Value::String("pong".into())),
        "file.read" => rpc_file_read(&req.params),
        "file.write" => rpc_file_write(&req.params),
        "circuit.parse_yaml" => rpc_parse_yaml(&req.params),
        "circuit.to_yaml" => rpc_to_yaml(&req.params),
        "circuit.new" => rpc_new_circuit(&req.params),
        "sim.dc" => rpc_sim_dc(&req.params),
        other => Err(format!("unknown method: {other}")),
    };

    match result {
        Ok(val) => {
            let resp = serde_json::json!({ "id": id, "result": val });
            serde_json::to_string(&resp).unwrap_or_else(|e| format!(r#"{{"id":null,"error":"{e}"}}"#))
        }
        Err(msg) => {
            let resp = serde_json::json!({ "id": id, "error": msg });
            serde_json::to_string(&resp).unwrap_or_else(|e| format!(r#"{{"id":null,"error":"{e}"}}"#))
        }
    }
}

fn rpc_file_read(params: &Value) -> Result<Value, String> {
    let path = params["path"].as_str().ok_or("missing 'path'")?;
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    Ok(Value::String(content))
}

fn rpc_file_write(params: &Value) -> Result<Value, String> {
    let path = params["path"].as_str().ok_or("missing 'path'")?;
    let content = params["content"].as_str().ok_or("missing 'content'")?;
    fs::write(path, content).map_err(|e| e.to_string())?;
    Ok(Value::Bool(true))
}

fn rpc_parse_yaml(params: &Value) -> Result<Value, String> {
    let yaml = params["yaml"].as_str().ok_or("missing 'yaml'")?;
    let circuit = circuit_from_yaml(yaml).map_err(|e| e.to_string())?;
    let json = circuit_to_json(&circuit).map_err(|e| e.to_string())?;
    serde_json::from_str(&json).map_err(|e| e.to_string())
}

fn rpc_to_yaml(params: &Value) -> Result<Value, String> {
    let circuit_json = serde_json::to_string(&params["circuit"]).map_err(|e| e.to_string())?;
    let circuit = circuit_from_json(&circuit_json).map_err(|e| e.to_string())?;
    let mut c = circuit;
    c.metadata.modified_at = iso_now();
    let yaml = circuit_to_yaml(&c).map_err(|e| e.to_string())?;
    Ok(Value::String(yaml))
}

fn rpc_new_circuit(params: &Value) -> Result<Value, String> {
    let name = params["name"].as_str().unwrap_or("Untitled");
    let mut c = Circuit::new(name);
    c.metadata.created_at = iso_now();
    c.metadata.modified_at = iso_now();
    let json = circuit_to_json(&c).map_err(|e| e.to_string())?;
    serde_json::from_str(&json).map_err(|e| e.to_string())
}

fn rpc_sim_dc(params: &Value) -> Result<Value, String> {
    let circuit_json = serde_json::to_string(&params["circuit"]).map_err(|e| e.to_string())?;
    let circuit = circuit_from_json(&circuit_json).map_err(|e| e.to_string())?;
    let result = dc_analysis(&circuit).map_err(|e| e.to_string())?;
    serde_json::to_value(&result).map_err(|e| e.to_string())
}

fn iso_now() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let s = secs % 60;
    let m = (secs / 60) % 60;
    let h = (secs / 3600) % 24;
    let days = secs / 86400;
    // Approximate timestamp without pulling in chrono (good enough for file metadata)
    format!("epoch+{days}d {h:02}:{m:02}:{s:02}Z")
}
