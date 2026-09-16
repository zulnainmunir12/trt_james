#!/usr/bin/env bash
# Remove the artifacts created by verify-cron.sh and verify-kanban.sh.
set -uo pipefail
HERMES="$HOME/.local/bin/hermes"

echo "==> archiving test tickets"
"$HERMES" kanban list 2>/dev/null | grep -oE 't_[0-9a-f]+' | while read -r id; do
    echo "   archiving $id"
    "$HERMES" kanban archive "$id" >/dev/null 2>&1
done

echo "==> deleting test cron job"
"$HERMES" cron delete cron-selftest 2>&1 | head -3

echo "==> removing probe files"
rm -f /tmp/hermes_cron_proof.log "$HOME/.hermes/scripts/cron_probe.sh"

echo
echo "==> remaining cron jobs"
"$HERMES" cron list 2>&1 | head -4
echo "==> remaining tickets"
"$HERMES" kanban list 2>&1 | head -4
