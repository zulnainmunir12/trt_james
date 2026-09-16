#!/usr/bin/env bash
# Configure the Hermes email gateway.
#
# Usage:
#   bash setup/configure-mailbox.sh you@gmail.com
#
# Prompts for the app password rather than taking it as an argument, so it
# does not land in shell history, process lists, or a chat transcript.
#
# Gmail: this must be a 16-character APP PASSWORD, not the account password.
# Generate at https://myaccount.google.com/apppasswords (requires 2FA on).
set -uo pipefail

ENV_FILE="$HOME/.hermes/.env"
ADDRESS="${1:-}"

if [ -z "$ADDRESS" ]; then
    echo "Usage: bash setup/configure-mailbox.sh <email-address>"
    exit 2
fi

case "$ADDRESS" in
    *@gmail.com|*@googlemail.com)
        IMAP_HOST="imap.gmail.com"; SMTP_HOST="smtp.gmail.com" ;;
    *@outlook.com|*@hotmail.com|*@live.com)
        IMAP_HOST="outlook.office365.com"; SMTP_HOST="smtp-mail.outlook.com" ;;
    *)
        read -r -p "IMAP host: " IMAP_HOST
        read -r -p "SMTP host: " SMTP_HOST ;;
esac

echo "Address:   $ADDRESS"
echo "IMAP:      $IMAP_HOST"
echo "SMTP:      $SMTP_HOST"
echo
printf 'App password (input hidden): '
read -r -s APP_PASSWORD
echo

if [ -z "$APP_PASSWORD" ]; then
    echo "No password entered. Nothing changed."
    exit 2
fi

# Gmail displays app passwords in groups of four; the spaces are cosmetic.
APP_PASSWORD="${APP_PASSWORD// /}"

cp "$ENV_FILE" "$ENV_FILE.$(date +%Y%m%d-%H%M%S).bak"

python3 - "$ENV_FILE" "$ADDRESS" "$APP_PASSWORD" "$IMAP_HOST" "$SMTP_HOST" <<'PYEOF'
import re, sys

env_file, address, password, imap_host, smtp_host = sys.argv[1:6]
text = open(env_file, encoding="utf-8").read()

values = {
    "EMAIL_ADDRESS": address,
    "EMAIL_PASSWORD": password,
    "EMAIL_IMAP_HOST": imap_host,
    "EMAIL_SMTP_HOST": smtp_host,
    # Only accept mail from senders we expect. The gateway otherwise denies
    # unknown senders anyway, but being explicit is better than relying on
    # a default we did not set.
    "EMAIL_ALLOWED_SENDERS": "",
}

for key, value in values.items():
    line = f"{key}={value}"
    pattern = re.compile(rf"^#?\s*{re.escape(key)}=.*$", re.MULTILINE)
    text = pattern.sub(line, text, count=1) if pattern.search(text) \
        else text.rstrip("\n") + f"\n{line}\n"

open(env_file, "w", encoding="utf-8").write(text)
print("  written to .env")
PYEOF

chmod 600 "$ENV_FILE"

echo
echo "==> verifying IMAP login"
python3 - "$ADDRESS" "$APP_PASSWORD" "$IMAP_HOST" <<'PYEOF'
import imaplib, sys
address, password, host = sys.argv[1:4]
try:
    conn = imaplib.IMAP4_SSL(host, 993, timeout=30)
    conn.login(address, password)
    status, data = conn.select("INBOX", readonly=True)
    print(f"  LOGIN OK - INBOX has {data[0].decode()} messages")
    conn.logout()
except Exception as err:
    print(f"  LOGIN FAILED: {err}")
    print("  For Gmail this usually means the password is the account")
    print("  password rather than a 16-character app password.")
    sys.exit(1)
PYEOF
