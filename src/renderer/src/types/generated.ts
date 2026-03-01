// ⚠️  AUTO-GENERATED — do not edit by hand.
// Source of truth: eerie-core/src/  (Rust types with #[derive(Facet)])
// Regenerate with: npm run codegen
//
// All types here have an exact Rust counterpart. When you change a Rust
// type, re-run codegen and commit the updated generated.ts alongside it.

export type EmbeddedPlatform = "avr" | "arm" | "riscv" | "fpga" | "custom";

/**
 * For MCU/FPGA components: how to simulate with QEMU or similar.
 */
export interface EmbeddedDef {
  platform: EmbeddedPlatform;
  qemu_machine?: string;
  firmware_formats?: string[];
  /**
   * pin_id → signal name (e.g. "PB0" → "GPIO_B0")
   */
  pin_signals?: Record<string, string>;
}

export type SimModelType = "spice_primitive" | "spice_subckt" | "behavioral" | "ideal";

export interface SimModel {
  model_type: SimModelType;
  netlist?: string;
  model_file?: string;
}

export type PropertyType = "float" | "int" | "string" | "bool" | "enum";

/**
 * Default value for a property definition.
 * Uses PascalCase tagging: `{ Float: 1000.0 }`, `{ String: "hello" }`.
 */
export type DefaultValue =
  | { Float: number }
  | { Int: number }
  | { Bool: boolean }
  | { String: string };

export interface PropertyDef {
  id: string;
  label: string;
  unit?: string;
  property_type: PropertyType;
  default: DefaultValue;
  min?: number;
  max?: number;
  si_prefixes?: boolean;
  options?: DefaultValue[];
}

export type TextAnchor = "start" | "middle" | "end";

export type GraphicsElementKind = "line" | "rect" | "circle" | "arc" | "polyline" | "text";

/**
 * A drawable element in a component symbol.
 *
 * Flat struct with a `kind` discriminant rather than a Rust enum,
 * so Facet generates a clean TypeScript type and the YAML format
 * is straightforward to hand-author.
 */
export interface GraphicsElement {
  kind: GraphicsElementKind;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  cx?: number;
  cy?: number;
  r?: number;
  start_angle?: number;
  end_angle?: number;
  points?: XY[];
  content?: string;
  font_size?: number;
  anchor?: TextAnchor;
  stroke_width?: number;
  filled?: boolean;
}

export interface XY {
  x: number;
  y: number;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SymbolDef {
  bounds: Bounds;
  graphics: GraphicsElement[];
}

export type PinType = "passive" | "input" | "output" | "bidirectional" | "power" | "open_collector";

export type PinDirection = "left" | "right" | "up" | "down";

export interface PinDef {
  id: string;
  name: string;
  position: XY;
  direction: PinDirection;
  pin_type?: PinType;
}

export interface ComponentDef {
  id: string;
  name: string;
  description?: string;
  category: string;
  subcategory?: string;
  keywords?: string[];
  pins: PinDef[];
  symbol: SymbolDef;
  properties?: PropertyDef[];
  simulation?: SimModel;
  embedded?: EmbeddedDef;
}

export type AnalysisType =
  | { Dc: "Dc" }
  | { Ac: { frequency_hz: number } }
  | { Transient: { time_s: number } };

export interface SimulationResult {
  node_voltages: Record<string, number>;
  branch_currents: Record<string, number>;
  converged: boolean;
  analysis_type: AnalysisType;
}

export interface NetLabel {
  name: string;
  position: Point;
}

export interface Point {
  x: number;
  y: number;
}

export interface PinRef {
  component_id: string;
  pin_id: string;
}

export interface WireSegment {
  start: Point;
  end: Point;
}

/**
 * A net: groups wire segments and tracks which component pins are connected.
 * Omit `id` in hand-authored YAML — auto-generated on load.
 * Using the net name as the id ("VIN", "GND") is idiomatic.
 */
export interface Net {
  id?: string;
  name?: string;
  segments?: WireSegment[];
  pins?: PinRef[];
  labels?: NetLabel[];
}

/**
 * Typed property value — externally tagged by default.
 * In YAML: `resistance: { Float: 1000.0 }` or `name: { String: "R1" }`.
 * In TypeScript (generated): `PropertyValue = { Float: number } | { Int: number } | ...`
 */
export type PropertyValue =
  | { Float: number }
  | { Int: number }
  | { Bool: boolean }
  | { String: string };

export interface Position {
  x: number;
  y: number;
}

/**
 * A component instance placed on the schematic.
 * `type_id` references a YAML definition in `components/`.
 *
 * In hand-authored files, using the label as the id ("R1", "V1") is encouraged.
 * Omit `id` and it is auto-generated on load.
 */
export interface ComponentInstance {
  id?: string;
  type_id: string;
  /**
   * Reference designator: "R1", "C3", "U1", etc.
   */
  label?: string;
  position: Position;
  /**
   * 0 | 90 | 180 | 270
   */
  rotation?: number;
  flip_x?: boolean;
  properties?: Record<string, PropertyValue>;
}

export interface CircuitMetadata {
  created_at: string;
  modified_at: string;
  author?: string;
}

/**
 * Top-level circuit document. Serializes to a `.eerie` YAML file.
 *
 * IDs are strings — anything unique within the file.
 * The UI uses UUID v4 strings; hand-authored files may use human-readable
 * names like "R1", "GND_net", etc.
 * Omit `id` in YAML and Eerie auto-generates one on load.
 */
export interface Circuit {
  id?: string;
  name: string;
  description?: string;
  version?: string;
  components?: ComponentInstance[];
  nets?: Net[];
  metadata: CircuitMetadata;
}

