#!/usr/bin/env bash
# ralph.sh — run Claude Code in a loop on eerie issues.
# Each iteration Claude picks one open issue, works on it, commits, and exits.
# The loop ends when Claude prints RALPH_DONE (no open issues remain).
#
# Usage:
#   ./ralph.sh            # run up to 50 iterations
#   ./ralph.sh 10         # run up to 10 iterations
#   ANTHROPIC_MODEL=claude-opus-4-6 ./ralph.sh

set -euo pipefail

MAX_ITER=${1:-50}
ITER=0
DONE_SIGNAL="RALPH_DONE"
TMPFILE=""

cleanup() {
    rm -f "$TMPFILE"
    echo ""
    echo "⛔  Interrupted after $ITER iteration(s)."
    exit 130
}
trap cleanup INT TERM

echo "╔══════════════════════════════════════╗"
echo "║          Eerie Ralph Loop            ║"
echo "╚══════════════════════════════════════╝"
echo "Max iterations: $MAX_ITER"
echo ""

while [ "$ITER" -lt "$MAX_ITER" ]; do
    ITER=$((ITER + 1))
    echo "━━━ Iteration $ITER / $MAX_ITER ━━━━━━━━━━━━━━━━━━━━"
    echo ""

    # Feed CLAUDE.md as the prompt; tee to stdout live and a temp file for signal detection.
    TMPFILE=$(mktemp)
    claude --dangerously-skip-permissions -p "$(cat CLAUDE.md)" 2>&1 | tee "$TMPFILE"
    echo ""

    if grep -q "$DONE_SIGNAL" "$TMPFILE"; then
        rm -f "$TMPFILE"
        echo "✅  All issues complete. Ralph loop finished after $ITER iteration(s)."
        exit 0
    fi
    rm -f "$TMPFILE"

    echo "↻  Issue done. Starting next iteration with fresh context..."
    echo ""
done

echo "⚠️   Reached max iterations ($MAX_ITER) without RALPH_DONE. Check .claude/issues/."
exit 1
