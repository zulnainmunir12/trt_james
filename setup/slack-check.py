#!/usr/bin/env python3
"""Report what the Slack bot can actually see.

Read-only. Proves the connection end to end: who we are, which channels the
bot was invited to, and whether history can really be read from one of them.
Run it any time the Slack side looks wrong, before assuming the code is.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://slack.com/api/"
ENV = Path(os.environ.get("HERMES_ENV", Path.home() / ".hermes" / ".env"))


def token() -> str:
    """Last active SLACK_BOT_TOKEN in the env file.

    Hermes ships a commented-out template line for this key, so match only
    lines that actually start with the name, and take the last one in case
    the file was appended to more than once.
    """
    found = ""
    if not ENV.exists():
        sys.exit(f"no config at {ENV}")
    for line in ENV.read_text(encoding="utf-8", errors="replace").splitlines():
        if line.startswith("SLACK_BOT_TOKEN="):
            found = line.split("=", 1)[1].strip().strip("'\"")
    if not found:
        sys.exit("SLACK_BOT_TOKEN is not set - run setup/save-slack-token.sh")
    return found


def call(method: str, tok: str, **params) -> dict:
    url = API + method + ("?" + urllib.parse.urlencode(params) if params else "")
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {tok}"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.load(resp)


def main() -> int:
    tok = token()

    who = call("auth.test", tok)
    if not who.get("ok"):
        print(f"  auth failed: {who.get('error')}")
        return 1
    print(f"  connected as {who['user']} in workspace \"{who['team']}\"")

    convo = call("users.conversations", tok, types="public_channel", limit=100)
    if not convo.get("ok"):
        print(f"  cannot list channels: {convo.get('error')}")
        return 1

    channels = convo.get("channels", [])
    if not channels:
        print("  the bot is not in any channel yet")
        print("  in Slack, send:  /invite @Care Ops")
        return 1

    print(f"\n  channels it can read ({len(channels)}):")
    for c in channels:
        print(f"    #{c['name']:<14} {c['id']}  members={c.get('num_members', '?')}")

    # Listing a channel is not the same as being allowed to read it, so
    # actually pull history rather than assuming the scope was granted.
    first = channels[0]
    hist = call("conversations.history", tok, channel=first["id"], limit=5)
    print()
    if not hist.get("ok"):
        print(f"  history read FAILED on #{first['name']}: {hist.get('error')}")
        return 1

    msgs = hist.get("messages", [])
    print(f"  history read OK on #{first['name']} - {len(msgs)} message(s)")
    for m in msgs[:3]:
        who_said = m.get("user") or m.get("bot_id") or "?"
        text = (m.get("text") or "").replace("\n", " ")[:64]
        print(f"    {who_said}: {text}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
