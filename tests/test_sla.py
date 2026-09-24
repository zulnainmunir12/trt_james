"""Tests for deadline arithmetic and the escalation sweep.

No LLM, no network. Dates are injected so the tests do not drift over time -
a test that passes today and fails in three weeks is worse than no test.
"""
from __future__ import annotations

import sys
from datetime import date, timedelta
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from hermes_trt.sla import (  # noqa: E402
    MEMBERSHIP_TERM_DAYS,
    RULES,
    SLAStatus,
    build_deadline,
    parse_date,
)
from hermes_trt.sla_check import run  # noqa: E402
from hermes_trt.store import DeadlineStore  # noqa: E402

START = date(2026, 1, 1)


@pytest.fixture(autouse=True)
def _never_touch_live_state(tmp_path, monkeypatch):
    """Keep every test in this file away from the real system.

    The sweep sends a real alert unless told otherwise, and `send_alert`
    falls back to writing the caller's own ~/.hermes/trt-alerts.log. Running
    this suite on a server created that directory and filled it with
    escalations for the fixture client. Worse, now that the escalation
    target is read from .env rather than only the environment, an
    unguarded test on a configured machine would post fixture alerts into
    the clinic's real Slack channel.

    Applied to the whole file rather than per test, so a new test cannot
    reintroduce the leak by forgetting.
    """
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / "hermes-home"))
    monkeypatch.setenv("HERMES_TRT_ALERT_LOG", str(tmp_path / "alerts.log"))
    monkeypatch.delenv("HERMES_TRT_ESCALATION_TARGET", raising=False)


def make(rule_key="followup_bloods", ticket="t_1", trigger=START, **kw):
    return build_deadline(ticket, rule_key, "client-A", trigger, **kw)


# --- the four published rules --------------------------------------------

def test_followup_bloods_is_eight_weeks():
    """The client's site says 'within the first eight weeks'."""
    assert RULES["followup_bloods"].days_from_trigger == 56
    assert make().due_date == date(2026, 2, 26)


def test_results_expire_after_four_months():
    d = make("results_expiry")
    assert d.due_date == START + timedelta(days=120)


def test_loyalty_anniversary_is_one_year():
    d = make("loyalty_anniversary")
    assert d.due_date == date(2027, 1, 1)


def test_every_rule_cites_its_source():
    """A rule the client cannot trace back to their own copy is one we
    invented, and they cannot sign it off."""
    for rule in RULES.values():
        assert rule.source.strip(), f"{rule.key} has no source"


# --- membership terms -----------------------------------------------------

def test_membership_term_changes_the_due_date():
    quarter = make("membership_renewal", term="quarter")
    annual = make("membership_renewal", term="annual")
    assert quarter.due_date == START + timedelta(days=90)
    assert annual.due_date == START + timedelta(days=365)


def test_unknown_membership_term_is_rejected():
    """Silently defaulting to quarterly would bill a yearly client wrong."""
    try:
        make("membership_renewal", term="monthly")
    except ValueError as err:
        assert "monthly" in str(err)
    else:
        raise AssertionError("expected ValueError for unknown term")


# --- status transitions ---------------------------------------------------

def test_status_ok_well_before_due():
    assert make().status(date(2026, 1, 15)) is SLAStatus.OK


def test_status_due_soon_inside_warning_window():
    # 8-week rule warns 14 days out: due 26 Feb, so 13 Feb onwards.
    assert make().status(date(2026, 2, 13)) is SLAStatus.DUE_SOON


def test_status_still_ok_the_day_before_the_window_opens():
    assert make().status(date(2026, 2, 11)) is SLAStatus.OK


def test_due_date_itself_is_not_yet_overdue():
    """Due today means today, not yesterday."""
    assert make().status(date(2026, 2, 26)) is SLAStatus.DUE_SOON


def test_status_overdue_the_day_after():
    assert make().status(date(2026, 2, 27)) is SLAStatus.OVERDUE


def test_completed_is_never_overdue():
    d = make()
    d.completed = True
    assert d.status(date(2030, 1, 1)) is SLAStatus.DONE


def test_days_remaining_goes_negative_when_overdue():
    assert make().days_remaining(date(2026, 3, 1)) == -3


def test_describe_reads_correctly_when_overdue():
    assert "3 days OVERDUE" in make().describe(date(2026, 3, 1))


def test_describe_handles_singular_day():
    assert "1 day OVERDUE" in make().describe(date(2026, 2, 27))


def test_describe_says_due_today_on_the_day():
    assert "due TODAY" in make().describe(date(2026, 2, 26))


# --- store ----------------------------------------------------------------

def test_store_roundtrip(tmp_path):
    store = DeadlineStore(tmp_path / "sla.db")
    assert store.add(make()) is True
    open_items = store.open_deadlines()
    assert len(open_items) == 1
    assert open_items[0].due_date == date(2026, 2, 26)


def test_adding_the_same_deadline_twice_is_ignored(tmp_path):
    """Two code paths may register the same deadline; the client should not
    get two escalations for it."""
    store = DeadlineStore(tmp_path / "sla.db")
    assert store.add(make()) is True
    assert store.add(make()) is False
    assert len(store.open_deadlines()) == 1


def test_completed_deadlines_drop_out_of_open_list(tmp_path):
    store = DeadlineStore(tmp_path / "sla.db")
    store.add(make())
    store.mark_complete("t_1", "followup_bloods")
    assert store.open_deadlines() == []


def test_every_state_change_is_audited(tmp_path):
    store = DeadlineStore(tmp_path / "sla.db")
    store.add(make())
    store.mark_escalated("t_1", "followup_bloods", {"days_overdue": 3})
    store.mark_complete("t_1", "followup_bloods")
    events = [e["event"] for e in store.events_for("t_1")]
    assert events == ["tracked", "escalated", "completed"]


# --- the daily sweep ------------------------------------------------------

def test_sweep_reports_nothing_when_all_clear(tmp_path):
    store = DeadlineStore(tmp_path / "sla.db")
    store.add(make())
    report, escalated = run(store, date(2026, 1, 10))
    assert escalated == 0
    assert "Nothing due or overdue" in report


def test_sweep_escalates_an_overdue_deadline(tmp_path):
    store = DeadlineStore(tmp_path / "sla.db")
    store.add(make())
    report, escalated = run(store, date(2026, 3, 1))
    assert escalated == 1
    assert "OVERDUE" in report


def test_sweep_does_not_escalate_the_same_ticket_twice(tmp_path):
    """Leadership should hear once. Daily repeats train people to ignore
    the channel.

    notify=False stands in for a successful delivery: the point under test
    is the de-duplication, not the sending.
    """
    store = DeadlineStore(tmp_path / "sla.db")
    store.add(make())
    _, first = run(store, date(2026, 3, 1), notify=False)
    _, second = run(store, date(2026, 3, 2), notify=False)
    assert (first, second) == (1, 0)


def test_failed_delivery_leaves_the_deadline_unescalated(tmp_path, monkeypatch):
    """If nobody received the alert, it must be retried.

    Marking it escalated after a failed send would bury it forever - the
    sweep skips anything already flagged, so the report would say handled
    while no human ever heard about it.
    """
    monkeypatch.setenv("HERMES_TRT_ESCALATION_TARGET", "")
    monkeypatch.setenv("HERMES_TRT_ALERT_LOG", str(tmp_path / "alerts.log"))

    store = DeadlineStore(tmp_path / "sla.db")
    store.add(make())

    report, first = run(store, date(2026, 3, 1))
    assert first == 1
    assert "NOT DELIVERED" in report
    assert "nobody was alerted" in report
    assert store.open_deadlines()[0].escalated is False

    # Still unescalated, so the next sweep tries again.
    _, second = run(store, date(2026, 3, 2))
    assert second == 1


def test_undelivered_alert_is_written_to_the_fallback_log(tmp_path, monkeypatch):
    """A file is not a person, but it means the alert is not silently lost."""
    log = tmp_path / "alerts.log"
    monkeypatch.setenv("HERMES_TRT_ESCALATION_TARGET", "")
    monkeypatch.setenv("HERMES_TRT_ALERT_LOG", str(log))

    store = DeadlineStore(tmp_path / "sla.db")
    store.add(make())
    run(store, date(2026, 3, 1))

    assert log.exists()
    assert "OVERDUE" in log.read_text(encoding="utf-8")


def test_dry_run_records_nothing(tmp_path):
    store = DeadlineStore(tmp_path / "sla.db")
    store.add(make())
    run(store, date(2026, 3, 1), dry_run=True)
    assert store.open_deadlines()[0].escalated is False


def test_sweep_separates_due_soon_from_overdue(tmp_path):
    # notify=False: without it this performs a REAL send_alert. The autouse
    # fixture above keeps that off live state, but a sweep test has no
    # business exercising delivery at all - that belongs in test_notify.
    store = DeadlineStore(tmp_path / "sla.db")
    # t_overdue: started 1 Jan, due 26 Feb - 3 days past on 1 March.
    store.add(make(ticket="t_overdue"))
    # t_soon: started 13 Jan, due 10 March - inside the 14-day window on
    # 1 March, but not yet late.
    store.add(make(ticket="t_soon", trigger=date(2026, 1, 13)))
    report, _ = run(store, date(2026, 3, 1), notify=False)
    assert "OVERDUE (1)" in report
    assert "Due soon (1)" in report


def test_parse_date_accepts_iso_with_time():
    assert parse_date("2026-02-26T10:30:00+05:00") == date(2026, 2, 26)


def test_membership_terms_cover_the_published_plans():
    assert set(MEMBERSHIP_TERM_DAYS) == {"quarter", "six", "annual"}
