#!/usr/bin/env bash
# Prove the Hermes scheduler actually fires.
#
# The SLA tracker and the monthly client check-in both depend entirely on
# cron working, so prove it before building on it.
#
# Two constraints discovered the hard way:
#   1. Cron scripts must live in ~/.hermes/scripts/ and be referenced by
#      filename only. Absolute paths are rejected.
#   2. Cron only fires while the GATEWAY process is running. The gateway is
#      the scheduler. On a server this must be a supervised service.
#
# Uses --no-agent + --script so the test is deterministic and costs no
# LLM tokens.
set -uo pipefail

HERMES="$HOME/.local/bin/hermes"
SCRIPTS="$HOME/.hermes/scripts"
MARKER=/tmp/hermes_cron_proof.log
JOB_NAME="cron-selftest"

echo "==> Cleaning up any previous run"
rm -f "$MARKER"
"$HERMES" cron delete "$JOB_NAME" >/dev/null 2>&1 || true

mkdir -p "$SCRIPTS"
printf '#!/bin/sh\ndate -Is >> %s\n' "$MARKER" > "$SCRIPTS/cron_probe.sh"
chmod +x "$SCRIPTS/cron_probe.sh"
echo "    probe script -> $SCRIPTS/cron_probe.sh"

echo "==> Creating a job that runs every minute"
"$HERMES" cron create "1m" --name "$JOB_NAME" --no-agent --script "cron_probe.sh" 2>&1 | head -8

echo
echo "==> Registered jobs"
"$HERMES" cron list 2>&1 | head -12

echo
echo "==> Starting the gateway (it is the scheduler)"
if "$HERMES" gateway status 2>&1 | grep -q "not running"; then
    mkdir -p "$HOME/.hermes/logs"
    nohup "$HERMES" gateway run > "$HOME/.hermes/logs/gateway.log" 2>&1 &
    echo "    started, pid $!"
    # Give it a moment to bind before we check.
    for _ in $(seq 1 10); do
        sleep 2
        "$HERMES" gateway status 2>&1 | grep -q "not running" || break
    done
fi
"$HERMES" gateway status 2>&1 | head -6
