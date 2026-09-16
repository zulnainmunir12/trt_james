#!/usr/bin/env bash
# Restart the gateway so config changes take effect.
# The gateway is also the scheduler, so cron stops while it is down.
set -uo pipefail
HERMES="$HOME/.local/bin/hermes"

echo "==> stopping"
"$HERMES" gateway stop 2>&1 | head -5
pkill -f "hermes gateway run" 2>/dev/null || true
sleep 3

echo "==> starting"
mkdir -p "$HOME/.hermes/logs"
nohup "$HERMES" gateway run > "$HOME/.hermes/logs/gateway.log" 2>&1 &
echo "    pid $!"

for _ in $(seq 1 10); do
    sleep 2
    "$HERMES" gateway status 2>&1 | grep -q "not running" || break
done

echo
"$HERMES" gateway status 2>&1 | head -4
