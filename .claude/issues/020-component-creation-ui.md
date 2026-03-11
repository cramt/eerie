# 020 — Component Creation UI

Status: open
Priority: low

## Goal
Allow users to create new component definitions from within the app and save them as
YAML files in the `components/` directory.

## Tasks
- New "Create Component" dialog / side panel:
  - Name, ID, description, category, keywords
  - Pin editor: add/remove/position pins, set direction and type
  - Symbol editor: draw graphics elements (line, circle, arc, polyline, rectangle)
  - Property editor: define typed properties with defaults
  - Simulation tab: set model type, netlist template
- Preview the symbol as it's drawn
- Save as YAML via daemon (`file.write` to `components/` subdirectory)
- Reload component list after save
- Edit existing components: right-click on component in panel → "Edit Definition"

## Notes
- The symbol editor doesn't need to be a full vector editor — just a grid where
  you can add/remove/move graphics primitives
- Keep it simple: if it gets complex, just let users edit the YAML directly

## Files to create
- `src/renderer/src/components/ComponentEditor/ComponentEditor.tsx` (new)
- `src/renderer/src/components/ComponentEditor/PinEditor.tsx` (new)
- `src/renderer/src/components/ComponentEditor/SymbolEditor.tsx` (new)

## Acceptance criteria
- Can create a simple 2-pin resistor-like component
- Saved YAML is valid and parseable by eerie-daemon
- New component appears in ComponentPanel immediately after save
