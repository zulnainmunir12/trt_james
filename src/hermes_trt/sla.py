"""SLA rules: when work is due, and when to escalate.

Hermes' kanban board has no due-date concept, so deadlines live here.

The four rules below come from TRT Australia's own published copy, not from
our assumptions - each one cites where it came from so the client can check
it. They still need the owner's sign-off before go-live; see
docs/OPEN-QUESTIONS.md.

Deliberately data, not code: the client will want to change these, and they
should not need a developer to do it.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from enum import Enum
from typing import Optional


class SLAStatus(str, Enum):
    OK = "ok"                # comfortably ahead of the deadline
    DUE_SOON = "due_soon"    # inside the warning window - nudge the assignee
    OVERDUE = "overdue"      # past due - escalate to leadership
    DONE = "done"            # completed, no longer tracked


#: Marks a source string as our invention rather than the client's policy.
PROVISIONAL_MARKER = "PROVISIONAL"


@dataclass(frozen=True)
class SLARule:
    """A deadline that starts from some event and warns before it lands."""

    key: str
    label: str
    days_from_trigger: int
    warn_days_before: int
    trigger: str              # the event the clock starts from
    source: str               # where this rule came from - keep it checkable
    escalate_to: str = "leadership"

    #: True when WE chose the number because the client has not defined it.
    #: Structural rather than a comment on purpose: invented numbers have a
    #: way of quietly becoming agreed numbers once someone has seen a demo.
    #: `assert_no_provisional_rules()` is the gate that stops that.
    provisional: bool = False

    def __post_init__(self) -> None:
        if self.provisional and PROVISIONAL_MARKER not in self.source:
            raise ValueError(
                f"Rule {self.key!r} is provisional but its source does not say so. "
                f"Start the source with {PROVISIONAL_MARKER} so it is obvious "
                f"in every report and log line."
            )

    def due_date(self, trigger_date: date) -> date:
        return trigger_date + timedelta(days=self.days_from_trigger)

    def warn_date(self, trigger_date: date) -> date:
        return self.due_date(trigger_date) - timedelta(days=self.warn_days_before)


#: Derived from the client's published copy. Each carries its source so the
#: owner can verify it rather than take our word for it.
RULES: dict[str, SLARule] = {
    "followup_bloods": SLARule(
        key="followup_bloods",
        label="First follow-up blood work",
        days_from_trigger=56,          # 8 weeks
        warn_days_before=14,
        trigger="treatment_start_date",
        source=(
            'Homepage, "How ongoing care is measured": "Mandatory follow-up '
            'blood work is completed within the first eight weeks of starting '
            'TRT with TRT Australia."'
        ),
    ),
    "results_expiry": SLARule(
        key="results_expiry",
        label="Blood results expire",
        days_from_trigger=120,         # ~4 months
        warn_days_before=21,
        trigger="results_collected_date",
        source=(
            'Blood work and eligibility pages: "Results from the last four '
            'months are accepted."'
        ),
    ),
    "membership_renewal": SLARule(
        key="membership_renewal",
        label="Membership renewal",
        days_from_trigger=90,          # quarterly; six/annual set per client
        warn_days_before=14,
        trigger="membership_start_date",
        source="Membership section: quarterly $240 / six-month $480 / yearly $860.",
    ),
    "loyalty_anniversary": SLARule(
        key="loyalty_anniversary",
        label="Year-1 loyalty rate becomes available",
        days_from_trigger=365,
        warn_days_before=30,
        trigger="membership_start_date",
        source=(
            'Loyalty timeline: "After one full year with TRT Australia, you '
            'will qualify for the $650 annual loyalty rate, ongoing."'
        ),
    ),
}

#: Operational response targets - how fast a ticket should be picked up.
#:
#: THE CLIENT HAS NOT DEFINED THESE. The numbers below are ours, chosen so
#: the pipeline has something to run against during development. They are
#: not a proposal and must not be shown to the client as agreed terms.
#:
#: Replace when they answer the question in docs/OPEN-QUESTIONS.md.
PROVISIONAL_RULES: dict[str, SLARule] = {
    "physician_response": SLARule(
        key="physician_response",
        label="Physician responds to a clinical ticket",
        days_from_trigger=2,
        warn_days_before=1,
        trigger="ticket_created",
        source=f"{PROVISIONAL_MARKER} - our placeholder. Client has not "
               f"defined a physician response target.",
        provisional=True,
    ),
    "nursing_response": SLARule(
        key="nursing_response",
        label="Nursing responds to a client consultation",
        days_from_trigger=2,
        warn_days_before=1,
        trigger="ticket_created",
        source=f"{PROVISIONAL_MARKER} - our placeholder. Client has not "
               f"defined a nursing response target.",
        provisional=True,
    ),
    "support_response": SLARule(
        key="support_response",
        label="Support responds to an administrative ticket",
        days_from_trigger=3,
        warn_days_before=1,
        trigger="ticket_created",
        source=f"{PROVISIONAL_MARKER} - our placeholder. Client has not "
               f"defined a support response target.",
        provisional=True,
    ),
}

#: Everything the tracker can use. Provisional rules are included so the
#: pipeline works end to end, and excluded from production by the gate below.
ALL_RULES: dict[str, SLARule] = {**RULES, **PROVISIONAL_RULES}


def provisional_rule_keys() -> list[str]:
    """Rules whose numbers we invented. Should be empty before go-live."""
    return sorted(k for k, r in ALL_RULES.items() if r.provisional)


def assert_no_provisional_rules() -> None:
    """Fail loudly if an invented deadline would reach production.

    Call this from deployment checks. A placeholder that ships is worse
    than a missing rule: it looks like an agreed commitment.
    """
    offenders = provisional_rule_keys()
    if offenders:
        raise RuntimeError(
            "Provisional SLA rules are still present and must not ship: "
            + ", ".join(offenders)
            + ". These numbers were chosen by us, not the client. "
              "See docs/OPEN-QUESTIONS.md."
        )


#: Membership terms other than quarterly. Kept separate from RULES because
#: the renewal interval depends on which plan the client is on.
MEMBERSHIP_TERM_DAYS = {"quarter": 90, "six": 182, "annual": 365}


@dataclass
class Deadline:
    """One tracked deadline against one ticket."""

    ticket_id: str
    rule_key: str
    client_ref: str
    trigger_date: date
    due_date: date
    completed: bool = False
    escalated: bool = False
    note: str = ""

    @property
    def rule(self) -> SLARule:
        return ALL_RULES[self.rule_key]

    def status(self, today: Optional[date] = None) -> SLAStatus:
        if self.completed:
            return SLAStatus.DONE
        today = today or date.today()
        if today > self.due_date:
            return SLAStatus.OVERDUE
        if today >= self.due_date - timedelta(days=self.rule.warn_days_before):
            return SLAStatus.DUE_SOON
        return SLAStatus.OK

    def days_remaining(self, today: Optional[date] = None) -> int:
        """Negative once overdue."""
        return (self.due_date - (today or date.today())).days

    def describe(self, today: Optional[date] = None) -> str:
        days = self.days_remaining(today)
        if days < 0:
            timing = f"{abs(days)} day{'s' if abs(days) != 1 else ''} OVERDUE"
        elif days == 0:
            timing = "due TODAY"
        else:
            timing = f"due in {days} day{'s' if days != 1 else ''}"
        return f"[{self.ticket_id}] {self.rule.label} for {self.client_ref} - {timing}"


def build_deadline(
    ticket_id: str, rule_key: str, client_ref: str, trigger_date: date,
    term: Optional[str] = None,
) -> Deadline:
    """Create a deadline from a rule and the date its clock starts.

    `term` applies only to membership rules, where the interval depends on
    the plan the client chose.
    """
    rule = ALL_RULES[rule_key]
    if term and rule_key == "membership_renewal":
        if term not in MEMBERSHIP_TERM_DAYS:
            raise ValueError(
                f"Unknown membership term {term!r}. "
                f"Expected one of {sorted(MEMBERSHIP_TERM_DAYS)}"
            )
        due = trigger_date + timedelta(days=MEMBERSHIP_TERM_DAYS[term])
    else:
        due = rule.due_date(trigger_date)

    return Deadline(
        ticket_id=ticket_id,
        rule_key=rule_key,
        client_ref=client_ref,
        trigger_date=trigger_date,
        due_date=due,
    )


def parse_date(value: str) -> date:
    """Accept ISO dates from config, fixtures and the CLI."""
    return datetime.strptime(value.strip()[:10], "%Y-%m-%d").date()
