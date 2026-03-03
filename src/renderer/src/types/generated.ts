// ⚠️  AUTO-GENERATED — do not edit by hand.
// Source of truth: eerie-core/src/  (Rust types with #[derive(Facet)])
// Regenerate with: pnpm codegen
//
// All types here have an exact Rust counterpart. When you change a Rust
// type, re-run codegen and commit the updated generated.ts alongside it.

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

