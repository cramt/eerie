use facet::Facet;

use crate::circuit::new_id;

/// A net: groups wire segments and tracks which component pins are connected.
/// Omit `id` in hand-authored YAML — auto-generated on load.
/// Using the net name as the id ("VIN", "GND") is idiomatic.
#[derive(Facet, Debug, Clone)]
pub struct Net {
    #[facet(default = new_id())]
    pub id: String,
    pub name: Option<String>,
    #[facet(default)]
    pub segments: Vec<WireSegment>,
    #[facet(default)]
    pub pins: Vec<PinRef>,
    #[facet(default)]
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

#[derive(Facet, Debug, Clone)]
pub struct WireSegment {
    pub start: Point,
    pub end: Point,
}

#[derive(Facet, Debug, Clone, Copy, PartialEq, Eq)]
pub struct Point {
    pub x: i32,
    pub y: i32,
}

impl Point {
    pub fn new(x: i32, y: i32) -> Self { Self { x, y } }
}

#[derive(Facet, Debug, Clone)]
pub struct PinRef {
    pub component_id: String,
    pub pin_id: String,
}

#[derive(Facet, Debug, Clone)]
pub struct NetLabel {
    pub name: String,
    pub position: Point,
}
