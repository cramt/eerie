//! Hardcoded schematic symbol graphics for each device type.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XY {
    pub x: f32,
    pub y: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GraphicsElementKind {
    Line,
    Rect,
    Circle,
    Arc,
    Polyline,
    Text,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphicsElement {
    pub kind: GraphicsElementKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub x1: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub y1: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub x2: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub y2: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub x: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub y: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub height: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cx: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cy: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub r: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub points: Option<Vec<XY>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stroke_width: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filled: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Bounds {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SymbolDef {
    pub bounds: Bounds,
    pub graphics: Vec<GraphicsElement>,
}

fn line(x1: f32, y1: f32, x2: f32, y2: f32) -> GraphicsElement {
    GraphicsElement {
        kind: GraphicsElementKind::Line,
        x1: Some(x1), y1: Some(y1), x2: Some(x2), y2: Some(y2),
        stroke_width: Some(1.5),
        x: None, y: None, width: None, height: None,
        cx: None, cy: None, r: None, points: None, filled: None,
    }
}

fn polyline(pts: Vec<(f32, f32)>) -> GraphicsElement {
    GraphicsElement {
        kind: GraphicsElementKind::Polyline,
        points: Some(pts.into_iter().map(|(x, y)| XY { x, y }).collect()),
        stroke_width: Some(1.5),
        x1: None, y1: None, x2: None, y2: None,
        x: None, y: None, width: None, height: None,
        cx: None, cy: None, r: None, filled: None,
    }
}

fn rect(x: f32, y: f32, w: f32, h: f32) -> GraphicsElement {
    GraphicsElement {
        kind: GraphicsElementKind::Rect,
        x: Some(x), y: Some(y), width: Some(w), height: Some(h),
        stroke_width: Some(1.5),
        x1: None, y1: None, x2: None, y2: None,
        cx: None, cy: None, r: None, points: None, filled: None,
    }
}

/// Diode symbol (anode left, cathode right, horizontal).
pub fn diode_symbol() -> SymbolDef {
    SymbolDef {
        bounds: Bounds { x: -10.0, y: -6.0, width: 20.0, height: 12.0 },
        graphics: vec![
            line(-10.0, 0.0, -5.0, 0.0),
            // Triangle body
            polyline(vec![(-5.0, -5.0), (5.0, 0.0), (-5.0, 5.0), (-5.0, -5.0)]),
            // Cathode bar
            line(5.0, -5.0, 5.0, 5.0),
            line(5.0, 0.0, 10.0, 0.0),
        ],
    }
}

/// NPN BJT symbol (B left, C top-right, E bottom-right).
pub fn npn_symbol() -> SymbolDef {
    SymbolDef {
        bounds: Bounds { x: -10.0, y: -12.0, width: 22.0, height: 24.0 },
        graphics: vec![
            // Base lead
            line(-10.0, 0.0, -2.0, 0.0),
            // Base bar
            line(-2.0, -8.0, -2.0, 8.0),
            // Collector line
            line(-2.0, -5.0, 10.0, -12.0),
            // Emitter line (with arrow tip)
            line(-2.0, 5.0, 10.0, 12.0),
            // Emitter arrow
            polyline(vec![(6.0, 9.0), (10.0, 12.0), (7.0, 8.0)]),
        ],
    }
}

/// PNP BJT symbol (B left, C top-right, E bottom-right with arrow pointing inward).
pub fn pnp_symbol() -> SymbolDef {
    SymbolDef {
        bounds: Bounds { x: -10.0, y: -12.0, width: 22.0, height: 24.0 },
        graphics: vec![
            line(-10.0, 0.0, -2.0, 0.0),
            line(-2.0, -8.0, -2.0, 8.0),
            line(-2.0, -5.0, 10.0, -12.0),
            line(-2.0, 5.0, 10.0, 12.0),
            // Arrow on collector (pointing toward base)
            polyline(vec![(-2.0, -5.0), (2.0, -8.0), (1.0, -4.0)]),
        ],
    }
}

/// N-channel MOSFET symbol (G left, D top, S bottom).
pub fn nmos_symbol() -> SymbolDef {
    SymbolDef {
        bounds: Bounds { x: -10.0, y: -12.0, width: 22.0, height: 24.0 },
        graphics: vec![
            // Gate lead
            line(-10.0, 0.0, -4.0, 0.0),
            // Gate bar (insulated)
            line(-4.0, -8.0, -4.0, 8.0),
            // Body bar (with gap for insulator)
            line(-2.0, -8.0, -2.0, -2.0),
            line(-2.0, 2.0, -2.0, 8.0),
            // Drain tap
            line(-2.0, -6.0, 10.0, -6.0),
            line(10.0, -12.0, 10.0, -6.0),
            // Source tap
            line(-2.0, 6.0, 10.0, 6.0),
            line(10.0, 6.0, 10.0, 12.0),
            // Arrow on source (pointing inward for N-channel)
            polyline(vec![(5.0, 6.0), (8.0, 3.0), (8.0, 9.0), (5.0, 6.0)]),
        ],
    }
}

/// P-channel MOSFET symbol (G left, D top, S bottom, arrow reversed).
pub fn pmos_symbol() -> SymbolDef {
    SymbolDef {
        bounds: Bounds { x: -10.0, y: -12.0, width: 22.0, height: 24.0 },
        graphics: vec![
            line(-10.0, 0.0, -4.0, 0.0),
            line(-4.0, -8.0, -4.0, 8.0),
            line(-2.0, -8.0, -2.0, -2.0),
            line(-2.0, 2.0, -2.0, 8.0),
            line(-2.0, -6.0, 10.0, -6.0),
            line(10.0, -12.0, 10.0, -6.0),
            line(-2.0, 6.0, 10.0, 6.0),
            line(10.0, 6.0, 10.0, 12.0),
            // Arrow pointing outward for P-channel
            polyline(vec![(8.0, 6.0), (5.0, 3.0), (5.0, 9.0), (8.0, 6.0)]),
        ],
    }
}

/// Generic box symbol for subcircuits with n pins on left side.
pub fn subckt_symbol(num_pins: usize) -> SymbolDef {
    let height = (num_pins.max(2) as f32) * 10.0;
    let half = height / 2.0;
    SymbolDef {
        bounds: Bounds { x: -16.0, y: -half, width: 32.0, height },
        graphics: vec![
            rect(-12.0, -half, 24.0, height),
        ],
    }
}

/// Op-amp symbol (IN+, IN-, V+, V-, OUT).
pub fn opamp_symbol() -> SymbolDef {
    SymbolDef {
        bounds: Bounds { x: -12.0, y: -12.0, width: 28.0, height: 24.0 },
        graphics: vec![
            // Triangle body
            polyline(vec![(-12.0, -12.0), (16.0, 0.0), (-12.0, 12.0), (-12.0, -12.0)]),
            // IN+ lead
            line(-16.0, -6.0, -12.0, -6.0),
            // IN- lead
            line(-16.0, 6.0, -12.0, 6.0),
            // OUT lead
            line(16.0, 0.0, 20.0, 0.0),
        ],
    }
}
