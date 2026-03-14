import { create } from 'zustand'
import type { Point, Tool, Theme } from '../types'

export interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
}

interface UiStore {
  tool: Tool
  placingTypeId: string | null
  /** When placing a project component, the preset properties + optional prefix */
  placingPreset: { properties: Record<string, unknown>; namePrefix?: string } | null
  /** Index into the project component list, or null when using generic */
  placingProjectIdx: number | null
  selectedComponentIds: Set<string>
  selectedNetIds: Set<string>
  theme: Theme
  zoom: number
  mouseGridPos: Point
  simPanelOpen: boolean
  chatOpen: boolean
  chatMessages: ChatMessage[]
  chatSessionId: string | null

  setTool: (tool: Tool) => void
  setPlacingTypeId: (typeId: string | null) => void
  setPlacingPreset: (preset: { properties: Record<string, unknown>; namePrefix?: string } | null) => void
  setPlacingProjectIdx: (idx: number | null) => void
  setSimPanelOpen: (open: boolean) => void
  toggleSimPanel: () => void
  setChatOpen: (open: boolean) => void
  toggleChat: () => void
  addChatMessage: (msg: ChatMessage) => void
  setChatSessionId: (id: string | null) => void
  selectComponent: (id: string | null) => void
  toggleSelectComponent: (id: string) => void
  addToSelection: (id: string) => void
  selectComponents: (ids: string[]) => void
  selectNet: (id: string | null) => void
  toggleSelectNet: (id: string) => void
  selectNets: (ids: string[]) => void
  clearSelection: () => void
  setTheme: (theme: Theme) => void
  setZoom: (zoom: number) => void
  setMouseGridPos: (pos: Point) => void

  aiEditDialog: { x: number; y: number; focusedComponentId?: string } | null
  openAiEditDialog: (x: number, y: number, focusedComponentId?: string) => void
  closeAiEditDialog: () => void
}

export const useUiStore = create<UiStore>((set, get) => ({
  tool: 'select',
  placingTypeId: null,
  placingPreset: null,
  placingProjectIdx: null,
  selectedComponentIds: new Set<string>(),
  selectedNetIds: new Set<string>(),
  theme: 'neon',
  zoom: 1,
  mouseGridPos: { x: 0, y: 0 },
  simPanelOpen: false,
  chatOpen: false,
  chatMessages: [],
  chatSessionId: null,

  setTool: (tool) => set({ tool }),
  setSimPanelOpen: (open) => set({ simPanelOpen: open }),
  toggleSimPanel: () => set((s) => ({ simPanelOpen: !s.simPanelOpen })),
  setChatOpen: (open) => set({ chatOpen: open }),
  toggleChat: () => set((s) => ({ chatOpen: !s.chatOpen })),
  addChatMessage: (msg) => set((s) => ({ chatMessages: [...s.chatMessages, msg] })),
  setChatSessionId: (id) => set({ chatSessionId: id }),
  setPlacingTypeId: (typeId) => set({ placingTypeId: typeId }),
  setPlacingPreset: (preset) => set({ placingPreset: preset }),
  setPlacingProjectIdx: (idx) => set({ placingProjectIdx: idx }),
  selectComponent: (id) => set({
    selectedComponentIds: id ? new Set([id]) : new Set(),
    selectedNetIds: new Set(),
  }),
  toggleSelectComponent: (id) => {
    const current = new Set(get().selectedComponentIds)
    if (current.has(id)) current.delete(id)
    else current.add(id)
    set({ selectedComponentIds: current })
  },
  addToSelection: (id) => {
    const current = new Set(get().selectedComponentIds)
    current.add(id)
    set({ selectedComponentIds: current })
  },
  selectComponents: (ids) => set({ selectedComponentIds: new Set(ids) }),
  selectNet: (id) => set({
    selectedNetIds: id ? new Set([id]) : new Set(),
    selectedComponentIds: new Set(),
  }),
  toggleSelectNet: (id) => {
    const current = new Set(get().selectedNetIds)
    if (current.has(id)) current.delete(id)
    else current.add(id)
    set({ selectedNetIds: current })
  },
  selectNets: (ids) => set({ selectedNetIds: new Set(ids) }),
  clearSelection: () => set({ selectedComponentIds: new Set(), selectedNetIds: new Set() }),
  setTheme: (theme) => {
    localStorage.setItem('eerie-theme', theme)
    set({ theme })
  },
  setZoom: (zoom) => set({ zoom }),
  setMouseGridPos: (pos) => set({ mouseGridPos: pos }),

  aiEditDialog: null,
  openAiEditDialog: (x, y, focusedComponentId) => set({ aiEditDialog: { x, y, focusedComponentId } }),
  closeAiEditDialog: () => set({ aiEditDialog: null }),
}))
