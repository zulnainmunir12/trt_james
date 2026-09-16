#!/usr/bin/env bash
# Create the four role profiles so kanban tickets have real assignees.
#
# IMPORTANT: these are ROUTING LABELS, not autonomous workers.
#
# Hermes' kanban dispatcher spawns an agent for a task's assignee when
# orchestration is enabled. We disabled that after it tried to draft
# clinical advice (docs/INCIDENT-auto-decomposer.md). Creating named
# profiles makes the board readable; it must not become a way for that
# behaviour to return through the back door.
#
# --clone is deliberate: a fresh profile would get Hermes' default config,
# which has autonomous dispatch ON. Cloning inherits our hardened settings.
set -uo pipefail
HERMES="$HOME/.local/bin/hermes"

create() {
    local name="$1" desc="$2"
    if "$HERMES" profile list 2>/dev/null | grep -qE "^\s*.?${name}\b"; then
        echo "==> $name already exists, updating description"
        "$HERMES" profile describe "$name" "$desc" 2>&1 | head -2
        return
    fi
    echo "==> creating $name"
    "$HERMES" profile create "$name" --clone --no-alias \
        --description "$desc" 2>&1 | head -4
}

# Descriptions are read by the kanban orchestrator, so each says plainly
# that the profile does not act on its own.
create physician \
"Clinical evaluations and pathology review. ROUTING LABEL ONLY - a qualified human performs this work. This profile must never autonomously assess, advise or respond to a client."

create nursing \
"Client consultations about existing care. ROUTING LABEL ONLY - a qualified human performs this work. This profile must never autonomously give clinical guidance."

create support \
"Administrative and billing requests: memberships, logistics, process questions. ROUTING LABEL ONLY - a human performs this work."

create leadership \
"SLA escalations. Receives alerts when a ticket is overdue. ROUTING LABEL ONLY."

echo
echo "==> profiles"
"$HERMES" profile list 2>&1 | head -12
