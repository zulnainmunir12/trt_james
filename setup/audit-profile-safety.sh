#!/usr/bin/env bash
# Verify EVERY profile has autonomous dispatch disabled.
#
# `profile create --clone` copies the active profile's config, but that is a
# claim until checked. A profile with the vendor's default config would have
# autonomous dispatch ON - see docs/INCIDENT-auto-decomposer.md.
set -uo pipefail

fail=0

check() {
    local label="$1" cfg="$2"
    if [ ! -f "$cfg" ]; then
        printf '  %-14s NO CONFIG (%s)\n' "$label" "$cfg"
        return
    fi
    local dispatch decompose
    dispatch=$(grep -oE 'dispatch_in_gateway:\s*\w+' "$cfg" | head -1 | awk '{print $2}')
    decompose=$(grep -oE 'auto_decompose:\s*\w+' "$cfg" | head -1 | awk '{print $2}')
    dispatch=${dispatch:-UNSET}
    decompose=${decompose:-UNSET}

    if [ "$dispatch" = "false" ] && [ "$decompose" = "false" ]; then
        printf '  %-14s OK       dispatch=%s decompose=%s\n' "$label" "$dispatch" "$decompose"
    else
        printf '  %-14s UNSAFE   dispatch=%s decompose=%s\n' "$label" "$dispatch" "$decompose"
        fail=1
    fi
}

echo "==> autonomous dispatch audit"
check "default" "$HOME/.hermes/config.yaml"
for dir in "$HOME"/.hermes/profiles/*/; do
    [ -d "$dir" ] || continue
    check "$(basename "$dir")" "$dir/config.yaml"
done

echo
if [ "$fail" -ne 0 ]; then
    echo "FAIL: at least one profile can dispatch autonomously."
    echo "Fix with setup/disable-auto-orchestration.sh, then re-run this."
    exit 1
fi
echo "All profiles have autonomous dispatch disabled."
