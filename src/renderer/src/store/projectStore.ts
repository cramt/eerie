import { create } from 'zustand'
import type { ComponentDef } from '../../../codegen/generated-rpc'

export type { ComponentDef }

export interface ProjectComponent {
  /** Display name shown in the component panel, e.g. "10kΩ Resistor" */
  name: string
  /** Matches a key in SYMBOL_REGISTRY, e.g. "resistor" */
  type_id: string
  /**
   * SPICE label prefix for auto-numbering, e.g. "R" → R1, R2, ...
   * Defaults to the built-in SPICE prefix for the type_id if omitted.
   */
  name_prefix?: string
  /** Default properties to apply when placing, e.g. { resistance: 10000 } */
  properties: Record<string, unknown>
}

interface ProjectStore {
  /** Component library from eerie.yaml. null = use the built-in generic list. */
  components: ProjectComponent[] | null
  setComponents: (components: ProjectComponent[] | null) => void
  /** Full ComponentDef[] (with symbol graphics) keyed by type_id. */
  componentDefs: Record<string, ComponentDef>
  setComponentDefs: (defs: ComponentDef[]) => void
}

export const useProjectStore = create<ProjectStore>((set) => ({
  components: null,
  setComponents: (components) => set({ components }),
  componentDefs: {},
  setComponentDefs: (defs) =>
    set({ componentDefs: Object.fromEntries(defs.map((d) => [d.id, d])) }),
}))
