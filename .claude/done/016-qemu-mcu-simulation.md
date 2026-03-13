# 016 — QEMU MCU Simulation

Status: done
Priority: low

## Goal
Allow placing an MCU component on the schematic and running its firmware in QEMU,
with GPIO pins connected to the circuit simulation.

## Planned approach
- MCU component def includes: `platform` (e.g. `stm32f4`), `firmware_elf` property
- Daemon spawns a QEMU instance for the MCU with the given ELF
- Semihosting or a custom QEMU plugin bridges GPIO register writes to the circuit
- At each simulation step: MCU outputs → drive circuit nodes; circuit inputs → MCU GPIO reads
- This is a co-simulation loop

## QEMU targets
- `arm`: STM32F4, RP2040 (Pico)
- `riscv32`: CH32V, GD32VF103
- `avr`: ATmega328P (Arduino)

## Tasks
- Define MCU component YAML schemas (see `components/mcu/README.md`)
- Implement `EmbeddedPlatform` → QEMU machine name mapping
- Daemon: spawn/kill QEMU process, communicate via stdin/stdout or UNIX socket
- Circuit simulator: treat MCU GPIO as current/voltage sources driven by QEMU
- UI: "Load Firmware" button in property editor when MCU is selected
- Display QEMU serial output in a terminal panel

## Acceptance criteria
- Place RP2040 (Pico) on schematic, load blink.elf firmware
- QEMU runs; LED GPIO pin (connected to an LED component) toggles at correct rate
- Simulation result shows the LED flashing in the transient waveform view
