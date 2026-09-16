#!/usr/bin/env python3
"""Run the fixture messages through the whole chain.

    python3 eval/run_pipeline.py            # create real tickets
    python3 eval/run_pipeline.py --dry-run  # classify only, touch nothing

Creates real tickets on the Hermes kanban board so they can be seen in the
dashboard. Clean up afterwards with setup/cleanup-test-artifacts.sh.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "src"))

from hermes_trt.config import ConfigError, load_provider  # noqa: E402
from hermes_trt.models import InboundMessage  # noqa: E402
from hermes_trt.pipeline import process  # noqa: E402
from hermes_trt.sla import provisional_rule_keys  # noqa: E402
from hermes_trt.store import DeadlineStore  # noqa: E402

FIXTURES = REPO / "fixtures" / "emails" / "inbound-samples.json"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true",
                    help="classify only; create no tickets or deadlines")
    ap.add_argument("--db", help="deadline store path (default: ~/.hermes/trt-sla.db)")
    ap.add_argument("--only", help="single fixture id")
    args = ap.parse_args()

    try:
        cfg = load_provider()
    except ConfigError as err:
        print(f"ERROR: {err}", file=sys.stderr)
        return 2

    samples = json.loads(FIXTURES.read_text(encoding="utf-8"))["samples"]
    if args.only:
        samples = [s for s in samples if s["id"] == args.only]

    store = DeadlineStore(args.db) if args.db else DeadlineStore()

    provisional = provisional_rule_keys()
    print(f"Model:    {cfg.model}")
    print(f"Messages: {len(samples)}")
    print(f"Mode:     {'DRY RUN' if args.dry_run else 'creating real tickets'}")
    if provisional:
        print(f"NOTE:     {len(provisional)} PROVISIONAL sla rules in use "
              f"({', '.join(provisional)}) - our numbers, not the client's.")
    print()

    outcomes = []
    for sample in samples:
        message = InboundMessage(
            id=sample["id"],
            sender=sample["from"],
            subject=sample["subject"],
            body=sample["body"],
            attachments=tuple(sample.get("attachments", [])),
        )
        outcome = process(message, store, cfg, today=date.today(),
                          dry_run=args.dry_run)
        outcomes.append(outcome)
        print(f"  {outcome.summary()}")

    print()
    print("-" * 62)
    tickets = [o for o in outcomes if o.ticket]
    errors = [o for o in outcomes if not o.ok]
    ignored = [o for o in outcomes if o.ok and o.ticket is None and o.decision]
    print(f"  {len(tickets)} tickets created, {len(ignored)} ignored as noise, "
          f"{len(errors)} errors")
    if errors:
        # Provider errors carry a full JSON body; repeating it once per
        # message buries the summary. One line each is enough to act on.
        for o in errors:
            first_line = " ".join((o.error or "").split())[:120]
            print(f"    {o.message_id}: {first_line}")

    print()
    print("Open tickets on the board:")
    try:
        from hermes_trt.tickets import list_open
        print(list_open())
    except Exception as err:  # noqa: BLE001
        print(f"  (could not list: {err})")

    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
