#!/usr/bin/env bash
# Restart the read-only status server.
#
# The kill pattern is bracketed so it cannot match this script's own command
# line - an unbracketed `pkill -f server.py` kills the shell running it.
PORT="${1:-8090}"
# Derived, not hardcoded: this script has to run on the laptop (a /mnt/c
# path under WSL) and on the server (/opt/...). A fixed path silently
# started nothing on whichever machine it was not written for.
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

pkill -f "statuspage/serve[r].py" 2>/dev/null
sleep 1
cd "$REPO" || exit 1
# No --host: server.py defaults to 127.0.0.1 and it stays that way. On a
# public VPS, binding 0.0.0.0 would put the console's unauthenticated write
# routes on the open internet. Reach it over an SSH tunnel instead.
nohup .venv/bin/python statuspage/server.py --port "$PORT" >/tmp/statuspage.log 2>&1 &
sleep 3
if pgrep -f "statuspage/serve[r].py" >/dev/null; then
  echo "status server running on port $PORT (pid $(pgrep -f 'statuspage/serve[r].py' | head -1))"
else
  echo "FAILED to start; log:"; tail -5 /tmp/statuspage.log
  exit 1
fi
