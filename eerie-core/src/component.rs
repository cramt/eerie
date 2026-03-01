use facet::Facet;
use std::collections::HashMap;

use crate::circuit::new_id;

/// A component instance placed on the schematic.
/// `type_id` references a YAML definition in `components/`.
///
/// In hand-authored files, using the label as the id ("R1", "V1") is encouraged.
/// Omit `id` and it is auto-generated on load.
#[derive(Facet, Debug, Clone)]
pub struct ComponentInstance {
    #[facet(default = new_id())]
    pub id: String,
    pub type_id: String,
    /// Reference designator: "R1", "C3", "U1", etc.
    pub label: Option<String>,
    pub position: Position,
    /// 0 | 90 | 180 | 270
    #[facet(default)]
    pub rotation: i32,
    #[facet(default)]
    pub flip_x: bool,
    #[facet(default)]
    pub properties: HashMap<String, PropertyValue>,
}

impl ComponentInstance {
    pub fn new(type_id: impl Into<String>, x: i32, y: i32) -> Self {
        Self {
            id: new_id(),
            type_id: type_id.into(),
            label: None,
            position: Position { x, y },
            rotation: 0,
            flip_x: false,
            properties: HashMap::new(),
        }
    }

    pub fn get_float(&self, key: &str) -> Option<f64> {
        match self.properties.get(key)? {
            PropertyValue::Float(v) => Some(*v),
            PropertyValue::Int(v) => Some(*v as f64),
            _ => None,
        }
    }
}

#[derive(Facet, Debug, Clone)]
pub struct Position {
    pub x: i32,
    pub y: i32,
}

/// Typed property value — externally tagged by default.
/// In YAML: `resistance: { Float: 1000.0 }` or `name: { String: "R1" }`.
/// In TypeScript (generated): `PropertyValue = { Float: number } | { Int: number } | ...`
#[derive(Facet, Debug, Clone)]
pub enum PropertyValue {
    Float(f64),
    Int(i64),
    Bool(bool),
    String(String),
}

impl From<f64> for PropertyValue   { fn from(v: f64)    -> Self { Self::Float(v) } }
impl From<i64> for PropertyValue   { fn from(v: i64)    -> Self { Self::Int(v) } }
impl From<bool> for PropertyValue  { fn from(v: bool)   -> Self { Self::Bool(v) } }
impl From<String> for PropertyValue { fn from(v: String) -> Self { Self::String(v) } }
impl From<&str> for PropertyValue  { fn from(v: &str)   -> Self { Self::String(v.to_owned()) } }
