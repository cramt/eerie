# 014 — Transient Simulation

Status: done
Priority: medium

## Goal
Implement time-domain (transient) simulation — integrate circuit equations over time
and plot node voltages vs time.

## Tasks
- Add transient solver to `eerie-core/src/simulation/` (new file `transient.rs`)
  - Use backward Euler integration (simplest stable method)
  - Time step: fixed step from user input
- Add `AnalysisType::Transient { time_s }` (already in type)
- Add time-varying source types to component defs:
  - `sine`: amplitude, frequency, phase, DC offset
  - `pulse`: initial, pulsed value, rise time, fall time, pulse width, period
  - `pwl`: piecewise linear (list of time-value pairs)
- SimulationPanel: "Transient" tab with:
  - Stop time
  - Time step
  - Output node selector
- Plot waveform as SVG (time on x-axis, voltage on y-axis)
- Multiple nodes can be plotted simultaneously (different colors)

## Notes
- Backward Euler: `C*(V(t+h) - V(t))/h = I(t+h)` — requires solving a linear system at each step
- For large circuits this is slow in WASM; consider running transient in the daemon
- Store waveform data as `Vec<(f64, HashMap<String, f64>)>` (time, node→voltage)

## Acceptance criteria
- RC circuit with step input: shows exponential charging curve
- Plot is zoomable (click and drag to zoom x-axis)
- Results match hand calculation within 1% for simple circuits
