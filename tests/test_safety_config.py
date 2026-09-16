"""Guard the safety-critical Hermes configuration.

These test the live ~/.hermes/config.yaml rather than our own code, because
the failure they guard against is a config regression - a `hermes update`,
a re-run of `hermes setup`, or someone toggling Orchestration in the
dashboard.

See docs/INCIDENT-auto-decomposer.md. On 16 September 2026 the autonomous
dispatcher picked up a triaged clinical ticket and spawned a worker to draft
medical advice. It was stopped by a quota limit, not by us.
"""
from __future__ import annotations

import os
import re
from pathlib import Path

import pytest

CONFIG = Path(os.environ.get("HERMES_HOME", Path.home() / ".hermes")) / "config.yaml"

pytestmark = pytest.mark.skipif(
    not CONFIG.exists(),
    reason=f"No Hermes install at {CONFIG} - CI without Hermes skips these",
)


def read_config() -> str:
    return CONFIG.read_text(encoding="utf-8")


def setting(name: str) -> str | None:
    """Return the value of a top-level-ish YAML key, or None if absent."""
    match = re.search(rf"^\s*{re.escape(name)}:\s*(\S+)", read_config(), re.MULTILINE)
    return match.group(1).strip() if match else None


def test_gateway_dispatcher_is_disabled():
    """The dispatcher claims tasks and spawns workers to act on them.

    With it on, routing a message to 'a human decides' is not a control -
    something else picks the ticket up and works it.
    """
    assert setting("dispatch_in_gateway") == "false", (
        "kanban.dispatch_in_gateway must be false. With it enabled Hermes "
        "claims triaged tickets and spawns workers to act on them. "
        "Run setup/disable-auto-orchestration.sh"
    )


def test_auto_decompose_is_disabled():
    """auto_decompose invented 'draft urgent clinical response' tasks from a
    ticket we had deliberately parked for a human."""
    assert setting("auto_decompose") == "false", (
        "kanban.auto_decompose must be false. It generated clinical-advice "
        "tasks from a triaged ticket. Run setup/disable-auto-orchestration.sh"
    )


def test_telemetry_is_off():
    """Client health information must not leave the client's infrastructure."""
    config = read_config()
    block = re.search(r"^telemetry:(.*?)^\S", config, re.MULTILINE | re.DOTALL)
    assert block, "no telemetry block found in config.yaml"
    assert "enabled: false" in block.group(1), (
        "telemetry.shared_metrics.enabled must be false - this deployment "
        "handles health information"
    )


def profile_configs() -> list[tuple[str, Path]]:
    """Every profile's config, including the default."""
    configs = [("default", CONFIG)]
    profiles_dir = CONFIG.parent / "profiles"
    if profiles_dir.is_dir():
        configs += [
            (d.name, d / "config.yaml")
            for d in sorted(profiles_dir.iterdir())
            if (d / "config.yaml").exists()
        ]
    return configs


def test_every_profile_has_dispatch_disabled():
    """`profile create --clone` inherits our hardened config, but a profile
    made any other way gets Hermes' defaults - which are autonomous.

    Each role profile is an assignee on the board. If one could dispatch,
    assigning a clinical ticket to 'physician' would spawn an agent to do
    the clinical work. That is the incident, through the back door.
    """
    unsafe = []
    for name, path in profile_configs():
        text = path.read_text(encoding="utf-8")
        dispatch = re.search(r"dispatch_in_gateway:\s*(\w+)", text)
        decompose = re.search(r"auto_decompose:\s*(\w+)", text)
        if not dispatch or dispatch.group(1) != "false":
            unsafe.append(f"{name}: dispatch_in_gateway="
                          f"{dispatch.group(1) if dispatch else 'UNSET'}")
        if not decompose or decompose.group(1) != "false":
            unsafe.append(f"{name}: auto_decompose="
                          f"{decompose.group(1) if decompose else 'UNSET'}")

    assert not unsafe, (
        "These profiles can dispatch autonomously: " + "; ".join(unsafe)
        + ". Run setup/disable-auto-orchestration.sh, then "
          "setup/audit-profile-safety.sh"
    )


def test_config_records_why_dispatch_is_off():
    """A future maintainer flipping this back should see the reason first.

    A bare `false` invites someone to 'fix' it.
    """
    config = read_config()
    kanban = re.search(r"^kanban:(.*?)^\S", config, re.MULTILINE | re.DOTALL)
    assert kanban, "no kanban block found"
    assert "SAFETY" in kanban.group(1), (
        "the kanban block must carry the safety note explaining why "
        "autonomous dispatch is disabled"
    )
