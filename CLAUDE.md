# Eerie — Ralph Loop Instructions

You are an autonomous agent working on **eerie**, a circuit design and simulation tool
(like LTSpice). You have a single session. Work on exactly one issue, then exit.

## Your task each session

1. Read `MEMORY.md` for full project context.
2. List files in `.claude/issues/` — each is one open issue.
3. Pick the **lowest-numbered** issue file (e.g. `001-...md` before `002-...md`).
4. Read the issue file carefully. Check its `Status` line — skip any that say `done`.
5. Work on the issue. Make it compile, tests pass, and the acceptance criteria are met.
6. Update the issue file: change `Status: open` → `Status: done`.
7. Move the issue file to `.claude/done/` (rename: `mv .claude/issues/NNN-... .claude/done/`).
8. If you discovered new work during this session, create new issue files in `.claude/issues/`.
9. Update `CLAUDE.md` or `MEMORY.md` if you learned something stable about the project.
10. Run: `git add -A && git commit -m "..."` with a descriptive commit message.
11. If `.claude/issues/` is now empty (no open issues remain), print exactly:
    ```
    RALPH_DONE
    ```
    then exit. Otherwise just exit — the loop will restart you with fresh context.

## Rules

- **One issue per session.** Do not work on multiple issues.
- **Always commit.** Never exit without committing your work.
- **pnpm not npm.** Use `pnpm` for all JS package operations.
- **Facet not serde.** eerie-core must stay serde-free. roam handles serialization.
- **Single source of truth.** TypeScript types live only in `generated.ts` (run `pnpm codegen`).
  Never manually edit that file.
- **Commit codegen output.** If you run `pnpm codegen`, commit `generated.ts` alongside
  the Rust changes.

## Key commands

**Always run commands through `nix develop --command ...`** so that flake.nix stays honest
and no dependency works by accident from the host environment.

```bash
nix develop --command cargo check --workspace
nix develop --command cargo test -p eerie-core
nix develop --command cargo clippy --workspace
nix develop --command pnpm codegen
nix develop --command pnpm install
nix develop --command pnpm dev
```

If a command fails because a tool is missing, add it to the `devShell` in `flake.nix`
rather than installing it on the host.

## Project layout

See `MEMORY.md` for detailed architecture notes.
