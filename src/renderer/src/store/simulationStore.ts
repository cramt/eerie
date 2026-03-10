import { create } from 'zustand'
import type { Analysis, SimResult } from '../../../codegen/types'

export interface SimulationState {
  analysis: Analysis
  result: SimResult | null
  error: string | null
  running: boolean
  setAnalysis: (a: Analysis) => void
  setResult: (r: SimResult | null) => void
  setError: (e: string | null) => void
  setRunning: (r: boolean) => void
}

export const useSimulationStore = create<SimulationState>((set) => ({
  analysis: 'Op',
  result: null,
  error: null,
  running: false,
  setAnalysis: (analysis) => set({ analysis }),
  setResult: (result) => set({ result }),
  setError: (error) => set({ error }),
  setRunning: (running) => set({ running }),
}))
