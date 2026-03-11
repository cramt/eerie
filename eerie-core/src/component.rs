use facet::Facet;
use std::collections::{HashMap, HashSet};

use crate::circuit::Circuit;

//
// ---------- Pin metadata (single source of truth) ----------
//

/// Pin definition metadata for a component type.
#[derive(Facet, Debug, Clone)]
pub struct PinMeta {
    /// Canonical pin name used in the UI (e.g., "a", "collector", "positive").
    pub name: String,
    /// Alias used in .eerie files (e.g., "p" for "a", "n" for "b").
    /// When absent, the canonical name is used as-is.
    pub file_alias: Option<String>,
}

impl PinMeta {
    fn new(name: &str) -> Self {
        Self {
            name: name.to_string(),
            file_alias: None,
        }
    }
    fn with_alias(name: &str, alias: &str) -> Self {
        Self {
            name: name.to_string(),
            file_alias: Some(alias.to_string()),
        }
    }
}

/// All known component type IDs.
pub const COMPONENT_KINDS: &[&str] = &[
    "resistor",
    "capacitor",
    "inductor",
    "diode",
    "npn",
    "pnp",
    "nmos",
    "pmos",
    "igbt",
    "opamp",
    "transformer",
    "relay",
    "dc_voltage",
    "dc_current",
    "ground",
];

/// Returns the canonical pin definitions for a component type ID.
/// This is the single source of truth for pin names across Rust and TypeScript.
pub fn pin_definitions(type_id: &str) -> Vec<PinMeta> {
    match type_id {
        "resistor" | "capacitor" | "inductor" => vec![
            PinMeta::with_alias("a", "p"),
            PinMeta::with_alias("b", "n"),
        ],
        "diode" => vec![
            PinMeta::with_alias("anode", "p"),
            PinMeta::with_alias("cathode", "n"),
        ],
        "npn" | "pnp" => vec![
            PinMeta::new("collector"),
            PinMeta::new("base"),
            PinMeta::new("emitter"),
        ],
        "nmos" | "pmos" | "igbt" => vec![
            PinMeta::new("drain"),
            PinMeta::new("gate"),
            PinMeta::new("source"),
            PinMeta::new("body"),
        ],
        "opamp" => vec![
            PinMeta::new("non_inverting"),
            PinMeta::new("inverting"),
            PinMeta::new("output"),
            PinMeta::new("v_pos"),
            PinMeta::new("v_neg"),
        ],
        "transformer" => vec![
            PinMeta::new("primary_pos"),
            PinMeta::new("primary_neg"),
            PinMeta::new("secondary_pos"),
            PinMeta::new("secondary_neg"),
        ],
        "relay" => vec![
            PinMeta::new("coil_pos"),
            PinMeta::new("coil_neg"),
            PinMeta::new("contact_common"),
            PinMeta::new("contact_no"),
        ],
        "dc_voltage" | "dc_current" => vec![
            PinMeta::with_alias("positive", "p"),
            PinMeta::with_alias("negative", "n"),
        ],
        "ground" => vec![PinMeta::with_alias("gnd", "p")],
        _ => vec![],
    }
}

//
// ---------- Metadata ----------
//

#[derive(Facet, Debug, Clone)]
pub struct Metadata {
    pub name: String,                  // R1, Q3, M7
    pub description: Option<String>,   // Optional comment
    pub tags: HashMap<String, String>, // TEMP=27, W=1u, L=180n
}

#[derive(Facet, Debug, Clone)]
#[repr(C)]
pub enum Component {
    // ----- Passive -----
    Resistor {
        pins: HashMap<String, String>,
        resistance: f64,       // Ohms
        tolerance: f64,        // +/- fraction
        temp_coefficient: f64, // ppm/K
    },

    Capacitor {
        pins: HashMap<String, String>,
        capacitance: f64,    // Farads
        esr: f64,            // Ohms
        leakage: f64,        // Amps
        voltage_rating: f64, // Volts
    },

    Inductor {
        pins: HashMap<String, String>,
        inductance: f64,         // Henry
        dcr: f64,                // Ohms
        saturation_current: f64, // Amps
    },

    Diode {
        pins: HashMap<String, String>,
        forward_voltage: f64,      // Volts
        reverse_breakdown: f64,    // Volts
        reverse_leakage: f64,      // Amps
        junction_capacitance: f64, // Farads
    },

    // ----- BJTs -----
    NPN {
        pins: HashMap<String, String>,
        beta: f64,
        vbe_on: f64,        // Volts
        vce_sat: f64,       // Volts
        early_voltage: f64, // Volts
    },

    PNP {
        pins: HashMap<String, String>,
        beta: f64,
        vbe_on: f64,
        vce_sat: f64,
        early_voltage: f64,
    },

    // ----- MOSFETs / IGBTs -----
    NMOS {
        pins: HashMap<String, String>,
        threshold_voltage: f64, // Volts
        k: f64,                 // Transconductance parameter
        channel_length_mod: f64,
        rds_on: f64,           // Ohms
        gate_capacitance: f64, // Farads
    },

    PMOS {
        pins: HashMap<String, String>,
        threshold_voltage: f64,
        k: f64,
        channel_length_mod: f64,
        rds_on: f64,
        gate_capacitance: f64,
    },

    IGBT {
        pins: HashMap<String, String>,
        gate_threshold: f64, // Volts
        vce_sat: f64,        // Volts
        tail_current: f64,   // Amps
        switching_loss: f64, // Joules
    },

    // ----- Analog ICs -----
    OpAmp {
        pins: HashMap<String, String>,
        gain: f64,               // Open-loop gain
        bandwidth: f64,          // Hz
        slew_rate: f64,          // V/s
        input_offset: f64,       // Volts
        input_bias_current: f64, // Amps
        output_impedance: f64,   // Ohms
    },

    // ----- Magnetics -----
    Transformer {
        pins: HashMap<String, String>,
        primary_inductance: f64, // Henry
        turns_ratio: f64,        // Ns / Np
        coupling: f64,           // 0.0 .. 1.0
        core_loss: f64,          // Watts
    },

    // ----- Electromechanical -----
    Relay {
        pins: HashMap<String, String>,
        coil_resistance: f64,    // Ohms
        pull_in_voltage: f64,    // Volts
        drop_out_voltage: f64,   // Volts
        contact_resistance: f64, // Ohms
        switching_time: f64,     // Seconds
    },

    // ----- Sources -----
    VoltageSource {
        pins: HashMap<String, String>,
        voltage: f64,             // Volts
        internal_resistance: f64, // Ohms
    },

    CurrentSource {
        pins: HashMap<String, String>,
        current: f64,            // Amps
        compliance_voltage: f64, // Volts
    },

    Composite {
        circuit: Circuit,
    },
}

impl Component {
    pub fn pin_names(&self) -> HashSet<&str> {
        match self {
            Component::Resistor { pins, .. }
            | Component::Capacitor { pins, .. }
            | Component::Inductor { pins, .. }
            | Component::Diode { pins, .. }
            | Component::NPN { pins, .. }
            | Component::PNP { pins, .. }
            | Component::NMOS { pins, .. }
            | Component::PMOS { pins, .. }
            | Component::IGBT { pins, .. }
            | Component::OpAmp { pins, .. }
            | Component::Transformer { pins, .. }
            | Component::Relay { pins, .. }
            | Component::VoltageSource { pins, .. }
            | Component::CurrentSource { pins, .. } => {
                pins.keys().map(|k| k.as_str()).collect()
            }
            Component::Composite { circuit } => circuit.pins.iter().map(|x| x.as_str()).collect(),
        }
    }
}

//
// ---------- Component instance (what a netlist line becomes) ----------
//

#[derive(Facet, Debug, Clone)]
pub struct ComponentData {
    pub meta: Metadata,
    pub component: Component,
}
