# 005 — File Open / Save

Status: done
Priority: high

## Goal
Wire the File > Open and File > Save buttons to actually load/save `.eerie` (YAML) files
via the daemon.

## Tasks
- Electron main process: add IPC handlers for open-file-dialog and save-file-dialog
  (using `dialog.showOpenDialog` / `dialog.showSaveDialog`)
- Preload: expose `window.eerie.openFile()` and `window.eerie.saveFile(circuit)` via contextBridge
- Daemon: ensure `file.read` and `file.write` methods work correctly (parse YAML → Circuit JSON)
- Frontend Toolbar: wire Open/Save buttons to `window.eerie.openFile()` / `window.eerie.saveFile()`
- Zustand store: update circuit state when a file is loaded
- Test by opening `examples/voltage_divider.eerie`

## Files to modify
- `src/main/index.ts` (IPC handlers)
- `src/preload/index.ts` (contextBridge)
- `src/renderer/src/components/Toolbar/Toolbar.tsx`
- `src/renderer/src/store/circuitStore.ts`

## Acceptance criteria
- Can open `examples/voltage_divider.eerie` via File > Open dialog
- Circuit name displays in the toolbar/title
- Can save modified circuit back to disk
- Saved YAML round-trips correctly (parse → serialize → parse gives same result)
