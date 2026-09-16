#!/usr/bin/env bash
# Run a hermes command without the Windows PATH bleeding into WSL.
#
# Calling `hermes ...` through `wsl.exe -- bash -lc "..."` keeps tripping on
# Windows PATH entries containing spaces ("C:/Program Files/..."). This
# wrapper avoids the whole class of problem.
#
# Usage: bash setup/h.sh kanban list
exec "$HOME/.local/bin/hermes" "$@"
