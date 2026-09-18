#!/usr/bin/env bash
# Public HTTPS URL for the read-only console, for a demo call.
#
# Port 8090 only. NEVER tunnel 9119 - that is the Hermes dashboard, which
# exposes API keys, the .env file and an embedded terminal.
LOG=/tmp/trt-tunnel.log
pkill -f "cloudflare[d] tunnel --url" 2>/dev/null
sleep 1
nohup cloudflared tunnel --url http://localhost:8090 >"$LOG" 2>&1 &
echo "starting..."
for i in $(seq 1 30); do
  URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" | head -1)
  [ -n "$URL" ] && { echo "URL: $URL"; exit 0; }
  sleep 1
done
echo "no URL after 30s; log tail:"; tail -12 "$LOG"
