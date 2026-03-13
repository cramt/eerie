# 029 — QEMU Daemon Integration

Status: open
Priority: low

## Goal
Implement the daemon side of QEMU MCU co-simulation (follow-up to 016).

## Tasks
- Add `qemu` binary to nix devShell
- Add `start_mcu_simulation(component_id, firmware_elf)` RPC method to EerieService
- Daemon spawns QEMU process for the MCU platform
- Bridge GPIO writes from QEMU to circuit simulation nodes via stdin/stdout or UNIX socket
- Implement co-simulation loop: MCU outputs → circuit nodes; circuit inputs → MCU GPIO reads
- Return streaming simulation results to the frontend
- UI: firmware_elf property shows file picker; "Start MCU Sim" button in SimulationPanel

## Acceptance criteria
- [ ] Place RP2040 on schematic, set firmware_elf path to blink.elf
- [ ] QEMU runs; LED GPIO pin toggles at correct rate
- [ ] Transient waveform shows LED toggling
