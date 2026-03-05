// ⚠️  AUTO-GENERATED — do not edit by hand.
// Source of truth: eerie-core/src/  (Rust types with #[derive(Facet)])
// Regenerate with: pnpm codegen
//
// All types here have an exact Rust counterpart. When you change a Rust
// type, re-run codegen and commit the updated generated.ts alongside it.

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
  | { Sens: { output: string[] } };

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
  | { Mosfet: { d: string; g: string; s: string; bulk: string; model: string; params: Param[] } }
  | { Jfet: { d: string; g: string; s: string; model: string; params: Param[] } }
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

export interface ComponentData {
  meta: Metadata;
  component: Component;
}

export type Component =
  | { Resistor: { pins: TwoPin; resistance: number; tolerance: number; temp_coefficient: number } }
  | { Capacitor: { pins: TwoPin; capacitance: number; esr: number; leakage: number; voltage_rating: number } }
  | { Inductor: { pins: TwoPin; inductance: number; dcr: number; saturation_current: number } }
  | { Diode: { pins: TwoPin; forward_voltage: number; reverse_breakdown: number; reverse_leakage: number; junction_capacitance: number } }
  | { NPN: { pins: BjtPins; beta: number; vbe_on: number; vce_sat: number; early_voltage: number } }
  | { PNP: { pins: BjtPins; beta: number; vbe_on: number; vce_sat: number; early_voltage: number } }
  | { NMOS: { pins: MosfetPins; threshold_voltage: number; k: number; channel_length_mod: number; rds_on: number; gate_capacitance: number } }
  | { PMOS: { pins: MosfetPins; threshold_voltage: number; k: number; channel_length_mod: number; rds_on: number; gate_capacitance: number } }
  | { IGBT: { pins: MosfetPins; gate_threshold: number; vce_sat: number; tail_current: number; switching_loss: number } }
  | { OpAmp: { pins: OpAmpPins; gain: number; bandwidth: number; slew_rate: number; input_offset: number; input_bias_current: number; output_impedance: number } }
  | { Transformer: { pins: TransformerPins; primary_inductance: number; turns_ratio: number; coupling: number; core_loss: number } }
  | { Relay: { pins: RelayPins; coil_resistance: number; pull_in_voltage: number; drop_out_voltage: number; contact_resistance: number; switching_time: number } }
  | { VoltageSource: { pins: TwoPin; voltage: number; internal_resistance: number } }
  | { CurrentSource: { pins: TwoPin; current: number; compliance_voltage: number } }
  | { Composite: { circuit: Circuit } };

export interface Circuit {
  name: string;
  components: ComponentData[];
  network_map: string[][];
  pins: string[];
}

export interface TwoPin {
  a: string;
  b: string;
}

export interface RelayPins {
  coil_pos: string;
  coil_neg: string;
  contact_common: string;
  contact_no: string;
}

export interface TransformerPins {
  primary_pos: string;
  primary_neg: string;
  secondary_pos: string;
  secondary_neg: string;
}

export interface OpAmpPins {
  non_inverting: string;
  inverting: string;
  output: string;
  v_pos: string;
  v_neg: string;
}

export interface MosfetPins {
  drain: string;
  gate: string;
  source: string;
  body: string;
}

export interface BjtPins {
  collector: string;
  base: string;
  emitter: string;
}

export interface Metadata {
  name: string;
  description?: string;
  tags: Record<string, string>;
}

