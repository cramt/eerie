---
name: Eerie
description: Circuit design and simulation for EE students who refuse to inherit the field's bad habits.
---

<!-- SEED: re-run /impeccable document once there's code to capture the actual tokens and components. -->

# Design System: Eerie

## 1. Overview

**Creative North Star: "The Workshop Compositor"**

Eerie's visual system answers a single design question: what does a circuit editor look
like when its author has lived inside Hyprland on CachyOS, not Vista? The compositor
half (Hyprland) sets the layout discipline: tiled, intentional, every region of the
screen has a job, no wasted chrome. The curator half (CachyOS) sets the defaults:
out-of-the-box choices that already feel rice-quality before any user opens
preferences.

The system is dark by default, a near-black canvas tinted toward the signal accent.
Darkness is not the point; craft density is. Tight typography, sharp edges, exponential
ease-out motion, full-palette color used only for semantic roles. Decoration is the
failure mode. The first-open emotion to chase is the one PRODUCT.md names verbatim:
"wait, this is for me?" Disbelief that EE software can feel current.

Eerie's surface explicitly rejects:
- 2007 Aero glass, faux-3D bevels, decorative translucency.
- Win32 dialog soup of LTSpice, PSpice, Multisim. Modal overlays, gray panels, heavy
  borders, "are you sure?" prompts on undoable actions.
- Industrial CAD weight of KiCad, OrCAD, Cadence: deep menus, modal everything,
  right-click-to-configure-everything dispersion.
- AI-generated SaaS-cream pastels and indistinct dark-mode-VS-Code clones.

**Key Characteristics:**
- **Tiled, never floating.** The app shell is a compositor: regions have jobs and
  stick to them. No floating panels, no draggable docks.
- **Pin-sharp.** Every glyph, every line, every component pin readable at 100% zoom
  on a 1080p display. Density without blur.
- **Semantic color, not decorative.** Hue maps to meaning (signal, probe, warn,
  ground). Never "this panel needs a pop of orange".
- **State, not theatre.** Motion exists to confirm a state change happened, not to
  entertain. Restrained by doctrine.
- **Curated defaults.** First-open looks like a senior dev's dotfile drop, not a
  setup wizard.

## 2. Colors: The Full-Role Palette

The palette commits to three to four deliberate roles, each tied to circuit semantics.
Hue is meaning, not decoration. All values are deferred until implementation; this
seed defines roles, not hex codes.

### Primary
- **Signal Accent** (`[to be resolved during implementation]`): the one signature
  color. Used for active mode indicator, current selection, the wire being drawn,
  focus rings, primary buttons. Roughly 5-10% of any given screen. Hue family open
  but should not be magenta (carries the discarded cyberpunk reading) and should not
  be cool blue (default-tool reflex). Probable lanes: warm cyan-teal (CachyOS-adjacent)
  or muted gold-amber (workshop-adjacent).

### Secondary
- **Probe** (`[to be resolved during implementation]`): plot lines, simulation
  outputs, measurement annotations, probe overlays on the canvas. Distinct hue from
  Signal so a measurement never reads as a wire and vice versa.

### Tertiary
- **Warn / Danger** (`[to be resolved during implementation]`): shorts, ungrounded
  nets, simulation errors, destructive actions. Warm red-orange family, slightly
  desaturated so it does not scream during a normal session and only earns attention
  when it appears.

### Neutral
- **Canvas** (`[to be resolved during implementation]`): tinted near-black, biased
  toward the Signal hue per global design law. The schematic background; figure
  must read against it.
- **Surface** (`[to be resolved during implementation]`): panels, toolbar, tabs,
  status bar. Slightly lighter than Canvas. Tonal layering, not borders.
- **Surface Hover** (`[to be resolved during implementation]`): one tonal step lighter
  than Surface. Used as the only hover affordance on most rows / list items.
- **Text Primary / Secondary / Muted** (`[to be resolved during implementation]`):
  three steps, each tinted toward the brand hue so neutrals do not read as flat gray.

### Named Rules
**The Semantic Hue Rule.** Every color carries a meaning. If a hue appears in the UI,
it must answer "what role does this represent?" Decorative use of color is forbidden.
Identity is communicated through restraint, not through accent sprinkles.

**The Tonal Layering Rule.** Depth is conveyed through tonal lightness steps, not
through borders or shadows. Panels separate from the canvas because they are slightly
lighter, not because they have outlines. Borders, when used, are 1px and only become
chromatic on focus.

## 3. Typography

**UI / Body Font:** Geist Sans (fallback: ui-sans-serif, system-ui, sans-serif).
**Mono Font:** JetBrains Mono (fallback: ui-monospace, "Cascadia Code", Menlo, monospace).
**Display Font:** none. Geist Sans at heavier weights does the headline work.

**Character.** Geist (Vercel, SIL OFL) is a 2020s opinionated technical sans: geometric,
tight, optimized for small-scale UI; pairs with its own mono. JetBrains Mono is the
riced-terminal default, free, high legibility for numerics, units, identifiers. Together
they read as "modern dev tool, current decade" without leaning into the over-saturated
Inter / Roboto / SF lane.

### Hierarchy
- **Heading** (Geist Sans, weight 600, ~20-22px, line-height 1.2): panel titles,
  dialog headers, rare big labels.
- **Subheading** (Geist Sans, weight 500, ~14-15px, letter-spacing slightly tightened):
  section labels inside panels.
- **Body** (Geist Sans, weight 400, ~13-14px, line-height 1.45): inline UI text,
  descriptions in dialogs. Capped at 65-75ch when a paragraph appears (rare in a tool).
- **Label** (Geist Sans, weight 500, ~11-12px, uppercase, letter-spacing 0.06em):
  mode indicators, status bar, tab labels. Sparingly.
- **Mono** (JetBrains Mono, weight 400-500, ~12-14px, tabular numerals on): component
  values, units, simulation results, identifiers, file paths, MCU register data, code
  blocks, anything copyable.

### Named Rules
**The Mono For Truth Rule.** Anything the user might copy, paste, compare across runs,
or read as a numeric value is monospace with tabular numerals. Component values like
`1kΩ`, voltages like `3.30V`, frequencies like `1MHz` always render in JetBrains Mono.
Never mix sans and mono within a single value string.

**The Two-Voice Rule.** Two faces, no more. Adding a display serif or a third sans for
"personality" is forbidden. Hierarchy comes from weight, size, and case, never from
new typefaces.

## 4. Elevation

Eerie is flat. Depth is conveyed through tonal layering, not shadows.

The app shell uses three lightness steps from the Canvas: deepest (canvas), middle
(surfaces), light (hovered surfaces). Borders, when used, are 1px and only chromatic
in focus state. The system has zero ambient shadows; nothing floats by default.

The single exception is dialogs and the command palette, which sit visually above the
canvas using a slightly denser surface plus a subtle backdrop dim (no blur). These are
the only places elevation reads as elevation.

### Named Rules
**The Flat Rule.** Surfaces are flat at rest. No box-shadows for depth. Faux-3D bevels,
glass blurs, and Vista chrome are forbidden. Backdrop-filter is reserved for the dialog
dim layer only, and never as decoration.

## 5. Components

Omitted in seed mode. Component tokens land on the next `/impeccable document` run
once the visual direction is implemented in code. In the meantime, the principles
above (semantic color, mono-for-values, flat-with-tonal-layering, two-voice typography)
constrain any new component built via `/impeccable shape` or `/impeccable craft`.

## 6. Do's and Don'ts

### Do
- **Do** map every color to a circuit-semantic role (signal, probe, warn, ground,
  neutral). Decorative color is forbidden.
- **Do** use tonal lightness layering for surface separation. Borders and shadows
  are not the depth mechanism.
- **Do** render every value, unit, and identifier in JetBrains Mono with tabular
  numerals on.
- **Do** use ease-out exponential curves (cubic-bezier(0.16, 1, 0.3, 1) class) for any
  state transition. Restrained motion only.
- **Do** ship curated defaults: first-open state should feel like a senior dev's
  dotfile drop, not a setup wizard.
- **Do** trust the user. Errors say what happened and what to do; tooltips are labels,
  not explanations.

### Don't
- **Don't** reproduce LTSpice, PSpice, or Multisim Win32 dialog soup. Confirmation
  modals on undoable actions, dense gray panels with heavy borders, and modal overlays
  for simple selections are the patterns being rejected.
- **Don't** echo KiCad, OrCAD, or Cadence heavy CAD weight. Deep menus, modal
  everything, right-click-as-primary-affordance: all forbidden.
- **Don't** ship Vista Aero chrome. Faux-3D glass, decorative blur, heavy gradient
  bevels, translucent toolbars where the translucency does no work.
- **Don't** drift into AI-generated SaaS-cream pastels or generic dark-mode-VS-Code
  grays. The system has a point of view; the visual mean is a failure mode.
- **Don't** add a third typeface for "personality". Two faces, Geist Sans plus
  JetBrains Mono, is the spec.
- **Don't** use color decoratively. If a hue cannot be assigned a circuit-semantic
  role, it does not appear.
- **Don't** animate layout properties (width, height, top, left, margin, padding,
  border, font-size). Compositor-friendly only (transform, opacity).
- **Don't** use side-stripe borders (border-left or border-right greater than 1px as
  a colored accent). Forbidden by global design law.
- **Don't** use gradient text. Solid color, with weight contrast for emphasis.
- **Don't** ship modals as a first thought. Inline progressive disclosure, command
  palette, and panel state are the surface; modals are exceptional.
- **Don't** add cheerful empty states, confetti, or onboarding tours. Eerie is a tool;
  empty states are blank canvases waiting for input, not opportunities to entertain.
