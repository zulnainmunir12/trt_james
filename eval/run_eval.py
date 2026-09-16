#!/usr/bin/env python3
"""Score the classifier against the fixture set.

Usage:
    python3 eval/run_eval.py
    python3 eval/run_eval.py --only e005

Exits non-zero if any SAFETY-CRITICAL case fails. Ordinary misroutes are
reported but do not fail the run - they are a quality signal, not a gate.
A clinical message reaching an automated route is a different class of
problem and should break the build.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "src"))

from hermes_trt.classify import ProviderUnavailable, classify  # noqa: E402
from hermes_trt.config import ConfigError, load_provider  # noqa: E402
from hermes_trt.models import InboundMessage, Route, RoutingDecision  # noqa: E402

FIXTURES = REPO / "fixtures" / "emails" / "inbound-samples.json"

#: Cases where a wrong answer is a safety failure, not a quality issue.
#: e005 is a client reporting chest tightness and asking whether to stop.
SAFETY_CRITICAL = {"e005"}


def load_samples() -> list[dict]:
    data = json.loads(FIXTURES.read_text(encoding="utf-8"))
    return data["samples"]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="run a single fixture id")
    ap.add_argument(
        "--repeat",
        type=int,
        default=1,
        metavar="N",
        help="classify each fixture N times and report stability. "
             "Temperature 0 is NOT deterministic here, so a single run is "
             "not a measurement. Costs N x fixtures requests.",
    )
    args = ap.parse_args()
    if args.repeat < 1:
        print("--repeat must be at least 1", file=sys.stderr)
        return 2

    try:
        cfg = load_provider()
    except ConfigError as err:
        print(f"ERROR: {err}", file=sys.stderr)
        return 2

    samples = load_samples()
    if args.only:
        samples = [s for s in samples if s["id"] == args.only]
        if not samples:
            print(f"No fixture with id {args.only!r}", file=sys.stderr)
            return 2

    print(f"Model: {cfg.model}")
    print(f"Fixtures: {len(samples)}\n")

    correct = 0
    safety_failures: list[str] = []
    unreachable: list[str] = []      # provider errors - not a routing result

    for sample in samples:
        message = InboundMessage(
            id=sample["id"],
            sender=sample["from"],
            subject=sample["subject"],
            body=sample["body"],
            attachments=tuple(sample.get("attachments", [])),
        )
        expected = Route(sample["expected_route"])
        critical = " [SAFETY-CRITICAL]" if sample["id"] in SAFETY_CRITICAL else ""

        observed: list[RoutingDecision] = []
        failed_to_reach = False
        for _ in range(args.repeat):
            try:
                observed.append(classify(message, cfg))
            except ProviderUnavailable as err:
                # The message was never assessed. That is an infrastructure
                # problem, not a routing failure - do not score it either way.
                print(f"  SKIP  {sample['id']}  provider unavailable: "
                      f"{str(err)[:90]}\n")
                failed_to_reach = True
                break
            except Exception as err:  # noqa: BLE001 - one bad call must not stop the run
                print(f"  ERROR {sample['id']}: {err}\n")
                failed_to_reach = True
                break

        if failed_to_reach or not observed:
            unreachable.append(sample["id"])
            continue

        routes = [d.route for d in observed]
        agreed = len({r for r in routes})== 1
        decision = observed[0]

        # With --repeat, a fixture only passes if EVERY run agreed with the
        # expected route. An intermittently-correct classifier is not correct.
        ok = all(r is expected for r in routes)
        correct += ok
        flag = "PASS" if ok else "FAIL"

        print(f"  {flag}{critical}  {sample['id']}  {sample['subject'][:44]}")
        got = decision.route.value if agreed else "/".join(r.value for r in routes)
        print(f"        expected={expected.value:<10} got={got:<10} "
              f"priority={decision.priority.value} conf={decision.confidence:.2f}")
        if args.repeat > 1 and not agreed:
            print(f"        UNSTABLE across {args.repeat} runs - "
                  f"this fixture is a boundary case, not a clean label")
        if decision.safety_override:
            print(f"        OVERRIDE: {decision.safety_override}")
        if not ok:
            print(f"        model said: {decision.reason[:110]}")

            # A safety-critical case is only a failure if it landed somewhere
            # automated on ANY run. Routing a non-critical case to human is
            # merely cautious, not unsafe.
            if sample["id"] in SAFETY_CRITICAL and any(
                r is not Route.HUMAN for r in routes
            ):
                safety_failures.append(sample["id"])
        print()

    scored = len(samples) - len(unreachable)
    print("-" * 62)
    print(f"  {correct}/{scored} routed as expected"
          + (f"  ({len(unreachable)} not scored - provider unavailable)"
             if unreachable else ""))

    if safety_failures:
        print(f"\n  SAFETY FAILURES: {', '.join(safety_failures)}")
        print("  A clinical message reached an automated route. Do not ship.")
        return 1

    if unreachable:
        print(f"  Unreachable: {', '.join(unreachable)} - rerun to score these.")

    # An eval that scored nothing has verified nothing. Reporting success
    # here would let a fully rate-limited run pass CI green.
    if scored == 0:
        print("\n  NOTHING WAS SCORED - the provider was unreachable throughout.")
        print("  This is not a pass. Rerun when quota is available.")
        return 3

    # Safety-critical cases must actually be exercised, not skipped.
    missed_critical = SAFETY_CRITICAL.intersection(unreachable)
    if missed_critical:
        print(f"\n  SAFETY-CRITICAL NOT EXERCISED: {', '.join(sorted(missed_critical))}")
        print("  These must run before any claim that routing is safe.")
        return 3

    print("  No safety failures.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
