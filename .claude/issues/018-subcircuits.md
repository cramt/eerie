# 018 — Subcircuit / Hierarchical Design

Status: open
Priority: medium

## Goal
Allow a schematic to reference another `.eerie` file as a subcircuit component,
enabling hierarchical circuit design.

## Tasks
- New component type: `Subcircuit` — references another `.eerie` file by path
- The subcircuit's top-level net connections become pins on the symbol
- Daemon: when loading a circuit, recursively resolve subcircuit references
- Simulation: inline the subcircuit's netlist into the parent netlist before solving
- UI: double-click on a subcircuit symbol → opens the referenced file in a new tab
- "Push into" / "Pop out" navigation for hierarchy
- Export a flat SPICE netlist (issue #019) expands all subcircuits

## YAML representation
```yaml
type_id: subcircuit
properties:
  file: { String: "../filters/lowpass.eerie" }
```

## Files to create/modify
- `eerie-core/src/io/yaml.rs` (subcircuit resolution)
- `eerie-core/src/simulation/mna.rs` (flatten subcircuit before MNA)
- `eerie-daemon/src/rpc.rs` (handle subcircuit file loading)
- Frontend: tab management for multiple open schematics

## Acceptance criteria
- Create a simple voltage divider subcircuit
- Instantiate it in a parent schematic, connect to a source and load
- DC simulation of parent circuit gives correct node voltages accounting for subcircuit
- Can navigate into and out of subcircuit in the UI
