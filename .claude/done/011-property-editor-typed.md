# 011 — Property Editor Wired to Component Definitions

Status: done
Priority: medium

## Goal
When a component is selected, the PropertyEditor shows the correct typed fields
(with units, default values, and validation) based on the component's YAML definition.

## Tasks
- Look up the selected component's `ComponentDef` by `type_id`
- For each property in `ComponentDef.properties`, render the appropriate input:
  - `float` → number input with SI prefix dropdown (Ω/kΩ/MΩ, pF/nF/μF, etc.)
  - `int` → integer input
  - `bool` → checkbox
  - `string` → text input
- Show property `label` and `unit` from the definition
- On change: update `ComponentInstance.properties[id]` in the Zustand store (wrapped in PropertyValue enum)
- Validate that required properties have values before simulation

## Notes
- SI prefix dropdown for properties with `si_prefixes: true`
- `PropertyValue` in the circuit: `{ Float: 1000.0 }` — update with correct variant
- The editor should show the current value if set, or the default from the def

## Files to modify
- `src/renderer/src/components/PropertyEditor/PropertyEditor.tsx`
- `src/renderer/src/store/circuitStore.ts` (update property action)

## Acceptance criteria
- Select resistor → shows "Resistance" field with kΩ/MΩ/Ω dropdown
- Select DC voltage source → shows "Voltage" field in V
- Changing value updates the circuit store
- Saving and re-opening preserves the edited values
