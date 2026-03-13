import { create } from 'zustand'
import type { Circuit, ComponentInstance, Net, Point, WireSegment } from '../types'
import { useHistoryStore } from './historyStore'
import { useUiStore } from './uiStore'
import { getDefaultProperties } from '../utils/defaultProperties'

/** SPICE prefix for each component type */
const SPICE_PREFIX: Record<string, string> = {
  resistor: 'R',
  capacitor: 'C',
  inductor: 'L',
  dc_voltage: 'V',
  dc_current: 'I',
  diode: 'D',
  npn: 'Q',
  pnp: 'Q',
  nmos: 'M',
  pmos: 'M',
  opamp: 'U',
}

/** Generate the next available label for a given prefix (e.g. "R" → R1, R2, ...) */
function nextLabel(prefix: string, components: ComponentInstance[]): string {
  const UP = prefix.toUpperCase()
  const existing = new Set(
    components
      .filter((c) => c.label?.toUpperCase().startsWith(UP))
      .map((c) => c.label!.toUpperCase())
  )
  for (let i = 1; ; i++) {
    const candidate = `${UP}${i}`
    if (!existing.has(candidate)) return candidate
  }
}

/** Merge collinear consecutive segments (both horizontal or both vertical). */
function simplifySegments(segments: WireSegment[]): WireSegment[] {
  if (segments.length <= 1) return segments
  const result: WireSegment[] = [segments[0]]
  for (let i = 1; i < segments.length; i++) {
    const prev = result[result.length - 1]
    const cur = segments[i]
    const prevHoriz = prev.start.y === prev.end.y
    const curHoriz = cur.start.y === cur.end.y
    const prevVert = prev.start.x === prev.end.x
    const curVert = cur.start.x === cur.end.x
    if (prevHoriz && curHoriz && prev.end.y === cur.start.y) {
      // Merge horizontal
      result[result.length - 1] = { start: prev.start, end: cur.end }
    } else if (prevVert && curVert && prev.end.x === cur.start.x) {
      // Merge vertical
      result[result.length - 1] = { start: prev.start, end: cur.end }
    } else {
      result.push(cur)
    }
  }
  // Remove zero-length segments
  return result.filter(s => s.start.x !== s.end.x || s.start.y !== s.end.y)
}

interface CircuitStore {
  circuit: Circuit
  projectPath: string | null
  circuitName: string | null
  dirty: boolean

  setCircuit: (circuit: Circuit, projectPath?: string, circuitName?: string) => void
  setCircuitDirect: (circuit: Circuit) => void
  setDirty: (dirty: boolean) => void
  setCircuitName: (name: string) => void
  setCircuitIntent: (intent: string | undefined) => void
  setParameter: (name: string, value: number) => void
  removeParameter: (name: string) => void

  addComponent: (typeId: string, x: number, y: number, preset?: { properties: Record<string, unknown>; namePrefix?: string }) => void
  updateComponent: (id: string, updates: Partial<ComponentInstance>) => void
  updateComponentProperty: (id: string, key: string, value: unknown) => void
  removeComponent: (id: string) => void
  removeComponents: (ids: string[]) => void
  moveComponent: (id: string, x: number, y: number) => void
  moveComponents: (ids: string[], dx: number, dy: number) => void

  rotateComponents: (ids: string[]) => void
  flipComponents: (ids: string[]) => void
  deleteSelection: (componentIds: string[], netIds: string[]) => void

  removeNet: (id: string) => void
  removeNets: (ids: string[]) => void
  mergeNets: (targetNetId: string, sourceNetId: string) => void

  addWireSegmentWithPins: (
    start: Point,
    end: Point,
    startPin: { component_id: string; pin_name: string } | null,
    endPin: { component_id: string; pin_name: string } | null,
    isNewWire: boolean,
    startNetId?: string | null,
    endNetId?: string | null,
  ) => void
}

function newId() {
  return crypto.randomUUID()
}

const DEFAULT_CIRCUIT: Circuit = {
  name: 'Untitled',
  components: [],
  nets: [],
}

function pushUndo() {
  useHistoryStore.getState().pushUndo()
}

export const useCircuitStore = create<CircuitStore>((set, get) => ({
  circuit: DEFAULT_CIRCUIT,
  projectPath: null,
  circuitName: null,
  dirty: false,

  setCircuit: (circuit, projectPath, circuitName) => {
    useHistoryStore.setState({ undoStack: [], redoStack: [] })
    set({
      circuit,
      projectPath: projectPath ?? get().projectPath,
      circuitName: circuitName ?? get().circuitName,
      dirty: false,
    })
  },

  setCircuitDirect: (circuit) => set({ circuit, dirty: true }),
  setDirty: (dirty) => set({ dirty }),

  setCircuitName: (name) => {
    const { circuit } = get()
    set({ circuit: { ...circuit, name }, dirty: true })
  },

  setCircuitIntent: (intent) => {
    const { circuit } = get()
    set({ circuit: { ...circuit, intent }, dirty: true })
  },

  setParameter: (name, value) => {
    const { circuit } = get()
    set({
      circuit: { ...circuit, parameters: { ...circuit.parameters, [name]: value } },
      dirty: true,
    })
  },

  removeParameter: (name) => {
    const { circuit } = get()
    const parameters = { ...circuit.parameters }
    delete parameters[name]
    set({ circuit: { ...circuit, parameters }, dirty: true })
  },

  addComponent: (typeId, x, y, preset) => {
    pushUndo()
    const { circuit } = get()
    const prefix = preset?.namePrefix ?? SPICE_PREFIX[typeId]
    const label = prefix ? nextLabel(prefix, circuit.components) : undefined
    const comp: ComponentInstance = {
      id: newId(),
      type_id: typeId,
      label,
      position: { x, y },
      rotation: 0,
      flip_x: false,
      properties: preset?.properties ?? getDefaultProperties(typeId),
    }
    set({
      circuit: { ...circuit, components: [...circuit.components, comp] },
      dirty: true,
    })
  },

  updateComponent: (id, updates) => {
    pushUndo()
    const { circuit } = get()
    const components = circuit.components.map((c) =>
      c.id === id ? { ...c, ...updates } : c
    )
    set({ circuit: { ...circuit, components }, dirty: true })
  },

  updateComponentProperty: (id, key, value) => {
    pushUndo()
    const { circuit } = get()
    const components = circuit.components.map((c) =>
      c.id === id ? { ...c, properties: { ...c.properties, [key]: value } } : c
    )
    set({ circuit: { ...circuit, components }, dirty: true })
  },

  removeComponent: (id) => {
    pushUndo()
    const { circuit } = get()
    set({
      circuit: {
        ...circuit,
        components: circuit.components.filter((c) => c.id !== id),
        nets: circuit.nets.map((n) => ({
          ...n,
          pins: n.pins.filter((p) => p.component_id !== id),
        })),
      },
      dirty: true,
    })
    const sel = useUiStore.getState().selectedComponentIds
    if (sel.has(id)) {
      const next = new Set(sel)
      next.delete(id)
      useUiStore.getState().selectComponents([...next])
    }
  },

  removeComponents: (ids) => {
    pushUndo()
    const { circuit } = get()
    const idSet = new Set(ids)
    set({
      circuit: {
        ...circuit,
        components: circuit.components.filter((c) => !idSet.has(c.id)),
        nets: circuit.nets.map((n) => ({
          ...n,
          pins: n.pins.filter((p) => !idSet.has(p.component_id)),
        })),
      },
      dirty: true,
    })
    useUiStore.getState().selectComponents([])
  },

  moveComponent: (id, x, y) => {
    const { circuit } = get()
    const components = circuit.components.map((c) =>
      c.id === id ? { ...c, position: { x, y } } : c
    )
    set({ circuit: { ...circuit, components }, dirty: true })
  },

  moveComponents: (ids, dx, dy) => {
    const { circuit } = get()
    const idSet = new Set(ids)
    const components = circuit.components.map((c) =>
      idSet.has(c.id) ? { ...c, position: { x: c.position.x + dx, y: c.position.y + dy } } : c
    )
    set({ circuit: { ...circuit, components }, dirty: true })
  },

  rotateComponents: (ids) => {
    pushUndo()
    const { circuit } = get()
    const idSet = new Set(ids)
    const components = circuit.components.map((c) =>
      idSet.has(c.id) ? { ...c, rotation: (c.rotation + 90) % 360 } : c
    )
    set({ circuit: { ...circuit, components }, dirty: true })
  },

  flipComponents: (ids) => {
    pushUndo()
    const { circuit } = get()
    const idSet = new Set(ids)
    const components = circuit.components.map((c) =>
      idSet.has(c.id) ? { ...c, flip_x: !c.flip_x } : c
    )
    set({ circuit: { ...circuit, components }, dirty: true })
  },

  deleteSelection: (componentIds, netIds) => {
    if (componentIds.length === 0 && netIds.length === 0) return
    pushUndo()
    const { circuit } = get()
    const compIdSet = new Set(componentIds)
    const netIdSet = new Set(netIds)
    set({
      circuit: {
        ...circuit,
        components: circuit.components.filter((c) => !compIdSet.has(c.id)),
        nets: circuit.nets
          .filter((n) => !netIdSet.has(n.id))
          .map((n) => ({
            ...n,
            pins: n.pins.filter((p) => !compIdSet.has(p.component_id)),
          })),
      },
      dirty: true,
    })
    useUiStore.getState().clearSelection()
  },

  removeNet: (id) => {
    pushUndo()
    const { circuit } = get()
    set({
      circuit: { ...circuit, nets: circuit.nets.filter((n) => n.id !== id) },
      dirty: true,
    })
    const sel = useUiStore.getState().selectedNetIds
    if (sel.has(id)) {
      const next = new Set(sel)
      next.delete(id)
      useUiStore.getState().selectNets([...next])
    }
  },

  removeNets: (ids) => {
    pushUndo()
    const { circuit } = get()
    const idSet = new Set(ids)
    set({
      circuit: { ...circuit, nets: circuit.nets.filter((n) => !idSet.has(n.id)) },
      dirty: true,
    })
    useUiStore.getState().selectNets([])
  },

  mergeNets: (targetNetId, sourceNetId) => {
    if (targetNetId === sourceNetId) return
    pushUndo()
    const { circuit } = get()
    const target = circuit.nets.find(n => n.id === targetNetId)
    const source = circuit.nets.find(n => n.id === sourceNetId)
    if (!target || !source) return
    const merged: Net = {
      ...target,
      segments: simplifySegments([...target.segments, ...source.segments]),
      pins: [...target.pins, ...source.pins],
      labels: [...target.labels, ...source.labels],
    }
    set({
      circuit: {
        ...circuit,
        nets: circuit.nets.map(n => n.id === targetNetId ? merged : n).filter(n => n.id !== sourceNetId),
      },
      dirty: true,
    })
  },

  addWireSegmentWithPins: (start, end, startPin, endPin, isNewWire, startNetId, endNetId) => {
    pushUndo()
    const { circuit } = get()
    const dx = Math.abs(end.x - start.x)
    const dy = Math.abs(end.y - start.y)
    // Horizontal-first if dx >= dy, vertical-first otherwise
    const mid: Point = dx >= dy
      ? { x: end.x, y: start.y }
      : { x: start.x, y: end.y }
    const newSegs: WireSegment[] = []
    if (mid.x !== start.x || mid.y !== start.y) newSegs.push({ start, end: mid })
    if (mid.x !== end.x || mid.y !== end.y) newSegs.push({ start: mid, end })
    if (newSegs.length === 0) return

    const pinRefs: { component_id: string; pin_name: string }[] = []
    if (startPin) pinRefs.push(startPin)
    if (endPin) pinRefs.push(endPin)

    // Dedup helper: avoid adding pins that already exist on the target net
    const addPinsDeduped = (existing: typeof pinRefs, adding: typeof pinRefs) => {
      const keys = new Set(existing.map(p => `${p.component_id}:${p.pin_name}`))
      return [...existing, ...adding.filter(p => !keys.has(`${p.component_id}:${p.pin_name}`))]
    }

    // Determine which net to add segments to
    // Priority: continue existing wire (!isNewWire) > startNetId > endNetId > new net
    let nets = [...circuit.nets]
    let targetIdx = -1

    if (!isNewWire && nets.length > 0) {
      targetIdx = nets.length - 1
    } else if (startNetId) {
      targetIdx = nets.findIndex(n => n.id === startNetId)
    } else if (endNetId) {
      targetIdx = nets.findIndex(n => n.id === endNetId)
    }

    if (targetIdx >= 0) {
      const target = nets[targetIdx]
      nets[targetIdx] = {
        ...target,
        segments: simplifySegments([...target.segments, ...newSegs]),
        pins: addPinsDeduped(target.pins, pinRefs),
      }
    } else {
      nets.push({ id: newId(), segments: simplifySegments(newSegs), pins: pinRefs, labels: [] })
      targetIdx = nets.length - 1
    }

    // If both startNetId and endNetId exist and differ, merge endNet into target
    const targetNetId = nets[targetIdx].id
    const otherNetId = startNetId && startNetId !== targetNetId ? startNetId
      : endNetId && endNetId !== targetNetId ? endNetId
      : null

    if (otherNetId) {
      const otherIdx = nets.findIndex(n => n.id === otherNetId)
      if (otherIdx >= 0) {
        const other = nets[otherIdx]
        const tIdx = nets.findIndex(n => n.id === targetNetId)
        nets[tIdx] = {
          ...nets[tIdx],
          segments: simplifySegments([...nets[tIdx].segments, ...other.segments]),
          pins: addPinsDeduped(nets[tIdx].pins, other.pins),
          labels: [...nets[tIdx].labels, ...other.labels],
        }
        nets = nets.filter(n => n.id !== otherNetId)
      }
    }

    set({ circuit: { ...circuit, nets }, dirty: true })
  },
}))
