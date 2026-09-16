#!/usr/bin/env python3
"""Walk the SLA tracker through a realistic timeline.

Uses a throwaway database and synthetic clients. Shows what leadership
would actually receive on each date, so the behaviour can be reviewed
without waiting eight weeks.
"""
from __future__ import annotations

import sys
import tempfile
from datetime import date
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "src"))

from hermes_trt.sla import build_deadline  # noqa: E402
from hermes_trt.sla_check import run  # noqa: E402
from hermes_trt.store import DeadlineStore  # noqa: E402


def main() -> int:
    with tempfile.TemporaryDirectory() as tmp:
        store = DeadlineStore(Path(tmp) / "demo.db")

        # Three synthetic clients, all starting treatment 1 July 2026.
        start = date(2026, 7, 1)
        for ticket, who in (
            ("t_1001", "client-Harding"),
            ("t_1002", "client-Okafor"),
            ("t_1003", "client-Nguyen"),
        ):
            store.add(build_deadline(ticket, "followup_bloods", who, start))

        # One client's results are ageing towards the 4-month cutoff.
        store.add(
            build_deadline("t_1004", "results_expiry", "client-Brennan",
                           date(2026, 6, 1))
        )

        print("Tracking 4 deadlines. Follow-up bloods are due 8 weeks after")
        print("1 July 2026 (= 26 August). Warning window opens 14 days before.\n")

        for day, label in (
            (date(2026, 7, 20), "Three weeks in - nothing due yet"),
            (date(2026, 8, 13), "Warning window opens"),
            (date(2026, 8, 27), "One day past due"),
            (date(2026, 8, 28), "Next day - should NOT re-alert"),
        ):
            print("=" * 62)
            print(f"{day.isoformat()}  {label}")
            print("=" * 62)
            report, escalated = run(store, day)
            print(report)
            print()

        print("=" * 62)
        print("Audit trail for t_1001")
        print("=" * 62)
        for event in store.events_for("t_1001"):
            print(f"  {event['at']}  {event['event']:<10} {event['detail']}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
