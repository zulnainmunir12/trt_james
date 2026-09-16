"""The daily SLA sweep.

Scans tracked deadlines, nudges on what is due soon, escalates what is
overdue. Runs from Hermes' cron - see setup/install-cron-jobs.sh.

No LLM involved. This is date arithmetic, and it should stay that way: a
deadline check that can hallucinate is worse than no deadline check. The
model's job is understanding messages, not counting days.

Escalation is idempotent: a ticket is escalated once, not once per day,
otherwise leadership learns to ignore the alerts within a week.
"""
from __future__ import annotations

import argparse
import sys
from datetime import date
from pathlib import Path

if __package__ in (None, ""):  # running as a cron script, not an import
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from hermes_trt.notify import send_alert  # noqa: E402
from hermes_trt.sla import Deadline, SLAStatus, parse_date  # noqa: E402
from hermes_trt.store import DeadlineStore  # noqa: E402


def format_report(
    due_soon: list[Deadline], overdue: list[Deadline], today: date
) -> str:
    """Human-readable summary, delivered to whoever the cron job targets."""
    lines = [f"SLA check - {today.isoformat()}"]

    if overdue:
        # Say what is actually happening. Claiming "escalating to leadership"
        # on a ticket that was escalated days ago is untrue, and a report
        # nobody trusts is a report nobody reads.
        fresh = [d for d in overdue if not d.escalated]
        lines.append("")
        lines.append(f"OVERDUE ({len(overdue)}):")
        for d in overdue:
            marker = "  -> ESCALATING" if d in fresh else "  (already escalated)"
            lines.append(f"  - {d.describe(today)}{marker}")

    if due_soon:
        lines.append("")
        lines.append(f"Due soon ({len(due_soon)}):")
        for d in due_soon:
            lines.append(f"  - {d.describe(today)}")

    if not overdue and not due_soon:
        lines.append("")
        lines.append("Nothing due or overdue.")

    return "\n".join(lines)


def run(
    store: DeadlineStore,
    today: date | None = None,
    dry_run: bool = False,
    notify: bool = True,
) -> tuple[str, int]:
    """Returns (report, count of newly escalated)."""
    today = today or date.today()
    due_soon, overdue = store.needing_attention(today)

    fresh = [d for d in overdue if not d.escalated]
    newly_escalated = 0

    # Send before recording. If delivery fails we must NOT mark the deadline
    # escalated, or it will never be alerted again - the sweep skips anything
    # already flagged. A missed escalation that looks handled is the worst
    # outcome here.
    delivery = None
    if fresh and notify and not dry_run:
        delivery = send_alert(
            subject=f"SLA escalation - {len(fresh)} overdue on {today.isoformat()}",
            body="\n".join(f"  - {d.describe(today)}" for d in fresh),
        )

    for deadline in fresh:
        # Escalate once. Re-alerting daily on the same ticket trains people
        # to ignore the channel.
        if not dry_run and (delivery is None or delivery.delivered):
            store.mark_escalated(
                deadline.ticket_id,
                deadline.rule_key,
                {
                    "days_overdue": abs(deadline.days_remaining(today)),
                    "client_ref": deadline.client_ref,
                    "rule": deadline.rule.label,
                    "escalate_to": deadline.rule.escalate_to,
                    "delivered_to": delivery.target if delivery else "not sent",
                },
            )
        newly_escalated += 1

    # Build the report from the pre-sweep state, so "already escalated"
    # reflects what was true when the sweep started rather than what this
    # run just did.
    report = format_report(due_soon, overdue, today)

    already = len([d for d in overdue if d.escalated])
    summary = []
    if newly_escalated:
        summary.append(f"{newly_escalated} newly escalated this run.")
    if already:
        summary.append(f"{already} previously escalated, not re-alerted.")
    if dry_run:
        summary.append("DRY RUN - nothing was recorded.")
    if summary:
        report += "\n\n" + " ".join(summary)

    if delivery:
        report += f"\nAlert: {delivery.describe()}"
        if not delivery.delivered:
            # Say it plainly. A report claiming an escalation happened when
            # nobody received it is worse than no report.
            report += (
                "\nWARNING: nobody was alerted. These deadlines stay flagged "
                "for the next run rather than being marked escalated."
            )

    return report, newly_escalated


def main() -> int:
    ap = argparse.ArgumentParser(description="Daily SLA sweep")
    ap.add_argument("--db", help="override the deadline store path")
    ap.add_argument("--today", help="pretend today is this ISO date (testing)")
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="report without recording escalations",
    )
    args = ap.parse_args()

    store = DeadlineStore(args.db) if args.db else DeadlineStore()
    today = parse_date(args.today) if args.today else date.today()

    report, escalated = run(store, today, dry_run=args.dry_run)
    print(report)

    # Exit 0 always: an overdue ticket is a finding, not a job failure.
    # Hermes' cron treats a non-zero exit as the job breaking, which would
    # mask the real signal behind an infrastructure alert.
    return 0


if __name__ == "__main__":
    sys.exit(main())
