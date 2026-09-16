#!/usr/bin/env bash
# Wait for Gemini quota to free up, then run the eval exactly once.
#
# Gemini's free tier is 20 requests/minute. Running two evals concurrently,
# or probing while one is in flight, saturates the window and every message
# comes back 429. Poll cheaply until a single request succeeds, then go.
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"

KEY=$(grep '^GEMINI_API_KEY=' "$HOME/.hermes/.env" | head -1 | cut -d= -f2-)
URL="https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent"

echo "==> waiting for quota"
for attempt in $(seq 1 12); do
    code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$URL" \
        -H "x-goog-api-key: $KEY" -H 'Content-Type: application/json' \
        -d '{"contents":[{"parts":[{"text":"ok"}]}]}')
    if [ "$code" = "200" ]; then
        echo "    quota available (attempt $attempt)"
        break
    fi
    echo "    HTTP $code - waiting 65s"
    sleep 65
done

if [ "$code" != "200" ]; then
    echo "Quota never freed up after 12 attempts. Try again later."
    exit 3
fi

# The probe above consumed one request; let the window breathe before a
# 7-message batch.
sleep 20

echo
echo "==> running eval"
.venv/bin/python eval/run_eval.py
