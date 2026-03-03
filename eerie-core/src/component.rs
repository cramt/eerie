use facet::Facet;
use std::collections::{HashMap, HashSet};

use crate::circuit::Circuit;

#[derive(Facet, Debug, Clone)]
#[repr(C)]
pub struct TwoPin {
    pub a: String,
    pub b: String,
}

#[derive(Facet, Debug, Clone)]
#[repr(C)]
pub struct BjtPins {
    pub collector: String,
    pub base: String,
    pub emitter: String,
}

#[derive(Facet, Debug, Clone)]
#[repr(C)]
pub struct MosfetPins {
    pub drain: String,
    pub gate: String,
    pub source: String,
    pub body: String,
}

#[derive(Facet, Debug, Clone)]
#[repr(C)]
pub struct OpAmpPins {
    pub non_inverting: String,
    pub inverting: String,
    pub output: String,
    pub v_pos: String,
    pub v_neg: String,
}

#[derive(Facet, Debug, Clone)]
#[repr(C)]
pub struct TransformerPins {
    pub primary_pos: String,
    pub primary_neg: String,
    pub secondary_pos: String,
    pub secondary_neg: String,
}

#[derive(Facet, Debug, Clone)]
#[repr(C)]
pub struct RelayPins {
    pub coil_pos: String,
    pub coil_neg: String,
    pub contact_common: String,
    pub contact_no: String,
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
        pins: TwoPin,
        resistance: f64,       // Ohms
        tolerance: f64,        // ± fraction
        temp_coefficient: f64, // ppm/K
    },

    Capacitor {
        pins: TwoPin,
        capacitance: f64,    // Farads
        esr: f64,            // Ohms
        leakage: f64,        // Amps
        voltage_rating: f64, // Volts
    },

    Inductor {
        pins: TwoPin,
        inductance: f64,         // Henry
        dcr: f64,                // Ohms
        saturation_current: f64, // Amps
    },

    Diode {
        pins: TwoPin,              // a = anode, b = cathode
        forward_voltage: f64,      // Volts
        reverse_breakdown: f64,    // Volts
        reverse_leakage: f64,      // Amps
        junction_capacitance: f64, // Farads
    },

    // ----- BJTs -----
    NPN {
        pins: BjtPins,
        beta: f64,
        vbe_on: f64,        // Volts
        vce_sat: f64,       // Volts
        early_voltage: f64, // Volts
    },

    PNP {
        pins: BjtPins,
        beta: f64,
        vbe_on: f64,
        vce_sat: f64,
        early_voltage: f64,
    },

    // ----- MOSFETs / IGBTs -----
    NMOS {
        pins: MosfetPins,
        threshold_voltage: f64, // Volts
        k: f64,                 // Transconductance parameter
        channel_length_mod: f64,
        rds_on: f64,           // Ohms
        gate_capacitance: f64, // Farads
    },

    PMOS {
        pins: MosfetPins,
        threshold_voltage: f64,
        k: f64,
        channel_length_mod: f64,
        rds_on: f64,
        gate_capacitance: f64,
    },

    IGBT {
        pins: MosfetPins,    // Gate, Collector, Emitter, (Body unused)
        gate_threshold: f64, // Volts
        vce_sat: f64,        // Volts
        tail_current: f64,   // Amps
        switching_loss: f64, // Joules
    },

    // ----- Analog ICs -----
    OpAmp {
        pins: OpAmpPins,
        gain: f64,               // Open-loop gain
        bandwidth: f64,          // Hz
        slew_rate: f64,          // V/s
        input_offset: f64,       // Volts
        input_bias_current: f64, // Amps
        output_impedance: f64,   // Ohms
    },

    // ----- Magnetics -----
    Transformer {
        pins: TransformerPins,
        primary_inductance: f64, // Henry
        turns_ratio: f64,        // Ns / Np
        coupling: f64,           // 0.0 .. 1.0
        core_loss: f64,          // Watts
    },

    // ----- Electromechanical -----
    Relay {
        pins: RelayPins,
        coil_resistance: f64,    // Ohms
        pull_in_voltage: f64,    // Volts
        drop_out_voltage: f64,   // Volts
        contact_resistance: f64, // Ohms
        switching_time: f64,     // Seconds
    },

    // ----- Sources -----
    VoltageSource {
        pins: TwoPin,
        voltage: f64,             // Volts
        internal_resistance: f64, // Ohms
    },

    CurrentSource {
        pins: TwoPin,
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
            | Component::VoltageSource { pins, .. }
            | Component::CurrentSource { pins, .. } => {
                [pins.a.as_str(), pins.b.as_str()].into_iter().collect()
            }
            Component::NPN { pins, .. } | Component::PNP { pins, .. } => [
                pins.collector.as_str(),
                pins.base.as_str(),
                pins.emitter.as_str(),
            ]
            .into_iter()
            .collect(),
            Component::NMOS { pins, .. }
            | Component::PMOS { pins, .. }
            | Component::IGBT { pins, .. } => [
                pins.drain.as_str(),
                pins.gate.as_str(),
                pins.source.as_str(),
                pins.body.as_str(),
            ]
            .into_iter()
            .collect(),
            Component::OpAmp { pins, .. } => [
                pins.non_inverting.as_str(),
                pins.inverting.as_str(),
                pins.output.as_str(),
                pins.v_pos.as_str(),
                pins.v_neg.as_str(),
            ]
            .into_iter()
            .collect(),
            Component::Transformer { pins, .. } => [
                pins.primary_pos.as_str(),
                pins.primary_neg.as_str(),
                pins.secondary_pos.as_str(),
                pins.secondary_neg.as_str(),
            ]
            .into_iter()
            .collect(),
            Component::Relay { pins, .. } => [
                pins.coil_pos.as_str(),
                pins.coil_neg.as_str(),
                pins.contact_common.as_str(),
                pins.contact_no.as_str(),
            ]
            .into_iter()
            .collect(),
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
