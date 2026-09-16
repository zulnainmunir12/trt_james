#!/usr/bin/env bash
# What is configured and what is still missing.
HERMES="$HOME/.local/bin/hermes"

echo "=== version ==="
"$HERMES" --version 2>&1 | head -3

echo
echo "=== gateway (messaging + cron service) ==="
"$HERMES" gateway --help 2>&1 | head -18

echo
echo "=== cron jobs ==="
"$HERMES" cron list 2>&1 | head -10 || echo "(no cron subcommand or none defined)"

echo
echo "=== telemetry setting ==="
grep -n -A3 '^telemetry:' "$HOME/.hermes/config.yaml" 2>/dev/null | head -8

echo
echo "=== skills installed ==="
ls "$HOME/.hermes/hermes-agent/skills/" 2>/dev/null | head -20
