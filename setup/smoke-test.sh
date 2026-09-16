#!/usr/bin/env bash
# Verify Hermes actually works end to end.
#
# Two tests, because they fail independently: a provider can answer chat
# while tool calling is broken, and tool calling is what the whole
# ticketing/routing design depends on.
set -uo pipefail

HERMES_BIN="$HOME/.local/bin/hermes"
FIXTURE=/tmp/hermes_smoke
pass=0
fail=0

check() {
    local name="$1" expected="$2" actual="$3"
    if [ "$actual" = "$expected" ]; then
        echo "  PASS  $name"
        pass=$((pass + 1))
    else
        echo "  FAIL  $name"
        echo "        expected: $expected"
        echo "        got:      $actual"
        fail=$((fail + 1))
    fi
}

echo "==> Hermes version"
"$HERMES_BIN" --version || { echo "FAIL: binary will not run"; exit 1; }
echo

echo "==> Configured provider"
grep -E '^\s+(default|provider):' "$HOME/.hermes/config.yaml" | head -4
echo

echo "==> Test 1: plain generation"
out=$(cd "$HOME" && timeout 240 "$HERMES_BIN" -z \
    "Reply with exactly this and nothing else: SMOKE-OK" 2>&1 | tr -d '\r\n')
check "generation" "SMOKE-OK" "$out"

echo
echo "==> Test 2: tool calling"
mkdir -p "$FIXTURE"
echo "TOOL-OK" > "$FIXTURE/probe.txt"
out=$(cd "$HOME" && timeout 300 "$HERMES_BIN" -z \
    "Use your file tools to read $FIXTURE/probe.txt and reply with only its exact contents." \
    2>&1 | tr -d '\r\n')
check "tool calling" "TOOL-OK" "$out"

echo
echo "-----------------------------------"
echo "  $pass passed, $fail failed"
[ "$fail" -eq 0 ] || exit 1
