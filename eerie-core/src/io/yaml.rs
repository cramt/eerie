use thiserror::Error;

use crate::circuit::Circuit;

#[derive(Debug, Error)]
pub enum IoError {
    #[error("YAML error: {0}")]
    Yaml(String),
    #[error("JSON error: {0}")]
    Json(String),
}

pub fn circuit_from_yaml(src: &str) -> Result<Circuit, IoError> {
    facet_yaml::from_str::<Circuit>(src).map_err(|e| IoError::Yaml(e.to_string()))
}

pub fn circuit_to_yaml(circuit: &Circuit) -> Result<String, IoError> {
    facet_yaml::to_string(circuit).map_err(|e| IoError::Yaml(e.to_string()))
}

pub fn circuit_to_json(circuit: &Circuit) -> Result<String, IoError> {
    facet_json::to_string_pretty(circuit).map_err(|e| IoError::Json(e.to_string()))
}

pub fn circuit_from_json(src: &str) -> Result<Circuit, IoError> {
    facet_json::from_str::<Circuit>(src).map_err(|e| IoError::Json(e.to_string()))
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
