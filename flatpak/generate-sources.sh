#!/usr/bin/env bash
# Generate vendored dependency sources for Flatpak builds.
#
# Prerequisites:
#   pip install flatpak-cargo-generator
#   pip install flatpak-node-generator  (or: pipx install flatpak-builder-tools)
#
# Usage:
#   cd flatpak/
#   ./generate-sources.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "==> Generating cargo-sources.json from Cargo.lock..."
flatpak-cargo-generator.py \
  "$PROJECT_ROOT/Cargo.lock" \
  -o "$SCRIPT_DIR/cargo-sources.json"

echo "==> Generating node-sources.json from pnpm-lock.yaml..."
flatpak-node-generator pnpm \
  "$PROJECT_ROOT/pnpm-lock.yaml" \
  -o "$SCRIPT_DIR/node-sources.json"

echo "==> Done. Generated files:"
echo "    flatpak/cargo-sources.json"
echo "    flatpak/node-sources.json"
echo ""
echo "Don't forget to rebuild the WASM archive if eerie-core changed:"
echo "    wasm-pack build eerie-core --target bundler --out-dir ../wasm-out"
echo "    tar czf flatpak/eerie-wasm.tar.gz -C wasm-out ."
