pub mod mna;

use facet::Facet;
use std::collections::HashMap;
use thiserror::Error;

pub use mna::dc_analysis;

#[derive(Facet, Debug, Clone)]
pub struct SimulationResult {
    pub node_voltages: HashMap<String, f64>,
    pub branch_currents: HashMap<String, f64>,
    pub converged: bool,
    pub analysis_type: AnalysisType,
}

#[derive(Facet, Debug, Clone)]
pub enum AnalysisType {
    Dc,
    Ac { frequency_hz: f64 },
    Transient { time_s: f64 },
}

#[derive(Debug, Error)]
pub enum SimError {
    #[error("Singular matrix — circuit may be floating or disconnected")]
    SingularMatrix,
    #[error("Missing property '{0}' on component '{1}'")]
    MissingProperty(String, String),
    #[error("Circuit has no ground node — add a GND symbol")]
    NoGround,
}
