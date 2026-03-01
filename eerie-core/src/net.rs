use facet::Facet;
use serde::{Deserialize, Serialize};

// new_id is used by serde default attributes
use crate::circuit::new_id;

/// A net: groups wire segments and tracks which component pins are connected.
///
/// `id` can be omitted in hand-authored YAML — auto-generated on load.
/// Using the net name as the id ("VIN", "GND") is encouraged in manual files.
#[derive(Facet, Serialize, Deserialize, Debug, Clone)]
pub struct Net {
    #[serde(default = "new_id")]
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default)]
    pub segments: Vec<WireSegment>,
    /// Pins attached to this net.
    #[serde(default)]
    pub pins: Vec<PinRef>,
    #[serde(default)]
    pub labels: Vec<NetLabel>,
}

impl Net {
    pub fn new() -> Self {
        Self {
            id: new_id(),
            name: None,
            segments: Vec::new(),
            pins: Vec::new(),
            labels: Vec::new(),
        }
    }

    pub fn named(name: impl Into<String>) -> Self {
        let mut n = Self::new();
        n.name = Some(name.into());
        n
    }
}

impl Default for Net {
    fn default() -> Self { Self::new() }
}

/// A single axis-aligned wire segment.
#[derive(Facet, Serialize, Deserialize, Debug, Clone)]
pub struct WireSegment {
    pub start: Point,
    pub end: Point,
}

/// Integer grid coordinate (schematic grid units, typically 50 mils).
#[derive(Facet, Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
pub struct Point {
    pub x: i32,
    pub y: i32,
}

impl Point {
    pub fn new(x: i32, y: i32) -> Self { Self { x, y } }
}

/// A reference to a specific pin on a component instance.
#[derive(Facet, Serialize, Deserialize, Debug, Clone)]
pub struct PinRef {
    pub component_id: String,
    pub pin_id: String,
}

/// Net label placed on the schematic — connects all nets with the same name.
#[derive(Facet, Serialize, Deserialize, Debug, Clone)]
pub struct NetLabel {
    pub name: String,
    pub position: Point,
}
