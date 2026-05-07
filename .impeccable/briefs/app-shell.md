# Design Brief: Eerie App Shell

> Produced by `/impeccable shape app-shell` on 2026-05-07. Confirmed.
> Reads PRODUCT.md and DESIGN.md as anchors; pass this brief plus those two files
> to `/impeccable craft` (or any implementation flow) to build the shell.

## 1. Feature Summary

The app shell is the global frame around Eerie's schematic canvas: top bar, side
rails (files, components, properties, AI), tabs, plot region, status bar. This brief
redesigns the shell from scratch in service of the "Workshop Compositor" north star:
collapsible flex tiles, shell recedes / canvas leads, muted gold-amber signature,
identity-loud status bar, dark-only.

## 2. Primary User Action

Recognize the current mode and the canvas state at a glance, and move between drawing,
simulating, and debugging without context-switching cost. The shell exists to confirm
what mode you're in, what file you're editing, and whether the sim is healthy, without
ever stealing attention from the schematic itself.

## 3. Design Direction

**Color strategy.** Full palette, semantic-only (per DESIGN.md Semantic Hue Rule).

- **Signal Accent**: muted gold-amber, target `oklch(78% 0.13 80)`. Sodium-lamp /
  oscilloscope-phosphor lane. Used on active mode segment, current selection, focus
  rings, primary action affordance, dirty marker, sim-running progress.
- **Probe**: cool teal, target `oklch(70% 0.11 195)`. Plot lines, simulation outputs,
  sim-completed indicator. Distinct from Signal so probe never reads as wire.
- **Warn / Danger**: muted scarlet, target `oklch(60% 0.18 25)`. Shorts, ungrounded
  nets, sim errors, destructive actions.
- **Neutrals** (tinted toward amber so they never read flat-gray):
  - Canvas (deepest): `oklch(13% 0.005 80)`
  - Surface (panels, top bar): `oklch(17% 0.005 80)`
  - Surface-2 (status bar, hovered surface): `oklch(20% 0.005 80)`
  - Border / hairline: `oklch(28% 0.005 80)`
  - Text muted: `oklch(50% 0.01 80)`
  - Text secondary: `oklch(72% 0.01 80)`
  - Text primary: `oklch(92% 0.01 80)`

(Hex equivalents land in DESIGN.md frontmatter via `/impeccable document` after the
first surface ships.)

**Theme scene sentence.** "An EE student at 11pm in their dorm room, headphones on,
sodium-lamp warm, debugging a circuit they don't fully understand yet but want to."
Forces dark, forces warm. Light theme is a future epic, not designed here.

**Anchor references.**
- Hyprland on default CachyOS (the directional reference; tile-collapse, status bar
  typography)
- tmux + starship status bar conventions
- Helix editor (mode-as-identity, terse status, no theatre)
- Working oscilloscope (phosphor amber, dense data, dark-room comfort)

**Anti-references.** Inherited verbatim from PRODUCT.md: LTSpice/PSpice/Multisim Win32
dialog soup, KiCad/OrCAD/Cadence CAD weight, Vista Aero chrome, AI SaaS-cream pastels,
neon cyberpunk.

Visual direction probe step skipped: harness lacks native image generation.

## 4. Scope

- **Fidelity**: high. Tokens, layout, all four state classes, interaction patterns.
  A11y specifics and edge-case states deferred to craft.
- **Breadth**: the entire global shell. Individual feature components
  (ComponentLibraryDialog innards, AiChat content, PropertyEditor row UI, PlotPanel
  internals) are downstream of this brief.
- **Interactivity**: shipped-quality component patterns + state behavior, not just
  static visuals.
- **Time intent**: polish until it ships. This is the foundation.

## 5. Layout Strategy

**Topology: collapsible flex tiles.** Every region is a sibling tile; each tile has
three states: full (default), rail (icon-only sliver), or hidden.

```
┌──────────────────────────────────────────────────────────────┐
│ ▾ select  wire  place           hint              ⌘K   ─ □ ✕ │ ← top bar 40px
├────┬─────┬─────────────────────────────┬──────┬──────────────┤
│ F  │ Cmp │  ◉ tab1   ◯ tab2   +       │ Prop │      AI      │
│    │     │  ──────────────────────    │      │              │
│ r  │     │                             │      │              │
│ a  │     │           canvas            │      │              │
│ i  │     │                             │      │              │
│ l  │     │  ──────  plot footer  ───── │      │              │
├────┴─────┴─────────────────────────────┴──────┴──────────────┤
│  SELECT │ ~/proj/divider.eerie* │ idle │ ⌃P palette │   AI   │ ← status bar 28px
└──────────────────────────────────────────────────────────────┘
```

**Rail behavior.** Four side rails (Files, Components, Properties, AI), each
independently toggled.
- Full: 240-280px wide, full content, 11px label header.
- Rail: 36px wide, icon column with active-state dots; hover reveals 80ms tooltip
  with keystroke hint.
- Hidden: 0px; replaced by a 4px hover-target edge that expands to rail on hover
  (220ms ease-out-expo).

Default keystrokes: `Cmd-1 / 2 / 3 / 4` toggle rails, `Cmd-0` focus mode (all rails
hidden, canvas + status bar only), `Cmd-K` command palette.

**Tabs.** Live inside the canvas tile's top edge, not as a separate global row.
Hyprland-style: each tab is a workspace, not global navigation. Max 6-8 visible
before horizontal-scroll overflow.

**Plot.** Vertically nested inside the canvas tile. Sim idle → 28px footer label.
Sim has data → canvas/plot 60/40 split. Toggle with a keystroke or click on the
footer label.

**Tile separation.** 1px hairline neutral border at rest
(`oklch(28% 0.005 80)`). Active tile gets focus-within amber border. No drop shadows.
No gaps in v1; expose an optional 4px-gap "rice-mode" toggle in a later pass.

**Hierarchy enforcement (shell-recedes / canvas-leads).**
- Canvas tile: full chromatic latitude (signal amber, probe teal, warn scarlet visible
  inside).
- Side rails: monochromatic. Single accent dot for current selection. ~75% of canvas
  contrast.
- Top bar: very quiet. Only the active mode pill carries amber.
- Status bar: identity-loud, but small and mono, so loudness is typographic not
  chromatic.

## 6. Key States

**Mode (Q select / W wire / E place).** Status bar leftmost segment renders
` SELECT ` / ` WIRE ` / ` PLACE ` (uppercase mono on Surface-2, foreground amber).
Top-bar mode pills mirror with a quiet amber dot on the active. Mode change is
instant; no transition.

**Place chord pending.** Status mode segment morphs to ` PLACE → _ ` with a 1ch
blinking caret. A floating chord chip appears near the cursor: ` E + ? ` listing
available keys (R, C, X, D, V, A, G, T, F, W) with their components. Chip motion:
80ms ease-out-expo in, 120ms out. Auto-dismisses on resolution or 500ms timeout.

**File dirty.** Active tab and status file segment carry an amber asterisk suffix.
Save flashes the asterisk to neutral 200ms then drops it.

**Multi-tab.** Active tab gets 1px amber underline at the bottom edge plus full text;
inactive tabs are muted text with no underline. Hover reveals a × close affordance
(also `Cmd-W`). New-tab `+` at the right. Overflow scrolls horizontally with edge
fade. No dropdown.

**Sim running / completed / errored.**
- Running: status sim segment ` ▶ DC sweep [3/12] ` (amber). A 1px progress hairline
  grows along the bottom of the canvas tile in amber, ease-out-expo. Status bar
  typography stays calm; the progress goes on the canvas frame, not the status text.
- Completed: status segment ` ● 1.2s ` (teal dot, mono duration). Plot footer
  auto-expands to 40% split.
- Errored: status segment ` ✕ short on N3 ` (scarlet). Canvas applies a scarlet halo
  (opacity + transform layer, compositor-friendly) to the offending node. Clicking
  the status segment focuses that node.

**AI panel open vs closed.** Closed = AI rail collapsed (36px) or hidden. Toggle via
`Cmd-4`. Opening: 36px → 360px over 220ms ease-out-expo. Canvas tile flexes to
compensate. Status bar gains a quiet ` AI ` segment when open. Unread count shown on
collapsed rail icon.

## 7. Interaction Model

**Keystrokes.**
- `Q / W / E`: mode switch. Mode pills + status update instantly.
- `E + (R/C/X/D/V/A/G/T/F/W)`: place chord. Chord chip appears within 16ms.
- `Cmd-K` or `Cmd-Shift-P`: command palette. Backdrop dim 30% opacity, palette
  480-560px wide, centered above canvas. Search-first; recent commands at top;
  categories: file, mode, components, sim, AI, theme.
- `Cmd-1 / 2 / 3 / 4`: toggle individual rails.
- `Cmd-0`: focus mode (all rails hidden, status bar stays).
- `Cmd-S`: save. `Cmd-O`: open. `Cmd-T`: new tab. `Cmd-W`: close tab.
- `Ctrl-Tab / Ctrl-Shift-Tab`: cycle tabs.
- `Esc`: close palette / cancel mode-specific operation / fall back to select mode.

**Hover behavior.** Rail icons reveal a tooltip with label + keystroke after 400ms
dwell. Hidden-rail edge strips expand to rail on hover. Tabs reveal close × on
hover. Status bar segments are clickable when actionable (e.g. sim error → focus
offending node).

**Focus rings.** 1px amber outline + 2px amber glow at 30% opacity. Visible but
quiet. Tab order: top-bar mode pills → rails left-to-right → canvas → status bar.

**Motion budget.** Single curve: `cubic-bezier(0.16, 1, 0.3, 1)` (ease-out-expo).
- Rail expand/collapse: 220ms.
- Chord chip: 80ms in / 120ms out.
- Sim progress hairline: continuous.
- Tab switch: instant.
- Mode change: instant.
- Backdrop dim (palette): 160ms.
- All values respect `prefers-reduced-motion: reduce` (collapse to 0ms).

## 8. Content Requirements

**Status bar segments (left to right).**
- Mode: ` SELECT ` / ` WIRE ` / ` PLACE ` / ` PLACE→_ ` (uppercase mono, amber on
  Surface-2)
- File path + dirty: ` ~/proj/circuit.eerie* ` (mono neutral; asterisk amber if dirty)
- Sim state: ` idle ` / ` ▶ DC sweep [3/12] ` / ` ● 1.2s ` / ` ✕ short on N3 ` (mono)
- Hint: ` ⌃P palette ` or context-relevant shortcut (mono muted)
- Right edge: ` AI ` indicator if open, with unread count

**Tab labels.** Filename only. Truncate from middle if needed.

**Empty states.** No illustrations, no encouragement.
- No tabs: " press ⌘T to start a new circuit, ⌘O to open one " centered, mono muted.
- AI open / no conversation: " ask anything about your circuit " centered.
- File tree, no folder open: " no folder open. ⌘O to open. " centered.
- Components, no library: error state, not empty (we always ship a default library).

**Tooltips.** Label + keystroke only, no description. Format: ` Resistor (E, R) `.

**Error messages.** Inline near the affected element when possible. Status bar
carries the canonical sim error. Canvas overlay (scarlet halo) for spatial errors
only. No toast soup; toasts reserved for ephemeral non-error events (file saved, etc.).

**Voice (per PRODUCT.md).** Terse. ` short on N3 `, not " Simulation failed: a short
circuit was detected on node N3. " No "are you sure?" except on irreversible actions
outside the undo stack. No cheerful empty states.

## 9. Recommended References

For implementation:
- `spatial-design.md`: tile collapse mechanics, focus mode, breakpoints.
- `motion-design.md`: ease-out-expo curves, reduced-motion handling, rail
  choreography.
- `interaction-design.md`: keyboard layer, command palette, focus management.
- `color-and-contrast.md`: amber/teal/scarlet derivation, neutral tinting, dark-only
  contrast targets.
- `typography.md`: Geist + JetBrains Mono pairing, hierarchy, tabular numerals
  enforcement.

## 10. Open Questions

- **Gap mode default.** v1 ships at 0 gaps (1px hairlines only). A 4px-gap "rice-mode"
  toggle is a v2 nice-to-have. Confirm during craft.
- **Focus mode (`Cmd-0`)**: keep status bar visible (current proposal) or hide it
  too? Defer to craft + first user test.
- **Plot tile when sim is idle**: 28px footer label (current proposal) or fully
  collapsed to 0? Brief favors footer label so the region is discoverable.
- **Command palette persistence**: project-history vs session-only? Defer to craft.
- **Tab overflow at 12+ tabs**: current proposal is pure horizontal scroll; revisit
  if students struggle. Dropdown is the easy out, but feels un-rice.
- **Light theme**: not designed here. If/when you want one, it warrants its own shape
  pass.
