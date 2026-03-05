# 024 — Decompose Canvas.tsx

Status: open

## Problem

`Canvas.tsx` (~300 lines) mixes several concerns:
- View state (pan, zoom)
- Wire drawing state machine (wireStart, wireStartPin, wireIsNew, hoveredPin)
- Drag-to-pan gesture tracking
- Component placement
- Wire routing logic

This makes it hard to modify any single behavior without touching unrelated code.

## Proposed fix

Split into focused modules:
- `Canvas.tsx` — container/orchestrator, renders Konva Stage
- `useCanvasView.ts` — hook for pan/zoom state
- `useWireDrawing.ts` — hook for wire tool state machine
- `useComponentDrag.ts` — hook for component drag/place

## Acceptance criteria

- [ ] Canvas.tsx under 100 lines
- [ ] Each hook is independently testable
- [ ] No behavioral changes — all interactions work as before
