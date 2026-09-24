#!/usr/bin/env bash
# Stage 1 of moving TRT ops onto the server: everything that needs no secrets.
#
#   cd /opt/hermes-trt-ops/hermes-trt-ops
#   git pull && bash setup/server-migrate.sh
#
# Stops before anything is connected. Credentials are deliberately NOT handled
# here - they go in by hand afterwards, so they never pass through a script
# that could end up in a log, a shell history or a git diff.
#
# Safe to re-run. Each step checks before it acts.
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO" || exit 1

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
ok()   { printf '    \033[32mok\033[0m       %s\n' "$1"; }
bad()  { printf '    \033[31mFAILED\033[0m   %s\n' "$1"; }
note() { printf '             %s\n' "$1"; }

# ---------------------------------------------------------------------------
step "1. OS dependencies"
# python3-venv is not in install-hermes.sh's list because that script only
# covers what the Hermes installer itself needs. Our test suite and the status
# server need a venv of our own.
missing=()
for p in build-essential libatomic1 ripgrep ffmpeg python3-venv; do
    dpkg -s "$p" >/dev/null 2>&1 || missing+=("$p")
done
if [ ${#missing[@]} -gt 0 ]; then
    bad "missing: ${missing[*]}"
    note "run this, then start the script again:"
    note "  sudo apt update && sudo apt install -y ${missing[*]}"
    note ""
    note "Do not skip it. The Hermes installer blocks forever on a sudo"
    note "prompt rather than failing - see docs/DEPLOYMENT-NOTES.md."
    exit 1
fi
ok "all present"

# ---------------------------------------------------------------------------
step "2. Python environment"
if [ ! -x "$REPO/.venv/bin/python" ]; then
    python3 -m venv "$REPO/.venv" || { bad "could not create .venv"; exit 1; }
fi
"$REPO/.venv/bin/pip" install -q --disable-pip-version-check pytest requests \
    || { bad "pip install"; exit 1; }
ok "$("$REPO/.venv/bin/python" --version 2>&1)"

# ---------------------------------------------------------------------------
step "3. Leftovers from earlier runs"
# /root/.hermes/trt-alerts.log on this box was written by a test run, not by a
# real escalation: the SLA tests used to perform a live send_alert() against
# whatever log the caller's environment pointed at. That is fixed now (the
# tests are isolated), but the file it left behind is fixture data - t_overdue,
# client-A - and would be confusing to keep next to real alerts.
LOG="$HOME/.hermes/trt-alerts.log"
if [ -f "$LOG" ]; then
    if grep -q 'client-A\|t_overdue' "$LOG" 2>/dev/null; then
        mv "$LOG" "$LOG.test-fixtures.bak"
        ok "moved fixture alert log aside -> $(basename "$LOG").test-fixtures.bak"
    else
        note "alert log present and does NOT look like fixtures - left alone:"
        note "  $LOG ($(stat -c%s "$LOG") bytes) - read it before deleting"
    fi
else
    ok "no stale alert log"
fi

# ---------------------------------------------------------------------------
step "4. Hermes agent"
if [ -x "$HOME/.local/bin/hermes" ]; then
    ok "already installed: $("$HOME/.local/bin/hermes" --version 2>&1 | head -1)"
else
    note "installing - several minutes, clones ~13.5k files"
    bash "$REPO/setup/install-hermes.sh" || { bad "install-hermes.sh"; exit 1; }
fi

# ---------------------------------------------------------------------------
step "5. Safety configuration"
# This runs BEFORE any credential goes in, and that ordering is the point.
# A fresh Hermes install turns dispatch_in_gateway and auto_decompose back ON.
# With those on and a mailbox connected, the agent acts on inbound clinic mail
# by itself - no human in the path. Catching it now costs nothing; catching it
# after the mailbox is live means it has already happened.
bash "$REPO/setup/disable-auto-orchestration.sh" >/dev/null 2>&1 \
    && ok "auto-orchestration disabled" \
    || note "disable-auto-orchestration.sh reported a problem - check by hand"

PYTHONPATH="$REPO/src" "$REPO/.venv/bin/python" -m pytest \
    "$REPO/tests/test_safety_config.py" -q 2>&1 | tail -3

# ---------------------------------------------------------------------------
step "6. Full test suite"
PYTHONPATH="$REPO/src" "$REPO/.venv/bin/python" -m pytest "$REPO/tests" -q 2>&1 | tail -3

# ---------------------------------------------------------------------------
step "What is still to do by hand"
cat <<'NEXT'
    Nothing is connected yet. In order:

    1. Credentials. Create ~/.hermes/.env on this machine and type the
       values in - do not paste them into a chat, an email or a commit.
       Keys needed:
         EMAIL_ADDRESS, EMAIL_PASSWORD, SLACK_BOT_TOKEN,
         TYPESAFE_API_KEY, HERMES_TRT_ESCALATION_TARGET,
         HERMES_TRT_CLASSIFIER=jev
       Then: chmod 600 ~/.hermes/.env

    2. Seen-markers. Copy trt-seen-uids.json and trt-slack-seen.json from
       the laptop into ~/.hermes/. Without them the first poll treats every
       message already handled as new and re-raises the lot.

    3. Register cron:   bash setup/install-cron-jobs.sh
                        bash setup/verify-cron.sh

    4. Console, bound to localhost only:
         bash setup/restart-statuspage.sh
       Reach it over an SSH tunnel:
         ssh -L 8090:localhost:8090 root@<this-server>
       Port 9119 is the Hermes dashboard. It exposes .env, the API keys and
       an embedded terminal. It must never be tunnelled or published.

    5. Last: stop the laptop's cron jobs, or both machines poll the same
       mailbox and the clinic gets everything twice.
NEXT
echo
