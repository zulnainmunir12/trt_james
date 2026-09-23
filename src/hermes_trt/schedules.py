"""Reading and changing when the background routines run.

The clinic should be able to decide that the pathology sweep runs at 7am
rather than 9, or pause the monthly check-in while someone is on leave,
without anyone editing code. That is what this exposes.

Reads come from Hermes' own job file. Writes go through its CLI rather
than the file, so Hermes stays the thing that owns the scheduler and a
change takes effect without a restart.

Deliberately narrow: schedule, pause and resume. Creating a routine means
defining what it DOES - a script or a prompt - which is a much larger
surface and not something to hand to a web form without more thought.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
from pathlib import Path

HERMES = Path.home() / ".local" / "bin" / "hermes"
HERMES_HOME = Path(os.environ.get("HERMES_HOME", Path.home() / ".hermes"))
JOBS_FILE = HERMES_HOME / "cron" / "jobs.json"

#: Plain-English labels for the routines we installed, so the console is not
#: showing people internal job names.
FRIENDLY = {
    "trt-sla-check": ("Pathology monitoring",
                      "Checks every client for follow-up blood work due, "
                      "results expiring and obligations past their date."),
    "trt-mailpoll": ("Client email",
                     "Reads new messages in the clinic mailbox and turns "
                     "them into tracked work."),
    "trt-slackpoll": ("Internal messages",
                      "Reads new messages in the team channels it has been "
                      "invited to."),
}

_INTERVAL = re.compile(r"^(?:every\s+)?(\d+)\s*(m|min|mins|minute|minutes|"
                       r"h|hr|hrs|hour|hours|d|day|days)$", re.I)
_CRON = re.compile(r"^\s*\S+\s+\S+\s+\S+\s+\S+\s+\S+\s*$")

#: Nothing may run more often than this. A one-minute floor is not about
#: model cost - the pollers only classify messages that are actually new -
#: but about the mail and Slack APIs, which rate-limit and will start
#: refusing us if something is set to run every few seconds.
MIN_MINUTES = 1


class ScheduleError(RuntimeError):
    pass


def _minutes(expr: str) -> int | None:
    """How often an interval expression fires, or None if it is cron syntax."""
    m = _INTERVAL.match(expr.strip())
    if not m:
        return None
    n, unit = int(m.group(1)), m.group(2).lower()
    if unit.startswith("m"):
        return n
    if unit.startswith("h"):
        return n * 60
    return n * 60 * 24


def validate(expr: str) -> str:
    """Check a schedule before handing it to Hermes.

    Returns the cleaned expression. Raises with a readable message rather
    than letting the CLI fail with something only we would understand.
    """
    expr = " ".join((expr or "").split())
    if not expr:
        raise ScheduleError("Give a schedule, for example '30m', "
                            "'every 2h', or '0 9 * * *'.")

    mins = _minutes(expr)
    if mins is not None:
        if mins < MIN_MINUTES:
            raise ScheduleError(
                f"The shortest allowed interval is {MIN_MINUTES} minute. "
                "Anything faster gets rate-limited by the mail and chat "
                "providers.")
        return expr

    if _CRON.match(expr):
        return expr

    raise ScheduleError(
        f"{expr!r} is not a schedule I recognise. Use an interval like "
        "'30m' or 'every 2h', or cron syntax like '0 9 * * *' for "
        "nine o'clock every day.")


def jobs() -> list[dict]:
    """Every registered routine, in the shape the console renders."""
    try:
        data = json.loads(JOBS_FILE.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001 - no scheduler yet is not an error
        return []

    out = []
    for j in data.get("jobs", []):
        name = j.get("name", "")
        label, blurb = FRIENDLY.get(name, (name, ""))
        sched = j.get("schedule") or {}
        out.append({
            "id": j.get("id", ""),
            "name": name,
            "label": label,
            "blurb": blurb,
            "schedule": sched.get("display") or sched.get("expr") or "",
            "kind": sched.get("kind", ""),
            "enabled": bool(j.get("enabled", True)),
            # Ours are plain scripts with no model attached; saying so stops
            # anyone assuming the clinic is being billed for these.
            "runs_a_model": not j.get("no_agent", False),
        })
    return out


def _run(args: list[str], timeout: int = 30) -> tuple[bool, str]:
    try:
        proc = subprocess.run([str(HERMES), *args], capture_output=True,
                              text=True, timeout=timeout)
        return proc.returncode == 0, (proc.stderr or proc.stdout).strip()
    except Exception as err:  # noqa: BLE001
        return False, str(err)


def _find(job_id: str) -> dict:
    for j in jobs():
        if j["id"] == job_id or j["name"] == job_id:
            return j
    raise ScheduleError(f"No routine called {job_id!r}.")


def set_schedule(job_id: str, expr: str) -> dict:
    job = _find(job_id)
    expr = validate(expr)
    ok, msg = _run(["cron", "edit", job["id"], "--schedule", expr])
    if not ok:
        raise ScheduleError(f"Hermes refused the change: {msg[:160]}")
    return _find(job["id"])


def set_enabled(job_id: str, enabled: bool) -> dict:
    job = _find(job_id)
    ok, msg = _run(["cron", "resume" if enabled else "pause", job["id"]])
    if not ok:
        raise ScheduleError(f"Hermes refused the change: {msg[:160]}")
    return _find(job["id"])
