//! Generate ComponentDef YAML from parsed SPICE data.

use serde::{Deserialize, Serialize};

use crate::parser::{ModelType, SpiceModel, SpiceSubckt};
use crate::symbol::{self, SymbolDef, XY};

// ──────────────────────────────────────────────────────────────────────────────
// Serde types mirroring eerie-core's ComponentDef (YAML output format)
// ──────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct ComponentDef {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub category: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subcategory: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub keywords: Vec<String>,
    pub pins: Vec<PinDef>,
    pub symbol: SymbolDef,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub properties: Vec<PropertyDef>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub simulation: Option<SimModel>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PinDef {
    pub id: String,
    pub name: String,
    pub position: XY,
    pub direction: String,
    pub pin_type: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PropertyDef {
    pub id: String,
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unit: Option<String>,
    pub property_type: String,
    pub default: serde_yaml::Value,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SimModel {
    pub model_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub netlist: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_name: Option<String>,
}

// ──────────────────────────────────────────────────────────────────────────────
// Conversion from parsed SPICE
// ──────────────────────────────────────────────────────────────────────────────

/// Convert a `.MODEL` statement into a `ComponentDef`.
pub fn model_to_component(m: &SpiceModel) -> Option<ComponentDef> {
    match &m.model_type {
        ModelType::D => Some(diode_component(m)),
        ModelType::Npn => Some(bjt_component(m, "npn")),
        ModelType::Pnp => Some(bjt_component(m, "pnp")),
        ModelType::Nmos => Some(mosfet_component(m, "nmos")),
        ModelType::Pmos => Some(mosfet_component(m, "pmos")),
        ModelType::Njf => Some(jfet_component(m, "njf")),
        ModelType::Pjf => Some(jfet_component(m, "pjf")),
        ModelType::Other(_) => None, // skip unsupported types
    }
}

/// Convert a `.SUBCKT` definition into a `ComponentDef`.
pub fn subckt_to_component(s: &SpiceSubckt) -> ComponentDef {
    let id = safe_id(&s.name);
    let kind = classify_subckt(s);

    let (pins, sym, cat, subcat, netlist) = match kind {
        SubcktKind::Opamp => opamp_from_subckt(s),
        SubcktKind::Mosfet => mosfet_subckt_from(s),
        SubcktKind::Generic => generic_subckt_from(s),
    };

    ComponentDef {
        id: id.clone(),
        name: s.name.clone(),
        description: Some(format!("SPICE subcircuit: {}", s.name)),
        category: cat,
        subcategory: subcat,
        keywords: vec!["spice".into(), "subckt".into()],
        pins,
        symbol: sym,
        properties: vec![],
        simulation: Some(SimModel {
            model_type: "spice_subckt".into(),
            netlist: Some(netlist),
            model_name: Some(s.name.clone()),
        }),
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Device-specific builders
// ──────────────────────────────────────────────────────────────────────────────

fn diode_component(m: &SpiceModel) -> ComponentDef {
    let id = safe_id(&m.name);
    ComponentDef {
        id: id.clone(),
        name: m.name.clone(),
        description: Some(format!("SPICE diode model: {}", m.name)),
        category: "semiconductor".into(),
        subcategory: Some("diodes".into()),
        keywords: vec!["diode".into(), "spice".into()],
        pins: vec![
            pin("a", "Anode",   -10.0, 0.0, "left",  "passive"),
            pin("k", "Cathode",  10.0, 0.0, "right", "passive"),
        ],
        symbol: symbol::diode_symbol(),
        properties: vec![],
        simulation: Some(SimModel {
            model_type: "spice_primitive".into(),
            netlist: Some(format!("D{{label}} {{a}} {{k}} {}", m.name)),
            model_name: Some(m.name.clone()),
        }),
    }
}

fn bjt_component(m: &SpiceModel, polarity: &str) -> ComponentDef {
    let id = safe_id(&m.name);
    let sym = if polarity == "npn" {
        symbol::npn_symbol()
    } else {
        symbol::pnp_symbol()
    };
    let subcat = if polarity == "npn" { "npn" } else { "pnp" };
    ComponentDef {
        id: id.clone(),
        name: m.name.clone(),
        description: Some(format!("SPICE {} BJT model: {}", polarity.to_uppercase(), m.name)),
        category: "semiconductor".into(),
        subcategory: Some(format!("bjt/{}", subcat)),
        keywords: vec!["bjt".into(), "transistor".into(), polarity.into(), "spice".into()],
        pins: vec![
            pin("b", "Base",      -10.0,  0.0, "left",  "input"),
            pin("c", "Collector",  10.0, -12.0, "up",    "passive"),
            pin("e", "Emitter",    10.0,  12.0, "down",  "passive"),
        ],
        symbol: sym,
        properties: vec![],
        simulation: Some(SimModel {
            model_type: "spice_primitive".into(),
            netlist: Some(format!("Q{{label}} {{c}} {{b}} {{e}} {}", m.name)),
            model_name: Some(m.name.clone()),
        }),
    }
}

fn mosfet_component(m: &SpiceModel, polarity: &str) -> ComponentDef {
    let id = safe_id(&m.name);
    let sym = if polarity == "nmos" {
        symbol::nmos_symbol()
    } else {
        symbol::pmos_symbol()
    };
    let subcat = if polarity == "nmos" { "n-channel" } else { "p-channel" };
    ComponentDef {
        id: id.clone(),
        name: m.name.clone(),
        description: Some(format!("SPICE {} MOSFET model: {}", polarity.to_uppercase(), m.name)),
        category: "semiconductor".into(),
        subcategory: Some(format!("mosfet/{}", subcat)),
        keywords: vec!["mosfet".into(), "transistor".into(), polarity.into(), "spice".into()],
        pins: vec![
            pin("g", "Gate",   -10.0,  0.0, "left", "input"),
            pin("d", "Drain",   10.0, -12.0, "up",   "passive"),
            pin("s", "Source",  10.0,  12.0, "down", "passive"),
        ],
        symbol: sym,
        properties: vec![],
        simulation: Some(SimModel {
            model_type: "spice_primitive".into(),
            netlist: Some(format!("M{{label}} {{d}} {{g}} {{s}} {{s}} {}", m.name)),
            model_name: Some(m.name.clone()),
        }),
    }
}

fn jfet_component(m: &SpiceModel, polarity: &str) -> ComponentDef {
    let id = safe_id(&m.name);
    let subcat = if polarity == "njf" { "n-channel" } else { "p-channel" };
    ComponentDef {
        id: id.clone(),
        name: m.name.clone(),
        description: Some(format!("SPICE {} JFET model: {}", polarity.to_uppercase(), m.name)),
        category: "semiconductor".into(),
        subcategory: Some(format!("jfet/{}", subcat)),
        keywords: vec!["jfet".into(), "transistor".into(), polarity.into(), "spice".into()],
        pins: vec![
            pin("g", "Gate",   -10.0,  0.0, "left", "input"),
            pin("d", "Drain",   10.0, -12.0, "up",   "passive"),
            pin("s", "Source",  10.0,  12.0, "down", "passive"),
        ],
        symbol: symbol::nmos_symbol(), // reuse MOSFET-style box for now
        properties: vec![],
        simulation: Some(SimModel {
            model_type: "spice_primitive".into(),
            netlist: Some(format!("J{{label}} {{d}} {{g}} {{s}} {}", m.name)),
            model_name: Some(m.name.clone()),
        }),
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Subcircuit classification & pin builders
// ──────────────────────────────────────────────────────────────────────────────

enum SubcktKind {
    Opamp,
    Mosfet,
    Generic,
}

fn classify_subckt(s: &SpiceSubckt) -> SubcktKind {
    let ports: Vec<String> = s.ports.iter().map(|p| p.to_uppercase()).collect();

    // Check port names for MOSFET keywords
    let mosfet_ports = ports.iter().any(|p| {
        matches!(p.as_str(), "DRAIN" | "GATE" | "SOURCE" | "D" | "G" | "S")
    });
    if mosfet_ports {
        return SubcktKind::Mosfet;
    }

    // Check for op-amp style (typically IN+, IN-, V+, V-, OUT or numeric with 5 ports)
    let opamp_ports = ports.iter().any(|p| {
        p.contains("IN") || p.contains("OUT") || p == "INP" || p == "INN"
    });
    // Many op-amp subckts have exactly 5 ports: IN+, IN-, V+, V-, OUT
    if s.ports.len() == 5 || opamp_ports {
        return SubcktKind::Opamp;
    }

    SubcktKind::Generic
}

fn opamp_from_subckt(
    s: &SpiceSubckt,
) -> (Vec<PinDef>, SymbolDef, String, Option<String>, String) {
    // Try to map named ports; fall back to positional (classic 5-pin order: IN+ IN- V+ V- OUT)
    let ports = &s.ports;
    let (inp_id, inn_id, vp_id, vn_id, out_id) = if ports.len() >= 5 {
        (
            ports[0].clone(),
            ports[1].clone(),
            ports[2].clone(),
            ports[3].clone(),
            ports[4].clone(),
        )
    } else {
        // Try named mapping
        let find = |pat: &str| {
            ports
                .iter()
                .find(|p| p.to_uppercase().contains(pat))
                .cloned()
                .unwrap_or_else(|| pat.to_lowercase())
        };
        (find("INP"), find("INN"), find("VP"), find("VN"), find("OUT"))
    };

    let netlist = format!(
        "X{{label}} {{{inp_id}}} {{{inn_id}}} {{{vp_id}}} {{{vn_id}}} {{{out_id}}} {}",
        s.name
    );

    let pins = vec![
        pin(&inp_id, "IN+", -16.0, -6.0, "left",  "input"),
        pin(&inn_id, "IN-", -16.0,  6.0, "left",  "input"),
        pin(&vp_id,  "V+",   0.0, -14.0, "up",    "power"),
        pin(&vn_id,  "V-",   0.0,  14.0, "down",  "power"),
        pin(&out_id, "OUT",  20.0,  0.0, "right", "output"),
    ];

    (
        pins,
        symbol::opamp_symbol(),
        "semiconductor".into(),
        Some("opamps".into()),
        netlist,
    )
}

fn mosfet_subckt_from(
    s: &SpiceSubckt,
) -> (Vec<PinDef>, SymbolDef, String, Option<String>, String) {
    let ports = &s.ports;
    // Common naming: drain gate source [Tj Tcase]
    let find_port = |names: &[&str]| -> String {
        ports
            .iter()
            .find(|p| {
                let u = p.to_uppercase();
                names.iter().any(|n| u == *n || u.starts_with(n))
            })
            .cloned()
            .unwrap_or_else(|| names[0].to_lowercase())
    };

    let d = find_port(&["DRAIN", "D", "DD"]);
    let g = find_port(&["GATE", "G"]);
    let s_port = find_port(&["SOURCE", "S"]);

    let netlist = format!("X{{label}} {{{d}}} {{{g}}} {{{s_port}}} {}", s.name);

    let pins = vec![
        pin(&g,      "Gate",   -10.0,  0.0, "left", "input"),
        pin(&d,      "Drain",   10.0, -12.0, "up",   "passive"),
        pin(&s_port, "Source",  10.0,  12.0, "down", "passive"),
    ];

    (
        pins,
        symbol::nmos_symbol(),
        "semiconductor".into(),
        Some("mosfet/n-channel".into()),
        netlist,
    )
}

fn generic_subckt_from(
    s: &SpiceSubckt,
) -> (Vec<PinDef>, SymbolDef, String, Option<String>, String) {
    let n = s.ports.len().max(1);
    let half = ((n as f32) * 10.0) / 2.0;
    let step = if n > 1 { n as f32 - 1.0 } else { 1.0 };

    let pins: Vec<PinDef> = s
        .ports
        .iter()
        .enumerate()
        .map(|(i, port)| {
            let y = -half + (i as f32 / step.max(1.0)) * (n as f32) * 10.0 / step.max(1.0);
            pin(port, port.as_str(), -16.0, y, "left", "passive")
        })
        .collect();

    let port_refs: String = s.ports.iter().map(|p| format!(" {{{p}}}")).collect();
    let netlist = format!("X{{label}}{port_refs} {}", s.name);

    (
        pins,
        symbol::subckt_symbol(n),
        "subcircuit".into(),
        None,
        netlist,
    )
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

fn pin(id: &str, name: &str, x: f32, y: f32, direction: &str, pin_type: &str) -> PinDef {
    PinDef {
        id: safe_id(id),
        name: name.to_string(),
        position: XY { x, y },
        direction: direction.to_string(),
        pin_type: pin_type.to_string(),
    }
}

/// Turn a SPICE name into a valid lowercase YAML id (replace non-alphanumeric with `_`).
pub fn safe_id(name: &str) -> String {
    name.chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '_' {
                c.to_lowercase().next().unwrap()
            } else {
                '_'
            }
        })
        .collect()
}
