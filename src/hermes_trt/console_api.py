"""Turn the live kanban into the shape the console renders.

The console was built against invented data with a deliberate shape: a queue,
a status, a priority, a target date, where the message came from and why it
was routed where it was. All of that exists in the running system, but spread
across the kanban board and the deadline store, so this is where the two are
joined and translated once rather than in the browser.

Read-only. Nothing here writes to the board.
"""
from __future__ import annotations

import json
import re
import subprocess
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Optional

HERMES = Path.home() / ".local" / "bin" / "hermes"

#: Hermes task status -> the four columns the board shows. `triage` means the
#: pipeline deliberately parked it for a person, which is the same thing the
#: console calls "held" - so it maps to a queue, not a status, below.
STATUS_MAP = {
    "triage": "open",
    "todo": "open",
    "ready": "open",
    "scheduled": "open",
    "running": "progress",
    "review": "progress",
    "blocked": "waiting",
    "done": "resolved",
    "archived": "resolved",
}

#: Assignee -> queue. Anything we do not recognise is treated as held rather
#: than guessed at: showing work in the wrong queue is worse than showing it
#: as needing a person to place it.
QUEUE_MAP = {"physician": "physician", "nursing": "nursing", "support": "support"}

PRIORITY_WORDS = {"urgent", "high", "normal", "low"}

_TRIAGE_SPLIT = re.compile(r"^-{2,}\s*Hermes triage\s*-{2,}\s*$", re.MULTILINE)


def _run_json(args: list[str], timeout: int = 30):
    try:
        proc = subprocess.run([str(HERMES), *args], capture_output=True,
                              text=True, timeout=timeout)
        return json.loads(proc.stdout) if proc.stdout.strip() else None
    except Exception:  # noqa: BLE001 - the console must still render
        return None


def _field(block: str, name: str) -> str:
    m = re.search(rf"^{name}:\s*(.+)$", block, re.MULTILINE)
    return m.group(1).strip() if m else ""


def parse_body(raw: str) -> dict:
    """Split a task body into the header, the message, and the triage block.

    The pipeline writes a fixed layout, so this parses rather than guesses.
    A body that does not match still yields something usable: the whole text
    becomes the message and the rest stays empty.
    """
    parts = _TRIAGE_SPLIT.split(raw or "", maxsplit=1)
    upper, triage = parts[0], (parts[1] if len(parts) > 1 else "")

    header_lines, message_lines, in_header = [], [], True
    for line in upper.splitlines():
        if in_header and re.match(r"^(From|Source|Subject):", line):
            header_lines.append(line)
            continue
        if in_header and not line.strip():
            in_header = False
            continue
        in_header = False
        message_lines.append(line)

    header = "\n".join(header_lines)
    return {
        "from": _field(header, "From"),
        "source": _field(header, "Source").lower(),
        "subject": _field(header, "Subject"),
        "message": "\n".join(message_lines).strip(),
        "route": _field(triage, "Route").lower(),
        "priority": _field(triage, "Priority").lower(),
        "confidence": _field(triage, "Confidence"),
        "reason": _field(triage, "Reason"),
        "client": _field(triage, "Client"),
    }


def _age(created_at) -> str:
    """Human age, matching how the console words it elsewhere."""
    try:
        then = datetime.fromtimestamp(float(created_at), tz=timezone.utc)
    except Exception:  # noqa: BLE001
        return ""
    mins = max(0, int((datetime.now(timezone.utc) - then).total_seconds() // 60))
    if mins < 60:
        return f"{mins}m"
    if mins < 60 * 24:
        return f"{mins // 60}h"
    return f"{mins // (60 * 24)}d"


def _deadline_index() -> dict[str, dict]:
    """Target dates keyed by ticket, so a ticket can show when it is due."""
    try:
        from hermes_trt.store import DeadlineStore
        store = DeadlineStore()
        today = date.today()
        index: dict[str, dict] = {}
        for d in store.open_deadlines():
            # A ticket can carry more than one clock. Show the tightest, since
            # that is the one that will escalate first.
            days = d.days_remaining(today)
            cur = index.get(d.ticket_id)
            if cur is None or days < cur["days"]:
                index[d.ticket_id] = {"days": days, "rule": d.rule.label,
                                      "escalated": d.escalated}
        return index
    except Exception:  # noqa: BLE001
        return {}


def tickets() -> list[dict]:
    data = _run_json(["kanban", "list", "--json"])
    if not data:
        return []
    items = data if isinstance(data, list) else data.get("tasks", data.get("items", []))
    due_by_ticket = _deadline_index()

    out = []
    for t in items:
        parsed = parse_body(t.get("body") or "")
        assignee = (t.get("assignee") or "").strip().lower()
        status = (t.get("status") or "").strip().lower()

        # Parked for a person, or routed somewhere we do not recognise.
        queue = QUEUE_MAP.get(assignee) or QUEUE_MAP.get(parsed["route"]) or "held"
        if status == "triage" and not assignee:
            queue = "held"

        pri = parsed["priority"] if parsed["priority"] in PRIORITY_WORDS else "normal"
        dl = due_by_ticket.get(t.get("id"))

        source = parsed["source"] or "email"
        acts = [["Created from " + {
            "email": "client email", "slack": "internal message",
        }.get(source, "an automated check"), _age(t.get("created_at")) + " ago"]]
        if queue == "held":
            acts.append(["Held for review - not routed", _age(t.get("created_at")) + " ago"])
        else:
            acts.append([f"Routed to {queue.title()}", _age(t.get("created_at")) + " ago"])
        if dl and dl.get("escalated"):
            acts.append(["Escalated to leadership", "since"])

        out.append({
            "key": t.get("id", ""),
            "sum": t.get("title") or parsed["subject"] or "(untitled)",
            "type": "clinical" if queue in ("physician", "held") else "admin",
            "q": queue,
            "st": STATUS_MAP.get(status, "open"),
            "pri": pri,
            "due": dl["days"] if dl else None,
            "client": parsed["client"] or "—",
            "from": parsed["from"] or "Automated check",
            "ch": {"email": "email", "slack": "slack"}.get(source, "system"),
            "age": _age(t.get("created_at")),
            "why": parsed["reason"] or "No routing note was recorded.",
            "body": parsed["message"] or "(no message body)",
            "acts": acts,
            "cm": [],
        })
    return out


def state() -> dict:
    """Everything the console needs, in one response."""
    rows = tickets()
    return {
        "live": True,
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "tickets": rows,
        "counts": {
            "total": len(rows),
            "open": len([r for r in rows if r["st"] != "resolved"]),
            "held": len([r for r in rows if r["q"] == "held" and r["st"] != "resolved"]),
            "overdue": len([r for r in rows
                            if r["due"] is not None and r["due"] < 0
                            and r["st"] != "resolved"]),
        },
    }
