# MCU / FPGA Components

Component definitions for microcontrollers and FPGAs live here.
Each MCU definition includes an `embedded` section describing how to
simulate it with QEMU.

## Planned components (see Issues #021–#022)

- `atmega328p.yaml` — Arduino Uno MCU (QEMU: `arduino-uno`)
- `stm32f103.yaml`  — Blue Pill (QEMU: `stm32-f103`)
- `rp2040.yaml`     — Raspberry Pi Pico (QEMU: `raspi0`)
- `ice40up5k.yaml`  — iCE40 FPGA (simulation via nextpnr/iverilog)

## Simulation workflow (planned)

1. User attaches a firmware binary (`.elf` / `.hex`) to the MCU component.
2. When simulating, the daemon spawns a QEMU instance with the firmware.
3. GPIO pin states are read via QEMU's GDB stub or a semihosting channel.
4. Those pin states drive the mixed-signal simulation of the surrounding circuit.
