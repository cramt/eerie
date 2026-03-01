# Eerie — Issue Tracker (Ralph Loop)

## Instructions for Claude
You are working on **eerie**, a circuit design and simulation tool (like LTSpice).
At the start of each session:
1. Read MEMORY.md (auto-loaded) for project context.
2. Read this file and pick the **first OPEN issue** (🔴).
3. Work on it. Mark it 🟡 IN PROGRESS while working.
4. When done: mark it 🟢 DONE, `git add -A && git commit`, then stop.
5. Each issue must be a self-contained, working increment — tests pass, code compiles.

**Tech stack**: Rust (edition 2024) + Facet 0.43 (types + TS codegen) + nalgebra (MNA sim)
+ Electron + React + TypeScript + electron-vite.
**Single source of truth**: Rust types → `npm run codegen` → `src/renderer/src/types/generated.ts`.
**File format**: `.eerie` = YAML, human-readable, git-friendly.

---

## Status Legend
🟢 DONE | 🟡 IN PROGRESS | 🔴 OPEN

---

## 🟢 #001 — Initial scaffold
Completed in founding commit. Project structure, flake.nix, Rust workspace, Electron/React
scaffold, component YAML definitions, Facet codegen pipeline.

---

## 🔴 #002 — Get everything compiling and run `cargo test`

**Goal**: Verify the Rust workspace compiles cleanly and the MNA test passes.

**Steps**:
1. Run `cargo check --workspace` and fix any errors.
2. Run `cargo test -p eerie-core` — the voltage divider test must pass.
3. Fix the daemon's `rpc.rs` — the `iso_now` function has a format string bug (the %02d).
4. Run `cargo clippy --workspace -- -D warnings` and fix warnings.
5. Commit.

**Acceptance**:
- `cargo test -p eerie-core` exits 0, voltage divider test passes.
- `cargo check --workspace` exits 0.

---

## 🔴 #003 — Run `npm run codegen` and verify generated TypeScript

**Goal**: Prove the single-source-of-truth pipeline works end-to-end.

**Steps**:
1. Run `cargo run -p eerie-codegen` (= `npm run codegen`).
2. Inspect `src/renderer/src/types/generated.ts` — all types should be present.
3. Fix any codegen issues (API mismatch with facet-typescript 0.43).
4. Run `npm install` then `npm run typecheck`.
5. Commit generated.ts alongside any fixes.

**Acceptance**:
- `generated.ts` exists and contains interfaces/types for Circuit, Net, ComponentInstance,
  SimulationResult, ComponentDef, GraphicsElement, etc.
- `npm run typecheck` exits 0.

---

## 🔴 #004 — npm install + electron-vite dev build works

**Goal**: `npm run dev` starts without errors (Electron window appears).

**Steps**:
1. Run `npm install`.
2. Run `npm run dev` — Electron window should open showing the app layout.
3. Fix any Vite/TypeScript import errors (most likely: missing generated.ts).
4. Add CSS module type declarations if needed (`.d.ts` for `*.module.css`).
5. Commit.

**Acceptance**:
- `npm run dev` opens Electron without crashing.
- App shows toolbar, component panel, canvas, property editor.

---

## 🔴 #005 — File open/save circuit in YAML format

**Goal**: User can open a `.eerie` file (daemon reads it) and save changes back to disk.

**Steps**:
1. Implement the "Open" button in Toolbar — call `window.eerie.dialog.open()`, then
   `window.eerie.daemon.call('file.read', { path })`, then `daemon.call('circuit.parse_yaml', ...)`.
2. Update `circuitStore.setCircuit` to track `filePath`.
3. Implement "Save" button — call `daemon.call('circuit.to_yaml', { circuit })` then write to disk.
4. Add keyboard shortcuts: Ctrl+O = Open, Ctrl+S = Save.
5. Load the `examples/voltage_divider.eerie` file to verify round-trip.
6. Commit.

---

## 🔴 #006 — Load component definitions from YAML at startup

**Goal**: Component panel populates from the `components/` directory (not hardcoded).

**Steps**:
1. Daemon: add `components.list` RPC method — scans `components/` recursively,
   parses each YAML, returns `Vec<ComponentDef>` as JSON.
2. Renderer: at startup, call `daemon.call('components.list', {})` and store in Zustand.
3. ComponentPanel: group by `category` and `subcategory` from the loaded definitions.
4. Add the component def types to the Rust serde parsing (they already exist in
   `eerie-core/src/io/component_def.rs`).
5. Commit.

---

## 🔴 #007 — Symbol renderer on canvas

**Goal**: Components draw as their actual symbols (from YAML `symbol.graphics`), not boxes.

**Steps**:
1. In the renderer, create `lib/symbolRenderer.ts` that takes a `ComponentDef` + canvas
   context + transform and draws each `GraphicsElement` (line, rect, circle, arc, polyline, text).
2. Respect `rotation` (0/90/180/270) and `flip_x` on `ComponentInstance`.
3. Draw pin dots at each pin location.
4. Update Canvas.tsx to use this renderer.
5. Test with the voltage divider example — resistors, voltage source, ground should draw correctly.
6. Commit.

---

## 🔴 #008 — Wire routing improvements + net connectivity

**Goal**: Wires snap to component pins; nets get correctly linked to PinRefs.

**Steps**:
1. When a wire endpoint lands on a component pin (within snap radius), add a `PinRef`
   to that net automatically.
2. When two wire segments share an endpoint, merge them into the same `Net`.
3. Show a junction dot when three or more segments meet at the same point.
4. Update `node_for_pin` in `mna.rs` to handle the case where the pin is on a net
   that was built by the UI (not hand-coded).
5. Commit.

---

## 🔴 #009 — DC simulation end-to-end in the UI

**Goal**: Click ▶ Simulate → results appear in SimulationPanel with correct voltages.

**Steps**:
1. Wire up the SimulationPanel "DC Operating Point" button fully.
2. Send the current circuit JSON via `daemon.call('sim.dc', { circuit })`.
3. Display the returned `SimulationResult` node voltages and branch currents.
4. Overlay net voltage labels on the canvas after simulation.
5. Test with voltage_divider.eerie — VMID should show ≈3.333 V.
6. Commit.

---

## 🔴 #010 — Undo / redo

**Goal**: Ctrl+Z undoes the last action, Ctrl+Y/Ctrl+Shift+Z redoes it.

**Steps**:
1. Add `history: Circuit[]` and `historyIdx: number` to the Zustand store.
2. Wrap all mutating actions (addComponent, addWireSegment, etc.) to push the
   previous state to history before mutating.
3. Implement `undo()` and `redo()` actions.
4. Hook Ctrl+Z and Ctrl+Y in a `useEffect` in App.tsx.
5. Commit.

---

## 🔴 #011 — Component property editor wired to definitions

**Goal**: PropertyEditor shows the typed property fields from the component definition,
not raw key-value pairs.

**Steps**:
1. Look up the `ComponentDef` for the selected component's `type_id`.
2. For each `PropertyDef`, render an appropriate input:
   - `Float`/`Int`: number input with unit label and SI prefix support.
   - `Enum`: `<select>` dropdown with the `options` values.
   - `Bool`: checkbox.
   - `String`: text input.
3. Validate min/max constraints.
4. Commit.

---

## 🔴 #012 — Component label editing

**Goal**: Double-click a component → inline rename of its label (R1, C2, U1, etc.).

**Steps**:
1. Track `editingLabelId: string | null` in the store.
2. On double-click hit-test in Canvas, set `editingLabelId`.
3. Render a positioned `<input>` overlay on the canvas container (or use a modal).
4. On blur/Enter, call `updateComponentLabel(id, newLabel)`.
5. Commit.

---

## 🔴 #013 — AC sweep analysis

**Goal**: Run AC frequency sweep and display Bode plot (magnitude + phase vs frequency).

**Steps**:
1. Implement `ac_sweep` in `eerie-core/src/simulation/mna.rs` using complex-number MNA
   (replace `f64` with `Complex<f64>` from nalgebra or num-complex).
2. Add `sim.ac` RPC method in the daemon.
3. Add AC sweep panel in SimulationPanel with frequency range inputs.
4. Plot magnitude (dB) and phase (degrees) with an HTML canvas chart.
5. Commit.

---

## 🔴 #014 — Transient simulation (time-domain)

**Goal**: Basic transient simulation with capacitors and inductors.

**Steps**:
1. Implement backward-Euler transient in `eerie-core/src/simulation/transient.rs`.
   - Capacitor companion model: Req = h/C, current source = v_prev/Req.
   - Inductor companion model: Req = L/h, voltage source = i_prev * Req.
2. Add `sim.transient` RPC with `{ circuit, t_stop, t_step }` params.
3. Return time series: `{ time: f64[], node_voltages: HashMap<String, f64[]> }`.
4. Plot waveforms in SimulationPanel with selectable nets.
5. Commit.

---

## 🔴 #015 — QEMU MCU simulation — ATmega328P (Arduino Uno)

**Goal**: Place an ATmega328P on the schematic, attach a firmware `.elf`, simulate.

**Steps**:
1. Add `components/mcu/atmega328p.yaml` with full pin definitions and
   `embedded.qemu_machine: "arduino-uno"`.
2. Daemon: implement `qemu.start` RPC — spawns
   `qemu-system-avr -machine arduino-uno -bios firmware.elf -s -S`.
3. Daemon: `qemu.gpio_read` — reads GPIO pin states via QEMU's GDB stub.
4. Mixed simulation: after each transient timestep, query GPIO outputs from QEMU
   and apply them as voltage sources/current injections in MNA.
5. UI: firmware file picker attached to MCU component properties.
6. Commit.

---

## 🔴 #016 — FPGA simulation (iCE40)

**Goal**: Place an iCE40 FPGA, attach a bitstream or Verilog, simulate its I/O.

**Steps**:
1. Add `components/fpga/ice40up5k.yaml`.
2. Daemon: `fpga.simulate` — runs `nextpnr` + `iverilog`/`verilator` on the Verilog source,
   or loads a pre-synthesized bitstream and simulates with `icarus`.
3. Map FPGA output pins to the circuit simulation the same way as MCU GPIO.
4. UI: HDL/bitstream file picker in PropertyEditor.
5. Commit.

---

## 🔴 #017 — Subcircuit / hierarchical design

**Goal**: A group of components can be saved as a subcircuit and reused.

**Steps**:
1. Select components → "Create Subcircuit" → prompts for name + interface pins.
2. Subcircuit serialized as a separate `.eerie` file with `type: subcircuit`.
3. The subcircuit appears as a new component type in the library.
4. On simulation, the daemon inlines the subcircuit's netlist into the parent.
5. Commit.

---

## 🔴 #018 — SPICE netlist export

**Goal**: Export the circuit as a `.cir` SPICE netlist compatible with ngspice/LTSpice.

**Steps**:
1. Implement `eerie-core/src/io/spice.rs` — walk the circuit and emit SPICE elements
   using each component's `simulation.netlist` template.
2. Daemon: `export.spice` RPC.
3. UI: File menu → "Export SPICE Netlist".
4. Test: export voltage_divider.eerie and verify it runs in ngspice.
5. Commit.

---

## 🔴 #019 — Component creation UI

**Goal**: In-app UI to create a new component definition and save it as YAML.

**Steps**:
1. New panel/modal: "New Component".
2. Fields: id, name, category, pins (add/remove), symbol graphics (visual editor or raw YAML).
3. On save, write to `components/<category>/<id>.yaml`.
4. Reload the component library.
5. Commit.

---

## 🔴 #020 — Packaging + NixOS installer

**Goal**: `nix build` produces a working Eerie app package.

**Steps**:
1. Add a `packages.default` output to `flake.nix` that builds the Electron app.
2. The package should include the compiled `eerie-daemon` binary.
3. Write a NixOS module (`nixosModules.eerie`) for system-level install.
4. Test: `nix run .#` opens the app.
5. Commit.
