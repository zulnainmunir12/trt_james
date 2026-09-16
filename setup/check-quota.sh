#!/usr/bin/env bash
# Report the Gemini key state and the current quota status.
set -uo pipefail
ENV_FILE="$HOME/.hermes/.env"

echo "==> keys in $ENV_FILE"
for var in GEMINI_API_KEY GOOGLE_API_KEY; do
    line=$(grep "^${var}=" "$ENV_FILE" 2>/dev/null | head -1)
    value="${line#*=}"
    if [ -n "$value" ]; then
        printf '    %-16s SET (%d chars)\n' "$var" "${#value}"
    else
        printf '    %-16s EMPTY or absent\n' "$var"
    fi
done

KEY=$(grep '^GEMINI_API_KEY=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2-)
if [ -z "$KEY" ]; then
    echo "No key found - cannot check quota."
    exit 1
fi

echo
echo "==> live quota probe"
curl -s -X POST \
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent" \
  -H "x-goog-api-key: $KEY" -H 'Content-Type: application/json' \
  -d '{"contents":[{"parts":[{"text":"hi"}]}]}' \
  | python3 -c '
import json, sys
d = json.load(sys.stdin)
err = d.get("error")
if err:
    print("HTTP", err.get("code"))
    print(err.get("message", "")[:900])
else:
    print("OK - quota available")
'
