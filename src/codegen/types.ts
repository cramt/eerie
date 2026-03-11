// ⚠️  AUTO-GENERATED — do not edit by hand.
// Source of truth: eerie-core/src/ + thevenin-types (Rust types with #[derive(Facet)])
// Regenerate with: pnpm codegen
//
// All types here have an exact Rust counterpart. When you change a Rust
// type, re-run codegen and commit the updated types.ts alongside it.

/**
 * Complex number pair for AC/frequency-domain vectors.
 */
export interface Complex {
  re: number;
  im: number;
}

/**
 * One simulation vector (real or complex data).
 */
export interface SimVector {
  /**
   * Vector name as reported by ngspice (e.g. `"v(out)"`, `"i(r1)"`).
   */
  name: string;
  /**
   * Real-valued data points. Non-empty when the vector is real.
   */
  real: number[];
  /**
   * Complex data points. Non-empty when the vector is complex.
   */
  complex: Complex[];
}

/**
 * One ngspice plot (analysis result set) containing its vectors.
 */
export interface SimPlot {
  /**
   * Plot name (e.g. `"op1"`, `"tran2"`).
   */
  name: string;
  vecs: SimVector[];
}

/**
 * Complete simulation response: all plots produced by one ngspice run.
 */
export interface SimResult {
  plots: SimPlot[];
}

/**
 * A simulation analysis command.
 */
export type Analysis =
  | "Op"
  | { Dc: { src: string; start: Expr; stop: Expr; step: Expr; src2?: DcSweep } }
  | { Tran: { tstep: Expr; tstop: Expr; tstart?: Expr; tmax?: Expr } }
  | { Ac: { variation: AcVariation; n: number; fstart: Expr; fstop: Expr } }
  | { Noise: { output: string; ref_node?: string; src: string; variation: AcVariation; n: number; fstart: Expr; fstop: Expr } }
  | { Tf: { output: string; input: string } }
  | { Sens: { output: string[] } }
  | { Pz: { node_i: string; node_g: string; node_j: string; node_k: string; input_type: PzInputType; analysis_type: PzAnalysisType } };

/**
 * Analysis type for pole-zero analysis.
 */
export type PzAnalysisType = "Pol" | "Zer" | "Pz";

/**
 * Input type for pole-zero analysis.
 */
export type PzInputType = "Vol" | "Cur";

/**
 * A scalar value in a SPICE netlist.
 *
 * SPICE supports three forms:
 * - Numeric literals with optional SI suffix: `1k`, `2.5n`, `100Meg`
 * - Parameter names: `Rval`, `myParam`
 * - Brace expressions (ngspice): `{2*Rval + 100}`
 */
export type Expr =
  | { Num: number }
  | { Param: string }
  | { Brace: string };

/**
 * Sweep variation for `.ac` and `.noise`.
 */
export type AcVariation = "Dec" | "Oct" | "Lin";

/**
 * The nested source for a double DC sweep (`src2` in `.dc`).
 */
export interface DcSweep {
  src: string;
  start: Expr;
  stop: Expr;
  step: Expr;
}

/**
 * The value specification for a voltage or current source.
 *
 * A source can have a DC component, an AC component for small-signal
 * analysis, and a transient waveform — all independently optional.
 */
export interface Source {
  dc?: Expr;
  ac?: AcSpec;
  waveform?: Waveform;
}

/**
 * Transient waveform for V/I sources.
 */
export type Waveform =
  | { Pulse: { v1: Expr; v2: Expr; td?: Expr; tr?: Expr; tf?: Expr; pw?: Expr; per?: Expr } }
  | { Sin: { v0: Expr; va: Expr; freq?: Expr; td?: Expr; theta?: Expr; phi?: Expr } }
  | { Exp: { v1: Expr; v2: Expr; td1?: Expr; tau1?: Expr; td2?: Expr; tau2?: Expr } }
  | { Pwl: PwlPoint[] }
  | { Sffm: { v0: Expr; va: Expr; fc?: Expr; fs?: Expr; md?: Expr } }
  | { Am: { va: Expr; vo: Expr; fc: Expr; fs: Expr; td?: Expr } };

/**
 * A single time-value pair in a `PWL` waveform.
 */
export interface PwlPoint {
  time: Expr;
  value: Expr;
}

/**
 * AC specification for a voltage or current source: magnitude and optional
 * phase in degrees.
 */
export interface AcSpec {
  mag: Expr;
  /**
   * Phase in degrees.  Defaults to 0 when absent.
   */
  phase?: Expr;
}

/**
 * The body of a circuit element, keyed by the type letter.
 */
export type ElementKind =
  | { Resistor: { pos: string; neg: string; value: Expr; params: Param[] } }
  | { Capacitor: { pos: string; neg: string; value: Expr; params: Param[] } }
  | { Inductor: { pos: string; neg: string; value: Expr; params: Param[] } }
  | { VoltageSource: { pos: string; neg: string; source: Source } }
  | { CurrentSource: { pos: string; neg: string; source: Source } }
  | { Diode: { anode: string; cathode: string; model: string; params: Param[] } }
  | { Bjt: { c: string; b: string; e: string; substrate?: string; model: string; params: Param[] } }
  | { Mosfet: { d: string; g: string; s: string; bulk: string; body?: string; model: string; params: Param[] } }
  | { Jfet: { d: string; g: string; s: string; model: string; params: Param[] } }
  | { Mesa: { d: string; g: string; s: string; model: string; params: Param[] } }
  | { MutualCoupling: { l1: string; l2: string; coupling: Expr } }
  | { Vcvs: { out_pos: string; out_neg: string; in_pos: string; in_neg: string; gain: Expr } }
  | { Cccs: { out_pos: string; out_neg: string; vsrc: string; gain: Expr } }
  | { Vccs: { out_pos: string; out_neg: string; in_pos: string; in_neg: string; gm: Expr } }
  | { Ccvs: { out_pos: string; out_neg: string; vsrc: string; rm: Expr } }
  | { BehavioralSource: { pos: string; neg: string; spec: string } }
  | { SubcktCall: { ports: string[]; subckt: string; params: Param[] } }
  | { Raw: string };

/**
 * A `name=value` parameter assignment used throughout netlists.
 *
 * Used in element parameter lists, `.model`, `.subckt PARAMS:`, `.param`,
 * and `.options`.
 */
export interface Param {
  name: string;
  value: Expr;
}

/**
 * A circuit element (single line starting with a letter).
 */
export interface Element {
  /**
   * Full element name including type letter, e.g. `"R1"`, `"Mfet"`.
   */
  name: string;
  kind: ElementKind;
}

/**
 * A single logical line (or block) in a SPICE netlist.
 */
export type Item =
  | { Element: Element }
  | { Subckt: SubcktDef }
  | { Model: ModelDef }
  | { Analysis: Analysis }
  | { Param: Param[] }
  | { Include: string }
  | { Lib: { file: string; entry?: string } }
  | { Global: string[] }
  | { Options: Param[] }
  | { Save: string[] }
  | { Comment: string }
  | { Raw: string };

/**
 * `.model name type [params]`
 */
export interface ModelDef {
  name: string;
  /**
   * Model type, e.g. `"NPN"`, `"NMOS"`, `"D"`.
   */
  kind: string;
  params: Param[];
}

/**
 * `.subckt name ports [PARAMS: key=val...] ... .ends`
 */
export interface SubcktDef {
  name: string;
  ports: string[];
  params: Param[];
  items: Item[];
}

/**
 * A complete SPICE netlist.
 */
export interface Netlist {
  /**
   * The title line (always the first line of a SPICE file).
   */
  title: string;
  items: Item[];
}

/**
 * Result of a save — contains the path that was actually written to
 * (may differ from request when the user picked a new name).
 */
export interface FileSaveResult {
  path: string;
}

/**
 * Request to save a file. If `path` is empty the daemon should show a
 * native save dialog.
 */
export interface FileSaveRequest {
  path: string;
  content: string;
}

/**
 * Request to open a file. If `path` is empty the daemon should show a
 * native file-picker dialog (if available) or return an error.
 */
export interface FileOpenRequest {
  path: string;
}

/**
 * Content returned when opening a file via the daemon.
 */
export interface FileContent {
  name: string;
  content: string;
}

/**
 * Describes what the backend can do. The frontend queries this once on
 * connect and adapts its behaviour accordingly.
 */
export interface Capabilities {
  /**
   * Backend can read/write files on the host filesystem.
   */
  file_io: boolean;
}

/**
 * Pin definition metadata for a component type.
 */
export interface PinMeta {
  /**
   * Canonical pin name used in the UI (e.g., "a", "collector", "positive").
   */
  name: string;
  /**
   * Alias used in .eerie files (e.g., "p" for "a", "n" for "b").
   * When absent, the canonical name is used as-is.
   */
  file_alias?: string;
}

export interface ComponentData {
  meta: Metadata;
  component: Component;
}

export type Component =
  | { Resistor: { pins: Record<string, string>; resistance: number; tolerance: number; temp_coefficient: number } }
  | { Capacitor: { pins: Record<string, string>; capacitance: number; esr: number; leakage: number; voltage_rating: number } }
  | { Inductor: { pins: Record<string, string>; inductance: number; dcr: number; saturation_current: number } }
  | { Diode: { pins: Record<string, string>; forward_voltage: number; reverse_breakdown: number; reverse_leakage: number; junction_capacitance: number } }
  | { NPN: { pins: Record<string, string>; beta: number; vbe_on: number; vce_sat: number; early_voltage: number } }
  | { PNP: { pins: Record<string, string>; beta: number; vbe_on: number; vce_sat: number; early_voltage: number } }
  | { NMOS: { pins: Record<string, string>; threshold_voltage: number; k: number; channel_length_mod: number; rds_on: number; gate_capacitance: number } }
  | { PMOS: { pins: Record<string, string>; threshold_voltage: number; k: number; channel_length_mod: number; rds_on: number; gate_capacitance: number } }
  | { IGBT: { pins: Record<string, string>; gate_threshold: number; vce_sat: number; tail_current: number; switching_loss: number } }
  | { OpAmp: { pins: Record<string, string>; gain: number; bandwidth: number; slew_rate: number; input_offset: number; input_bias_current: number; output_impedance: number } }
  | { Transformer: { pins: Record<string, string>; primary_inductance: number; turns_ratio: number; coupling: number; core_loss: number } }
  | { Relay: { pins: Record<string, string>; coil_resistance: number; pull_in_voltage: number; drop_out_voltage: number; contact_resistance: number; switching_time: number } }
  | { VoltageSource: { pins: Record<string, string>; voltage: number; internal_resistance: number } }
  | { CurrentSource: { pins: Record<string, string>; current: number; compliance_voltage: number } }
  | { Composite: { circuit: Circuit } };

export interface Circuit {
  name: string;
  components: ComponentData[];
  network_map: string[][];
  pins: string[];
}

export interface Metadata {
  name: string;
  description?: string;
  tags: Record<string, string>;
}


/**
 * Pin definitions per component type.
 * Single source of truth — generated from Rust.
 */
export const PIN_DEFINITIONS: Record<string, PinMeta[]> = {
  "resistor": [
    { name: "a", file_alias: "p" },
    { name: "b", file_alias: "n" },
  ],
  "capacitor": [
    { name: "a", file_alias: "p" },
    { name: "b", file_alias: "n" },
  ],
  "inductor": [
    { name: "a", file_alias: "p" },
    { name: "b", file_alias: "n" },
  ],
  "diode": [
    { name: "anode", file_alias: "p" },
    { name: "cathode", file_alias: "n" },
  ],
  "npn": [
    { name: "collector", file_alias: null },
    { name: "base", file_alias: null },
    { name: "emitter", file_alias: null },
  ],
  "pnp": [
    { name: "collector", file_alias: null },
    { name: "base", file_alias: null },
    { name: "emitter", file_alias: null },
  ],
  "nmos": [
    { name: "drain", file_alias: null },
    { name: "gate", file_alias: null },
    { name: "source", file_alias: null },
    { name: "body", file_alias: null },
  ],
  "pmos": [
    { name: "drain", file_alias: null },
    { name: "gate", file_alias: null },
    { name: "source", file_alias: null },
    { name: "body", file_alias: null },
  ],
  "igbt": [
    { name: "drain", file_alias: null },
    { name: "gate", file_alias: null },
    { name: "source", file_alias: null },
    { name: "body", file_alias: null },
  ],
  "opamp": [
    { name: "non_inverting", file_alias: null },
    { name: "inverting", file_alias: null },
    { name: "output", file_alias: null },
    { name: "v_pos", file_alias: null },
    { name: "v_neg", file_alias: null },
  ],
  "transformer": [
    { name: "primary_pos", file_alias: null },
    { name: "primary_neg", file_alias: null },
    { name: "secondary_pos", file_alias: null },
    { name: "secondary_neg", file_alias: null },
  ],
  "relay": [
    { name: "coil_pos", file_alias: null },
    { name: "coil_neg", file_alias: null },
    { name: "contact_common", file_alias: null },
    { name: "contact_no", file_alias: null },
  ],
  "dc_voltage": [
    { name: "positive", file_alias: "p" },
    { name: "negative", file_alias: "n" },
  ],
  "dc_current": [
    { name: "positive", file_alias: "p" },
    { name: "negative", file_alias: "n" },
  ],
  "ground": [
    { name: "gnd", file_alias: "p" },
  ],
};

/**
 * Pin name mapping: .eerie file pin_id → UI pin name.
 * Generated from PIN_DEFINITIONS — do not edit.
 */
export const FILE_PIN_TO_UI: Record<string, Record<string, string>> = {
  "resistor": { p: "a", n: "b", },
  "capacitor": { p: "a", n: "b", },
  "inductor": { p: "a", n: "b", },
  "diode": { p: "anode", n: "cathode", },
  "dc_voltage": { p: "positive", n: "negative", },
  "dc_current": { p: "positive", n: "negative", },
  "ground": { p: "gnd", },
};

/**
 * Reverse mapping: UI pin name → .eerie file pin_id.
 * Generated from PIN_DEFINITIONS — do not edit.
 */
export const UI_PIN_TO_FILE: Record<string, Record<string, string>> = {
  "resistor": { a: "p", b: "n", },
  "capacitor": { a: "p", b: "n", },
  "inductor": { a: "p", b: "n", },
  "diode": { anode: "p", cathode: "n", },
  "dc_voltage": { positive: "p", negative: "n", },
  "dc_current": { positive: "p", negative: "n", },
  "ground": { gnd: "p", },
};
