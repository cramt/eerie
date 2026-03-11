# Wire UI to Daemon for MWP

Status: done

## Problem

The UI is a local-only schematic editor with zero working daemon interaction:
1. **Transport mismatch**: `connectEerieDaemon()` uses WebSocket, daemon serves raw TCP
2. **No YAML parsing**: `.eerie` files are YAML but `parseCircuitYaml()` uses `JSON.parse`
3. **Simulation broken**: wrong IPC method name, wrong argument type, transport down
4. **No circuit→Netlist conversion**: nothing converts UI circuit to typed `Netlist`
5. **Codegen doesn't output Netlist types**: spice-netlist types missing from generated.ts

## Blocker: roam-codegen stack overflow

`roam_codegen::targets::typescript::generate_service()` stack-overflows on recursive
types. The `Netlist` type is recursive: `SubcktDef → Vec<Item> → SubcktDef`.

**Minimal repro**: `/home/cramt/code/repro-roam-codegen-overflow/`

This blocks Step 2 (codegen regeneration). Until fixed, either:
- (A) Work around by hand-writing the postcard schema in generated-rpc.ts (fragile)
- (B) Change `sim_dc` to take `Vec<String>` (netlist text lines) instead of typed `Netlist`
- (C) Wait for upstream fix

## Plan (6 steps)

### Step 1: Fix daemon TCP transport

**Files**: `src/main/index.ts`, `package.json`

- Add `@bearcove/roam-tcp` 7.0.1 to deps (already a transitive dep, just needs direct listing)
- Remove `ws`, `@types/ws`, `bufferutil`, `utf-8-validate` (no longer needed)
- Remove the `WebSocket` polyfill hack at top of `src/main/index.ts`
- Replace `connectEerieDaemon(url)` with:
  ```ts
  import { Server } from "@bearcove/roam-tcp"
  const server = new Server()
  const connection = await server.connect(`127.0.0.1:${port}`)
  daemonClient = new EerieDaemonClient(connection.asCaller())
  ```
- Fix `daemon:call` IPC handler — `CallBuilder` is `PromiseLike` (has `.then()`),
  no `.execute()`. Just `await fn.apply(daemonClient, args)`.

### Step 2: Update codegen to output Netlist types + regenerate

**Files**: `eerie-codegen/Cargo.toml`, `eerie-codegen/src/main.rs`

**BLOCKED by roam-codegen stack overflow** — facet-typescript types generate fine,
but the RPC client generation crashes.

1. Add `spice-netlist` dep to `eerie-codegen/Cargo.toml`
2. Add Netlist types to facet-typescript generation:
   ```rust
   generator.add_type::<spice_netlist::Netlist>();
   generator.add_type::<spice_netlist::Item>();
   generator.add_type::<spice_netlist::Element>();
   generator.add_type::<spice_netlist::ElementKind>();
   generator.add_type::<spice_netlist::Expr>();
   generator.add_type::<spice_netlist::Source>();
   generator.add_type::<spice_netlist::Analysis>();
   generator.add_type::<spice_netlist::SimResult>();
   generator.add_type::<spice_netlist::SimPlot>();
   generator.add_type::<spice_netlist::SimVector>();
   generator.add_type::<spice_netlist::Complex>();
   ```
3. Run `pnpm codegen` — types.ts works, generated-rpc.ts CRASHES (stack overflow)
4. Need roam-codegen fix first, or workaround

### Step 3: Add YAML support for file I/O

**Files**: `package.json`, `src/renderer/src/App.tsx`

- Add `yaml` ^2.6 dependency
- Replace `parseCircuitYaml()`: use `YAML.parse(content)` instead of `JSON.parse`
- Replace `serializeCircuitYaml()`: use `YAML.stringify(data)` instead of `JSON.stringify`
- Handle pin_id ↔ pin_name mapping (file uses `p`/`n`, UI uses symbol names):
  ```
  resistor/capacitor/inductor:  p→a, n→b
  dc_voltage/dc_current:        p→positive, n→negative
  ground:                       p→gnd
  diode/bjt/mosfet/opamp:       pin names match
  ```
- Unwrap Facet-style property values: `{ Float: 1000.0 }` → `1000.0`

### Step 4: Build circuit → typed Netlist converter

**New file**: `src/renderer/src/utils/netlistBuilder.ts`

Converts UI visual `Circuit` → typed `Netlist` (from generated types). Algorithm:
1. Assign node names: each net gets a SPICE node name (use net.id or first label)
2. Identify ground: any net with a pin from a `ground` component → node `"0"`
3. Build pin→node lookup: `(componentId, pinName)` → node name
4. Generate typed `Item` objects for each non-ground component
5. Add `.op` analysis
6. Return `{ title: circuit.name, items }`

### Step 5: Wire simulation through IPC

**Files**: `src/main/index.ts`, `src/preload/index.ts`, Toolbar.tsx

- Add dedicated `sim:dc` IPC handler (or fix `daemon:call` to dispatch correctly)
- Add `sim.dc` to preload bridge
- In SimulationRunner: convert circuit → Netlist → call IPC → display results

### Step 6: Format simulation results

**File**: `src/renderer/src/components/Toolbar/Toolbar.tsx`

- Parse ngspice vector names: `"op1.v(vin)"` → `"V(VIN)"`
- Format values with SI prefixes (reuse `formatValue` from PropertyEditor)
- Show node voltages and branch currents in a clean table

## Verification

1. `cargo check --workspace` — Rust compiles
2. `cargo test -p eerie-daemon` — daemon tests pass
3. `pnpm codegen` — regenerates TS (once roam-codegen is fixed)
4. `pnpm dev` — Electron starts, daemon connects (green dot)
5. Open `examples/voltage_divider.eerie` — circuit loads
6. Click Sim → DC Operating Point — shows V(VIN)=5V, V(VMID)≈3.333V
7. Save circuit — writes valid YAML that round-trips
