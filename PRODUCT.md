# Product

## Register

product

## Users

University-level EE students. Their context is coursework: lab assignments, debugging
homework circuits, exploring concepts from class. They have been issued LTSpice,
PSpice, or Multisim and resent the experience: dense Win32 dialog soup, dated UX,
things that feel alien on a 2026 laptop. The job to be done is twofold: (1) build
and simulate a circuit fast enough to keep up with curiosity, (2) understand what
is happening, not just produce a number.

The dominant emotion to chase on first open is "wait, this is for me?" Disbelief
that EE software can feel modern. That reaction is the entire product strategy in
one beat.

## Product Purpose

Eerie is an open, hackable circuit design and simulation tool, GPL-3.0. It exists
because the dominant tools in the field are dated, hostile, and not built for
students. Success is when a student finishes a session and the headline thought is
"that was a breath of fresh air compared to the rest of the software in my field."

Eerie is a tool, not a marketing surface. PRODUCT.md is scoped to the app.

## Brand Personality

Modern, opinionated, fast. Closer to Linear, Raycast, or Figma than to any EE tool.

The directional reference, in the user's own words:

> A riced-up modern Hyprland desktop on default CachyOS, while the rest of the
> industry is stuck on Windows Vista.

Unpacking that: typography-forward, sharp edges, fast, tiled and intentional layout
rhythm, deliberate accent color rather than ambient glow, defaults that already feel
curated (the CachyOS half) with room for personalization (the rice half). Eerie
should feel pre-configured by someone with taste, not assembled from a stock kit.

Voice in UI copy is terse to the point of curt: short labels, no hand-holding, no
"are you sure?" on undoable actions. Assume competence, even on day one.

Confidence is earned, not loud. The previous "neon cyberpunk" theme overshot in the
loud direction; visual direction for the long term is open and will be set by
DESIGN.md.

## Anti-references

- **LTSpice, PSpice, Multisim.** Win32 dialog soup. Dense, gray, alien. The thing
  students are running from. If a screen in Eerie ever feels like it could ship in
  one of these tools, it has failed.
- **KiCad, OrCAD, Cadence.** Heavy industrial CAD. Modal everything, deep menus,
  visually punishing. Power without humanity. Eerie's power should feel light.
- **Windows Vista Aero chrome.** Faux-3D glass, decorative translucency, heavy
  gradients, blur for the sake of blur. The user's framing is that the EE industry
  is "stuck on Windows Vista," and Eerie's surface should never read as 2007 Aero.
  Modern translucency / blur is a register; cargo-culted Vista chrome is not.
- **Implied bans.** AI-generated SaaS-cream pastels, generic VS Code-clone gray,
  anything that reads as "indistinct dev tool." Eerie has a point of view;
  lookalike defaults are a failure mode.

## Design Principles

1. **Refuse the field's bad habits.** Every interaction is implicitly graded against
   LTSpice's worst patterns: confirmation modals, settings spread across nested
   tabs, right-click-to-configure-everything, modes that do not tell you what mode
   you are in. If Eerie reproduces one of those patterns, it is a regression, not
   a tradition.

2. **Speed of thought.** The keyboard model already encodes this (Q/W/E modes,
   `E,_` chords for components). Defaults exist so frequent actions take one
   keystroke and rare ones do not clog the surface. Latency, dialog round-trips,
   and confirmation prompts are taxes; remove them unless they prevent real harm.

3. **Trust the user, terse the copy.** Students are not coddled. Errors say what
   happened and what to do. Tooltips are labels, not explanations. No cheerful
   empty states. No re-confirming reversible actions. Undo is the safety net, not
   modal prompts.

4. **Ship a point of view.** Pick defaults, schema, and conventions; stand behind
   them. Hackability serves the curious 10%, but Eerie is not vendor-neutral
   middleware. Opinionated choices (units, naming, layout) are part of the tool's
   identity.

5. **Clarity is the kindness.** Pedagogical generosity does not mean cute
   illustrations or chatty onboarding. It means the canvas, plot, and properties
   panel make circuit behavior legible at a glance: where current flows, why a node
   is unreachable, why a sim fails. Visible state over hidden state.

## Accessibility & Inclusion

No formal commitment yet. Accessibility targets (WCAG level, contrast, keyboard
coverage) are deliberately deferred to a later teach pass. Designs in the meantime
should still avoid obvious failures (focus visibility, keyboard reachability of all
actions, reduced-motion respect), but PRODUCT.md does not lock in a spec.
