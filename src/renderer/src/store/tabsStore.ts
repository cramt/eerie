import { create } from 'zustand'
import type { Circuit } from '../types'
import { useCircuitStore } from './circuitStore'

export interface Tab {
  id: string
  projectPath: string
  circuitName: string
  circuit: Circuit
  dirty: boolean
}

interface TabsStore {
  tabs: Tab[]
  activeTabId: string | null

  openTab: (projectPath: string, circuitName: string, circuit: Circuit) => void
  closeTab: (tabId: string) => void
  switchToTab: (tabId: string) => void
}

const EMPTY_CIRCUIT: Circuit = { name: 'Untitled', components: [], nets: [] }

export const useTabsStore = create<TabsStore>((set, get) => ({
  tabs: [],
  activeTabId: null,

  openTab: (projectPath, circuitName, circuit) => {
    const { tabs } = get()

    // Already open — just switch to it
    const existing = tabs.find(
      (t) => t.projectPath === projectPath && t.circuitName === circuitName,
    )
    if (existing) {
      get().switchToTab(existing.id)
      return
    }

    // Save current circuit snapshot to the currently active tab
    syncActiveTabFromStore(get)

    // Create and activate new tab
    const id = crypto.randomUUID()
    const tab: Tab = { id, projectPath, circuitName, circuit, dirty: false }
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: id }))

    // Load circuit into the active store (clears undo history)
    useCircuitStore.getState().setCircuit(circuit, projectPath, circuitName)
  },

  closeTab: (tabId) => {
    const { tabs, activeTabId } = get()
    const idx = tabs.findIndex((t) => t.id === tabId)
    if (idx < 0) return

    const newTabs = tabs.filter((t) => t.id !== tabId)
    let newActiveId: string | null = null

    if (activeTabId === tabId) {
      // Pick adjacent tab
      if (newTabs.length > 0) {
        newActiveId = newTabs[Math.max(0, idx - 1)].id
      }
    } else {
      newActiveId = activeTabId
    }

    set({ tabs: newTabs, activeTabId: newActiveId })

    // Load the new active tab's circuit
    if (newActiveId) {
      const next = newTabs.find((t) => t.id === newActiveId)!
      useCircuitStore.getState().setCircuit(next.circuit, next.projectPath, next.circuitName)
      useCircuitStore.setState({ dirty: next.dirty })
    } else {
      useCircuitStore.getState().setCircuit(EMPTY_CIRCUIT)
      useCircuitStore.setState({ projectPath: null, circuitName: null, dirty: false })
    }
  },

  switchToTab: (tabId) => {
    const { tabs, activeTabId } = get()
    if (tabId === activeTabId) return

    // Snapshot current circuit into current tab
    syncActiveTabFromStore(get)

    const tab = tabs.find((t) => t.id === tabId)
    if (!tab) return

    set({ activeTabId: tabId })
    useCircuitStore.getState().setCircuit(tab.circuit, tab.projectPath, tab.circuitName)
    useCircuitStore.setState({ dirty: tab.dirty })
  },
}))

/** Copy current circuitStore state into the active tab snapshot. */
function syncActiveTabFromStore(get: () => TabsStore): void {
  const { activeTabId } = get()
  if (!activeTabId) return
  const { circuit, dirty } = useCircuitStore.getState()
  useTabsStore.setState((s) => ({
    tabs: s.tabs.map((t) =>
      t.id === activeTabId ? { ...t, circuit, dirty } : t,
    ),
  }))
}

// Keep active tab snapshot in sync as the user edits the circuit.
useCircuitStore.subscribe((state, prev) => {
  if (state.circuit === prev.circuit && state.dirty === prev.dirty) return
  const { activeTabId } = useTabsStore.getState()
  if (!activeTabId) return
  useTabsStore.setState((s) => ({
    tabs: s.tabs.map((t) =>
      t.id === activeTabId
        ? { ...t, circuit: state.circuit, dirty: state.dirty }
        : t,
    ),
  }))
})
