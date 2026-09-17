#!/usr/bin/env python3
"""Send a test email into the Hermes mailbox.

Hermes tracks its own set of seen message UIDs, separate from the IMAP
\\Seen flag — so clearing the unread flag does NOT make it reprocess an old
message. Testing ingestion needs a genuinely new email, which is what this
sends.

Usage:
    python3 setup/send-test-email.py                # default clinical case
    python3 setup/send-test-email.py billing        # admin case
    python3 setup/send-test-email.py symptom        # must be held for a person
"""
from __future__ import annotations

import os
import re
import smtplib
import sys
from email.message import EmailMessage
from email.utils import formatdate, make_msgid
from pathlib import Path

ENV = Path(os.environ.get("HERMES_HOME", Path.home() / ".hermes")) / ".env"

CASES = {
    "results": (
        "Blood test results attached",
        "Hi,\n\nI had the private panel done on Tuesday at the collection centre. "
        "Results came through this morning.\n\nFull name Daniel Okafor, DOB 04/09/1986.\n\n"
        "Can someone take a look and let me know what the next step is?\n\nThanks,\nDaniel",
    ),
    "billing": (
        "Switching to the yearly membership",
        "Hello,\n\nI'm on the quarterly plan and would like to move to yearly before "
        "my next renewal. Could you tell me what the difference works out to, and "
        "whether the blood testing is included?\n\nRegards,\nHelen Barros",
    ),
    "symptom": (
        "Feeling off since my last dose",
        "I've had a tight feeling in my chest for the last two days and I'm worried. "
        "I started treatment about six weeks ago.\n\nShould I stop taking it?",
    ),
}


def env_value(name: str) -> str:
    match = re.search(rf"^{name}=(.*)$", ENV.read_text(encoding="utf-8"), re.MULTILINE)
    return match.group(1).strip() if match else ""


def main() -> int:
    case = sys.argv[1] if len(sys.argv) > 1 else "results"
    if case not in CASES:
        print(f"Unknown case {case!r}. Choose from: {', '.join(CASES)}", file=sys.stderr)
        return 2

    address = env_value("EMAIL_ADDRESS")
    password = env_value("EMAIL_PASSWORD")
    host = env_value("EMAIL_SMTP_HOST") or "smtp.gmail.com"
    if not address or not password:
        print("Mailbox not configured.", file=sys.stderr)
        return 2

    subject, body = CASES[case]
    msg = EmailMessage()
    msg["From"] = address
    msg["To"] = address
    msg["Subject"] = subject
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid()
    msg.set_content(body)

    with smtplib.SMTP(host, 587, timeout=30) as smtp:
        smtp.starttls()
        smtp.login(address, password)
        smtp.send_message(msg)

    print(f"Sent '{case}' to {address}")
    print(f"  Subject: {subject}")
    print("\nThe gateway polls every 15s. Watch it arrive with:")
    print("  tail -f ~/.hermes/trt-hook-logs/activity.log")
    return 0


if __name__ == "__main__":
    sys.exit(main())
