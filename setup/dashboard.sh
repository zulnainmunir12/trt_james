#!/usr/bin/env bash
# Start the Hermes web dashboard so a human can watch what the agent is doing.
#
# Usage:
#   bash setup/dashboard.sh --help      show options
#   bash setup/dashboard.sh             start it
#
# The dashboard is how staff (and we, during development) see live sessions,
# the kanban board, cron runs and logs - rather than reading terminal output.
set -uo pipefail
HERMES="$HOME/.local/bin/hermes"

if [ "${1:-}" = "--help" ]; then
    "$HERMES" dashboard --help
    exit 0
fi

mkdir -p "$HOME/.hermes/logs"
echo "==> starting dashboard"
nohup "$HERMES" dashboard > "$HOME/.hermes/logs/dashboard.log" 2>&1 &
echo "    pid $!"

# Give it time to build assets and bind a port on first run.
for _ in $(seq 1 20); do
    sleep 3
    if grep -qiE 'http://|listening|running on' "$HOME/.hermes/logs/dashboard.log" 2>/dev/null; then
        break
    fi
done

echo
echo "==> log"
tail -25 "$HOME/.hermes/logs/dashboard.log" | sed 's/\x1b\[[0-9;]*m//g'
