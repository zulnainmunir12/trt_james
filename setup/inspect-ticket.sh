#!/usr/bin/env bash
# Show a kanban ticket with its comments and events.
# Usage: bash setup/inspect-ticket.sh t_abc123
set -uo pipefail
"$HOME/.local/bin/hermes" kanban show "$1" 2>&1 | head -60
