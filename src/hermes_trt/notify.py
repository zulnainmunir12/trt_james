"""Deliver escalations and alerts.

Until now the SLA sweep detected overdue work and told nobody - it printed a
report and exited. That is the one thing the client explicitly asked for, so
this closes it.

Delivery goes through `hermes send`, which routes to whatever platform is
configured. While no platform is connected it falls back to writing the
alert to a local file, so nothing is silently lost during development.
"""
from __future__ import annotations

import os
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

HERMES_BIN = Path(
    os.environ.get("HERMES_BIN", Path.home() / ".local" / "bin" / "hermes")
)

# Config is read at CALL time, not import time. Reading env vars into module
# constants looks tidier but means the value is frozen by whoever imported
# first - which makes it untestable and surprising to configure.


def fallback_log() -> Path:
    """Where alerts go when no messaging platform is connected.

    A file is not a substitute for reaching a person, but it is auditable
    and it makes the gap visible rather than pretending delivery happened.
    """
    return Path(
        os.environ.get(
            "HERMES_TRT_ALERT_LOG", Path.home() / ".hermes" / "trt-alerts.log"
        )
    )


def _from_env_file(name: str) -> str:
    """Read a key from Hermes' env file.

    The environment is checked first so a caller can override, but the file
    has to be read too: cron runners exec Python directly and nothing loads
    .env into the process. Without this, every scheduled escalation saw an
    empty target and fell back to the log file - the sweep ran daily and
    nobody was ever told. The same pattern is in slackpoll and jev.
    """
    env_file = Path(
        os.environ.get("HERMES_HOME", Path.home() / ".hermes")) / ".env"
    if not env_file.exists():
        return ""
    found = ""
    for line in env_file.read_text(encoding="utf-8", errors="replace").splitlines():
        if line.startswith(f"{name}="):
            found = line.split("=", 1)[1].strip().strip("'\"")
    return found


def escalation_target() -> str:
    """Where escalations go. Empty until a channel is configured."""
    return (os.environ.get("HERMES_TRT_ESCALATION_TARGET", "")
            or _from_env_file("HERMES_TRT_ESCALATION_TARGET"))


@dataclass
class Delivery:
    delivered: bool
    target: str
    detail: str = ""

    def describe(self) -> str:
        if self.delivered:
            return f"delivered to {self.target}"
        return f"NOT DELIVERED ({self.target}): {self.detail}"


def _append_fallback(subject: str, body: str) -> Path:
    log = fallback_log()
    log.parent.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with log.open("a", encoding="utf-8") as fh:
        fh.write(f"\n{'=' * 70}\n{stamp}  {subject}\n{'=' * 70}\n{body}\n")
    return log


def send_alert(
    subject: str, body: str, target: Optional[str] = None, timeout: int = 60
) -> Delivery:
    """Send an operational alert.

    Returns a Delivery describing what actually happened. Callers should
    surface a failed delivery rather than swallow it: an escalation nobody
    received is worse than one that was never raised, because the report
    says it went out.
    """
    target = target or escalation_target()
    message = f"{subject}\n\n{body}"

    if not target:
        log = _append_fallback(subject, body)
        return Delivery(
            delivered=False,
            target="local file",
            detail=(
                f"no escalation target configured - written to {log}. "
                f"Set HERMES_TRT_ESCALATION_TARGET once the client gives us "
                f"a Slack channel."
            ),
        )

    try:
        proc = subprocess.run(
            # The target is a flag, not a positional. `hermes send` takes one
            # positional (the message); passing the target positionally makes
            # argparse reject the call, which looked like a delivery failure.
            [str(HERMES_BIN), "send", "-t", target, message],
            capture_output=True, text=True, timeout=timeout,
        )
    except (OSError, subprocess.TimeoutExpired) as err:
        _append_fallback(subject, body)
        return Delivery(False, target, f"send failed: {err}")

    if proc.returncode != 0:
        _append_fallback(subject, body)
        return Delivery(
            False, target,
            f"hermes send exited {proc.returncode}: "
            f"{(proc.stderr or proc.stdout).strip()[:200]}",
        )

    return Delivery(True, target)
