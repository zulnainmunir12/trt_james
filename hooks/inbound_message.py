#!/usr/bin/env python3
"""Gateway hook: triage an inbound message instead of chatting back.

Wired to Hermes' `pre_gateway_dispatch`, which fires for every incoming
platform message BEFORE the agent is dispatched. We run our pipeline
(classify -> ticket -> deadline) and then return {"action": "skip"} so
Hermes does not generate a reply of its own.

That skip is a safety control, not an optimisation. If Hermes never
composes a reply to a client, it can never accidentally give clinical
advice. Humans answer clients; Hermes routes the work.

Failure behaviour, deliberately:

  - We ALWAYS skip, even when our own processing fails. Falling through to
    the agent would mean an unsupervised chatbot answering a clinic's
    clients - the exact thing we spent today preventing.
  - Anything we could not process is written to a dead-letter file so it is
    visible rather than silently dropped.

IMPORTANT - why "always skip" is load-bearing rather than belt-and-braces:

Hermes warns at startup that `fail_closed` is IGNORED for this event:

    hooks.pre_gateway_dispatch[0].fail_closed=true will be ignored at
    runtime - fail_closed only applies to blocking-capable events
    (pre_tool_call).

So the platform will NOT stop a message reaching the agent if this hook
crashes, times out, or is killed. The only protection is that this script
prints a skip under every circumstance it can still print at all - hence
the bare excepts, and hence printing the skip from a finally-style path
rather than only on the happy route.

This is a gap worth raising with the client: "no autonomous clinical
decisions" currently depends on our script staying alive, not on a platform
guarantee. A proper fix is either a Hermes feature request, or not
connecting client-facing channels to an agent profile at all.

Payload shapes vary by platform, so extraction is defensive and the raw
payload is recorded for the first runs while we learn the real shape.
"""
from __future__ import annotations

import json
import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "src"))

LOG_DIR = Path.home() / ".hermes" / "trt-hook-logs"
RAW_LOG = LOG_DIR / "raw-payloads.jsonl"
DEAD_LETTER = LOG_DIR / "dead-letter.jsonl"
ACTIVITY = LOG_DIR / "activity.log"


def record(path: Path, obj: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(obj, default=str) + "\n")


def note(text: str) -> None:
    ACTIVITY.parent.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with ACTIVITY.open("a", encoding="utf-8") as fh:
        fh.write(f"{stamp}  {text}\n")


def first(payload: dict, *keys: str, default: str = "") -> str:
    """Pull the first present key, searching one level into nested dicts.

    Platform payloads disagree about naming ('text' vs 'body', 'from' vs
    'sender'), so we look for any of several spellings rather than assume.
    """
    for key in keys:
        if key in payload and payload[key]:
            return str(payload[key])
    for value in payload.values():
        if isinstance(value, dict):
            for key in keys:
                if key in value and value[key]:
                    return str(value[key])
    return default


def extract(payload: dict) -> tuple[str, str, str, str, tuple[str, ...]]:
    message_id = first(payload, "message_id", "id", "event_id",
                       default=f"gw-{datetime.now(timezone.utc):%Y%m%d%H%M%S%f}")
    sender = first(payload, "sender", "from", "user", "user_id", "author",
                   default="unknown")
    subject = first(payload, "subject", "title")
    body = first(payload, "text", "body", "message", "content")
    raw_attachments = payload.get("attachments") or []
    if isinstance(raw_attachments, list):
        attachments = tuple(
            str(a.get("name") if isinstance(a, dict) else a)
            for a in raw_attachments
        )
    else:
        attachments = ()
    return message_id, sender, subject, body, attachments


SKIP = {"action": "skip", "reason": "handled by TRT triage pipeline"}


def main() -> int:
    # Emit the skip FIRST, before any work that could fail, crash or hang.
    # fail_closed does not apply to this event (see module docstring), so a
    # skip we have already written is the only thing that reliably stops the
    # agent replying to a client. Everything after this is best-effort.
    print(json.dumps(SKIP), flush=True)

    skip = SKIP

    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except Exception as err:  # noqa: BLE001
        note(f"could not parse hook payload: {err}")
        return 0

    # Keep the raw shape while we are still learning it. Remove once the
    # extraction above is known to be right for every platform in use.
    record(RAW_LOG, {"at": datetime.now(timezone.utc).isoformat(), **payload})

    try:
        message_id, sender, subject, body, attachments = extract(payload)

        if not body.strip():
            note(f"{message_id}: empty body, nothing to triage")
            return 0

        from hermes_trt.models import InboundMessage
        from hermes_trt.pipeline import process
        from hermes_trt.store import DeadlineStore

        message = InboundMessage(
            id=message_id,
            sender=sender,
            subject=subject,
            body=body,
            attachments=attachments,
            source=first(payload, "platform", "source", default="gateway"),
        )

        outcome = process(message, DeadlineStore())
        note(outcome.summary())

        if not outcome.ok:
            record(DEAD_LETTER, {
                "at": datetime.now(timezone.utc).isoformat(),
                "message_id": message_id,
                "sender": sender,
                "subject": subject,
                "error": outcome.error,
            })

    except Exception:  # noqa: BLE001
        # Never let an exception here fall through to the agent.
        note("hook raised:\n" + traceback.format_exc())
        record(DEAD_LETTER, {
            "at": datetime.now(timezone.utc).isoformat(),
            "error": traceback.format_exc(),
            "payload": payload,
        })

    return 0


if __name__ == "__main__":
    sys.exit(main())
