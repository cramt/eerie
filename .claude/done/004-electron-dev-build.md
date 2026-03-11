# 004 — Electron Dev Build Working

Status: done
Priority: high

## Goal
Get `pnpm dev` working so the Electron window opens with the React UI visible.

## Tasks
- Run `pnpm install` (using pnpm, not npm)
- Run `pnpm build:wasm` to build eerie-core as WASM (`pkg/` directory)
- Run `pnpm codegen` to generate TypeScript types (if not done in issue 002)
- Run `pnpm dev` and verify the Electron window opens
- Check browser console for errors and fix them
- Verify all React components render without crashing

## Notes
- WASM build: `wasm-pack build eerie-core --target bundler --out-dir ../pkg`
- The `pkg/` directory is gitignored; it must be rebuilt each time
- Check `electron.vite.config.ts` for the vite config
- `src/renderer/src/main.tsx` is the React entry point

## Acceptance criteria
- `pnpm dev` opens an Electron window
- No console errors on startup
- Canvas, toolbar, component panel, and property editor are all visible
