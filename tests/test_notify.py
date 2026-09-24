"""Guards on how escalations are delivered.

The delivery path is the one part of the SLA sweep with no visible output
when it goes wrong: a failed send still leaves a tidy-looking report. These
tests pin the shape of the call and the honesty of what it reports back.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from hermes_trt import notify  # noqa: E402


@pytest.fixture(autouse=True)
def _isolate(tmp_path, monkeypatch):
    """Keep every test off the real config and the real alert log.

    HERMES_HOME matters as much as the env var: escalation_target() falls
    back to reading ~/.hermes/.env, because cron runners exec Python
    directly and nothing loads that file into the environment. Without
    pointing HOME somewhere empty, these tests would read the machine's
    real configuration - and on a configured machine, post to the clinic's
    Slack channel.
    """
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / "hermes-home"))
    monkeypatch.setenv("HERMES_TRT_ALERT_LOG", str(tmp_path / "alerts.log"))
    monkeypatch.delenv("HERMES_TRT_ESCALATION_TARGET", raising=False)


def test_target_is_passed_as_a_flag_not_a_positional(monkeypatch):
    """`hermes send` takes ONE positional - the message.

    Passing the target positionally makes argparse reject the whole call,
    which surfaces as a delivery failure rather than a bad invocation. That
    bug shipped, and was only found when a target was configured for the
    first time.
    """
    seen: dict = {}

    class Result:
        returncode = 0
        stdout = ""
        stderr = ""

    def fake_run(cmd, **kwargs):
        seen["cmd"] = cmd
        return Result()

    monkeypatch.setattr(notify.subprocess, "run", fake_run)
    delivery = notify.send_alert("subject", "body", target="slack:C123")

    assert delivery.delivered
    cmd = seen["cmd"]
    assert cmd[1] == "send"
    assert "-t" in cmd, f"target must be passed with -t, got: {cmd}"
    assert cmd[cmd.index("-t") + 1] == "slack:C123"
    # Exactly one positional after the flags: the message itself.
    assert cmd[-1] == "subject\n\nbody"


def test_no_target_falls_back_to_a_file_and_says_so(tmp_path):
    delivery = notify.send_alert("subject", "body")

    assert not delivery.delivered
    assert delivery.target == "local file"
    assert "no escalation target configured" in delivery.detail
    # The alert itself must survive, or the escalation is simply lost.
    log = Path(os.environ["HERMES_TRT_ALERT_LOG"])
    assert log.exists() and "body" in log.read_text(encoding="utf-8")


def test_a_failed_send_is_reported_as_failed_and_still_logged(monkeypatch):
    """A report claiming an escalation went out when nobody got it is worse
    than no report at all."""

    class Result:
        returncode = 1
        stdout = ""
        stderr = "channel_not_found"

    monkeypatch.setattr(notify.subprocess, "run", lambda cmd, **kw: Result())
    delivery = notify.send_alert("subject", "body", target="slack:C404")

    assert not delivery.delivered
    assert "channel_not_found" in delivery.detail
    assert "NOT DELIVERED" in delivery.describe()
    log = Path(os.environ["HERMES_TRT_ALERT_LOG"])
    assert log.exists() and "body" in log.read_text(encoding="utf-8")


def test_config_is_read_at_call_time(monkeypatch):
    """Reading the target into a module constant freezes it at import, which
    makes it untestable and surprising to configure."""
    assert notify.escalation_target() == ""
    monkeypatch.setenv("HERMES_TRT_ESCALATION_TARGET", "slack:C999")
    assert notify.escalation_target() == "slack:C999"


def test_target_is_read_from_the_env_file_when_not_in_the_environment(tmp_path,
                                                                     monkeypatch):
    """Cron runners exec Python directly, so nothing loads .env into the
    process. Reading only os.environ meant every scheduled escalation saw an
    empty target and fell back to a log file that nobody reads - the sweep
    ran daily and no one was ever told."""
    home = tmp_path / "hermes-home"
    home.mkdir()
    (home / ".env").write_text(
        "# a commented template line must not win\n"
        "# HERMES_TRT_ESCALATION_TARGET=\n"
        "HERMES_TRT_ESCALATION_TARGET=slack:C0DEADBEEF\n",
        encoding="utf-8")
    monkeypatch.setenv("HERMES_HOME", str(home))
    monkeypatch.delenv("HERMES_TRT_ESCALATION_TARGET", raising=False)

    assert notify.escalation_target() == "slack:C0DEADBEEF"


def test_the_environment_still_wins_over_the_file(tmp_path, monkeypatch):
    home = tmp_path / "hermes-home"
    home.mkdir()
    (home / ".env").write_text(
        "HERMES_TRT_ESCALATION_TARGET=slack:CFROMFILE\n", encoding="utf-8")
    monkeypatch.setenv("HERMES_HOME", str(home))
    monkeypatch.setenv("HERMES_TRT_ESCALATION_TARGET", "slack:CFROMENV")

    assert notify.escalation_target() == "slack:CFROMENV"
