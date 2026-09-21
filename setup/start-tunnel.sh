#!/usr/bin/env bash
# Public HTTPS URL for the read-only console, for a demo call.
#
# Port 8090 only. NEVER tunnel 9119 - that is the Hermes dashboard, which
# exposes API keys, the .env file and an embedded terminal.
#
# The kill pattern is bracketed so it cannot match this script's own command
# line; an unbracketed pkill -f would kill the shell running it.
LOG=/tmp/trt-tunnel.log
pkill -f "cloudflare[d] tunnel --url" 2>/dev/null
sleep 1

if ! curl -s -o /dev/null --max-time 5 http://localhost:8090/; then
  echo "the console is not running on 8090 - start it first:"
  echo "  bash /mnt/c/Projects/hermes-trt-ops/setup/restart-statuspage.sh"
  exit 1
fi

nohup cloudflared tunnel --url http://localhost:8090 >"$LOG" 2>&1 &
for i in $(seq 1 40); do
  URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" | head -1)
  if [ -n "$URL" ]; then
    echo "URL: $URL"
    exit 0
  fi
  sleep 1
done
echo "no URL after 40s; log tail:"
tail -15 "$LOG"
exit 1
