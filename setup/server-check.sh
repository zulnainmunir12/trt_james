#!/usr/bin/env bash
# What state is this machine in, before we install or move anything?
#
# Reports only. Changes nothing. Run it on the target server:
#
#   cd /opt/hermes-trt-ops/hermes-trt-ops && git pull && bash setup/server-check.sh
#
# Written as a script rather than a pasted block because a multi-line paste
# into an SSH terminal mangles - lines overwrite each other and the output
# is unreadable.

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ok()   { printf '  \033[32mok\033[0m       %s\n' "$1"; }
bad()  { printf '  \033[31mMISSING\033[0m  %s\n' "$1"; }
note() { printf '           %s\n' "$1"; }

echo
echo "=== repo ==="
cd "$REPO" || exit 1
note "path    $REPO"
note "commit  $(git log --oneline -1 2>/dev/null || echo 'not a git repo')"
note "branch  $(git status -sb 2>/dev/null | head -1)"

echo
echo "=== hermes agent ==="
if [ -x "$HOME/.local/bin/hermes" ]; then
  ok "binary    $("$HOME/.local/bin/hermes" --version 2>&1 | head -1)"
else
  bad "no hermes binary at ~/.local/bin/hermes"
fi
[ -d "$HOME/.hermes" ] && ok "~/.hermes exists" || bad "~/.hermes"

echo
echo "=== credentials (names only, never values) ==="
if [ -f "$HOME/.hermes/.env" ]; then
  for k in EMAIL_ADDRESS EMAIL_PASSWORD SLACK_BOT_TOKEN TYPESAFE_API_KEY \
           GEMINI_API_KEY HERMES_TRT_ESCALATION_TARGET HERMES_TRT_CLASSIFIER; do
    v=$(grep -E "^$k=" "$HOME/.hermes/.env" 2>/dev/null | tail -1 | cut -d= -f2-)
    [ -n "$v" ] && ok "$k set (${#v} chars)" || bad "$k"
  done
else
  bad "no ~/.hermes/.env at all"
fi

echo
echo "=== existing data (would we be joining someone else's board?) ==="
for f in kanban.db trt-clients.json trt-board.json trt-seen-uids.json \
         trt-slack-seen.json; do
  if [ -e "$HOME/.hermes/$f" ]; then
    note "$(printf '%-22s %s bytes' "$f" "$(stat -c%s "$HOME/.hermes/$f")")"
  else
    note "$(printf '%-22s -' "$f")"
  fi
done

echo
echo "=== python ==="
if [ -x "$REPO/.venv/bin/python" ]; then
  ok "venv      $("$REPO/.venv/bin/python" --version 2>&1)"
  "$REPO/.venv/bin/python" -c "import pytest" 2>/dev/null \
    && ok "pytest installed" || bad "pytest not in the venv"
else
  bad "no .venv/bin/python"
fi

echo
echo "=== os dependencies ==="
for p in build-essential libatomic1 ripgrep ffmpeg python3-venv; do
  dpkg -s "$p" >/dev/null 2>&1 && ok "$p" || bad "$p"
done

echo
echo "=== anything already running ==="
pgrep -af 'hermes|statuspage/serve[r].py' | head -6 || note "nothing"

echo
echo "=== other hermes installs on this box ==="
for d in /opt/hermes-integration /opt/chat-trt /opt/chat-harness; do
  [ -d "$d" ] && note "$(printf '%-26s %s' "$d" "$(ls "$d" 2>/dev/null | head -3 | tr '\n' ' ')")"
done

echo
echo "=== cron jobs registered here ==="
if [ -f "$HOME/.hermes/cron/jobs.json" ]; then
  python3 - <<'PY' 2>/dev/null || note "could not read jobs.json"
import json, os
p = os.path.expanduser("~/.hermes/cron/jobs.json")
for j in json.load(open(p)).get("jobs", []):
    s = j.get("schedule") or {}
    print(f"           {j.get('name','?'):18} {s.get('display','?'):14} enabled={j.get('enabled')}")
PY
else
  note "none"
fi
echo
