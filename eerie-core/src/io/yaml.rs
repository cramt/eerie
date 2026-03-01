use crate::circuit::Circuit;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum IoError {
    #[error("YAML parse error: {0}")]
    Parse(#[from] serde_yaml::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
}

/// Deserialize a circuit from a `.eerie` YAML file's contents.
pub fn circuit_from_yaml(src: &str) -> Result<Circuit, IoError> {
    let circuit: Circuit = serde_yaml::from_str(src)?;
    Ok(circuit)
}

/// Serialize a circuit to YAML for saving as a `.eerie` file.
pub fn circuit_to_yaml(circuit: &Circuit) -> Result<String, IoError> {
    let yaml = serde_yaml::to_string(circuit)?;
    Ok(yaml)
}

/// Round-trip through JSON (for IPC between Electron and WASM/daemon).
pub fn circuit_to_json(circuit: &Circuit) -> Result<String, IoError> {
    Ok(serde_json::to_string_pretty(circuit)?)
}

pub fn circuit_from_json(src: &str) -> Result<Circuit, IoError> {
    Ok(serde_json::from_str(src)?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::circuit::Circuit;

    #[test]
    fn test_roundtrip_yaml() {
        let mut circuit = Circuit::new("test");
        circuit.description = Some("Round-trip test".into());

        let yaml = circuit_to_yaml(&circuit).unwrap();
        let recovered = circuit_from_yaml(&yaml).unwrap();

        assert_eq!(circuit.name, recovered.name);
        assert_eq!(circuit.id, recovered.id);
    }

    #[test]
    fn test_roundtrip_json() {
        let circuit = Circuit::new("json_test");
        let json = circuit_to_json(&circuit).unwrap();
        let recovered = circuit_from_json(&json).unwrap();
        assert_eq!(circuit.id, recovered.id);
    }
}
