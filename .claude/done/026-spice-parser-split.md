# 026 — Split spice-netlist parser into modules

Status: done

## Problem

`spice-netlist/src/parse.rs` is 1,094 lines — a monolithic parser with preprocessing,
tokenizing, element parsing, and analysis parsing all in one file.

## Proposed fix

Split into sub-modules:
- `parse/preprocess.rs` — line folding, comment stripping
- `parse/value.rs` — SI number parsing, expression parsing
- `parse/element.rs` — element/component parsing
- `parse/analysis.rs` — analysis directive parsing (.op, .dc, .tran, .ac)
- `parse/mod.rs` — top-level `parse()` function, orchestration

## Acceptance criteria

- [ ] No file over 300 lines
- [ ] All existing tests pass unchanged
- [ ] Public API unchanged
