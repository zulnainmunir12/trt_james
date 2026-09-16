#!/usr/bin/env bash
# Install Hermes Agent reproducibly.
#
# Run the OS dependencies first (see docs/DEPLOYMENT-NOTES.md #1):
#   sudo apt update && sudo apt install -y build-essential libatomic1 ripgrep ffmpeg
#
# Usage: bash setup/install-hermes.sh
set -euo pipefail

INSTALLER_URL="https://hermes-agent.nousresearch.com/install.sh"
WORK="$HOME/hermes-setup"
mkdir -p "$WORK/bin"

echo "==> Checking OS dependencies"
missing=()
for p in build-essential libatomic1 ripgrep ffmpeg; do
    dpkg -s "$p" >/dev/null 2>&1 || missing+=("$p")
done
if [ ${#missing[@]} -gt 0 ]; then
    echo "MISSING: ${missing[*]}"
    echo
    echo "Install them first, then re-run this script:"
    echo "  sudo apt update && sudo apt install -y ${missing[*]}"
    echo
    echo "Do NOT skip this. The Hermes installer hangs forever on sudo"
    echo "prompts rather than failing - see docs/DEPLOYMENT-NOTES.md."
    exit 1
fi
echo "    all present"

echo "==> Downloading installer"
curl -fsSL -o "$WORK/install.sh" "$INSTALLER_URL"
echo "    $(wc -c <"$WORK/install.sh") bytes"
echo "    sha256: $(sha256sum "$WORK/install.sh" | cut -d' ' -f1)"

# The installer's apt steps are best-effort (`|| true`), but they BLOCK rather
# than fail when sudo exists and cannot authenticate. A sudo that exits
# non-zero makes them degrade cleanly. Scoped to this script's PATH only.
echo "==> Preparing non-interactive sudo shim"
printf '#!/bin/sh\nexit 1\n' > "$WORK/bin/sudo"
chmod +x "$WORK/bin/sudo"

echo "==> Running installer (several minutes: clones ~13.5k files, builds deps)"
PATH="$WORK/bin:$PATH" bash "$WORK/install.sh" --non-interactive --skip-setup \
    > "$WORK/install.log" 2>&1 || {
        echo "FAILED - last 30 lines:"
        tail -30 "$WORK/install.log" | sed 's/\x1b\[[0-9;]*m//g'
        exit 1
    }

echo "==> Verifying"
if ! "$HOME/.local/bin/hermes" --version; then
    echo "FAILED: binary installed but will not run"
    exit 1
fi

echo
echo "Hermes installed. Next:"
echo "  python3 setup/configure-provider.py gemini <API_KEY>"
echo "  bash setup/smoke-test.sh"
