# 022 — Refactor pin structs in component.rs

Status: done

## Problem

`eerie-core/src/component.rs` has 7 separate pin tuple structs (`TwoPin`, `BjtPins`,
`MosfetPins`, `OpAmpPins`, `TransformerPins`, `RelayPins`, etc.) and a 56-line
`pin_names()` match with 14 arms that all do nearly the same thing.

Adding a new component type requires: a new pin struct, a new `Component` variant,
and a new match arm — high ceremony for what's essentially "a bag of named pins."

## Proposed fix

Replace the per-component pin structs with a single `HashMap<String, String>` (or a
small `Vec<(String, String)>`) on `ComponentData`. Each component type defines its
*expected* pin names as metadata, not as separate Rust types.

This eliminates the match arm explosion and makes `pin_names()` trivial.

## Acceptance criteria

- [ ] No per-component pin structs (TwoPin, BjtPins, etc.)
- [ ] `pin_names()` is data-driven, not a 14-arm match
- [ ] All existing tests pass
- [ ] Codegen output unchanged or updated to match
