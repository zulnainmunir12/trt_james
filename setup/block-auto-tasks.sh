#!/usr/bin/env bash
# Block the tasks the auto-decomposer created, so they cannot be claimed
# again if the dispatcher is ever re-enabled.
#
# Blocked rather than archived on purpose: this is evidence of the incident
# in docs/INCIDENT-auto-decomposer.md and should stay inspectable.
set -uo pipefail
HERMES="$HOME/.local/bin/hermes"

REASON="BLOCKED BY SAFETY POLICY: created autonomously by auto-decomposer. Hermes must not draft clinical advice. See docs/INCIDENT-auto-decomposer.md"

for id in "$@"; do
    echo "==> $id"
    "$HERMES" kanban block "$id" "$REASON" 2>&1 | head -3
done

echo
echo "==> board"
"$HERMES" kanban list 2>&1 | head -20
