//! Component definition schema — parsed from `components/**/*.yaml`.
//!
//! These are static "type" definitions. `ComponentInstance` is an instantiation
//! of one of these on the schematic.
//!
//! **Single source of truth**: all types here derive `Facet`, which is used by
//! `eerie-codegen` to generate `src/renderer/src/types/generated.ts`.

use facet::Facet;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Facet, Serialize, Deserialize, Debug, Clone)]
pub struct ComponentDef {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub category: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub subcategory: Option<String>,
    #[serde(default)]
    pub keywords: Vec<String>,
    pub pins: Vec<PinDef>,
    pub symbol: SymbolDef,
    #[serde(default)]
    pub properties: Vec<PropertyDef>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub simulation: Option<SimModel>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub embedded: Option<EmbeddedDef>,
}

#[derive(Facet, Serialize, Deserialize, Debug, Clone)]
pub struct PinDef {
    pub id: String,
    pub name: String,
    pub position: XY,
    pub direction: PinDirection,
    #[serde(default)]
    pub pin_type: PinType,
}

#[derive(Facet, Serialize, Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "snake_case")]
pub enum PinDirection {
    #[default]
    Left,
    Right,
    Up,
    Down,
}

#[derive(Facet, Serialize, Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "snake_case")]
pub enum PinType {
    #[default]
    Passive,
    Input,
    Output,
    Bidirectional,
    Power,
    OpenCollector,
}

#[derive(Facet, Serialize, Deserialize, Debug, Clone, Copy)]
pub struct XY {
    pub x: f32,
    pub y: f32,
}

#[derive(Facet, Serialize, Deserialize, Debug, Clone)]
pub struct SymbolDef {
    pub bounds: Bounds,
    pub graphics: Vec<GraphicsElement>,
}

#[derive(Facet, Serialize, Deserialize, Debug, Clone, Copy)]
pub struct Bounds {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

/// A drawable element in a component symbol.
///
/// Flat struct rather than a tagged enum so that Facet generates
/// TypeScript types that match the JSON/YAML representation exactly.
/// The `kind` field discriminates which optional fields are in use.
#[derive(Facet, Serialize, Deserialize, Debug, Clone)]
pub struct GraphicsElement {
    pub kind: GraphicsElementKind,
    // ── line / polyline segment endpoints ───────────────────────────────────
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub x1: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub y1: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub x2: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub y2: Option<f32>,
    // ── rect / text position ─────────────────────────────────────────────────
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub x: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub y: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height: Option<f32>,
    // ── circle / arc ─────────────────────────────────────────────────────────
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cx: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cy: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub r: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub start_angle: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub end_angle: Option<f32>,
    // ── polyline ─────────────────────────────────────────────────────────────
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub points: Option<Vec<XY>>,
    // ── text ─────────────────────────────────────────────────────────────────
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_size: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub anchor: Option<TextAnchor>,
    // ── shared ───────────────────────────────────────────────────────────────
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stroke_width: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub filled: Option<bool>,
}

#[derive(Facet, Serialize, Deserialize, Debug, Clone, Copy)]
#[serde(rename_all = "snake_case")]
pub enum GraphicsElementKind {
    Line,
    Rect,
    Circle,
    Arc,
    Polyline,
    Text,
}

#[derive(Facet, Serialize, Deserialize, Debug, Clone, Copy, Default)]
#[serde(rename_all = "snake_case")]
pub enum TextAnchor {
    #[default]
    Start,
    Middle,
    End,
}

#[derive(Facet, Serialize, Deserialize, Debug, Clone)]
pub struct PropertyDef {
    pub id: String,
    pub label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unit: Option<String>,
    pub property_type: PropertyType,
    /// Default value for this property.
    pub default: DefaultValue,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max: Option<f64>,
    #[serde(default)]
    pub si_prefixes: bool,
    /// Restrict to these values (for enum-like properties).
    #[serde(default)]
    pub options: Vec<DefaultValue>,
}

/// Default value for a property — distinct from `PropertyValue` (which is
/// an instance override). Using an explicit enum keeps Facet output clean.
#[derive(Facet, Serialize, Deserialize, Debug, Clone)]
pub enum DefaultValue {
    Float(f64),
    Int(i64),
    Bool(bool),
    String(String),
}

#[derive(Facet, Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "snake_case")]
pub enum PropertyType {
    Float,
    Int,
    String,
    Bool,
    Enum,
}

#[derive(Facet, Serialize, Deserialize, Debug, Clone)]
pub struct SimModel {
    pub model_type: SimModelType,
    /// SPICE netlist template: use `{label}`, `{pin_id}`, `{property_id}`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub netlist: Option<String>,
    /// External .model or .subckt path (relative to the component file).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model_file: Option<String>,
}

#[derive(Facet, Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "snake_case")]
pub enum SimModelType {
    SpicePrimitive,
    SpiceSubckt,
    Behavioral,
    Ideal,
}

/// For MCU/FPGA components: how to simulate with QEMU or similar tools.
#[derive(Facet, Serialize, Deserialize, Debug, Clone)]
pub struct EmbeddedDef {
    pub platform: EmbeddedPlatform,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub qemu_machine: Option<String>,
    #[serde(default)]
    pub firmware_formats: Vec<String>,
    /// Maps pin_id → signal name (e.g. "PB0" → "GPIO_B0").
    #[serde(default)]
    pub pin_signals: HashMap<String, String>,
}

#[derive(Facet, Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "snake_case")]
pub enum EmbeddedPlatform {
    Avr,
    Arm,
    Riscv,
    Fpga,
    Custom,
}
