import { create } from 'zustand'
import type { Analysis, SimResult } from '../../../codegen/generated-rpc'

export interface SimulationState {
  analysis: Analysis
  result: SimResult | null
  /** Maps net ID → SPICE node name (e.g. "0", "VCC", "n001"). Set alongside result. */
  netNodeMap: Map<string, string>
  error: string | null
  running: boolean
  setAnalysis: (a: Analysis) => void
  setResult: (r: SimResult | null, netNodeMap?: Map<string, string>) => void
  setError: (e: string | null) => void
  setRunning: (r: boolean) => void
}

export const useSimulationStore = create<SimulationState>((set) => ({
  analysis: { tag: 'Op' },
  result: null,
  netNodeMap: new Map(),
  error: null,
  running: false,
  setAnalysis: (analysis) => set({ analysis }),
  setResult: (result, netNodeMap) => set({ result, ...(netNodeMap ? { netNodeMap } : {}) }),
  setError: (error) => set({ error }),
  setRunning: (running) => set({ running }),
}))
