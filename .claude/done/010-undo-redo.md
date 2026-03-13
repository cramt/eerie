# 010 — Undo / Redo

Status: done
Priority: medium

## Goal
Implement Ctrl+Z / Ctrl+Y undo/redo for all circuit editing operations.

## Tasks
- Add undo/redo stack to Zustand store (array of past `Circuit` snapshots)
- Every mutation that changes the circuit pushes to the undo stack
- `Ctrl+Z`: pop from undo stack, push current to redo stack
- `Ctrl+Y` / `Ctrl+Shift+Z`: pop from redo stack, push current to undo stack
- Clear redo stack whenever a new mutation happens
- Cap the stack at 100 entries to limit memory use

## Notes
- Simplest correct approach: store full `Circuit` snapshots (circuits are small)
- Alternative: command pattern — only if snapshot approach is too slow
- Keyboard event listener in the Canvas or App component
- Show "Undo" / "Redo" buttons in Toolbar (grayed out when stack is empty)

## Files to modify
- `src/renderer/src/store/circuitStore.ts`
- `src/renderer/src/components/Toolbar/Toolbar.tsx`
- `src/renderer/src/App.tsx` (keyboard listener)

## Acceptance criteria
- Place a component, press Ctrl+Z → component disappears
- Press Ctrl+Y → component reappears
- Undo across multiple operations works correctly
