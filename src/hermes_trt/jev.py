"""Classify with Jev (TypeSafe System One) instead of a chat model.

Jev answers structured questions: pick from a list, score on a scale, or give
the probability a statement is true. It does not generate text. That is the
whole point - the shape of the answer is guaranteed rather than requested,
so there is no JSON to coax out of prose and nothing to fail parsing.

It also means Jev CANNOT do two things the Gemini classifier does today:
write a one-line ticket title, and pull a client's name out of the message.
Those are generative. See `summary` and `client_name` below for how that is
handled and what it costs.

Drop-in by design: this returns the same RoutingDecision the Gemini path
returns, and ends with the same `apply_safety_rules` call. The deterministic
clinical override is model-independent and does not change.
"""
from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from pathlib import Path
from typing import Optional

from . import clients
from .classify import apply_safety_rules
from .models import InboundMessage, Priority, RoutingDecision, Route

ENDPOINT = "https://api.typesafe.ai/v1/systemone"
MODEL = os.environ.get("TYPESAFE_MODEL", "jev-latest")
HERMES_HOME = Path(os.environ.get("HERMES_HOME", Path.home() / ".hermes"))
ENV_FILE = HERMES_HOME / ".env"

#: Above this, treat the message as reporting a symptom regardless of what
#: the department question said. Deliberately low: this is a second net under
#: the regex rules, and the cost of catching one too many is a person reading
#: an ordinary email. The cost of missing one is the opposite.
SYMPTOM_THRESHOLD = 0.40


class JevUnavailable(RuntimeError):
    """The provider could not be reached, or refused the call.

    Raised rather than returning a guess: a message that was never assessed
    must not produce a ticket with an invented route.
    """


def _key() -> str:
    key = os.environ.get("TYPESAFE_API_KEY", "")
    if key:
        return key
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8", errors="replace").splitlines():
            if line.startswith("TYPESAFE_API_KEY="):
                key = line.split("=", 1)[1].strip().strip("'\"")
    return key


# The criteria text is the prompt. Jev scores each option against its
# description, so these are written as what the option covers, not as
# instructions to a chat model.
QUESTIONS = {
    "department": {
        "type": "choice",
        "instructions": "Which part of a telehealth clinic should handle this request?",
        "criteria": {
            "physician": "Clinical evaluation, reviewing pathology results, "
                         "decisions about dose or treatment",
            "nursing": "Consultation about existing care, chasing outstanding "
                       "bloods, injection technique, follow-up appointments",
            "support": "Administrative: billing, membership, deliveries, "
                       "address changes, account questions",
            "human": "Needs a qualified person to decide, or the request is "
                     "unclear or cannot be placed",
            "ignore": "Newsletter, automated notification, delivery receipt or "
                      "other noise that is not a request",
        },
    },
    "priority": {
        "type": "choice",
        "instructions": "How quickly does this need attention?",
        "criteria": {
            "urgent": "Someone could come to harm if this waits",
            "high": "Time-sensitive but not a safety issue",
            "normal": "Routine request with no particular deadline",
            "low": "No deadline; informational",
        },
    },
    "reports_symptom": {
        "type": "noul",
        "instructions": "The sender is describing a physical symptom they are "
                        "experiencing, or asking whether to stop, pause or "
                        "change their treatment.",
    },
}


def _call(state: str, timeout: int = 30) -> dict:
    key = _key()
    if not key:
        raise JevUnavailable("TYPESAFE_API_KEY is not set")

    body = json.dumps({"state": state, "model": MODEL,
                       "questions": QUESTIONS}).encode()
    req = urllib.request.Request(ENDPOINT, data=body, method="POST", headers={
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", "replace")[:200]
        raise JevUnavailable(f"HTTP {err.code}: {detail}") from err
    except Exception as err:  # noqa: BLE001
        raise JevUnavailable(str(err)) from err


#: A title is cut at a sentence end, not a character count. Truncating at 80
#: produced "...twelve-week review? He's", which reads as broken rather than
#: shortened.
_SENTENCE_END = re.compile(r"(?<=[.!?])\s+")


def _title(message: InboundMessage) -> str:
    """A ticket title, without a generative model.

    Gemini rewrote the message into a summary. Jev cannot, so the first
    sentence is used instead. Less polished than a paraphrase, but it is the
    sender's own words, which on a clinical ticket is worth more than style.
    """
    subject = (message.subject or "").strip()
    text = subject if subject.lower() not in ("", "(no subject)", "(no text)") else ""
    if not text:
        text = next((ln.strip() for ln in message.body.splitlines() if ln.strip()), "")
    if not text:
        return "(no subject)"

    first = _SENTENCE_END.split(text, maxsplit=1)[0].strip()
    if len(first) <= 90:
        return first
    # One very long sentence: fall back to a word boundary rather than
    # cutting mid-word.
    cut = first[:87]
    if " " in cut:
        cut = cut[:cut.rfind(" ")]
    return cut + "..."


def classify(message: InboundMessage, cfg=None) -> RoutingDecision:
    """Route a message with Jev, then apply the same safety rules."""
    out = _call(message.as_prompt_block())
    answers = out.get("answers", {})

    dep = answers.get("department", {})
    pri = answers.get("priority", {})
    sym = answers.get("reports_symptom", {})

    route = _coerce(dep.get("choice"), Route, Route.HUMAN)
    priority = _coerce(pri.get("choice"), Priority, Priority.NORMAL)
    symptom_p = float(sym.get("noul") or 0.0)

    reason_bits = [
        f"Jev routed to {route.value} "
        f"(confidence {float(dep.get('confidence') or 0):.2f})."
    ]

    # Jev's own read of the clinical question, before the regex rules run.
    # Two independent signals are better than one, and this one is calibrated.
    if symptom_p >= SYMPTOM_THRESHOLD and route is not Route.HUMAN:
        reason_bits.append(
            f"Symptom probability {symptom_p:.2f} at or above "
            f"{SYMPTOM_THRESHOLD} - held for a person."
        )
        route = Route.HUMAN
        priority = Priority.URGENT

    decision = RoutingDecision(
        route=route,
        priority=priority,
        reason=" ".join(reason_bits),
        confidence=float(dep.get("confidence") or 0.0),
        summary=_title(message),
        # Matched against the registry, not generated. An unknown name stays
        # blank rather than being invented onto a clinical record.
        client_name=clients.resolve(message.sender, message.body),
        raw=out,
    )
    # Unchanged, and deliberately so: the deterministic override does not know
    # or care which model produced the decision.
    return apply_safety_rules(decision, message)


def _coerce(value, enum, fallback):
    try:
        return enum((value or "").strip().lower())
    except Exception:  # noqa: BLE001
        return fallback
