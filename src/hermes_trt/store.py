"""Durable store for tracked deadlines.

Hermes' kanban board holds the work; this holds the clock. They are kept
separate deliberately:

  - kanban.db belongs to Hermes and is rewritten by `hermes update`.
  - Deadlines are client-specific compliance data we must not lose.

Every state change is appended to an events table rather than only mutating
the row. The solution design commits to "every transaction, decision path,
and systemic action captured in immutable audit logs", and an escalation
that cannot be reconstructed afterwards does not meet that.
"""
from __future__ import annotations

import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Iterator, Optional

from .sla import Deadline, SLAStatus, parse_date

DEFAULT_DB = Path(
    os.environ.get("HERMES_TRT_DB", Path.home() / ".hermes" / "trt-sla.db")
)

SCHEMA = """
CREATE TABLE IF NOT EXISTS deadlines (
    ticket_id     TEXT NOT NULL,
    rule_key      TEXT NOT NULL,
    client_ref    TEXT NOT NULL,
    trigger_date  TEXT NOT NULL,
    due_date      TEXT NOT NULL,
    completed     INTEGER NOT NULL DEFAULT 0,
    escalated     INTEGER NOT NULL DEFAULT 0,
    note          TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL,
    PRIMARY KEY (ticket_id, rule_key)
);

CREATE INDEX IF NOT EXISTS idx_deadlines_due
    ON deadlines (completed, due_date);

-- Append-only. Nothing in this application updates or deletes from here.
CREATE TABLE IF NOT EXISTS events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    at         TEXT NOT NULL,
    ticket_id  TEXT NOT NULL,
    rule_key   TEXT NOT NULL,
    event      TEXT NOT NULL,
    detail     TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_events_ticket ON events (ticket_id);
"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class DeadlineStore:
    def __init__(self, path: Path | str = DEFAULT_DB):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.executescript(SCHEMA)

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    # -- writes -----------------------------------------------------------

    def add(self, deadline: Deadline) -> bool:
        """Track a deadline. Returns False if this ticket+rule already exists.

        Idempotent on purpose: the daily job and the classifier may both try
        to register the same deadline, and duplicate escalations for one
        client would erode trust in the alerts fast.
        """
        with self._connect() as conn:
            existing = conn.execute(
                "SELECT 1 FROM deadlines WHERE ticket_id=? AND rule_key=?",
                (deadline.ticket_id, deadline.rule_key),
            ).fetchone()
            if existing:
                return False
            conn.execute(
                "INSERT INTO deadlines (ticket_id, rule_key, client_ref, "
                "trigger_date, due_date, completed, escalated, note, created_at) "
                "VALUES (?,?,?,?,?,?,?,?,?)",
                (
                    deadline.ticket_id, deadline.rule_key, deadline.client_ref,
                    deadline.trigger_date.isoformat(), deadline.due_date.isoformat(),
                    int(deadline.completed), int(deadline.escalated),
                    deadline.note, _now(),
                ),
            )
            self._log(conn, deadline.ticket_id, deadline.rule_key, "tracked", {
                "client_ref": deadline.client_ref,
                "due_date": deadline.due_date.isoformat(),
            })
        return True

    def mark_complete(self, ticket_id: str, rule_key: str) -> None:
        with self._connect() as conn:
            conn.execute(
                "UPDATE deadlines SET completed=1 WHERE ticket_id=? AND rule_key=?",
                (ticket_id, rule_key),
            )
            self._log(conn, ticket_id, rule_key, "completed", {})

    def mark_escalated(self, ticket_id: str, rule_key: str, detail: dict) -> None:
        with self._connect() as conn:
            conn.execute(
                "UPDATE deadlines SET escalated=1 WHERE ticket_id=? AND rule_key=?",
                (ticket_id, rule_key),
            )
            self._log(conn, ticket_id, rule_key, "escalated", detail)

    def _log(self, conn, ticket_id: str, rule_key: str, event: str,
             detail: dict) -> None:
        conn.execute(
            "INSERT INTO events (at, ticket_id, rule_key, event, detail) "
            "VALUES (?,?,?,?,?)",
            (_now(), ticket_id, rule_key, event, json.dumps(detail, default=str)),
        )

    # -- reads ------------------------------------------------------------

    def _row_to_deadline(self, row: sqlite3.Row) -> Deadline:
        return Deadline(
            ticket_id=row["ticket_id"],
            rule_key=row["rule_key"],
            client_ref=row["client_ref"],
            trigger_date=parse_date(row["trigger_date"]),
            due_date=parse_date(row["due_date"]),
            completed=bool(row["completed"]),
            escalated=bool(row["escalated"]),
            note=row["note"],
        )

    def open_deadlines(self) -> list[Deadline]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM deadlines WHERE completed=0 ORDER BY due_date"
            ).fetchall()
        return [self._row_to_deadline(r) for r in rows]

    def needing_attention(
        self, today: Optional[date] = None
    ) -> tuple[list[Deadline], list[Deadline]]:
        """Return (due_soon, overdue) - the two lists the daily job acts on."""
        due_soon, overdue = [], []
        for deadline in self.open_deadlines():
            status = deadline.status(today)
            if status is SLAStatus.OVERDUE:
                overdue.append(deadline)
            elif status is SLAStatus.DUE_SOON:
                due_soon.append(deadline)
        return due_soon, overdue

    def events_for(self, ticket_id: str) -> list[dict]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM events WHERE ticket_id=? ORDER BY id", (ticket_id,)
            ).fetchall()
        return [dict(r) for r in rows]
