#!/usr/bin/env bash
# EMERGENCY CONTROL - disable Hermes' autonomous kanban dispatcher.
#
# Why this exists:
#
# On 16 September 2026 the pipeline correctly routed a client reporting
# chest tightness to triage (Route.HUMAN, no assignee, parked for a person).
# Hermes' auto-decomposer then picked that ticket up on its own and created:
#
#   t_0e9cffa6 "Review medical records and draft urgent clinical response
#               with safety-netting"
#   body: "...clear clinical guidance on whether to temporarily hold the
#          medication."
#
# and SPAWNED A WORKER (pid 5491) to carry it out. The worker did not produce
# clinical advice only because it hit the Gemini quota wall (exit 75).
#
# Nothing in our safety layer stopped it. Our control lives at the
# classification layer; the orchestration layer downstream ignored it.
#
# The solution design states: "Autonomous execution of clinical or
# discretionary client decisions is strictly prohibited."
set -uo pipefail
HERMES="$HOME/.local/bin/hermes"
CONFIG="$HOME/.hermes/config.yaml"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> current kanban orchestration settings"
grep -n -A12 '^kanban:' "$CONFIG" | head -20 || echo "  (no kanban block found)"

echo
echo "==> disabling dispatcher in config.yaml"
python3 - "$CONFIG" <<'PYEOF'
import re, sys, shutil
from datetime import datetime

path = sys.argv[1]
shutil.copy2(path, f"{path}.{datetime.now():%Y%m%d-%H%M%S}.bak")
text = open(path, encoding="utf-8").read()

block = (
    "kanban:\n"
    "  # SAFETY: autonomous dispatch is disabled for this deployment.\n"
    "  # Hermes coordinates work; it must never execute clinical or\n"
    "  # discretionary client decisions. See\n"
    "  # docs/INCIDENT-auto-decomposer.md\n"
    "  dispatch_in_gateway: false\n"
    "  auto_decompose: false\n"
    "  review_dispatch: false\n"
)

if re.search(r"^kanban:", text, re.MULTILINE):
    # Replace the existing block's dispatch flags rather than the whole block.
    text = re.sub(r"^(\s*)dispatch_in_gateway:\s*\w+",
                  r"\g<1>dispatch_in_gateway: false", text, flags=re.MULTILINE)
    text = re.sub(r"^(\s*)auto_decompose:\s*\w+",
                  r"\g<1>auto_decompose: false", text, flags=re.MULTILINE)
    # review_dispatch ships true and sits in the same block as the two
    # flags above. Hermes does not document it and `hermes config list`
    # does not show it, so what it dispatches is unknown. An undocumented
    # dispatch switch beside two that spawned a clinical worker gets turned
    # off until someone can say what it does. Reversible: a .bak is written
    # above, and turning it back on is one edit.
    text = re.sub(r"^(\s*)review_dispatch:\s*\w+",
                  r"\g<1>review_dispatch: false", text, flags=re.MULTILINE)
    if "dispatch_in_gateway" not in text:
        text = re.sub(r"^kanban:\n", block, text, count=1, flags=re.MULTILINE)
else:
    text = text.rstrip("\n") + "\n\n" + block

open(path, "w", encoding="utf-8").write(text)
print("  written")
PYEOF

echo
echo "==> verifying"
grep -n -E "dispatch_in_gateway|auto_decompose|review_dispatch" "$CONFIG" | head -8

echo
echo "==> the same flags in every role profile"
# Each profile is an assignee on the board. A flag left true in one profile
# is a live path no matter what the top-level config says.
for pc in "$HOME"/.hermes/profiles/*/config.yaml; do
    [ -e "$pc" ] || continue
    python3 "$REPO/setup/_force_flags_false.py" "$pc"
    printf '    %-12s %s of 3 disabled\n' "$(basename "$(dirname "$pc")")" \
        "$(grep -cE '(dispatch_in_gateway|auto_decompose|review_dispatch): false' "$pc")"
done

echo
echo "==> restart the gateway for this to take effect:"
echo "     hermes gateway stop && hermes gateway run"
