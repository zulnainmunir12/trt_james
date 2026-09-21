"""The chain: message in, ticket and deadline out.

    inbound message
        -> classify           (the configured model proposes a route)
        -> safety rules       (deterministic; can only route towards a human)
        -> kanban ticket      (or nothing, if it is noise)
        -> response deadline  (so the daily sweep can chase it)

Deliberately one function you can read top to bottom. The failure
behaviour matters more than the happy path, so each step says what it does
when the step before it went wrong.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import date
from typing import Optional

from .classify import ProviderUnavailable, classify as classify_gemini
from .config import ProviderConfig
from .models import InboundMessage, Route, RoutingDecision
from .sla import build_deadline
from .store import DeadlineStore
from .tickets import Ticket, TicketError, create_ticket


#: Which model proposes the route. Selectable rather than swapped in place,
#: so a bad result can be reverted with an environment variable instead of a
#: deploy, and so both can be compared on the same traffic.
#:
#: The safety rules run after whichever one is chosen and are not affected.
CLASSIFIER = os.environ.get("HERMES_TRT_CLASSIFIER", "gemini").strip().lower()


def _classify(message: InboundMessage, cfg: Optional[ProviderConfig]) -> RoutingDecision:
    if CLASSIFIER == "jev":
        # Imported lazily: the Gemini path must keep working on a machine
        # that has no TypeSafe key and has never installed anything for it.
        from .jev import JevUnavailable, classify as classify_jev
        try:
            return classify_jev(message, cfg)
        except JevUnavailable as err:
            # Same contract as the Gemini path: not assessed, so no ticket.
            raise ProviderUnavailable(str(err)) from err
    return classify_gemini(message, cfg)


@dataclass
class Outcome:
    """What happened to one message. Every field is optional because any
    step can fail without the others being meaningless."""

    message_id: str
    decision: Optional[RoutingDecision] = None
    ticket: Optional[Ticket] = None
    deadline_tracked: bool = False
    error: Optional[str] = None

    @property
    def ok(self) -> bool:
        return self.error is None

    def summary(self) -> str:
        if self.error:
            return f"{self.message_id}: ERROR - {self.error}"
        route = self.decision.route.value if self.decision else "?"
        if self.ticket is None:
            return f"{self.message_id}: {route} - no ticket (ignored)"
        parts = [f"{self.message_id}: {route} -> {self.ticket.id}"]
        if self.deadline_tracked:
            parts.append("deadline tracked")
        if self.decision and self.decision.safety_override:
            parts.append("SAFETY OVERRIDE")
        return " | ".join(parts)


def process(
    message: InboundMessage,
    store: DeadlineStore,
    cfg: Optional[ProviderConfig] = None,
    today: Optional[date] = None,
    dry_run: bool = False,
) -> Outcome:
    """Run one message through the whole chain."""
    outcome = Outcome(message_id=message.id)

    # 1. Classify. If the provider is down the message was never assessed,
    #    so we must NOT raise a ticket guessing at a route - leave it for
    #    the next poll.
    try:
        outcome.decision = _classify(message, cfg)
    except ProviderUnavailable as err:
        outcome.error = f"provider unavailable, message not assessed: {err}"
        return outcome
    except Exception as err:  # noqa: BLE001
        outcome.error = f"classification failed: {err}"
        return outcome

    if dry_run:
        return outcome

    # 2. Ticket. Noise (Route.IGNORE) deliberately produces nothing.
    try:
        outcome.ticket = create_ticket(message, outcome.decision)
    except TicketError as err:
        # The message WAS assessed but we could not record it. That is worse
        # than a classification failure - the work would silently vanish.
        outcome.error = f"ticket creation failed: {err}"
        return outcome

    if outcome.ticket is None:
        return outcome

    # 3. Response deadline, so the daily sweep can chase it.
    #
    #    Route.HUMAN gets no response clock: it is parked in triage awaiting
    #    a person, and we have no agreed target for how fast that should
    #    happen. Inventing one here would be exactly the kind of quiet
    #    placeholder we are trying to avoid.
    from .tickets import ROUTE_RESPONSE_RULE

    rule_key = ROUTE_RESPONSE_RULE.get(outcome.decision.route)
    if rule_key:
        deadline = build_deadline(
            ticket_id=outcome.ticket.id,
            rule_key=rule_key,
            client_ref=outcome.decision.client_name or message.sender,
            trigger_date=today or date.today(),
        )
        outcome.deadline_tracked = store.add(deadline)

    return outcome


def process_all(
    messages: list[InboundMessage],
    store: DeadlineStore,
    cfg: Optional[ProviderConfig] = None,
    today: Optional[date] = None,
) -> list[Outcome]:
    """Process a batch. One bad message must not stop the rest."""
    return [process(m, store, cfg, today) for m in messages]
