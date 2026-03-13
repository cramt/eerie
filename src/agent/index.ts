/**
 * Eerie AI agent — subprocess entry point.
 *
 * Similar to Zed's claude-agent-acp: spawned by the daemon, communicates
 * over stdin/stdout with JSON, and uses @anthropic-ai/claude-agent-sdk
 * (which drives the `claude` CLI) with custom in-process MCP tools for
 * circuit manipulation.
 *
 * Usage: tsx src/agent/index.ts
 * Stdin:  JSON { messages, circuit_yaml, spice_netlist, mcp_url }
 * Stdout: JSON { message, mutations }
 */

import { query, tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

// ── Types ──────────────────────────────────────────────────────────────────

interface AgentRequest {
  messages: { role: string; content: string }[]
  circuit_yaml: string
  spice_netlist: string
  mcp_url: string
}

type Mutation =
  | { tag: 'UpdateProperty'; component_id: string; property: string; value: number }
  | { tag: 'AddComponent'; type_id: string; label: string | null; properties: [string, number][] }
  | { tag: 'RemoveComponent'; component_id: string }
  | { tag: 'SetIntent'; intent: string | null }
  | { tag: 'SetParameter'; name: string; value: number }
  | { tag: 'RemoveParameter'; name: string }

// ── Read stdin ─────────────────────────────────────────────────────────────

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as ArrayBuffer))
  }
  return Buffer.concat(chunks).toString('utf8')
}

const req: AgentRequest = JSON.parse(await readStdin())

// ── Mutation accumulator ───────────────────────────────────────────────────

const mutations: Mutation[] = []

// ── MCP helper: call a tool on the daemon's MCP server ────────────────────

async function callDaemonTool(mcp_url: string, name: string, args: Record<string, unknown>): Promise<string> {
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name, arguments: args },
  })
  const res = await fetch(mcp_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })
  const data = await res.json() as { result?: { content?: { text?: string }[] }; error?: { message?: string } }
  if (data.error) {
    return `Error: ${data.error.message ?? 'unknown error'}`
  }
  return data.result?.content?.[0]?.text ?? '(no result)'
}

// ── In-process MCP tools for circuit mutations ────────────────────────────

const circuitTools = [
  tool(
    'update_component_property',
    'Update a numeric property of a circuit component (e.g. change resistance, voltage, capacitance).',
    {
      component_id: z.string().describe('The label/ID of the component (e.g. R1, V1, C2)'),
      property: z.string().describe('Property name (e.g. resistance, voltage, capacitance, inductance, current)'),
      value: z.number().describe('New value in base SI units (ohms, volts, farads, henries, amps)'),
    },
    async ({ component_id, property, value }) => {
      mutations.push({ tag: 'UpdateProperty', component_id, property, value })
      return { content: [{ type: 'text' as const, text: `Updated ${component_id}.${property} = ${value}` }] }
    },
  ),

  tool(
    'add_component',
    'Add a new component to the circuit. It will appear at the canvas center for the user to position.',
    {
      type_id: z.string().describe('Component type (e.g. resistor, capacitor, inductor, dc_voltage, dc_current, diode, npn, pnp, nmos, pmos, ground, opamp)'),
      label: z.string().optional().describe('Optional label (e.g. R3). Leave empty to auto-generate.'),
      properties: z.record(z.string(), z.number()).optional().describe('Numeric property values, e.g. {"resistance": 4700}'),
    },
    async ({ type_id, label, properties }) => {
      const props: [string, number][] = Object.entries(properties ?? {})
      mutations.push({ tag: 'AddComponent', type_id, label: label ?? null, properties: props })
      const label_str = label ? ` (${label})` : ''
      return { content: [{ type: 'text' as const, text: `Added ${type_id}${label_str}` }] }
    },
  ),

  tool(
    'remove_component',
    'Remove a component from the circuit.',
    {
      component_id: z.string().describe('The label/ID of the component to remove (e.g. R1, V1)'),
    },
    async ({ component_id }) => {
      mutations.push({ tag: 'RemoveComponent', component_id })
      return { content: [{ type: 'text' as const, text: `Removed ${component_id}` }] }
    },
  ),

  tool(
    'run_simulation',
    'Run a DC operating point simulation and return node voltages and branch currents.',
    {
      netlist: z.string().describe('SPICE netlist text (ngspice dialect). Must include .op and end with .end.'),
    },
    async ({ netlist }) => {
      const result = await callDaemonTool(req.mcp_url, 'simulate_spice', { netlist })
      return { content: [{ type: 'text' as const, text: result }] }
    },
  ),

  tool(
    'set_circuit_intent',
    'Set or update the design intent description for this circuit.',
    {
      intent: z.string().describe('Human-readable description of the circuit\'s purpose, design goals, and constraints.'),
    },
    async ({ intent }) => {
      mutations.push({ tag: 'SetIntent', intent: intent.trim() || null })
      return { content: [{ type: 'text' as const, text: 'Circuit intent updated' }] }
    },
  ),

  tool(
    'set_parameter',
    'Define or update a named circuit parameter.',
    {
      name: z.string().describe('Parameter name (e.g. R_load, cutoff_freq, supply_voltage)'),
      value: z.number().describe('Numeric value in base SI units'),
    },
    async ({ name, value }) => {
      mutations.push({ tag: 'SetParameter', name, value })
      return { content: [{ type: 'text' as const, text: `Parameter ${name} = ${value}` }] }
    },
  ),

  tool(
    'remove_parameter',
    'Remove a named circuit parameter.',
    {
      name: z.string().describe('Parameter name to remove'),
    },
    async ({ name }) => {
      mutations.push({ tag: 'RemoveParameter', name })
      return { content: [{ type: 'text' as const, text: `Removed parameter ${name}` }] }
    },
  ),

  tool(
    'get_project_info',
    'Get project metadata: name, directory, and list of circuit files.',
    {},
    async () => {
      const result = await callDaemonTool(req.mcp_url, 'get_project_info', {})
      return { content: [{ type: 'text' as const, text: result }] }
    },
  ),

  tool(
    'read_circuit',
    'Read a .eerie circuit file and return its topology summary.',
    {
      filename: z.string().describe('Filename relative to project dir, e.g. "voltage_divider.eerie"'),
    },
    async ({ filename }) => {
      const result = await callDaemonTool(req.mcp_url, 'get_circuit_topology', { filename })
      return { content: [{ type: 'text' as const, text: result }] }
    },
  ),
]

// ── System prompt ──────────────────────────────────────────────────────────

const systemPrompt = `You are an expert circuit design assistant embedded in Eerie, a SPICE-based circuit design tool.

You help users design, analyze, and debug analog and digital circuits. You can:
- Explain circuit behavior and theory
- Suggest component values and circuit topologies
- Analyze simulation results and identify issues
- Modify the circuit by calling tools (add components, update values, etc.)

Current circuit state:
${req.circuit_yaml}

${req.spice_netlist ? `SPICE netlist:\n${req.spice_netlist}\n` : ''}
When modifying the circuit, prefer making targeted changes and explain what you changed and why.
After making changes, suggest running a simulation to verify the design.
Pin names for connections: resistor/capacitor/inductor use (a, b); voltage/current sources use (positive, negative); BJT uses (collector, base, emitter); MOSFET uses (drain, gate, source); diode uses (anode, cathode).`

// ── Build prompt from message history ─────────────────────────────────────

function buildPrompt(messages: { role: string; content: string }[]): string {
  if (messages.length === 0) return ''
  if (messages.length === 1) return messages[0].content

  const history = messages.slice(0, -1)
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n')
  const last = messages[messages.length - 1].content
  return `Previous conversation:\n${history}\n\nUser: ${last}`
}

// ── Run the agent ──────────────────────────────────────────────────────────

const server = createSdkMcpServer({ name: 'eerie-circuit', tools: circuitTools })
const prompt = buildPrompt(req.messages)

let finalText = ''
for await (const message of query({
  prompt,
  options: {
    systemPrompt,
    mcpServers: { 'eerie-circuit': server },
    maxTurns: 10,
  },
})) {
  if ('result' in message) {
    finalText = (message.result as string | null | undefined) ?? ''
  }
}

// ── Write response to stdout ───────────────────────────────────────────────

process.stdout.write(JSON.stringify({
  message: finalText.trim() || '(no response)',
  mutations,
}) + '\n')
