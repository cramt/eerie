# 019 — SPICE Netlist Export

Status: open
Priority: medium

## Goal
Export a circuit as a SPICE netlist (.sp) that can be loaded into LTSpice or ngspice.

## Tasks
- Walk all components in the circuit, generate SPICE lines from `simulation.netlist` template
- Template variables: `{label}`, `{p}`, `{n}`, plus any property names
- Net naming: use net name if set, otherwise generate N001, N002, etc.
- Ground net must map to `0` in SPICE
- Add analysis commands based on last simulation type:
  - DC: `.op`
  - AC sweep: `.ac dec 100 {start} {stop}`
  - Transient: `.tran {step} {stop}`
- Handle subcircuits: flatten or use `.SUBCKT` blocks
- Export via "File > Export SPICE Netlist..." menu item
- Validate the export by running ngspice on it (if ngspice is in the PATH)

## Example output
```spice
* Voltage Divider - exported from eerie
V1 VIN 0 DC 5
R1 VIN VMID 1000
R2 VMID 0 1000
.op
.end
```

## Files to create/modify
- `eerie-core/src/io/spice_export.rs` (new)
- `eerie-core/src/io/mod.rs` (export the new module)
- `eerie-daemon/src/rpc.rs` (add `circuit.export_spice` method)
- `src/main/index.ts` (add "Export SPICE" menu item)
- `src/renderer/src/components/Toolbar/Toolbar.tsx` (Export button)

## Acceptance criteria
- Export voltage_divider.eerie → valid SPICE netlist
- ngspice can parse and simulate the exported netlist without errors
- All component property values appear correctly in the netlist
