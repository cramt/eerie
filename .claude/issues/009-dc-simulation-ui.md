# 009 — DC Simulation End-to-End

Status: open
Priority: high

## Goal
Wire the "Run DC" button in the SimulationPanel to actually run the MNA solver and
display node voltages and branch currents on the canvas.

## Tasks
- SimulationPanel: "Run DC" button calls daemon's `sim.dc` method with the current circuit
- Daemon: calls `eerie-core`'s MNA solver (or use WASM version from renderer)
- Display `SimulationResult.node_voltages` as voltage labels on each net
- Display `SimulationResult.branch_currents` as current annotations on branches
- Show "Converged" / "Did not converge" status in SimulationPanel
- Handle the case where circuit has no sources (return zero result gracefully)

## Notes
- MNA solver is in `eerie-core/src/simulation/mna.rs`
- Net naming: MNA needs numbered nodes; the solver maps net IDs to node indices
- The WASM build of eerie-core exposes `run_dc_simulation(circuit_json: &str) -> String`
- Consider running simulation in WASM (renderer side) to avoid daemon round-trip latency
- Ground net must be node 0 (look for a net connected to a GND component)

## Files to modify
- `src/renderer/src/components/SimulationPanel/SimulationPanel.tsx`
- `src/renderer/src/components/Canvas/Canvas.tsx` (overlay voltage/current labels)
- `src/renderer/src/store/circuitStore.ts` (store SimulationResult)
- `eerie-core/src/simulation/mna.rs` (fix/complete the solver if needed)

## Acceptance criteria
- voltage_divider.eerie: V1=5V, node at midpoint between R1 and R2 shows correct voltage
- SimulationPanel shows "DC Operating Point — Converged"
- Node voltages visible on canvas as small labels near each net
