# 017 — FPGA Simulation

Status: open
Priority: low

## Goal
Allow placing an FPGA component on the schematic and simulating its behavior,
using a FPGA simulator (Verilator or QEMU with FPGA emulation).

## Planned approach
- FPGA component def: `platform` = `ice40`, `ecp5`, `xilinx_7series`, etc.
- Accept bitstream or Verilog/VHDL source
- Use Verilator to compile Verilog/VHDL to a fast C++ simulation model
- Co-simulate with the circuit (same GPIO bridge as MCU simulation)
- Alternatively: use QEMU FPGA emulation if available for target platform

## Tasks
- Define FPGA component YAML (see `components/mcu/README.md` for existing MCU schema)
- Add Verilator to `flake.nix` dev shell
- Daemon: invoke `verilator` to compile Verilog, then run the resulting simulation
- Bridge Verilator I/O to circuit nets
- UI: "Load Verilog" / "Load Bitstream" button in property editor

## Notes
- iCE40 FPGA can be emulated with Project IceStorm / nextpnr / icarus iverilog
- Start with iCE40 (fully open source toolchain) before closed-source FPGAs
- Verilator is available in nixpkgs: `pkgs.verilator`

## Acceptance criteria
- Place iCE40 FPGA, load simple blink.v Verilog
- Verilator compiles and runs the simulation
- Output pin toggles are visible in the transient simulation view
