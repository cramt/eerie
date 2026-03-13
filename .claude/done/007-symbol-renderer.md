# 007 — Symbol Renderer on Canvas

Status: done
Priority: high

## Goal
Draw actual component symbols on the canvas using the `graphics` array from each
component's YAML definition, instead of placeholder rectangles.

## Tasks
- Create a `SymbolRenderer` React component that takes a `ComponentDef` and renders
  its `symbol.graphics` elements as SVG
- Support all graphics kinds: `line`, `circle`, `arc`, `polyline`, `rectangle`, `text`
- Apply component `position` and `rotation` transforms
- Render pin connection points as small dots (visible when hovering)
- Show component label (e.g. "R1", "V1") near the symbol
- Show component value (e.g. "1kΩ") as a secondary label

## Files to create/modify
- `src/renderer/src/components/Canvas/SymbolRenderer.tsx` (new)
- `src/renderer/src/components/Canvas/Canvas.tsx` (use SymbolRenderer)

## Notes
- Canvas coordinate system: origin top-left, x right, y down
- Component `position` is in canvas units (not pixels); apply a zoom/pan transform
- `GraphicsElement` is a flat struct: check `kind` field to determine what to draw
- `stroke_width` from YAML maps to SVG `strokeWidth`
- `filled: true` on polyline means fill the shape

## Acceptance criteria
- Resistor symbol renders as a rectangle with leads
- DC Voltage source renders as a circle with +/- marks
- Ground renders as the triple-bar symbol
- VCC renders as the arrow/triangle symbol
- Rotation (0/90/180/270) works correctly
