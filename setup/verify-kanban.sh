#!/usr/bin/env bash
# Does Hermes' built-in kanban board work as a ticketing substrate?
#
# If it does, we build the SLA/deadline layer on top of a durable board
# that already handles create/assign/complete/block and stale reclaim,
# rather than writing a ticketing system from scratch.
set -uo pipefail
HERMES="$HOME/.local/bin/hermes"

echo "==> init"
"$HERMES" kanban init 2>&1 | head -5

echo
echo "==> create a ticket (modelled on fixture e001)"
"$HERMES" kanban create \
  "Review pathology results for client James Harding (synthetic)" \
  2>&1 | head -10

echo
echo "==> list"
"$HERMES" kanban list 2>&1 | head -20

echo
echo "==> what fields does a ticket carry?"
"$HERMES" kanban create --help 2>&1 | head -40
