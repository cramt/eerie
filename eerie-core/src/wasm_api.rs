//! WASM-bindgen API — compiled when feature "wasm" is enabled.
//! This is what the Electron renderer calls from TypeScript.

use wasm_bindgen::prelude::*;

use crate::circuit::Circuit;
use crate::component::{ComponentInstance, PropertyValue};
use crate::io::yaml::{circuit_from_json, circuit_from_yaml, circuit_to_json, circuit_to_yaml};
use crate::simulation::mna::dc_analysis;

/// Call this once to get better panic messages in the browser console.
#[wasm_bindgen(start)]
pub fn init_panic_hook() {
    console_error_panic_hook::set_once();
}

/// Create a new empty circuit, returning it as a JSON string.
#[wasm_bindgen]
pub fn new_circuit(name: &str) -> String {
    let c = Circuit::new(name);
    circuit_to_json(&c).unwrap_or_else(|e| format!("{{\"error\":\"{e}\"}}"))
}

/// Parse a YAML `.eerie` file to JSON (for the React store).
#[wasm_bindgen]
pub fn parse_eerie_yaml(yaml_src: &str) -> Result<String, JsValue> {
    let c = circuit_from_yaml(yaml_src).map_err(|e| JsValue::from_str(&e.to_string()))?;
    circuit_to_json(&c).map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Serialize the circuit (provided as JSON) back to YAML for saving.
#[wasm_bindgen]
pub fn serialize_to_yaml(circuit_json: &str) -> Result<String, JsValue> {
    let c = circuit_from_json(circuit_json).map_err(|e| JsValue::from_str(&e.to_string()))?;
    circuit_to_yaml(&c).map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Run DC operating-point analysis on a circuit (provided as JSON).
/// Returns simulation results as JSON.
#[wasm_bindgen]
pub fn run_dc(circuit_json: &str) -> Result<String, JsValue> {
    let c = circuit_from_json(circuit_json).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let result = dc_analysis(&c).map_err(|e| JsValue::from_str(&e.to_string()))?;
    serde_json::to_string(&result).map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Add a component to a circuit. Both circuit and returned value are JSON.
#[wasm_bindgen]
pub fn add_component(
    circuit_json: &str,
    type_id: &str,
    x: i32,
    y: i32,
) -> Result<String, JsValue> {
    let mut c = circuit_from_json(circuit_json).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let comp = ComponentInstance::new(type_id, x, y);
    c.components.push(comp);
    c.touch();
    circuit_to_json(&c).map_err(|e| JsValue::from_str(&e.to_string()))
}
