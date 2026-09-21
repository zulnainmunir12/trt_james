"""Poll Slack channels and turn staff requests into tracked work.

The same shape as `mailpoll`: read on a schedule, hand each message to the
same pipeline, let the same safety rules decide where it goes. Deliberately
polling rather than Socket Mode - there is no public endpoint to secure, no
app-level token, and a missed poll just means the next one picks the message
up. The app reads only the public channels it has been invited to.

Nothing is ever posted back to Slack from here. A reply is a clinical act in
this setting, so it stays a human's job.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from hermes_trt.models import InboundMessage  # noqa: E402
from hermes_trt.pipeline import process  # noqa: E402
from hermes_trt.store import DeadlineStore  # noqa: E402

HERMES_HOME = Path(os.environ.get("HERMES_HOME", Path.home() / ".hermes"))
ENV_FILE = HERMES_HOME / ".env"

#: Last message timestamp handled per channel. Slack's `ts` is a string and
#: also the message's identity, so it doubles as a high-water mark.
SEEN_FILE = HERMES_HOME / "trt-slack-seen.json"
LOG_FILE = HERMES_HOME / "trt-hook-logs" / "slackpoll.log"

API = "https://slack.com/api/"

#: Slack emits a message event for joins, leaves, pins, topic changes and so
#: on. None of those are a request from a person, and turning them into
#: tickets would bury the real ones.
IGNORED_SUBTYPES = frozenset({
    "channel_join", "channel_leave", "channel_topic", "channel_purpose",
    "channel_name", "channel_archive", "channel_unarchive", "pinned_item",
    "unpinned_item", "bot_message", "message_changed", "message_deleted",
    "thread_broadcast", "reminder_add", "file_comment", "tombstone",
})


def env_value(name: str) -> str:
    """Read a key from Hermes's env file.

    Matches only lines that start with the name: the shipped file carries a
    commented-out template line for SLACK_BOT_TOKEN, and a looser match
    would return the empty comment instead of the real value.
    """
    if not ENV_FILE.exists():
        return ""
    found = ""
    for line in ENV_FILE.read_text(encoding="utf-8", errors="replace").splitlines():
        if line.startswith(f"{name}="):
            found = line.split("=", 1)[1].strip().strip("'\"")
    return found


def log(text: str) -> None:
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
    line = f"{stamp}  {text}"
    print(line, flush=True)
    with LOG_FILE.open("a", encoding="utf-8") as fh:
        fh.write(line + "\n")


def load_seen() -> dict[str, str]:
    try:
        data = json.loads(SEEN_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:  # noqa: BLE001 - missing or corrupt means start fresh
        return {}


def save_seen(seen: dict[str, str]) -> None:
    SEEN_FILE.parent.mkdir(parents=True, exist_ok=True)
    SEEN_FILE.write_text(json.dumps(seen, indent=2, sort_keys=True), encoding="utf-8")


class SlackError(RuntimeError):
    pass


def call(method: str, token: str, **params) -> dict:
    url = API + method + ("?" + urllib.parse.urlencode(params) if params else "")
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            data = json.load(resp)
    except urllib.error.HTTPError as err:
        # 429 carries the wait in a header. Honour it rather than guessing:
        # a blind backoff either wastes time or keeps hammering.
        if err.code == 429:
            wait = int(err.headers.get("Retry-After", "5"))
            log(f"rate limited on {method}, waiting {wait}s")
            time.sleep(wait)
            return call(method, token, **params)
        raise SlackError(f"{method} HTTP {err.code}") from err
    except Exception as err:  # noqa: BLE001
        raise SlackError(f"{method} failed: {err}") from err

    if not data.get("ok"):
        raise SlackError(f"{method}: {data.get('error', 'unknown error')}")
    return data


# -- turning Slack's wire format into something a person (or a model) reads --

_MENTION = re.compile(r"<@([UW][A-Z0-9]+)(?:\|[^>]*)?>")
_CHANNEL = re.compile(r"<#(C[A-Z0-9]+)(?:\|([^>]*))?>")
_LINK = re.compile(r"<(https?://[^|>]+)(?:\|([^>]*))?>")


def humanise(text: str, names: dict[str, str]) -> str:
    """Replace Slack's ID markup with readable text.

    The classifier sees this, and `<@U0C2BMJCDJT>` carries no meaning while
    `@Sarah Mitchell` does. Links keep their label where they have one.
    """
    text = _MENTION.sub(lambda m: "@" + names.get(m.group(1), "someone"), text)
    text = _CHANNEL.sub(lambda m: "#" + (m.group(2) or "channel"), text)
    text = _LINK.sub(lambda m: m.group(2) or m.group(1), text)
    return text.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").strip()


def subject_of(text: str) -> str:
    """Slack messages have no subject, so make one from the first sentence.

    Not the first LINE: Slack wraps as a person types, so a sentence
    routinely spans two lines and a line-based subject ends mid-clause
    ("...have come back"). Paragraph breaks are still honoured - a blank
    line means a new thought, and only the first one is wanted.
    """
    para = text.split("\n\n", 1)[0]
    joined = " ".join(ln.strip() for ln in para.splitlines() if ln.strip())
    if not joined:
        return "(no text)"
    first = re.split(r"(?<=[.!?])\s+", joined, maxsplit=1)[0].strip()
    if len(first) <= 100:
        return first
    cut = first[:97]
    if " " in cut:
        cut = cut[:cut.rfind(" ")]
    return cut + "..."


class Names:
    """User ID to display name, resolved once per run."""

    def __init__(self, token: str) -> None:
        self.token = token
        self.cache: dict[str, str] = {}

    def of(self, user_id: str) -> str:
        if not user_id:
            return "unknown"
        if user_id not in self.cache:
            try:
                info = call("users.info", self.token, user=user_id)["user"]
                profile = info.get("profile", {})
                self.cache[user_id] = (
                    profile.get("real_name") or profile.get("display_name")
                    or info.get("name") or user_id
                )
            except SlackError:
                # A name we cannot resolve must not stop the message being
                # handled - the request still matters.
                self.cache[user_id] = user_id
        return self.cache[user_id]


def channels(token: str) -> list[dict]:
    data = call("users.conversations", token,
                types="public_channel", exclude_archived="true", limit=200)
    return data.get("channels", [])


def fetch_new(token: str, backfill: int = 0, limit: int = 50) -> list[InboundMessage]:
    """New messages across every channel the bot was invited to.

    A channel seen for the first time is marked at its newest message and
    nothing older is processed. Without that, inviting the bot to a busy
    channel would raise a ticket for every message in its history.
    """
    seen = load_seen()
    names = Names(token)
    out: list[InboundMessage] = []

    for ch in channels(token):
        cid = ch["id"]
        cname = ch.get("name", cid)
        try:
            hist = call("conversations.history", token, channel=cid, limit=limit)
        except SlackError as err:
            log(f"#{cname}: {err}")
            continue

        msgs = hist.get("messages", [])
        if cid not in seen:
            if backfill > 0:
                # Oldest first, so the high-water mark ends up on the newest.
                msgs = list(reversed(msgs))[-backfill:]
                log(f"#{cname}: first sight, backfilling {len(msgs)}")
            else:
                newest = max((m["ts"] for m in msgs), default="0")
                seen[cid] = newest
                save_seen(seen)
                log(f"#{cname}: first sight, baseline set - nothing older processed")
                continue
        else:
            msgs = [m for m in msgs if m.get("ts", "0") > seen[cid]]
            msgs = list(reversed(msgs))  # oldest first

        for m in msgs:
            ts = m.get("ts", "")
            if m.get("subtype") in IGNORED_SUBTYPES or m.get("bot_id"):
                seen[cid] = max(seen.get(cid, "0"), ts)
                continue

            raw = m.get("text", "")
            if not raw.strip():
                seen[cid] = max(seen.get(cid, "0"), ts)
                continue

            who = names.of(m.get("user", ""))
            # Resolve everyone the message mentions before rendering it, or
            # humanise() falls back to "@someone" for anyone not yet cached.
            for uid in set(_MENTION.findall(raw)):
                names.of(uid)
            text = humanise(raw, names.cache)
            if not text.strip():
                seen[cid] = max(seen.get(cid, "0"), ts)
                continue

            out.append(InboundMessage(
                id=f"slack-{cid}-{ts}",
                sender=f"{who} in #{cname}",
                subject=subject_of(text),
                body=text,
                attachments=tuple(
                    f.get("name", "file") for f in m.get("files", []) or ()
                ),
                source="slack",
            ))
            seen[cid] = max(seen.get(cid, "0"), ts)

        save_seen(seen)

    return out


def run_once(backfill: int = 0) -> int:
    token = env_value("SLACK_BOT_TOKEN")
    if not token:
        log("SLACK_BOT_TOKEN not set - run setup/save-slack-token.sh")
        return 0

    store = DeadlineStore()
    try:
        messages = fetch_new(token, backfill=backfill)
    except SlackError as err:
        log(f"fetch failed: {err}")
        return 0

    if not messages:
        return 0

    handled = 0
    for message in messages:
        log(f"processing {message.id} from {message.sender}: {message.subject!r}")
        outcome = process(message, store)
        log(f"  -> {outcome.summary()}")
        handled += 1
    return handled


def main() -> int:
    ap = argparse.ArgumentParser(description="Poll Slack for staff requests.")
    ap.add_argument("--watch", action="store_true", help="keep polling")
    ap.add_argument("--interval", type=int, default=60, help="seconds between polls")
    ap.add_argument("--backfill", type=int, default=0, metavar="N",
                    help="on a channel's first poll, process its last N messages "
                         "instead of starting from now")
    ap.add_argument("--reset", action="store_true",
                    help="forget the high-water marks (re-baselines every channel)")
    args = ap.parse_args()

    if args.reset:
        SEEN_FILE.unlink(missing_ok=True)
        log("slack high-water marks cleared")

    if not args.watch:
        n = run_once(backfill=args.backfill)
        log(f"pass complete, {n} handled")
        return 0

    log(f"watching slack every {args.interval}s")
    while True:
        try:
            n = run_once(backfill=args.backfill)
            if n:
                log(f"pass complete, {n} handled")
        except KeyboardInterrupt:
            return 0
        except Exception as err:  # noqa: BLE001 - a bad pass must not end the watch
            log(f"pass failed: {err}")
        time.sleep(args.interval)


if __name__ == "__main__":
    sys.exit(main())
