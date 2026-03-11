# 021 — Packaging / NixOS Installer

Status: open
Priority: low

## Goal
Package eerie as a distributable application:
- NixOS: `nix run github:user/eerie` or include in a NixOS configuration
- The daemon serves the web frontend as static files on localhost

## Tasks
- Fix `eerie-frontend` nix derivation `pnpmDeps` hash (currently `fakeHash`)
- Add `flake.nix` NixOS module for installing eerie system-wide
- Ensure all runtime dependencies (ngspice) are declared
- Test `nix build` end-to-end

## Acceptance criteria
- `nix build` in the project directory produces a runnable `./result/bin/eerie`
- Running it starts the daemon which serves the webapp on localhost
- Browser can connect and run simulations
