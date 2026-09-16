#!/usr/bin/env bash
# Is the free-tier quota per-model or per-project?
#
# If a sibling model answers while gemini-3.6-flash is rate limited, the cap
# is per-model and we can spread load or switch. If everything 429s, the cap
# is project-wide and only a paid tier fixes it.
set -uo pipefail
KEY=$(grep '^GEMINI_API_KEY=' "$HOME/.hermes/.env" | head -1 | cut -d= -f2-)

for m in gemini-3.6-flash gemini-3.5-flash gemini-3-flash-preview gemini-3.1-flash-lite; do
    printf '%-26s ' "$m"
    out=$(curl -s -X POST \
        "https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent" \
        -H "x-goog-api-key: $KEY" -H 'Content-Type: application/json' \
        -d '{"contents":[{"parts":[{"text":"say OK"}]}]}')
    if echo "$out" | grep -q '"error"'; then
        code=$(echo "$out" | python3 -c 'import json,sys; print(json.load(sys.stdin)["error"]["code"])' 2>/dev/null)
        limit=$(echo "$out" | grep -oE 'limit: [0-9]+' | head -1)
        retry=$(echo "$out" | grep -oE 'retry in [0-9.]+s' | head -1)
        echo "HTTP $code  $limit  $retry"
    else
        echo "OK"
    fi
    sleep 4
done
