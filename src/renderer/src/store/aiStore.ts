import { create } from 'zustand'
import Anthropic from '@anthropic-ai/sdk'
import type { MessageParam, ToolUseBlock, TextBlock } from '@anthropic-ai/sdk/resources/messages'
import { circuitToContext, COMPONENT_TYPES } from '../utils/circuitContext'
import { useCircuitStore } from './circuitStore'
import { useSimulationStore } from './simulationStore'
import { buildNetlist } from '../utils/netlistBuilder'
import * as api from '../api'

const LS_API_KEY = 'eerie-anthropic-key'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'error'
  content: string
}

interface AiStore {
  open: boolean
  messages: ChatMessage[]
  /** Internal Anthropic API history (includes tool use blocks) */
  _apiHistory: MessageParam[]
  loading: boolean
  /** User-supplied key from localStorage */
  apiKey: string | null
  /** Key provided by daemon (ANTHROPIC_API_KEY env) — preferred over apiKey */
  daemonApiKey: string | null

  /** True if any API key is available (daemon or user-supplied) */
  hasKey: () => boolean

  setOpen: (open: boolean) => void
  toggleOpen: () => void
  setApiKey: (key: string) => void
  clearApiKey: () => void
  /** Load daemon-provided key from capabilities (called once on startup) */
  initDaemonKey: () => Promise<void>
  sendMessage: (text: string) => Promise<void>
  clearMessages: () => void
}

function newId() {
  return crypto.randomUUID()
}

function loadApiKey(): string | null {
  return localStorage.getItem(LS_API_KEY)
}

const SYSTEM_PROMPT = (circuitContext: string) => `\
You are an expert circuit design assistant embedded in Eerie, a SPICE-based circuit design tool.

You help users design, analyze, and debug analog and digital circuits. You can:
- Explain circuit behavior and theory
- Suggest component values and circuit topologies
- Analyze simulation results and identify issues
- Modify the circuit by calling tools (add components, update values, etc.)

Available component types:
${COMPONENT_TYPES.map(c => `  - ${c.type_id}: ${c.description}`).join('\n')}

Current circuit state:
${circuitContext}

When modifying the circuit, prefer making targeted changes and explain what you changed and why.
After making changes, suggest running a simulation to verify the design.
Pin names for connections: resistor/capacitor/inductor use (a, b); voltage/current sources use (positive, negative); BJT uses (collector, base, emitter); MOSFET uses (drain, gate, source); diode uses (anode, cathode).`

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'update_component_property',
    description: 'Update a numeric property of a circuit component (e.g. change resistance, voltage, capacitance).',
    input_schema: {
      type: 'object',
      properties: {
        component_id: {
          type: 'string',
          description: 'The label/ID of the component (e.g. R1, V1, C2)',
        },
        property: {
          type: 'string',
          description: 'Property name (e.g. resistance, voltage, capacitance, inductance, current)',
        },
        value: {
          type: 'number',
          description: 'New value in base SI units (ohms, volts, farads, henries, amps)',
        },
      },
      required: ['component_id', 'property', 'value'],
    },
  },
  {
    name: 'add_component',
    description: 'Add a new component to the circuit. It will appear at the canvas center for the user to position.',
    input_schema: {
      type: 'object',
      properties: {
        type_id: {
          type: 'string',
          enum: COMPONENT_TYPES.map(c => c.type_id) as string[],
          description: 'Component type',
        },
        label: {
          type: 'string',
          description: 'Optional label (e.g. R3). Leave empty to auto-generate.',
        },
        properties: {
          type: 'object',
          description: 'Key-value pairs of numeric properties. E.g. {"resistance": 4700} or {"voltage": 12}',
          additionalProperties: { type: 'number' },
        },
      },
      required: ['type_id'],
    },
  },
  {
    name: 'remove_component',
    description: 'Remove a component from the circuit.',
    input_schema: {
      type: 'object',
      properties: {
        component_id: {
          type: 'string',
          description: 'The label/ID of the component to remove (e.g. R1, V1)',
        },
      },
      required: ['component_id'],
    },
  },
  {
    name: 'run_simulation',
    description: 'Run a DC operating point simulation and return the results.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
]

/** Execute a single tool call and return a result string */
async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  const store = useCircuitStore.getState()

  switch (name) {
    case 'update_component_property': {
      const { component_id, property, value } = input as {
        component_id: string; property: string; value: number
      }
      // Find component by label or id
      const comp = store.circuit.components.find(
        c => c.label === component_id || c.id === component_id
      )
      if (!comp) return `Error: component "${component_id}" not found`
      store.updateComponentProperty(comp.id, property, { Float: value })
      return `Updated ${comp.label ?? comp.id}.${property} = ${value}`
    }

    case 'add_component': {
      const { type_id, label, properties } = input as {
        type_id: string; label?: string; properties?: Record<string, number>
      }
      const props = properties
        ? Object.fromEntries(Object.entries(properties).map(([k, v]) => [k, { Float: v }]))
        : {}
      store.addComponent(type_id, 0, 0, {
        properties: props,
        ...(label ? { namePrefix: label } : {}),
      })
      const added = store.circuit.components.at(-1)
      return `Added ${added?.label ?? type_id} (${type_id})`
    }

    case 'remove_component': {
      const { component_id } = input as { component_id: string }
      const comp = store.circuit.components.find(
        c => c.label === component_id || c.id === component_id
      )
      if (!comp) return `Error: component "${component_id}" not found`
      store.removeComponent(comp.id)
      return `Removed ${comp.label ?? comp.id}`
    }

    case 'run_simulation': {
      try {
        const netlist = buildNetlist(store.circuit)
        const result = await api.simulate(netlist)
        if (!result.ok) return `Simulation error: ${result.error.message}`
        useSimulationStore.getState().setResult(result.value)
        // Format key results
        const lines: string[] = []
        for (const plot of result.value.plots) {
          for (const vec of plot.vecs) {
            if (vec.real?.length === 1) {
              lines.push(`${vec.name} = ${vec.real[0].toPrecision(4)}`)
            }
          }
        }
        return lines.length > 0
          ? `Simulation complete:\n${lines.join('\n')}`
          : 'Simulation complete (no scalar results)'
      } catch (e) {
        return `Simulation error: ${String(e)}`
      }
    }

    default:
      return `Unknown tool: ${name}`
  }
}

export const useAiStore = create<AiStore>((set, get) => ({
  open: false,
  messages: [],
  _apiHistory: [],
  loading: false,
  apiKey: loadApiKey(),
  daemonApiKey: null,

  hasKey: () => !!(get().daemonApiKey ?? get().apiKey),

  setOpen: (open) => set({ open }),
  toggleOpen: () => set(s => ({ open: !s.open })),

  setApiKey: (key) => {
    localStorage.setItem(LS_API_KEY, key)
    set({ apiKey: key })
  },

  clearApiKey: () => {
    localStorage.removeItem(LS_API_KEY)
    set({ apiKey: null })
  },

  initDaemonKey: async () => {
    try {
      const caps = await api.getCapabilities()
      if (caps.anthropic_api_key) {
        set({ daemonApiKey: caps.anthropic_api_key })
      }
    } catch { /* daemon not available, ignore */ }
  },

  clearMessages: () => set({ messages: [], _apiHistory: [] }),

  sendMessage: async (text: string) => {
    const apiKey = get().daemonApiKey ?? get().apiKey
    if (!apiKey) return
    const { _apiHistory } = get()

    const userMsg: ChatMessage = { id: newId(), role: 'user', content: text }
    const history: MessageParam[] = [..._apiHistory, { role: 'user', content: text }]

    set(s => ({
      messages: [...s.messages, userMsg],
      _apiHistory: history,
      loading: true,
    }))

    try {
      const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })

      const circuit = useCircuitStore.getState().circuit
      const simResult = useSimulationStore.getState().result
      const systemPrompt = SYSTEM_PROMPT(circuitToContext(circuit, simResult))

      let currentHistory = history

      // Agentic loop: keep going until no more tool calls
      while (true) {
        const response = await client.messages.create({
          model: 'claude-opus-4-6',
          max_tokens: 4096,
          system: systemPrompt,
          tools: TOOLS,
          messages: currentHistory,
        })

        if (response.stop_reason === 'tool_use') {
          // Execute all tool calls in this response
          const toolResults: Anthropic.ToolResultBlockParam[] = []
          for (const block of response.content) {
            if (block.type === 'tool_use') {
              const toolBlock = block as ToolUseBlock
              const result = await executeTool(
                toolBlock.name,
                toolBlock.input as Record<string, unknown>
              )
              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolBlock.id,
                content: result,
              })
            }
          }

          // Add assistant message + tool results to history
          currentHistory = [
            ...currentHistory,
            { role: 'assistant', content: response.content },
            { role: 'user', content: toolResults },
          ]
        } else {
          // Final response — extract text
          const textBlocks = response.content.filter(b => b.type === 'text') as TextBlock[]
          const assistantText = textBlocks.map(b => b.text).join('\n').trim()

          const assistantMsg: ChatMessage = {
            id: newId(),
            role: 'assistant',
            content: assistantText || '(no response)',
          }

          const finalHistory: MessageParam[] = [
            ...currentHistory,
            { role: 'assistant', content: response.content },
          ]

          set(s => ({
            messages: [...s.messages, assistantMsg],
            _apiHistory: finalHistory,
            loading: false,
          }))
          break
        }
      }
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
