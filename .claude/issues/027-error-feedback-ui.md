# 027 — Add toast/snackbar error feedback in UI

Status: open

## Problem

File I/O failures, daemon disconnects, and simulation errors all log to console
silently. The user has no idea when something goes wrong unless they open DevTools.

## Proposed fix

Add a simple toast/notification system:
- Show error toasts for: file read/write failures, daemon disconnect, simulation errors
- Show success toasts for: file saved, simulation complete
- Auto-dismiss after a few seconds, with manual dismiss option

## Acceptance criteria

- [ ] Toast component exists and is styled consistently
- [ ] File I/O errors show a toast
- [ ] Daemon connection loss shows a toast
- [ ] Simulation errors show a toast (already partially done with `error` state in SimulationRunner)
