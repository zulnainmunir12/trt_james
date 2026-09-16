"""Tests for the deterministic safety layer.

These deliberately do not call the model. The whole point of the safety
rules is that they hold regardless of what the model says, so they must be
testable without it - and they must run in CI without an API key.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from hermes_trt.classify import (  # noqa: E402
    MIN_CONFIDENCE,
    apply_safety_rules,
    detect_clinical_signal,
)
from hermes_trt.models import InboundMessage, Priority, Route, RoutingDecision  # noqa: E402


def make_message(subject: str = "", body: str = "") -> InboundMessage:
    return InboundMessage(id="t", sender="a@example.com", subject=subject, body=body)


def make_decision(
    route: Route = Route.SUPPORT, confidence: float = 0.95
) -> RoutingDecision:
    return RoutingDecision(
        route=route, priority=Priority.NORMAL, reason="test", confidence=confidence
    )


# --- clinical signal detection -------------------------------------------

def test_detects_symptom_in_body():
    msg = make_message(body="I've had chest tightness for two days.")
    assert detect_clinical_signal(msg) is not None


def test_detects_signal_in_subject_not_just_body():
    msg = make_message(subject="Should I stop my treatment?", body="Thanks")
    assert detect_clinical_signal(msg) is not None


def test_ignores_ordinary_admin_message():
    msg = make_message(
        subject="Changing my billing to yearly",
        body="I want to switch from quarterly before my next renewal.",
    )
    assert detect_clinical_signal(msg) is None


def test_detection_is_case_insensitive():
    msg = make_message(body="SHOULD I STOP taking the medication?")
    assert detect_clinical_signal(msg) is not None


# --- override behaviour ---------------------------------------------------

def test_clinical_signal_forces_human_and_urgent():
    msg = make_message(body="Chest pain since starting. Should I stop?")
    result = apply_safety_rules(make_decision(Route.SUPPORT), msg)
    assert result.route is Route.HUMAN
    assert result.priority is Priority.URGENT
    assert result.safety_override is not None


def test_clinical_signal_overrides_even_physician_route():
    """Physician is a legitimate route, but a symptom report needs a person
    now - not a queue a doctor reads later."""
    msg = make_message(body="I'm dizzy and worried about it.")
    result = apply_safety_rules(make_decision(Route.PHYSICIAN), msg)
    assert result.route is Route.HUMAN


def test_low_confidence_forces_human():
    msg = make_message(body="Something about my account maybe")
    result = apply_safety_rules(make_decision(Route.SUPPORT, confidence=0.4), msg)
    assert result.route is Route.HUMAN
    assert "Confidence" in (result.safety_override or "")


def test_confidence_at_threshold_is_allowed_through():
    msg = make_message(body="Please change my billing period.")
    result = apply_safety_rules(
        make_decision(Route.SUPPORT, confidence=MIN_CONFIDENCE), msg
    )
    assert result.route is Route.SUPPORT
    assert result.safety_override is None


def test_low_confidence_does_not_promote_ignore_to_human():
    """A newsletter the model was unsure about is still a newsletter.
    Forcing it to human would flood the queue with marketing email."""
    msg = make_message(subject="Weekly digest", body="Unsubscribe here")
    result = apply_safety_rules(make_decision(Route.IGNORE, confidence=0.3), msg)
    assert result.route is Route.IGNORE


def test_clean_message_is_left_alone():
    msg = make_message(
        subject="Question about my next appointment",
        body="When is my next consult scheduled?",
    )
    result = apply_safety_rules(make_decision(Route.SUPPORT), msg)
    assert result.route is Route.SUPPORT
    assert result.safety_override is None


def test_overrides_never_move_away_from_human():
    """A message already routed to a human must stay there, whatever else
    the rules think."""
    msg = make_message(body="Routine admin question, nothing clinical.")
    result = apply_safety_rules(make_decision(Route.HUMAN, confidence=0.99), msg)
    assert result.route is Route.HUMAN


# --- decision helpers -----------------------------------------------------

def test_ignore_does_not_create_a_ticket():
    assert make_decision(Route.IGNORE).creates_ticket is False


def test_every_other_route_creates_a_ticket():
    for route in (Route.PHYSICIAN, Route.NURSING, Route.SUPPORT, Route.HUMAN):
        assert make_decision(route).creates_ticket is True
