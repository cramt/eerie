import { create } from 'zustand'
import type { Circuit } from '../types'
import { useCircuitStore } from './circuitStore'

interface HistoryEntry {
  circuit: Circuit
}

interface HistoryStore {
  undoStack: HistoryEntry[]
  redoStack: HistoryEntry[]

  pushUndo: () => void
  undo: () => void
  redo: () => void
}

export const useHistoryStore = create<HistoryStore>((set, get) => ({
  undoStack: [],
  redoStack: [],

  pushUndo: () => {
    const circuit = useCircuitStore.getState().circuit
    set({
      undoStack: [...get().undoStack.slice(-49), { circuit }],
      redoStack: [],
    })
  },

  undo: () => {
    const { undoStack } = get()
    if (undoStack.length === 0) return
    const prev = undoStack[undoStack.length - 1]
    const circuit = useCircuitStore.getState().circuit
    set({
      undoStack: undoStack.slice(0, -1),
      redoStack: [...get().redoStack, { circuit }],
    })
    useCircuitStore.getState().setCircuitDirect(prev.circuit)
  },

  redo: () => {
    const { redoStack } = get()
    if (redoStack.length === 0) return
    const next = redoStack[redoStack.length - 1]
    const circuit = useCircuitStore.getState().circuit
    set({
      redoStack: redoStack.slice(0, -1),
      undoStack: [...get().undoStack, { circuit }],
    })
    useCircuitStore.getState().setCircuitDirect(next.circuit)
  },
}))
