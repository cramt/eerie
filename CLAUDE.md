# Eerie

Eerie is a circuit design and simulation tool, like LTSpice but open and hackable.

## Repo conventions

- **pnpm not npm.** Use `pnpm` for all JS package operations.
- **Facet not serde.** eerie-core must stay serde-free. roam handles serialization.
- **Single source of truth.** TypeScript types live only in `generated.ts` (run
  `pnpm codegen`). Never manually edit that file.
- **Commit codegen output.** If you run `pnpm codegen`, commit `generated.ts`
  alongside the Rust changes.

## Key commands

**Always run commands through `nix develop --command ...`** so that flake.nix stays
honest and no dependency works by accident from the host environment.

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

## WASM vs Native modes

**WASM mode** (`pnpm dev:wasm`) is a demo mode: runs entirely in-browser, no daemon.
Features that require the daemon (AI assistant, file I/O, MCP server) are gracefully
disabled in WASM mode. It is fine to leave daemon-only features non-functional in
WASM.

**Native mode** (`pnpm dev` or `pnpm dev:native`) is the primary development target.
The daemon reads `ANTHROPIC_API_KEY` from the environment to enable the AI assistant.

## Design context

The renderer's design strategy lives in two files at the project root:

- **`PRODUCT.md`** — strategic. Register (product), target users (EE students
  escaping LTSpice / KiCad / Vista-era EE software), brand personality,
  anti-references, and five design principles. Read before any UI/UX work.
- **`DESIGN.md`** — visual system. Currently a `<!-- SEED -->` (no committed hex
  values yet). Creative North Star: "The Workshop Compositor": Hyprland-tiled
  discipline, CachyOS-curated defaults, Geist Sans + JetBrains Mono, full-palette
  color tied to circuit semantics (signal / probe / warn / ground / neutral), flat
  with tonal layering, restrained motion. Read before touching CSS, themes, or
  component visuals.

The existing `src/renderer/src/themes/neon.*` direction (hot-pink-on-void-black) is
**not** committed; it pre-dates these files and PRODUCT.md disavows it. New visual
work follows DESIGN.md, not the existing theme.

Confirmed feature briefs live in `.impeccable/briefs/`:
- `app-shell.md` — full redesign brief for the global shell (top bar, side rails,
  tabs, plot, status bar, command palette). High-fidelity. Hand to `/impeccable craft`
  or implement piecewise.

Update product strategy via `/impeccable teach`; update the visual system via
`/impeccable document`. Don't hand-edit those two files as part of routine UI work.
