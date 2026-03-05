# 025 — Split Zustand store

Status: open

## Problem

`circuitStore.ts` (253 lines) combines:
- Circuit state (components, nets)
- UI state (tool, zoom, selectedComponentId)
- Undo/redo stack (pushUndo, undo, redo)
- File I/O state (filePath, dirty)

This makes it hard to reason about state flow and leads to unnecessary re-renders.

## Proposed fix

Split into 2-3 stores:
- `circuitStore` — components, nets, file path, dirty flag
- `uiStore` — active tool, zoom, pan, selection
- `historyStore` — undo/redo stack (wraps circuitStore mutations)

## Acceptance criteria

- [ ] Each store under 100 lines
- [ ] No behavioral changes
- [ ] Undo/redo still works
