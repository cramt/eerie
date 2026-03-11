# 008 — Wire Routing and Net Connectivity

Status: open
Priority: high

## Goal
Allow the user to draw wires between component pins. Wires snap to pins and form nets.

## Tasks
- Canvas: enter "wire mode" when user clicks a pin endpoint
- Draw wire as horizontal/vertical segments (Manhattan routing)
- Snap wire endpoint to nearby pins (within ~5px)
- On completion: create/update a `Net` in the circuit, adding `PinRef` entries
- Render existing nets (wires) from `circuit.nets[].segments`
- Highlight nets on hover (show connected pins)
- Delete wire: click on wire segment, press Delete

## Data model
- `Net.segments`: array of `WireSegment { x1, y1, x2, y2 }`
- `Net.pins`: array of `PinRef { component_id, pin_id }`
- When two pins are connected: they share the same `Net`

## Files to create/modify
- `src/renderer/src/components/Canvas/Canvas.tsx` (wire drawing state machine)
- `src/renderer/src/components/Canvas/WireRenderer.tsx` (new)
- `src/renderer/src/store/circuitStore.ts` (net mutations)

## Acceptance criteria
- Can draw a wire from VCC pin to resistor pin
- Can draw a wire from resistor to ground
- Nets are stored in circuit and survive save/load round-trip
- No overlapping/crossing wires needed (user manages layout)
