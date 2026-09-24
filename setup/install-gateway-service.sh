#!/usr/bin/env bash
# Keep the gateway running across reboots.
#
#   bash setup/install-gateway-service.sh
#
# Why this is not optional on a server.
#
# The gateway is the scheduler: `hermes cron` only fires while
# `hermes gateway run` is alive (docs/DEPLOYMENT-NOTES.md #7). Started by
# hand it dies on reboot, on an OOM kill, or when the SSH session that
# launched it closes. Nothing announces this. The mail poll, the Slack poll
# and the daily SLA sweep simply stop, and the board keeps looking healthy
# because a board with no new tickets looks exactly like a quiet day.
#
# That failure is invisible for as long as nobody happens to check, which is
# the worst property a clinical escalation path can have.
#
# Laptop-safe: WSL has no systemd by default, so this exits cleanly there
# rather than half-installing.
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UNIT=/etc/systemd/system/hermes-gateway.service
HERMES="$HOME/.local/bin/hermes"

if ! command -v systemctl >/dev/null 2>&1 || [ ! -d /run/systemd/system ]; then
    echo "No systemd on this machine (WSL?). Nothing to install."
    echo "Start the gateway by hand instead:  bash setup/restart-gateway.sh"
    exit 0
fi

if [ ! -x "$HERMES" ]; then
    echo "No Hermes binary at $HERMES - install it first."
    exit 1
fi

echo "==> writing $UNIT"
cat > "$UNIT" <<UNITFILE
[Unit]
Description=Hermes gateway (scheduler for TRT ops cron jobs)
Documentation=file://$REPO/docs/DEPLOYMENT-NOTES.md
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=$HERMES gateway run
WorkingDirectory=$REPO
Environment=HOME=$HOME

# Restart on any exit, not just failure. A clean exit is still an outage
# here: no gateway means no cron, and no cron means the SLA sweep never
# runs. There is no "finished successfully" state for this process.
Restart=always
RestartSec=10

# Give up and stay down rather than crash-loop forever if something is
# genuinely wrong - a flapping service is harder to notice than a stopped
# one, and journalctl will show why it stopped.
StartLimitIntervalSec=300
StartLimitBurst=5

StandardOutput=journal
StandardError=journal
SyslogIdentifier=hermes-gateway

[Install]
WantedBy=multi-user.target
UNITFILE

echo "==> enabling"
systemctl daemon-reload
systemctl enable hermes-gateway >/dev/null 2>&1
systemctl restart hermes-gateway
sleep 8

echo
echo "==> status"
systemctl is-active hermes-gateway
systemctl is-enabled hermes-gateway

echo
echo "==> cron jobs the gateway can now see"
"$HERMES" cron list 2>&1 | head -10

echo
echo "Logs:     journalctl -u hermes-gateway -f"
echo "Restart:  systemctl restart hermes-gateway"
