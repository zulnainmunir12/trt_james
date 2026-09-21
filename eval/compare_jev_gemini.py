"""Run Jev over the messages Gemini already classified, and compare.

Gemini's decision is recorded in each ticket body by the pipeline, so the
comparison uses what actually happened in production rather than re-running
Gemini and spending quota on it.

Reports where the two agree, where they differ, and - the question that
matters most - whether each would have held the clinical ones.
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from hermes_trt import jev  # noqa: E402
from hermes_trt.console_api import parse_body, _run_json  # noqa: E402
from hermes_trt.models import InboundMessage  # noqa: E402

GREEN, RED, YELLOW, DIM, RESET = (
    "\033[32m", "\033[31m", "\033[33m", "\033[2m", "\033[0m")


def live_tickets() -> list[dict]:
    data = _run_json(["kanban", "list", "--json"])
    if not data:
        return []
    items = data if isinstance(data, list) else data.get("tasks", data.get("items", []))
    out = []
    for t in items:
        p = parse_body(t.get("body") or "")
        if not p["message"]:
            continue
        out.append({
            "id": t.get("id", ""),
            "title": t.get("title", ""),
            "from": p["from"],
            "source": p["source"],
            "subject": p["subject"],
            "message": p["message"],
            # What Gemini concluded at the time, straight off the ticket.
            "gemini_route": p["route"] or "?",
            "gemini_priority": p["priority"] or "?",
        })
    return out


def main() -> int:
    rows = live_tickets()
    if not rows:
        print("no tickets with a parseable body - is the gateway running?")
        return 1

    print(f"comparing {len(rows)} real tickets\n")
    header = f"  {'ticket':12} {'gemini':22} {'jev':22} {'symptom':8}  title"
    print(header)
    print("  " + "-" * (len(header) - 2))

    agree = differ = failed = 0
    disagreements = []

    for r in rows:
        msg = InboundMessage(id=r["id"], sender=r["from"],
                             subject=r["subject"], body=r["message"],
                             source=r["source"])
        try:
            d = jev.classify(msg)
        except jev.JevUnavailable as err:
            print(f"  {r['id']:12} {RED}jev failed: {err}{RESET}")
            failed += 1
            continue

        g = f"{r['gemini_route']}/{r['gemini_priority']}"
        j = f"{d.route.value}/{d.priority.value}"
        sym = float((d.raw.get("answers", {})
                     .get("reports_symptom", {}) or {}).get("noul") or 0.0)

        same = r["gemini_route"] == d.route.value
        mark = f"{GREEN}=={RESET}" if same else f"{YELLOW}!={RESET}"
        if same:
            agree += 1
        else:
            differ += 1
            disagreements.append((r, d))

        flag = f"{RED}{sym:.2f}{RESET}" if sym >= jev.SYMPTOM_THRESHOLD else f"{sym:.2f}"
        print(f"  {r['id']:12} {g:22} {j:22} {flag:17} {mark} {r['title'][:38]}")
        time.sleep(0.2)   # be polite to the API

    print(f"\n  same route: {agree}   different: {differ}   failed: {failed}")

    if disagreements:
        print("\n  where they differ:")
        for r, d in disagreements:
            print(f"\n    {r['id']}  {r['title'][:60]}")
            print(f"      message : {r['message'][:90].replace(chr(10), ' ')}...")
            print(f"      gemini  : {r['gemini_route']} / {r['gemini_priority']}")
            print(f"      jev     : {d.route.value} / {d.priority.value}")
            print(f"      jev why : {d.reason}")
            if d.safety_override:
                print(f"      {RED}override: {d.safety_override}{RESET}")

    print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
