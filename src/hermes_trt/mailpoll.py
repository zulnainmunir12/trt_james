"""Poll the mailbox and run each new message through the pipeline.

Why this exists rather than using Hermes' own email gateway:

The gateway connects and then dies on fetch, repeatedly:

    [Email] IMAP fetch error: socket error: EOF occurred in violation
            of protocol (_ssl.c:2406)
    [Email] IMAP fetch error: The read operation timed out
    Fatal email adapter error (email_imap_fetch_failed)

It holds one long-lived IMAP connection, which is fragile here. This opens
a connection, fetches, and closes again on every pass - slower, but it
cannot rot between polls, and when it does fail the failure is ours to see
and fix.

Runs from cron, or as a loop:

    python3 -m hermes_trt.mailpoll            # one pass
    python3 -m hermes_trt.mailpoll --watch    # keep polling
"""
from __future__ import annotations

import argparse
import email
import imaplib
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from email.header import decode_header
from pathlib import Path
from typing import Optional

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from hermes_trt.models import InboundMessage  # noqa: E402
from hermes_trt.pipeline import process  # noqa: E402
from hermes_trt.store import DeadlineStore  # noqa: E402

HERMES_HOME = Path(os.environ.get("HERMES_HOME", Path.home() / ".hermes"))
ENV_FILE = HERMES_HOME / ".env"

#: Which messages we have already handled. Kept as our own file rather than
#: relying on the IMAP \Seen flag, because a human opening the mailbox in a
#: browser would otherwise cause work to be silently skipped.
SEEN_FILE = HERMES_HOME / "trt-seen-uids.json"
LOG_FILE = HERMES_HOME / "trt-hook-logs" / "mailpoll.log"


def env_value(name: str) -> str:
    if not ENV_FILE.exists():
        return ""
    m = re.search(rf"^{name}=(.*)$", ENV_FILE.read_text(encoding="utf-8"), re.MULTILINE)
    return m.group(1).strip() if m else ""


def log(text: str) -> None:
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
    line = f"{stamp}  {text}"
    print(line, flush=True)
    with LOG_FILE.open("a", encoding="utf-8") as fh:
        fh.write(line + "\n")


def load_seen() -> set[str]:
    try:
        return set(json.loads(SEEN_FILE.read_text(encoding="utf-8")))
    except Exception:  # noqa: BLE001 - a missing or corrupt file means start fresh
        return set()


def save_seen(seen: set[str]) -> None:
    SEEN_FILE.parent.mkdir(parents=True, exist_ok=True)
    SEEN_FILE.write_text(json.dumps(sorted(seen)), encoding="utf-8")


def decode_value(raw: Optional[str]) -> str:
    if not raw:
        return ""
    out = []
    for text, charset in decode_header(raw):
        if isinstance(text, bytes):
            out.append(text.decode(charset or "utf-8", errors="replace"))
        else:
            out.append(text)
    return "".join(out)


def plain_body(msg: email.message.Message) -> str:
    """Prefer text/plain; fall back to stripping tags from text/html.

    Real mail is multipart with an HTML twin, and classifying raw HTML
    wastes tokens and confuses the model.
    """
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain" and \
                    part.get_content_disposition() != "attachment":
                payload = part.get_payload(decode=True) or b""
                return payload.decode(part.get_content_charset() or "utf-8",
                                      errors="replace")
        for part in msg.walk():
            if part.get_content_type() == "text/html":
                payload = part.get_payload(decode=True) or b""
                html = payload.decode(part.get_content_charset() or "utf-8",
                                      errors="replace")
                return re.sub(r"<[^>]+>", " ", html)
        return ""
    payload = msg.get_payload(decode=True) or b""
    return payload.decode(msg.get_content_charset() or "utf-8", errors="replace")


def strip_quoted(text: str) -> str:
    """Drop quoted history and signatures.

    A reply carrying three previous emails would otherwise be classified on
    whatever was said last week rather than what the client just wrote.
    """
    cut = re.split(
        r"\n-{2,}\s*\n|\nOn .{5,80} wrote:|\n_{5,}|\nFrom: .+\nSent: ",
        text, maxsplit=1,
    )[0]
    return cut.strip()


def attachments_of(msg: email.message.Message) -> tuple[str, ...]:
    return tuple(
        decode_value(p.get_filename())
        for p in msg.walk()
        if p.get_content_disposition() == "attachment" and p.get_filename()
    )


def fetch_new(limit: int = 20) -> list[InboundMessage]:
    address, password = env_value("EMAIL_ADDRESS"), env_value("EMAIL_PASSWORD")
    host = env_value("EMAIL_IMAP_HOST") or "imap.gmail.com"
    if not address or not password:
        raise RuntimeError("Mailbox not configured — run setup/configure-mailbox.sh")

    allowed = [a.strip().lower() for a in
               env_value("EMAIL_ALLOWED_SENDERS").split(",") if a.strip()]

    seen = load_seen()
    found: list[InboundMessage] = []

    # Short-lived connection on purpose: opened, used, closed. Nothing is
    # held open between polls, so there is nothing to go stale.
    conn = imaplib.IMAP4_SSL(host, 993, timeout=30)
    try:
        conn.login(address, password)
        conn.select("INBOX", readonly=True)
        status, data = conn.search(None, "ALL")
        uids = data[0].split()[-limit:]

        for uid in uids:
            key = uid.decode()
            if key in seen:
                continue
            status, raw = conn.fetch(uid, "(RFC822)")
            if not raw or not raw[0]:
                continue
            msg = email.message_from_bytes(raw[0][1])

            sender = decode_value(msg.get("From"))
            addr = re.search(r"[\w.+-]+@[\w.-]+", sender)
            addr = addr.group(0).lower() if addr else ""

            seen.add(key)  # mark regardless, so a bad message is not retried forever

            if allowed and addr not in allowed:
                log(f"uid {key}: sender {addr} not allowlisted, skipped")
                continue

            body = strip_quoted(plain_body(msg))
            if not body.strip():
                log(f"uid {key}: empty body, skipped")
                continue

            found.append(InboundMessage(
                id=f"mail-{key}",
                sender=addr or sender,
                subject=decode_value(msg.get("Subject")),
                body=body[:6000],
                attachments=attachments_of(msg),
                source="email",
            ))
    finally:
        try:
            conn.logout()
        except Exception:  # noqa: BLE001
            pass
        save_seen(seen)

    return found


def run_once() -> int:
    store = DeadlineStore()
    try:
        messages = fetch_new()
    except Exception as err:  # noqa: BLE001
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
    ap = argparse.ArgumentParser()
    ap.add_argument("--watch", action="store_true", help="keep polling")
    ap.add_argument("--interval", type=int, default=30, help="seconds between polls")
    ap.add_argument("--reset", action="store_true",
                    help="forget which messages were handled (reprocesses the inbox)")
    args = ap.parse_args()

    if args.reset:
        SEEN_FILE.unlink(missing_ok=True)
        log("seen list cleared")

    if not args.watch:
        n = run_once()
        log(f"pass complete, {n} handled")
        return 0

    log(f"watching mailbox every {args.interval}s")
    while True:
        try:
            run_once()
        except KeyboardInterrupt:
            log("stopped")
            return 0
        except Exception as err:  # noqa: BLE001 - a bad pass must not end the watch
            log(f"pass failed: {err}")
        time.sleep(args.interval)


if __name__ == "__main__":
    sys.exit(main())
