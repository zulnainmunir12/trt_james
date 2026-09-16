#!/usr/bin/env python3
"""Mark the most recent inbox message unread so the gateway reprocesses it.

Hermes only acts on UNSEEN messages, and it marks a message seen as soon as
it fetches it - even when it then denies the sender. Without this, fixing an
allowlist means asking someone to send another email.

Usage:
    python3 setup/mark-unread.py            # most recent message
    python3 setup/mark-unread.py 3          # most recent 3
"""
from __future__ import annotations

import imaplib
import os
import re
import sys
from pathlib import Path

ENV = Path(os.environ.get("HERMES_HOME", Path.home() / ".hermes")) / ".env"


def env_value(name: str) -> str:
    match = re.search(rf"^{name}=(.*)$", ENV.read_text(encoding="utf-8"), re.MULTILINE)
    return match.group(1).strip() if match else ""


def main() -> int:
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    address, password = env_value("EMAIL_ADDRESS"), env_value("EMAIL_PASSWORD")
    host = env_value("EMAIL_IMAP_HOST") or "imap.gmail.com"
    if not address or not password:
        print("Mailbox not configured.", file=sys.stderr)
        return 2

    conn = imaplib.IMAP4_SSL(host, 993, timeout=30)
    conn.login(address, password)
    conn.select("INBOX")           # writable - we are changing flags

    status, data = conn.search(None, "ALL")
    ids = data[0].split()
    for msg_id in ids[-count:]:
        conn.store(msg_id, "-FLAGS", "\\Seen")
        print(f"  marked {msg_id.decode()} unread")

    conn.logout()
    return 0


if __name__ == "__main__":
    sys.exit(main())
