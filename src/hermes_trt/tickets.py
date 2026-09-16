"""Create and inspect tickets on Hermes' kanban board.

Thin wrapper over the `hermes kanban` CLI rather than the SQLite file
directly: the schema is Hermes' to change, the CLI is its contract. A
subprocess per ticket is cheap compared with an inbound email.

Routing maps to kanban assignees. Route.HUMAN uses --triage, which is
kanban's own "park this for a person to look at" state - exactly the
behaviour we need when the classifier is unsure.
"""
from __future__ import annotations

import os
import re
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from .models import InboundMessage, Priority, Route, RoutingDecision

HERMES_BIN = Path(
    os.environ.get("HERMES_BIN", Path.home() / ".local" / "bin" / "hermes")
)

#: Which kanban assignee handles each route. These are profile names; until
#: the client gives us their staff roster these are placeholders and the
#: tickets land unassigned in triage.
ROUTE_ASSIGNEES: dict[Route, Optional[str]] = {
    Route.PHYSICIAN: None,   # awaiting real profiles - see OPEN-QUESTIONS #5
    Route.NURSING: None,
    Route.SUPPORT: None,
    Route.HUMAN: None,
}

#: The SLA rule that starts ticking when a ticket of each route is created.
ROUTE_RESPONSE_RULE: dict[Route, str] = {
    Route.PHYSICIAN: "physician_response",
    Route.NURSING: "nursing_response",
    Route.SUPPORT: "support_response",
}

#: kanban's --priority is an integer tiebreaker, and it sorts
#: `ORDER BY priority DESC` - so HIGHER is handled first. That is the
#: opposite of the usual convention, hence the explicit map.
PRIORITY_VALUES: dict[Priority, int] = {
    Priority.URGENT: 100,
    Priority.NORMAL: 50,
    Priority.LOW: 10,
    Priority.NONE: 0,
}

_TICKET_ID_RE = re.compile(r"\b(t_[0-9a-f]+)\b")


class TicketError(RuntimeError):
    pass


@dataclass
class Ticket:
    id: str
    title: str
    route: Route


def _run(args: list[str], timeout: int = 120) -> str:
    if not HERMES_BIN.exists() and not shutil.which(str(HERMES_BIN)):
        raise TicketError(f"hermes binary not found at {HERMES_BIN}")
    proc = subprocess.run(
        [str(HERMES_BIN), "kanban", *args],
        capture_output=True, text=True, timeout=timeout,
    )
    if proc.returncode != 0:
        raise TicketError(
            f"hermes kanban {' '.join(args)} failed ({proc.returncode}): "
            f"{proc.stderr.strip() or proc.stdout.strip()}"
        )
    return proc.stdout


def _body_for(message: InboundMessage, decision: RoutingDecision) -> str:
    """The opening post on the ticket.

    Includes the agent's reasoning so a human reviewing the queue can see
    why it landed here without re-running anything - part of the audit
    commitment in the solution design.
    """
    lines = [
        f"From: {message.sender}",
        f"Source: {message.source}",
        f"Subject: {message.subject}",
        "",
        message.body.strip(),
        "",
        "--- Hermes triage ---",
        f"Route: {decision.route.value}",
        f"Priority: {decision.priority.value}",
        f"Confidence: {decision.confidence:.2f}",
        f"Reason: {decision.reason}",
    ]
    if decision.client_name:
        lines.append(f"Client: {decision.client_name}")
    if message.attachments:
        lines.append(f"Attachments: {', '.join(message.attachments)}")
    if decision.safety_override:
        lines.append("")
        lines.append(f"SAFETY OVERRIDE: {decision.safety_override}")
    lines.append("")
    lines.append(
        "Hermes routed this ticket. It has not assessed anything clinical."
    )
    return "\n".join(lines)


def create_ticket(
    message: InboundMessage, decision: RoutingDecision
) -> Optional[Ticket]:
    """Raise a ticket for a routed message. Returns None for Route.IGNORE.

    Uses the message id as an idempotency key so re-processing the same
    email (the gateway polls every 15s) returns the existing ticket instead
    of raising a duplicate.
    """
    if not decision.creates_ticket:
        return None

    title = decision.summary or message.subject or "(no subject)"
    args = [
        "create", title,
        "--body", _body_for(message, decision),
        "--priority", str(PRIORITY_VALUES[decision.priority]),
        "--idempotency-key", f"msg:{message.id}",
        "--created-by", "hermes-triage",
    ]

    # HUMAN means "a person must decide". kanban's triage state is exactly
    # that: parked, not assigned, waiting for someone to look.
    if decision.needs_human:
        args.append("--triage")
    else:
        assignee = ROUTE_ASSIGNEES.get(decision.route)
        if assignee:
            args.extend(["--assignee", assignee])

    output = _run(args)
    match = _TICKET_ID_RE.search(output)
    if not match:
        raise TicketError(f"Could not parse a ticket id from: {output!r}")
    return Ticket(id=match.group(1), title=title, route=decision.route)


def comment(ticket_id: str, text: str) -> None:
    _run(["comment", ticket_id, text])


def list_open() -> str:
    return _run(["list"])
