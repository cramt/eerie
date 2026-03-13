# 012 — Component Label Editing

Status: done
Priority: low

## Goal
Allow the user to double-click a component label (e.g. "R1") to rename it inline.

## Tasks
- Double-click on a component label → show an inline text input over the label
- Pressing Enter or clicking away commits the change
- Pressing Escape cancels
- Update `ComponentInstance.label` in the Zustand store
- Labels must be unique within a circuit (warn if duplicate, but don't block)
- Net name labels (on net symbols like VCC, GND) are edited similarly,
  updating `Net.labels[].text` or the `net_name` property on the symbol component

## Files to modify
- `src/renderer/src/components/Canvas/Canvas.tsx` or `SymbolRenderer.tsx`
- `src/renderer/src/store/circuitStore.ts`

## Acceptance criteria
- Double-click "R1" label → text input appears
- Type "Rfeedback" + Enter → label updates on canvas
- Label persists in saved file
