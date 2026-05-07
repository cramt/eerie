import { create } from 'zustand'
import type { Point, Tool, Theme } from '../types'

export interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
}

export type RailId = 'files' | 'components' | 'props' | 'ai'
export type RailState = 'full' | 'collapsed' | 'hidden'
export type RailMap = Record<RailId, RailState>

const DEFAULT_RAILS: RailMap = {
  files: 'full',
  components: 'full',
  props: 'full',
  ai: 'hidden',
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
  chatMessages: ChatMessage[]
  chatSessionId: string | null
  rails: RailMap
  focusMode: boolean
  paletteOpen: boolean
  /** When E is held, the chord chip near cursor lists candidates. */
  chordPending: boolean

  setTool: (tool: Tool) => void
  setPlacingTypeId: (typeId: string | null) => void
  setPlacingPreset: (preset: { properties: Record<string, unknown>; namePrefix?: string } | null) => void
  setPlacingProjectIdx: (idx: number | null) => void
  setSimPanelOpen: (open: boolean) => void
  toggleSimPanel: () => void
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

  cycleRail: (id: RailId) => void
  setRail: (id: RailId, state: RailState) => void
  toggleFocusMode: () => void
  setPaletteOpen: (open: boolean) => void
  togglePalette: () => void
  setChordPending: (pending: boolean) => void
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
  chatMessages: [],
  chatSessionId: null,
  rails: DEFAULT_RAILS,
  focusMode: false,
  paletteOpen: false,
  chordPending: false,

  setTool: (tool) => set({ tool }),
  setSimPanelOpen: (open) => set({ simPanelOpen: open }),
  toggleSimPanel: () => set((s) => ({ simPanelOpen: !s.simPanelOpen })),
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
  setMouseGridPos: (pos) => {
    const prev = get().mouseGridPos
    if (prev.x !== pos.x || prev.y !== pos.y) set({ mouseGridPos: pos })
  },

  aiEditDialog: null,
  openAiEditDialog: (x, y, focusedComponentId) => set({ aiEditDialog: { x, y, focusedComponentId } }),
  closeAiEditDialog: () => set({ aiEditDialog: null }),

  cycleRail: (id) => {
    const order: RailState[] = ['full', 'collapsed', 'hidden']
    const current = get().rails[id]
    const next = order[(order.indexOf(current) + 1) % order.length]
    set((s) => ({ rails: { ...s.rails, [id]: next } }))
  },
  setRail: (id, state) => set((s) => ({ rails: { ...s.rails, [id]: state } })),
  toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen })),
  setChordPending: (pending) => set({ chordPending: pending }),
}))
