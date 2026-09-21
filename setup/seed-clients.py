#!/usr/bin/env python3
"""Build the client registry from tickets that already exist.

Every email sender becomes a client, and every name the old classifier
recorded is folded in. That is what collapses "Daniel", "d.whitcombe" and
"Daniel Whitcombe" back into one person.

Safe to re-run: registering the same address or name twice is a no-op.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from hermes_trt import clients  # noqa: E402
from hermes_trt.console_api import _run_json, parse_body  # noqa: E402


def main() -> int:
    data = _run_json(["kanban", "list", "--json"])
    if not data:
        print("no tickets found - is hermes installed and on PATH?")
        return 1
    items = data if isinstance(data, list) else data.get("tasks", data.get("items", []))

    addresses, names = [], []
    for t in items:
        p = parse_body(t.get("body") or "")
        if "@" in (p["from"] or ""):
            addresses.append(p["from"].strip())
        if p["client"] and p["client"] != "—":
            names.append(p["client"].strip())

    print(f"from {len(items)} tickets: {len(set(addresses))} addresses, "
          f"{len(set(names))} recorded names\n")

    # Addresses first: they are the reliable half, and they create the
    # records that the looser names then merge into.
    for addr in sorted(set(addresses)):
        got = clients.register_email(addr)
        print(f"  address  {addr:34} -> {got or '(skipped, ours)'}")

    print()
    # Names second. A fuller spelling upgrades the record rather than adding
    # a second one, which is the whole point of doing this.
    for name in sorted(set(names), key=len, reverse=True):
        got = clients.merge_name(name)
        arrow = "-> " + got if got and got != name else "(kept)"
        print(f"  name     {name:34} {arrow}")

    print(f"\nregistry now holds {len(clients.known_names())} names "
          f"at {clients.REGISTRY}")
    for rec_name in sorted(set(clients.known_names())):
        print(f"  {rec_name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
