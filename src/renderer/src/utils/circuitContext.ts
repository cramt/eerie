import type { Circuit, ComponentInstance } from '../types'
import type { SimResult } from '../../../codegen/generated-rpc'

/** Format a numeric property value with appropriate engineering suffixes */
function formatValue(key: string, raw: unknown): string {
  let n: number | null = null
  if (typeof raw === 'number') n = raw
  else if (raw && typeof raw === 'object') {
    if ('Float' in raw) n = (raw as { Float: number }).Float
    else if ('Int' in raw) n = (raw as { Int: number }).Int
    else if ('String' in raw) return String((raw as { String: string }).String)
    else if ('Bool' in raw) return String((raw as { Bool: boolean }).Bool)
    else if ('Param' in raw) return `{${(raw as { Param: string }).Param}}`
  }
  if (n === null) return String(raw)

  // Resistance
  if (key === 'resistance') {
    if (n >= 1e6) return `${n / 1e6}MΩ`
    if (n >= 1e3) return `${n / 1e3}kΩ`
    return `${n}Ω`
  }
  // Capacitance
  if (key === 'capacitance') {
    if (n >= 1e-3) return `${n * 1e3}mF`
    if (n >= 1e-6) return `${n * 1e6}µF`
    if (n >= 1e-9) return `${n * 1e9}nF`
    return `${n * 1e12}pF`
  }
  // Inductance
  if (key === 'inductance') {
    if (n >= 1) return `${n}H`
    if (n >= 1e-3) return `${n * 1e3}mH`
    return `${n * 1e6}µH`
  }
  // Voltage / current
  if (key === 'voltage' || key === 'current') {
    if (Math.abs(n) >= 1) return `${n}${key === 'voltage' ? 'V' : 'A'}`
    if (Math.abs(n) >= 1e-3) return `${n * 1e3}m${key === 'voltage' ? 'V' : 'A'}`
    return `${n * 1e6}µ${key === 'voltage' ? 'V' : 'A'}`
  }
  // Frequency
  if (key === 'frequency' || key === 'freq') {
    if (n >= 1e9) return `${n / 1e9}GHz`
    if (n >= 1e6) return `${n / 1e6}MHz`
    if (n >= 1e3) return `${n / 1e3}kHz`
    return `${n}Hz`
  }
  return String(n)
}

/** Format component properties as "key=value, key=value" */
function formatProps(comp: ComponentInstance): string {
  const entries = Object.entries(comp.properties)
  if (entries.length === 0) return ''
  return entries
    .filter(([, v]) => {
      // Skip internal/display-only props
      if (v === null || v === undefined) return false
      if (v && typeof v === 'object' && 'Param' in v) return true
      return true
    })
    .map(([k, v]) => `${k}=${formatValue(k, v)}`)
    .join(', ')
}

/** Format simulation results compactly */
function formatSimResult(result: SimResult): string {
  const lines: string[] = []
  for (const plot of result.plots) {
    const vLines: string[] = []
    for (const vec of plot.vecs) {
      if (!vec.real || vec.real.length === 0) continue
      if (vec.real.length === 1) {
        vLines.push(`  ${vec.name} = ${vec.real[0].toPrecision(4)}`)
      } else {
        const first = vec.real[0].toPrecision(3)
        const last = vec.real[vec.real.length - 1].toPrecision(3)
        vLines.push(`  ${vec.name}: ${first} → ${last} (${vec.real.length} pts)`)
      }
    }
    if (vLines.length > 0) {
      lines.push(...vLines)
    }
  }
  return lines.join('\n')
}

/**
 * Convert a Circuit into a compact, geometry-free text description for AI context.
 * Includes component topology and last simulation results if available.
 */
export function circuitToContext(circuit: Circuit, simResult?: SimResult | null): string {
  const lines: string[] = []

  lines.push(`Circuit: ${circuit.name}`)

  if (circuit.intent) {
    lines.push('')
    lines.push('Intent:')
    for (const l of circuit.intent.trim().split('\n')) lines.push(`  ${l}`)
  }

  if (circuit.parameters && Object.keys(circuit.parameters).length > 0) {
    lines.push('')
    lines.push('Parameters:')
    for (const [k, v] of Object.entries(circuit.parameters)) {
      lines.push(`  ${k} = ${v}`)
    }
  }

  lines.push('')

  // Components (no positions)
  lines.push('Components:')
  for (const comp of circuit.components) {
    const propsStr = formatProps(comp)
    const label = comp.label ?? comp.id
    if (propsStr) {
      lines.push(`  ${label} (${comp.type_id}): ${propsStr}`)
    } else {
      lines.push(`  ${label} (${comp.type_id})`)
    }
  }

  // Net topology (canonical pin names, no segments)
  if (circuit.nets.length > 0) {
    lines.push('')
    lines.push('Connections:')

    // Build component ID → label map
    const compLabel = new Map<string, string>()
    for (const comp of circuit.components) {
      compLabel.set(comp.id, comp.label ?? comp.id)
    }

    for (const net of circuit.nets) {
      if (net.pins.length === 0) continue
      // Use first label if available, otherwise net id
      const netName = net.labels?.[0]?.text ?? net.id
      const pinList = net.pins
        .map(p => `${compLabel.get(p.component_id) ?? p.component_id}(${p.pin_name})`)
        .join(' ↔ ')
      lines.push(`  ${netName}: ${pinList}`)
    }
  }

  // Simulation results
  if (simResult && simResult.plots.length > 0) {
    const resultText = formatSimResult(simResult)
    if (resultText) {
      lines.push('')
      lines.push('Last simulation results:')
      lines.push(resultText)
    }
  }

  return lines.join('\n')
}

/** Component types available in eerie */
export const COMPONENT_TYPES = [
  { type_id: 'resistor', description: 'Resistor. Properties: resistance (ohms)' },
  { type_id: 'capacitor', description: 'Capacitor. Properties: capacitance (farads)' },
  { type_id: 'inductor', description: 'Inductor. Properties: inductance (henries)' },
  { type_id: 'dc_voltage', description: 'DC voltage source. Properties: voltage (volts)' },
  { type_id: 'dc_current', description: 'DC current source. Properties: current (amps)' },
  { type_id: 'diode', description: 'Diode (default model D)' },
  { type_id: 'npn', description: 'NPN BJT transistor' },
  { type_id: 'pnp', description: 'PNP BJT transistor' },
  { type_id: 'nmos', description: 'N-channel MOSFET' },
  { type_id: 'pmos', description: 'P-channel MOSFET' },
  { type_id: 'ground', description: 'Ground reference (0V node)' },
] as const
