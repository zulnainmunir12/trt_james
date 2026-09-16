"""Decide where an inbound message should go.

Two layers, deliberately:

  1. The model proposes a route.
  2. Deterministic rules can override it - always towards a human, never
     away from one.

The second layer exists because prompt instructions are not a control. A
model that is asked nicely not to give clinical advice will occasionally do
it anyway. The safety rules here cannot be talked out of by a cleverly
worded email, because they are not part of the conversation.
"""
from __future__ import annotations

import json
import os
import random
import re
import time
import urllib.error
import urllib.request

from .config import ProviderConfig, load_provider
from .models import InboundMessage, Priority, Route, RoutingDecision

#: Gemini's free tier allows 20 generate_content requests per minute for
#: gemini-3.6-flash. Self-throttle so batch jobs (the eval set, a backlog of
#: unread mail) stay inside it instead of relying on retries to absorb the
#: overflow - retries consume quota too, which turns a small overrun into a
#: cascade. 4s gives 15/min, comfortable headroom. A paid tier can set 0.
MIN_REQUEST_INTERVAL = float(os.environ.get("HERMES_TRT_MIN_INTERVAL", "4.0"))

#: 503 "high demand" is common on newer Gemini models and usually clears in
#: seconds. Retry rather than failing the message.
MAX_RETRIES = 4

#: Gemini's 429 body carries "Please retry in 59.99s". Honouring that is far
#: better than guessing with exponential backoff.
_RETRY_HINT_RE = re.compile(r"retry in ([0-9.]+)s", re.IGNORECASE)

#: Never sleep longer than this on a single retry, even if the server asks
#: for more - a batch job should give up and be rerun, not hang for minutes.
MAX_RETRY_SLEEP = 65.0

_last_request_at = 0.0

# --------------------------------------------------------------------------
# Safety rules
# --------------------------------------------------------------------------

#: Phrases that indicate the sender is describing a physical symptom or
#: asking whether to change/stop treatment. Any hit forces Route.HUMAN.
#:
#: Deliberately broad. A false positive costs one human glance at a ticket.
#: A false negative means an agent answered a medical question, which is the
#: single outcome the solution design forbids outright.
_CLINICAL_SIGNALS = (
    r"\bchest (pain|tight)", r"\bshortness of breath\b", r"\bcan'?t breathe\b",
    r"\bpalpitation", r"\bdizz(y|iness)\b", r"\bfaint(ed|ing)?\b",
    r"\bblood clot\b", r"\bswelling\b", r"\bnumb(ness)?\b",
    r"\bshould i (stop|quit|halt|cease|pause)\b",
    r"\bstop (taking|my|the) (treatment|trt|injection|medication)",
    r"\bside ?effects?\b", r"\breaction\b", r"\ballerg",
    r"\bworried about\b", r"\bis (this|that) (normal|safe|dangerous)\b",
    r"\bemergency\b", r"\bhospital\b", r"\bambulance\b",
)

#: Confidence below this routes to a human regardless of the proposed route.
#: Better a person triages an ambiguous message than the agent guesses.
MIN_CONFIDENCE = 0.70

_CLINICAL_RE = re.compile("|".join(_CLINICAL_SIGNALS), re.IGNORECASE)


def detect_clinical_signal(message: InboundMessage) -> str | None:
    """Return the matched phrase if the message looks clinically loaded."""
    haystack = f"{message.subject}\n{message.body}"
    match = _CLINICAL_RE.search(haystack)
    return match.group(0) if match else None


def apply_safety_rules(
    decision: RoutingDecision, message: InboundMessage
) -> RoutingDecision:
    """Override the model's route where a rule demands it.

    Overrides only ever move *towards* a human. Nothing here can promote a
    message to an automated route.
    """
    signal = detect_clinical_signal(message)
    if signal and decision.route is not Route.HUMAN:
        decision.safety_override = (
            f"Clinical signal {signal!r} detected - forced to human review "
            f"(model proposed {decision.route.value})"
        )
        decision.route = Route.HUMAN
        decision.priority = Priority.URGENT
        return decision

    if decision.confidence < MIN_CONFIDENCE and decision.route not in (
        Route.HUMAN,
        Route.IGNORE,
    ):
        decision.safety_override = (
            f"Confidence {decision.confidence:.2f} below {MIN_CONFIDENCE} - "
            f"forced to human review (model proposed {decision.route.value})"
        )
        decision.route = Route.HUMAN
        return decision

    return decision


# --------------------------------------------------------------------------
# Prompt
# --------------------------------------------------------------------------

SYSTEM_PROMPT = """\
You triage inbound messages for TRT Australia, a telehealth clinic that
coordinates testosterone replacement therapy.

Say "client", never "patient". The company coordinates care; independent
AHPRA-registered doctors make every clinical decision.

Choose exactly one route:

- physician  - results to review, clinical evaluation, anything needing a
               doctor's assessment of a client's condition.
- nursing    - a client asking about their existing care: how to take
               something, what to expect, scheduling a consult.
- support    - administrative: billing, membership changes, how the process
               works, what tests are required, delivery and logistics.
               Checking WHICH markers are present or missing in a panel is
               administrative. Interpreting the VALUES is not.
- human      - anything needing clinical judgement, anything describing
               physical symptoms, any question about stopping or changing
               treatment, or anything you are not confident about.
- ignore     - newsletters, marketing, automated notifications. No ticket.

Rules you must follow:

1. Never give medical advice or interpret a result. You route work; you do
   not answer clinical questions.
2. If a message describes a symptom or asks whether to stop or change
   treatment, choose "human" and priority "urgent", however routine it
   sounds.
3. If you are unsure between two routes, choose "human". Being unsure is a
   valid answer and is preferred over guessing.
4. Report your confidence honestly. Do not inflate it.

Respond with JSON only:
{
  "route": "physician|nursing|support|human|ignore",
  "priority": "urgent|normal|low|none",
  "summary": "one line, max 80 chars, suitable as a ticket title",
  "client_name": "name if stated, else null",
  "reason": "one or two sentences explaining the routing",
  "confidence": 0.0
}"""


def _build_request(message: InboundMessage) -> dict:
    return {
        "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": [{"parts": [{"text": message.as_prompt_block()}]}],
        "generationConfig": {
            # Deterministic: this is classification, not writing. We want the
            # same message to route the same way every time so the eval set
            # means something.
            "temperature": 0.0,
            "responseMimeType": "application/json",
        },
    }


class ProviderUnavailable(RuntimeError):
    """The provider could not be reached or refused the request.

    Distinct from a classification problem: the message was never assessed,
    so it must be retried rather than routed. Callers should leave it in the
    queue, not raise a ticket from it.
    """


def _throttle() -> None:
    """Space requests out to stay inside the free tier's 5/minute."""
    global _last_request_at
    if MIN_REQUEST_INTERVAL <= 0:
        return
    elapsed = time.monotonic() - _last_request_at
    if _last_request_at and elapsed < MIN_REQUEST_INTERVAL:
        time.sleep(MIN_REQUEST_INTERVAL - elapsed)
    _last_request_at = time.monotonic()


def _call_gemini(payload: dict, cfg: ProviderConfig, timeout: int = 60) -> dict:
    body = json.dumps(payload).encode("utf-8")
    last_error = "unknown"

    for attempt in range(MAX_RETRIES):
        _throttle()
        request = urllib.request.Request(
            cfg.endpoint,
            data=body,
            headers={
                "Content-Type": "application/json",
                "x-goog-api-key": cfg.api_key,
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as err:
            detail = err.read().decode("utf-8", errors="replace")[:300]
            last_error = f"HTTP {err.code}: {detail}"
            # 429 = rate limited, 503 = overloaded, 5xx = transient. All
            # worth retrying. A 400 or 403 is our fault and will not improve.
            if err.code not in (429, 500, 502, 503, 504):
                raise ProviderUnavailable(f"Gemini {last_error}") from err
            # A 429 usually names its own cooldown. Waiting exactly that long
            # beats guessing, and stops retries burning more quota.
            hint = _RETRY_HINT_RE.search(detail)
            if hint:
                wait = min(float(hint.group(1)) + 1, MAX_RETRY_SLEEP)
                if attempt < MAX_RETRIES - 1:
                    time.sleep(wait)
                continue
        except (urllib.error.URLError, TimeoutError) as err:
            last_error = str(err)

        if attempt < MAX_RETRIES - 1:
            # Exponential backoff with jitter, so a batch of messages does
            # not retry in lockstep.
            delay = (2 ** attempt) * 5 + random.uniform(0, 3)
            time.sleep(delay)

    raise ProviderUnavailable(
        f"Gemini unavailable after {MAX_RETRIES} attempts. Last: {last_error}"
    )


def _extract_json(response: dict) -> dict:
    """Pull the model's JSON out of the Gemini response envelope."""
    try:
        text = response["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError) as err:
        raise RuntimeError(f"Unexpected Gemini response shape: {response}") from err
    return json.loads(text)


def _coerce(value: str, enum_cls, fallback):
    try:
        return enum_cls(value)
    except ValueError:
        return fallback


def classify(
    message: InboundMessage, cfg: ProviderConfig | None = None
) -> RoutingDecision:
    """Route one message. Safety rules are applied before returning."""
    cfg = cfg or load_provider()
    raw = _extract_json(_call_gemini(_build_request(message), cfg))

    decision = RoutingDecision(
        # An unrecognised route is treated as "unsure", not as a crash.
        route=_coerce(raw.get("route", ""), Route, Route.HUMAN),
        priority=_coerce(raw.get("priority", ""), Priority, Priority.NORMAL),
        reason=raw.get("reason", ""),
        confidence=float(raw.get("confidence", 0.0)),
        summary=(raw.get("summary") or "").strip()[:80],
        client_name=raw.get("client_name") or None,
        raw=raw,
    )
    return apply_safety_rules(decision, message)
