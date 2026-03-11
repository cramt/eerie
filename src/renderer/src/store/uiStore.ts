import { create } from 'zustand'
import type { Point, Tool, Theme } from '../types'

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

  setTool: (tool: Tool) => void
  setPlacingTypeId: (typeId: string | null) => void
  setPlacingPreset: (preset: { properties: Record<string, unknown>; namePrefix?: string } | null) => void
  setPlacingProjectIdx: (idx: number | null) => void
  setSimPanelOpen: (open: boolean) => void
  toggleSimPanel: () => void
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

  setTool: (tool) => set({ tool }),
  setSimPanelOpen: (open) => set({ simPanelOpen: open }),
  toggleSimPanel: () => set((s) => ({ simPanelOpen: !s.simPanelOpen })),
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
}))
