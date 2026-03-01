//! Component definition schema — parsed from `components/**/*.yaml`.
//!
//! All types derive `Facet` — single source of truth for TypeScript types.
//! Run `pnpm codegen` after any changes here.

use facet::Facet;
use std::collections::HashMap;

#[derive(Facet, Debug, Clone)]
pub struct ComponentDef {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub category: String,
    pub subcategory: Option<String>,
    #[facet(default)]
    pub keywords: Vec<String>,
    pub pins: Vec<PinDef>,
    pub symbol: SymbolDef,
    #[facet(default)]
    pub properties: Vec<PropertyDef>,
    pub simulation: Option<SimModel>,
    pub embedded: Option<EmbeddedDef>,
}

#[derive(Facet, Debug, Clone)]
pub struct PinDef {
    pub id: String,
    pub name: String,
    pub position: XY,
    pub direction: PinDirection,
    #[facet(default)]
    pub pin_type: PinType,
}

#[derive(Facet, Debug, Clone, Default)]
#[facet(rename_all = "snake_case")]
pub enum PinDirection {
    #[default]
    Left,
    Right,
    Up,
    Down,
}

#[derive(Facet, Debug, Clone, Default)]
#[facet(rename_all = "snake_case")]
pub enum PinType {
    #[default]
    Passive,
    Input,
    Output,
    Bidirectional,
    Power,
    OpenCollector,
}

#[derive(Facet, Debug, Clone, Copy)]
pub struct XY {
    pub x: f32,
    pub y: f32,
}

#[derive(Facet, Debug, Clone)]
pub struct SymbolDef {
    pub bounds: Bounds,
    pub graphics: Vec<GraphicsElement>,
}

#[derive(Facet, Debug, Clone, Copy)]
pub struct Bounds {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

/// A drawable element in a component symbol.
///
/// Flat struct with a `kind` discriminant rather than a Rust enum,
/// so Facet generates a clean TypeScript type and the YAML format
/// is straightforward to hand-author.
#[derive(Facet, Debug, Clone)]
pub struct GraphicsElement {
    pub kind: GraphicsElementKind,
    pub x1: Option<f32>,
    pub y1: Option<f32>,
    pub x2: Option<f32>,
    pub y2: Option<f32>,
    pub x: Option<f32>,
    pub y: Option<f32>,
    pub width: Option<f32>,
    pub height: Option<f32>,
    pub cx: Option<f32>,
    pub cy: Option<f32>,
    pub r: Option<f32>,
    pub start_angle: Option<f32>,
    pub end_angle: Option<f32>,
    pub points: Option<Vec<XY>>,
    pub content: Option<String>,
    pub font_size: Option<f32>,
    pub anchor: Option<TextAnchor>,
    pub stroke_width: Option<f32>,
    pub filled: Option<bool>,
}

#[derive(Facet, Debug, Clone, Copy)]
#[facet(rename_all = "snake_case")]
pub enum GraphicsElementKind {
    Line,
    Rect,
    Circle,
    Arc,
    Polyline,
    Text,
}

#[derive(Facet, Debug, Clone, Copy, Default)]
#[facet(rename_all = "snake_case")]
pub enum TextAnchor {
    #[default]
    Start,
    Middle,
    End,
}

#[derive(Facet, Debug, Clone)]
pub struct PropertyDef {
    pub id: String,
    pub label: String,
    pub unit: Option<String>,
    pub property_type: PropertyType,
    pub default: DefaultValue,
    pub min: Option<f64>,
    pub max: Option<f64>,
    #[facet(default)]
    pub si_prefixes: bool,
    #[facet(default)]
    pub options: Vec<DefaultValue>,
}

/// Default value for a property definition.
/// Uses PascalCase tagging: `{ Float: 1000.0 }`, `{ String: "hello" }`.
#[derive(Facet, Debug, Clone)]
pub enum DefaultValue {
    Float(f64),
    Int(i64),
    Bool(bool),
    String(String),
}

#[derive(Facet, Debug, Clone)]
#[facet(rename_all = "snake_case")]
pub enum PropertyType {
    Float,
    Int,
    String,
    Bool,
    Enum,
}

#[derive(Facet, Debug, Clone)]
pub struct SimModel {
    pub model_type: SimModelType,
    pub netlist: Option<String>,
    pub model_file: Option<String>,
}

#[derive(Facet, Debug, Clone)]
#[facet(rename_all = "snake_case")]
pub enum SimModelType {
    SpicePrimitive,
    SpiceSubckt,
    Behavioral,
    Ideal,
}

/// For MCU/FPGA components: how to simulate with QEMU or similar.
#[derive(Facet, Debug, Clone)]
pub struct EmbeddedDef {
    pub platform: EmbeddedPlatform,
    pub qemu_machine: Option<String>,
    #[facet(default)]
    pub firmware_formats: Vec<String>,
    /// pin_id → signal name (e.g. "PB0" → "GPIO_B0")
    #[facet(default)]
    pub pin_signals: HashMap<String, String>,
}

#[derive(Facet, Debug, Clone)]
#[facet(rename_all = "snake_case")]
pub enum EmbeddedPlatform {
    Avr,
    Arm,
    Riscv,
    Fpga,
    Custom,
}
