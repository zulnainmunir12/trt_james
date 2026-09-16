#!/usr/bin/env python3
"""Show what is actually in the test mailbox.

Separates "the email never arrived" from "the gateway did not act on it",
which otherwise look identical from the logs.
"""
from __future__ import annotations

import email
import imaplib
import os
import re
import sys
from email.header import decode_header
from pathlib import Path

ENV = Path(os.environ.get("HERMES_HOME", Path.home() / ".hermes")) / ".env"


def env_value(name: str) -> str:
    match = re.search(rf"^{name}=(.*)$", ENV.read_text(encoding="utf-8"), re.MULTILINE)
    return match.group(1).strip() if match else ""


def decode(value: str | None) -> str:
    if not value:
        return ""
    parts = decode_header(value)
    out = []
    for text, charset in parts:
        if isinstance(text, bytes):
            out.append(text.decode(charset or "utf-8", errors="replace"))
        else:
            out.append(text)
    return "".join(out)


def main() -> int:
    address = env_value("EMAIL_ADDRESS")
    password = env_value("EMAIL_PASSWORD")
    host = env_value("EMAIL_IMAP_HOST") or "imap.gmail.com"
    if not address or not password:
        print("Mailbox not configured. Run setup/configure-mailbox.sh", file=sys.stderr)
        return 2

    conn = imaplib.IMAP4_SSL(host, 993, timeout=30)
    conn.login(address, password)
    conn.select("INBOX", readonly=True)   # readonly: do not mark anything read

    status, data = conn.search(None, "ALL")
    ids = data[0].split()
    print(f"{address}: {len(ids)} message(s)\n")

    for msg_id in ids[-6:]:
        status, raw = conn.fetch(msg_id, "(RFC822)")
        msg = email.message_from_bytes(raw[0][1])
        flags_status, flag_data = conn.fetch(msg_id, "(FLAGS)")
        seen = b"\\Seen" in (flag_data[0] or b"")
        print(f"  [{msg_id.decode()}] {'read' if seen else 'UNREAD'}")
        print(f"      From:    {decode(msg.get('From'))}")
        print(f"      Subject: {decode(msg.get('Subject'))}")
        print(f"      Date:    {msg.get('Date')}")
        attachments = [
            p.get_filename() for p in msg.walk()
            if p.get_content_disposition() == "attachment"
        ]
        if attachments:
            print(f"      Files:   {', '.join(filter(None, attachments))}")
        print()

    conn.logout()
    return 0


if __name__ == "__main__":
    sys.exit(main())
