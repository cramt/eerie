# 002 — Run Codegen and Verify generated.ts

Status: done
Priority: high

## Goal
Run `pnpm codegen` (which runs `cargo run -p eerie-codegen`) and verify it produces a valid
`src/renderer/src/types/generated.ts`. Then run the TypeScript type-checker.

## Tasks
- Run `cargo run -p eerie-codegen` (or `pnpm codegen` if pnpm install has been done)
- Check that `src/renderer/src/types/generated.ts` exists and contains the expected types:
  `Circuit`, `ComponentInstance`, `Net`, `PropertyValue`, `SimulationResult`, etc.
- Run `pnpm install` (first time) then `pnpm typecheck`
- Fix any TypeScript errors that arise from the generated types
- Commit `generated.ts` — it should be committed to git (not in .gitignore)

## Notes
- The generator is in `eerie-codegen/src/main.rs`
- `src/renderer/src/types/index.ts` re-exports everything from `./generated`
- If facet-typescript generates different field names than expected by the frontend,
  update the frontend components to match (generated.ts is the source of truth)

## Acceptance criteria
- `src/renderer/src/types/generated.ts` exists and is non-empty
- `pnpm typecheck` exits 0
- `generated.ts` is committed to git
