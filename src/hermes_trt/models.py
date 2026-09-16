"""Domain types for the TRT Australia operations assistant.

Terminology follows the client's own: they say "client", never "patient".
Their disclaimer states they facilitate access to practitioners and are not
themselves the clinical provider, so the wording is deliberate. See
docs/FINDINGS-client-systems.md.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class Route(str, Enum):
    """Where a message should go.

    HUMAN is not a failure mode. It is the correct answer whenever the
    request needs clinical judgement, or whenever the classifier is not
    confident. Hermes coordinates work; it does not make clinical decisions.
    """

    PHYSICIAN = "physician"      # clinical evaluations, results review
    NURSING = "nursing"          # client consultations about existing care
    SUPPORT = "support"          # admin, billing, process questions
    HUMAN = "human"              # needs a person to decide - clinical or unclear
    IGNORE = "ignore"            # newsletters, autoresponders, noise


class Priority(str, Enum):
    URGENT = "urgent"
    NORMAL = "normal"
    LOW = "low"
    NONE = "none"                # only valid alongside Route.IGNORE


#: Routes that must never be produced by the model alone. Anything the
#: classifier marks as clinically loaded is forced to HUMAN regardless of
#: what it proposed - see classify.apply_safety_rules.
CLINICAL_ROUTES = frozenset({Route.PHYSICIAN})


@dataclass(frozen=True)
class InboundMessage:
    """A message arriving from email or Slack, before any interpretation."""

    id: str
    sender: str
    subject: str
    body: str
    attachments: tuple[str, ...] = ()
    source: str = "email"        # "email" | "slack"

    def as_prompt_block(self) -> str:
        """Render for the classifier prompt. Kept separate from __str__ so
        the prompt format can change without affecting logging."""
        attach = ", ".join(self.attachments) if self.attachments else "(none)"
        return (
            f"From: {self.sender}\n"
            f"Subject: {self.subject}\n"
            f"Attachments: {attach}\n"
            f"Body:\n{self.body}"
        )


@dataclass
class RoutingDecision:
    """What the classifier concluded, plus why.

    `reason` is stored on the ticket so a human reviewing the queue can see
    the agent's reasoning without re-running anything. That is part of the
    audit-logging commitment in the solution design.
    """

    route: Route
    priority: Priority
    reason: str
    confidence: float                       # 0.0 - 1.0 as reported by the model
    summary: str = ""                       # one-line ticket title
    client_name: Optional[str] = None       # if identifiable from the message
    safety_override: Optional[str] = None    # set when a rule overrode the model
    raw: dict = field(default_factory=dict, repr=False)

    @property
    def needs_human(self) -> bool:
        return self.route is Route.HUMAN

    @property
    def creates_ticket(self) -> bool:
        return self.route is not Route.IGNORE
