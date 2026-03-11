# 006 — Load Component Definitions from YAML

Status: open
Priority: high

## Goal
Have the daemon scan the `components/` directory at startup, parse all YAML component
definition files, and serve them to the frontend so the ComponentPanel is populated
with real components.

## Tasks
- Daemon: on startup, recursively scan `components/**/*.yaml`
- Parse each file as `ComponentDef` using `facet_yaml::from_str::<ComponentDef>()`
- Add a daemon RPC method: `components.list` → returns `Vec<ComponentDef>` as JSON
- Frontend: on app start, call `components.list` and store results in Zustand
- ComponentPanel: render the real component list (grouped by category)
- Wire drag-from-panel to place a new `ComponentInstance` on the canvas

## Files to modify
- `eerie-daemon/src/main.rs` or `rpc.rs` (add `components.list` handler)
- `src/main/index.ts` (forward RPC call)
- `src/renderer/src/store/circuitStore.ts` (add `componentDefs` state)
- `src/renderer/src/components/ComponentPanel/ComponentPanel.tsx`

## Notes
- Component YAML casing: `direction: left`, `pin_type: passive`, `property_type: float`
  (all snake_case — matches `#[facet(rename_all = "snake_case")]`)
- `DefaultValue` enum stays PascalCase: `default: { Float: 1000.0 }`

## Acceptance criteria
- ComponentPanel shows: Resistor, Capacitor, Inductor, DC Voltage, DC Current, Ground, VCC
- Each entry shows name, category, and description from the YAML
- Dragging a component onto the canvas places it (position tracked in circuit store)
