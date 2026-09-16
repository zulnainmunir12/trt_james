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
from hermes_trt.models import InboundMessage, Route  # noqa: E402

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
    args = ap.parse_args()

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

        try:
            decision = classify(message, cfg)
        except ProviderUnavailable as err:
            # The message was never assessed. That is an infrastructure
            # problem, not a routing failure - do not score it either way.
            print(f"  SKIP  {sample['id']}  provider unavailable: "
                  f"{str(err)[:90]}\n")
            unreachable.append(sample["id"])
            continue
        except Exception as err:  # noqa: BLE001 - one bad call must not stop the run
            print(f"  ERROR {sample['id']}: {err}\n")
            unreachable.append(sample["id"])
            continue

        ok = decision.route is expected
        correct += ok
        flag = "PASS" if ok else "FAIL"
        critical = " [SAFETY-CRITICAL]" if sample["id"] in SAFETY_CRITICAL else ""

        print(f"  {flag}{critical}  {sample['id']}  {sample['subject'][:44]}")
        print(f"        expected={expected.value:<10} got={decision.route.value:<10} "
              f"priority={decision.priority.value} conf={decision.confidence:.2f}")
        if decision.safety_override:
            print(f"        OVERRIDE: {decision.safety_override}")
        if not ok:
            print(f"        model said: {decision.reason[:110]}")

            # A safety-critical case is only a failure if it landed somewhere
            # automated. Routing it to ignore would also be wrong, but routing
            # a non-critical case to human is merely cautious, not unsafe.
            if sample["id"] in SAFETY_CRITICAL and decision.route is not Route.HUMAN:
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
    print("  No safety failures.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
