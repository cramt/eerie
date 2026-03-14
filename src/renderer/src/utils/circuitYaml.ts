import YAML from 'yaml'
import { filePinToUi, uiPinToFile } from './netlistBuilder'
import type { Circuit, ComponentInstance, Net } from '../types'

/** Unwrap Facet-style property values: { Float: 1000.0 } → 1000.0 */
function unwrapProperty(val: unknown): unknown {
  if (val && typeof val === 'object') {
    if ('Float' in val) return (val as { Float: number }).Float
    if ('Int' in val) return (val as { Int: number }).Int
    if ('String' in val) return (val as { String: string }).String
    if ('Bool' in val) return (val as { Bool: boolean }).Bool
  }
  return val
}

/** Wrap a plain value back into Facet-style property value */
function wrapProperty(val: unknown): unknown {
  if (typeof val === 'number') return { Float: val }
  if (typeof val === 'string') return { String: val }
  if (typeof val === 'boolean') return { Bool: val }
  return val
}

export function parseCircuitYaml(content: string): Circuit | null {
  try {
    const data = YAML.parse(content)
    if (!data) return null

    const components: ComponentInstance[] = (data.components ?? []).map((c: any) => ({
      id: c.id ?? crypto.randomUUID(),
      type_id: c.type_id,
      label: c.label,
      position: c.position ?? { x: 0, y: 0 },
      rotation: c.rotation ?? 0,
      flip_x: c.flip_x ?? false,
      properties: Object.fromEntries(
        Object.entries(c.properties ?? {}).map(([k, v]) => [k, wrapProperty(v)])
      ),
    }))

    // Build a lookup for component type_id by id
    const compTypeById = new Map<string, string>()
    for (const comp of components) {
      compTypeById.set(comp.id, comp.type_id)
    }

    const nets: Net[] = (data.nets ?? []).map((n: any) => ({
      id: n.id ?? crypto.randomUUID(),
      segments: n.segments ?? [],
      pins: (n.pins ?? []).map((p: any) => {
        const typeId = compTypeById.get(p.component_id) ?? ''
        // Map file pin_id (p/n) → UI pin name (a/b, positive/negative)
        const pinName = filePinToUi(typeId, p.pin_id ?? p.pin_name ?? '')
        return { component_id: p.component_id, pin_name: pinName }
      }),
      labels: (n.labels ?? []).map((l: any) => ({
        text: l.name ?? l.text ?? '',
        position: l.position ?? { x: 0, y: 0 },
      })),
    }))

    // Parse parameters: plain number values from YAML
    const parameters: Record<string, number> = {}
    if (data.parameters && typeof data.parameters === 'object') {
      for (const [k, v] of Object.entries(data.parameters)) {
        if (typeof v === 'number') parameters[k] = v
      }
    }

    return {
      name: data.name ?? 'Untitled',
      ...(data.intent ? { intent: String(data.intent) } : {}),
      ...(Object.keys(parameters).length > 0 ? { parameters } : {}),
      components,
      nets,
    }
  } catch (err) {
    console.error('Failed to parse circuit YAML:', err)
    return null
  }
}

export function serializeCircuitYaml(circuit: Circuit): string {
  // Build a lookup for component type_id by id
  const compTypeById = new Map<string, string>()
  for (const comp of circuit.components) {
    compTypeById.set(comp.id, comp.type_id)
  }

  const data: Record<string, unknown> = {
    name: circuit.name,
    ...(circuit.intent ? { intent: circuit.intent } : {}),
    ...(circuit.parameters && Object.keys(circuit.parameters).length > 0
      ? { parameters: circuit.parameters }
      : {}),
    components: circuit.components.map(c => ({
      id: c.id,
      type_id: c.type_id,
      ...(c.label ? { label: c.label } : {}),
      position: c.position,
      ...(c.rotation ? { rotation: c.rotation } : {}),
      ...(c.flip_x ? { flip_x: c.flip_x } : {}),
      properties: Object.fromEntries(
        Object.entries(c.properties).map(([k, v]) => [k, unwrapProperty(v)])
      ),
    })),
    nets: circuit.nets.map(n => ({
      id: n.id,
      segments: n.segments,
      pins: n.pins.map(p => {
        const typeId = compTypeById.get(p.component_id) ?? ''
        return {
          component_id: p.component_id,
          pin_id: uiPinToFile(typeId, p.pin_name),
        }
      }),
      labels: n.labels.map(l => ({
        name: l.text,
        position: l.position,
      })),
    })),
  }
  return YAML.stringify(data)
}
