# 001 — Compile and Test

Status: done
Priority: high

## Goal
Verify the Rust workspace compiles cleanly and tests pass after the serde→facet migration.

## Tasks
- Run `cargo check --workspace` and fix all errors
- Run `cargo test -p eerie-core` and fix any test failures
- Run `cargo clippy --workspace` and address warnings
- Ensure `eerie-codegen` compiles (it uses facet-typescript)
- Ensure `eerie-daemon` compiles

## Acceptance criteria
- `cargo check --workspace` exits 0
- `cargo test -p eerie-core` exits 0 (all tests pass or are marked `#[ignore]` with a reason)
- No `use serde` or `serde::` references remain in `eerie-core` or `eerie-codegen`
