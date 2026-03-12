import { create } from 'zustand'
import type { Circuit } from '../types'
import { useCircuitStore } from './circuitStore'

export interface CircuitTab {
  kind: 'circuit'
  id: string
  projectPath: string
  circuitName: string
  circuit: Circuit
  dirty: boolean
}

export interface TextTab {
  kind: 'text'
  id: string
  projectPath: string
  fileName: string
  content: string
  dirty: boolean
}

export type Tab = CircuitTab | TextTab

interface TabsStore {
  tabs: Tab[]
  activeTabId: string | null

  openTab: (projectPath: string, circuitName: string, circuit: Circuit) => void
  openTextTab: (projectPath: string, fileName: string, content: string) => void
  updateTextContent: (tabId: string, content: string) => void
  closeTab: (tabId: string) => void
  switchToTab: (tabId: string) => void
}

const EMPTY_CIRCUIT: Circuit = { name: 'Untitled', components: [], nets: [] }

/** Get display name for a tab (used for dedup and display). */
export function tabDisplayName(tab: Tab): string {
  return tab.kind === 'circuit' ? tab.circuitName : tab.fileName
}

/** Get the unique key for dedup: projectPath + name. */
function tabKey(tab: Tab): string {
  return `${tab.projectPath}/${tabDisplayName(tab)}`
}

export const useTabsStore = create<TabsStore>((set, get) => ({
  tabs: [],
  activeTabId: null,

  openTab: (projectPath, circuitName, circuit) => {
    const { tabs } = get()

    // Already open — just switch to it
    const existing = tabs.find(
      (t) => t.kind === 'circuit' && t.projectPath === projectPath && t.circuitName === circuitName,
    )
    if (existing) {
      get().switchToTab(existing.id)
      return
    }

    // Save current circuit snapshot to the currently active tab
    syncActiveTabFromStore(get)

    // Create and activate new tab
    const id = crypto.randomUUID()
    const tab: CircuitTab = { kind: 'circuit', id, projectPath, circuitName, circuit, dirty: false }
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: id }))

    // Load circuit into the active store (clears undo history)
    useCircuitStore.getState().setCircuit(circuit, projectPath, circuitName)
  },

  openTextTab: (projectPath, fileName, content) => {
    const { tabs } = get()

    // Already open — just switch to it
    const existing = tabs.find(
      (t) => t.kind === 'text' && t.projectPath === projectPath && t.fileName === fileName,
    )
    if (existing) {
      get().switchToTab(existing.id)
      return
    }

    // Save current circuit snapshot to the currently active tab
    syncActiveTabFromStore(get)

    const id = crypto.randomUUID()
    const tab: TextTab = { kind: 'text', id, projectPath, fileName, content, dirty: false }
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: id }))

    // Clear circuit store since we're not editing a circuit
    useCircuitStore.getState().setCircuit(EMPTY_CIRCUIT)
    useCircuitStore.setState({ projectPath, circuitName: null, dirty: false })
  },

  updateTextContent: (tabId, content) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId && t.kind === 'text' ? { ...t, content, dirty: true } : t,
      ),
    }))
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

    // Load the new active tab's circuit (or clear if text tab / no tabs)
    if (newActiveId) {
      const next = newTabs.find((t) => t.id === newActiveId)!
      if (next.kind === 'circuit') {
        useCircuitStore.getState().setCircuit(next.circuit, next.projectPath, next.circuitName)
        useCircuitStore.setState({ dirty: next.dirty })
      } else {
        useCircuitStore.getState().setCircuit(EMPTY_CIRCUIT)
        useCircuitStore.setState({ projectPath: next.projectPath, circuitName: null, dirty: false })
      }
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
    if (tab.kind === 'circuit') {
      useCircuitStore.getState().setCircuit(tab.circuit, tab.projectPath, tab.circuitName)
      useCircuitStore.setState({ dirty: tab.dirty })
    } else {
      useCircuitStore.getState().setCircuit(EMPTY_CIRCUIT)
      useCircuitStore.setState({ projectPath: tab.projectPath, circuitName: null, dirty: false })
    }
  },
}))

/** Copy current circuitStore state into the active tab snapshot. */
function syncActiveTabFromStore(get: () => TabsStore): void {
  const { activeTabId } = get()
  if (!activeTabId) return
  const { circuit, dirty } = useCircuitStore.getState()
  useTabsStore.setState((s) => ({
    tabs: s.tabs.map((t) =>
      t.id === activeTabId && t.kind === 'circuit' ? { ...t, circuit, dirty } : t,
    ),
  }))
}

// Keep active tab snapshot in sync as the user edits the circuit.
useCircuitStore.subscribe((state, prev) => {
  if (state.circuit === prev.circuit && state.dirty === prev.dirty) return
  const { activeTabId, tabs } = useTabsStore.getState()
  if (!activeTabId) return
  const activeTab = tabs.find((t) => t.id === activeTabId)
  if (!activeTab || activeTab.kind !== 'circuit') return
  useTabsStore.setState((s) => ({
    tabs: s.tabs.map((t) =>
      t.id === activeTabId && t.kind === 'circuit'
        ? { ...t, circuit: state.circuit, dirty: state.dirty }
        : t,
    ),
  }))
})
