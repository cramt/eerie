# 013 — AC Sweep Simulation

Status: done
Priority: medium

## Goal
Implement AC sweep (frequency response) analysis — sweep a frequency range and
compute the magnitude/phase at each node.

## Tasks
- Extend MNA solver in `eerie-core/src/simulation/mna.rs` to support AC analysis
  (complex impedances for capacitors and inductors)
- Add `AnalysisType::Ac { frequency_hz }` result to `SimulationResult` (already in type)
- SimulationPanel: add "AC Sweep" tab with:
  - Start frequency (Hz)
  - Stop frequency (Hz)
  - Points per decade
  - Output node selector
- Run sweep: collect `Vec<(f64, SimulationResult)>` at each frequency point
- Plot result as a Bode plot (magnitude in dB and phase in degrees vs log frequency)
- Use a simple SVG or canvas plot — no external charting library needed

## Notes
- AC analysis requires complex-valued node voltages (use `num_complex::Complex<f64>`)
- Add `num-complex` to `eerie-core/Cargo.toml`
- Capacitor AC impedance: Z = 1/(j·ω·C), Inductor: Z = j·ω·L
- Store AC sweep results in Zustand (separate from DC result)

## Acceptance criteria
- RC low-pass filter: run AC sweep 1Hz–1MHz → shows -3dB at f=1/(2πRC)
- Bode plot visible in SimulationPanel
- Multiple runs don't crash
