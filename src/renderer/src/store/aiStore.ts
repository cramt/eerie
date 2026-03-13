import { create } from 'zustand'
import YAML from 'yaml'
import type { AiMessage, CircuitMutation } from '../../../codegen/generated-rpc'
import { useCircuitStore } from './circuitStore'
import { buildNetlist } from '../utils/netlistBuilder'
import { netlistToSpice } from '../utils/spiceWriter'
import * as api from '../api'
import { uiPinToFile } from '../utils/netlistBuilder'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'error'
  content: string
}

interface AiStore {
  open: boolean
  messages: ChatMessage[]
  /** Internal conversation history sent to daemon (text-only turns) */
  _history: AiMessage[]
  loading: boolean
  /** Key provided by daemon (ANTHROPIC_API_KEY env) */
  daemonApiKey: string | null

  /** True if daemon API key is available */
  hasKey: () => boolean

  setOpen: (open: boolean) => void
  toggleOpen: () => void
  /** Load daemon-provided key from capabilities (called once on startup) */
  initDaemonKey: () => Promise<void>
  sendMessage: (text: string) => Promise<void>
  clearMessages: () => void
}

function newId() {
  return crypto.randomUUID()
}

/** Serialize current circuit to YAML string (same format as App.tsx save) */
function serializeCircuitYaml(): string {
  const circuit = useCircuitStore.getState().circuit

  // Build a lookup for component type_id by id
  const compTypeById = new Map<string, string>()
  for (const comp of circuit.components) {
    compTypeById.set(comp.id, comp.type_id)
  }

  function unwrapProperty(val: unknown): unknown {
    if (val && typeof val === 'object') {
      if ('Float' in val) return (val as { Float: number }).Float
      if ('Int' in val) return (val as { Int: number }).Int
      if ('String' in val) return (val as { String: string }).String
      if ('Bool' in val) return (val as { Bool: boolean }).Bool
    }
    return val
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

/** Apply a list of CircuitMutation objects to the circuit store */
function applyMutations(mutations: CircuitMutation[]) {
  const store = useCircuitStore.getState()

  for (const mutation of mutations) {
    switch (mutation.tag) {
      case 'UpdateProperty': {
        const comp = store.circuit.components.find(
          c => c.label === mutation.component_id || c.id === mutation.component_id
        )
        if (comp) {
          store.updateComponentProperty(comp.id, mutation.property, { Float: mutation.value })
        }
        break
      }

      case 'AddComponent': {
        const props = mutation.properties
          ? Object.fromEntries(mutation.properties.map(([k, v]) => [k, { Float: v }]))
          : {}
        // Place near the centroid of existing components, or origin
        const comps = store.circuit.components
        let cx = 0, cy = 0
        if (comps.length > 0) {
          cx = comps.reduce((s, c) => s + c.position.x, 0) / comps.length
          cy = comps.reduce((s, c) => s + c.position.y, 0) / comps.length
          cx += (Math.random() - 0.5) * 4
          cy += (Math.random() - 0.5) * 4
        }
        cx = Math.round(cx)
        cy = Math.round(cy)
        store.addComponent(mutation.type_id, cx, cy, {
          properties: props,
          ...(mutation.label ? { namePrefix: mutation.label } : {}),
        })
        break
      }

      case 'RemoveComponent': {
        const comp = store.circuit.components.find(
          c => c.label === mutation.component_id || c.id === mutation.component_id
        )
        if (comp) {
          store.removeComponent(comp.id)
        }
        break
      }

      case 'SetIntent': {
        store.setCircuitIntent(mutation.intent ?? undefined)
        break
      }

      case 'SetParameter': {
        store.setParameter(mutation.name, mutation.value)
        break
      }

      case 'RemoveParameter': {
        store.removeParameter(mutation.name)
        break
      }
    }
  }
}

export const useAiStore = create<AiStore>((set, get) => ({
  open: false,
  messages: [],
  _history: [],
  loading: false,
  daemonApiKey: null,

  hasKey: () => !!get().daemonApiKey,

  setOpen: (open) => set({ open }),
  toggleOpen: () => set(s => ({ open: !s.open })),

  initDaemonKey: async () => {
    try {
      const caps = await api.getCapabilities()
      if (caps.anthropic_api_key) {
        set({ daemonApiKey: caps.anthropic_api_key })
      }
    } catch { /* daemon not available, ignore */ }
  },

  clearMessages: () => set({ messages: [], _history: [] }),

  sendMessage: async (text: string) => {
    if (!get().daemonApiKey) return
    const { _history } = get()

    const userMsg: ChatMessage = { id: newId(), role: 'user', content: text }
    const newHistory: AiMessage[] = [..._history, { role: 'user', content: text }]

    set(s => ({
      messages: [...s.messages, userMsg],
      _history: newHistory,
      loading: true,
    }))

    try {
      // Build circuit YAML and SPICE netlist
      const circuit_yaml = serializeCircuitYaml()
      const circuit = useCircuitStore.getState().circuit
      let spice_netlist = ''
      try {
        const netlist = buildNetlist(circuit)
        spice_netlist = netlistToSpice(netlist)
      } catch {
        // Circuit may be incomplete; that's OK
      }

      const response = await api.aiChat({
        messages: newHistory,
        circuit_yaml,
        spice_netlist,
      })

      // Apply any circuit mutations
      if (response.mutations.length > 0) {
        applyMutations(response.mutations)
      }

      const assistantMsg: ChatMessage = {
        id: newId(),
        role: 'assistant',
        content: response.message || '(no response)',
      }

      const finalHistory: AiMessage[] = [
        ...newHistory,
        { role: 'assistant', content: response.message },
      ]

      set(s => ({
        messages: [...s.messages, assistantMsg],
        _history: finalHistory,
        loading: false,
      }))
    } catch (e) {
      const errMsg: ChatMessage = {
        id: newId(),
        role: 'error',
        content: `Error: ${String(e)}`,
      }
      set(s => ({ messages: [...s.messages, errMsg], loading: false }))
    }
  },
}))
