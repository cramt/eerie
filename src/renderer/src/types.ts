// Schematic-level types for the UI canvas.
// These are *visual* types (positions, wires on screen) — separate from
// the simulation-level Circuit in src/codegen/types.ts.

export interface Point {
  x: number
  y: number
}

export interface ComponentInstance {
  id: string
  type_id: string
  label?: string
  position: Point
  rotation: number
  flip_x: boolean
  properties: Record<string, unknown>
}

export interface WireSegment {
  start: Point
  end: Point
}

export interface NetLabel {
  text: string
  position: Point
}

export interface Net {
  id: string
  segments: WireSegment[]
  pins: { component_id: string; pin_name: string }[]
  labels: NetLabel[]
}

export interface Circuit {
  name: string
  components: ComponentInstance[]
  nets: Net[]
}

export interface SimulationResult {
  node_voltages: Record<string, number>
  branch_currents: Record<string, number>
}

export type Tool = 'select' | 'wire' | 'place'

export type Theme = 'neon'

export interface PinDef {
  name: string
  x: number
  y: number
}
