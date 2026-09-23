"""Moving work across the board, and the writes that go with it.

The console's four columns are the clinic's workflow - open, in progress,
waiting on the client, resolved. Hermes' own task states describe something
different: whether an agent has claimed and executed a task. We deliberately
run with agent execution disabled, so those states never advance on their
own and cannot carry the clinic's meaning.

So the workflow status is kept here, and Hermes' state is the fallback for
anything nobody has moved yet.

Resolving a ticket does three things rather than one, because until now
nothing in the system could close anything: the deadline store still had
`mark_complete` with no callers, so a ticket could be raised, chased and
escalated but never finished.
"""
from __future__ import annotations

import json
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

HERMES = Path.home() / ".local" / "bin" / "hermes"
HERMES_HOME = Path(os.environ.get("HERMES_HOME", Path.home() / ".hermes"))
STATUS_FILE = Path(os.environ.get("HERMES_TRT_BOARD",
                                  HERMES_HOME / "trt-board.json"))

#: The columns the console shows. Anything else is refused rather than
#: written, so a typo in a request cannot put a ticket in a state the board
#: has no column for.
COLUMNS = ("open", "progress", "waiting", "resolved")


class BoardError(RuntimeError):
    pass


def _load() -> dict:
    try:
        data = json.loads(STATUS_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:  # noqa: BLE001 - missing or corrupt means no overrides
        return {}


def _save(data: dict) -> None:
    STATUS_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATUS_FILE.write_text(json.dumps(data, indent=2, sort_keys=True),
                           encoding="utf-8")


def overlay() -> dict:
    """Every ticket a person has moved, and where they moved it to."""
    return _load()


def _run(args: list[str], timeout: int = 30) -> tuple[bool, str]:
    try:
        proc = subprocess.run([str(HERMES), *args], capture_output=True,
                              text=True, timeout=timeout)
        return proc.returncode == 0, (proc.stderr or proc.stdout).strip()
    except Exception as err:  # noqa: BLE001
        return False, str(err)


def _close_deadlines(ticket_id: str) -> int:
    """Mark this ticket's tracked obligations done.

    Without this a resolved ticket keeps its clock running and the daily
    sweep escalates work that somebody already finished.
    """
    try:
        from hermes_trt.store import DeadlineStore
        store = DeadlineStore()
        closed = 0
        for d in store.open_deadlines():
            if d.ticket_id == ticket_id:
                store.mark_complete(ticket_id, d.rule_key)
                closed += 1
        return closed
    except Exception:  # noqa: BLE001 - a ticket must still move if this fails
        return 0


def set_status(ticket_id: str, status: str, who: str = "") -> dict:
    """Move a ticket to a column.

    Returns what actually happened, including the parts that failed. A
    caller must be able to tell "moved, but the deadline is still running"
    from "moved cleanly" - reporting success for a partial write is how a
    chased deadline ends up escalating after someone closed it.
    """
    status = (status or "").strip().lower()
    if status not in COLUMNS:
        raise BoardError(f"unknown column {status!r}; expected one of "
                         f"{', '.join(COLUMNS)}")
    if not ticket_id.strip():
        raise BoardError("no ticket id")

    data = _load()
    data[ticket_id] = {
        "st": status,
        "at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "by": who or "someone",
    }
    _save(data)

    result = {"id": ticket_id, "status": status, "deadlines_closed": 0,
              "hermes": "not attempted", "warnings": []}

    # Mirror into Hermes where it has a matching notion, so the two do not
    # drift for anyone reading the board directly.
    if status == "resolved":
        result["deadlines_closed"] = _close_deadlines(ticket_id)
        ok, msg = _run(["kanban", "complete", ticket_id])
        result["hermes"] = "completed" if ok else f"complete failed: {msg[:120]}"
        if not ok:
            result["warnings"].append("Hermes still shows this task as open.")
    elif status == "waiting":
        ok, msg = _run(["kanban", "block", ticket_id, "Waiting on the client"])
        result["hermes"] = "blocked" if ok else f"block failed: {msg[:120]}"
    elif status == "open":
        # Only meaningful coming back from blocked; harmless otherwise.
        ok, _ = _run(["kanban", "unblock", ticket_id])
        result["hermes"] = "unblocked" if ok else "no change needed"
    else:
        # `in progress` is a person picking work up. Hermes' running state
        # means an agent claimed it, which is not the same thing and must
        # not be faked - agent execution is off in this deployment.
        result["hermes"] = "workflow only"

    return result


def status_of(ticket_id: str, hermes_status: str, mapped: str) -> str:
    """Where this ticket sits, preferring what a person chose."""
    rec = _load().get(ticket_id)
    if rec and rec.get("st") in COLUMNS:
        return rec["st"]
    return mapped


def moved_by(ticket_id: str) -> Optional[dict]:
    return _load().get(ticket_id)
