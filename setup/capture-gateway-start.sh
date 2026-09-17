#!/usr/bin/env bash
# Capture a full, unfiltered gateway startup so platform-connect failures
# are visible.
#
# Note: killing by `pkill -f "gateway run"` matches the shell running this
# script too, so the old process is found by PID and killed explicitly.
set -uo pipefail
OUT="$HOME/gw-start.log"

old=$(pgrep -f "hermes-agent/venv/bin/python.*gateway" | head -5)
for pid in $old; do
    kill "$pid" 2>/dev/null
done
sleep 3

timeout 75 "$HOME/.local/bin/hermes" gateway run > "$OUT" 2>&1
echo "captured $(wc -l < "$OUT") lines to $OUT"
