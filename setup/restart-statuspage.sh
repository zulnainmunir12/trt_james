#!/usr/bin/env bash
# Restart the read-only status server.
#
# The kill pattern is bracketed so it cannot match this script's own command
# line - an unbracketed `pkill -f server.py` kills the shell running it.
PORT="${1:-8090}"
REPO=/mnt/c/Projects/hermes-trt-ops

pkill -f "statuspage/serve[r].py" 2>/dev/null
sleep 1
cd "$REPO" || exit 1
nohup .venv/bin/python statuspage/server.py --port "$PORT" >/tmp/statuspage.log 2>&1 &
sleep 3
if pgrep -f "statuspage/serve[r].py" >/dev/null; then
  echo "status server running on port $PORT (pid $(pgrep -f 'statuspage/serve[r].py' | head -1))"
else
  echo "FAILED to start; log:"; tail -5 /tmp/statuspage.log
  exit 1
fi
