#!/usr/bin/env bash
#
# Saves the Slack bot token into Hermes's config and proves it works.
#
# Run it from Windows with a single line (no WSL knowledge needed):
#   wsl -d Ubuntu bash /mnt/c/Projects/hermes-trt-ops/setup/save-slack-token.sh
#
# The token is typed hidden and written straight to ~/.hermes/.env, so it never
# appears on screen, in shell history, or in a chat window.

set -uo pipefail

ENV_FILE="$HOME/.hermes/.env"
G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; B=$'\033[1m'; D=$'\033[2m'; N=$'\033[0m'

printf '\n%s  Save the Slack bot token%s\n\n' "$B" "$N"
printf '%s  Get it from: api.slack.com/apps -> your app -> OAuth & Permissions\n' "$D"
printf '  -> "Bot User OAuth Token" -> Copy. It starts with xoxb-%s\n\n' "$N"

printf '  %sPaste the token (nothing will appear as you type), then Enter:%s ' "$B" "$N"
read -rs TOKEN
printf '\n\n'

if [[ -z "$TOKEN" ]]; then
  printf '  %sNothing pasted. Run this again once you have the token.%s\n\n' "$Y" "$N"
  exit 1
fi

if [[ "$TOKEN" != xoxb-* ]]; then
  printf '  %sThat does not start with xoxb-%s\n' "$Y" "$N"
  printf '%s  Slack shows several tokens on that page:\n' "$D"
  printf '    xoxb-  bot token      <- this is the one we need\n'
  printf '    xoxp-  user token\n'
  printf '    xapp-  app-level token%s\n\n' "$N"
  printf '  Save it anyway? [y/N] '
  read -r yn
  [[ "$yn" =~ ^[Yy] ]] || exit 1
fi

# Check it against Slack BEFORE writing, so a bad token is never stored.
printf '  Checking it with Slack...\n'
AUTH=$(curl -sS --max-time 20 -H "Authorization: Bearer $TOKEN" \
        https://slack.com/api/auth.test 2>/dev/null || echo '{"ok":false,"error":"no_network"}')

if ! printf '%s' "$AUTH" | grep -q '"ok":true'; then
  ERR=$(printf '%s' "$AUTH" | sed -E 's/.*"error":"([^"]*)".*/\1/')
  printf '\n  %sSlack rejected it: %s%s\n' "$R" "$ERR" "$N"
  case "$ERR" in
    invalid_auth|not_authed)
      printf '%s  Usually means the app has not been installed to the workspace yet,\n' "$D"
      printf '  or only part of the token was copied.%s\n' "$N" ;;
    account_inactive)
      printf '%s  The app was removed from the workspace. Reinstall it.%s\n' "$D" "$N" ;;
  esac
  printf '\n  Nothing was saved.\n\n'
  exit 1
fi

TEAM=$(printf '%s' "$AUTH" | sed -E 's/.*"team":"([^"]*)".*/\1/')
USER=$(printf '%s' "$AUTH" | sed -E 's/.*"user":"([^"]*)".*/\1/')
printf '  %sConnected%s as %s in workspace "%s"\n\n' "$G" "$N" "$USER" "$TEAM"

# Upsert, so re-running replaces rather than appends a second line.
mkdir -p "$(dirname "$ENV_FILE")"
touch "$ENV_FILE"
TMP=$(mktemp)
grep -vE '^SLACK_BOT_TOKEN=' "$ENV_FILE" > "$TMP" 2>/dev/null || true
printf 'SLACK_BOT_TOKEN=%s\n' "$TOKEN" >> "$TMP"
mv "$TMP" "$ENV_FILE"
chmod 600 "$ENV_FILE"
printf '  %sSaved%s to %s (readable only by you)\n\n' "$G" "$N" "$ENV_FILE"

# Which channels can it actually see? This is the part people get wrong:
# the bot reads nothing until it is invited.
CONV=$(curl -sS --max-time 20 -H "Authorization: Bearer $TOKEN" \
        "https://slack.com/api/users.conversations?types=public_channel&limit=100" \
        2>/dev/null || echo '{"ok":false}')

if printf '%s' "$CONV" | grep -q '"ok":true'; then
  NAMES=$(printf '%s' "$CONV" | grep -oE '"name":"[^"]+"' | sed 's/"name":"//;s/"//' | sort -u)
  if [[ -n "$NAMES" ]]; then
    printf '  %sChannels it can read:%s\n' "$B" "$N"
    printf '%s' "$NAMES" | while read -r c; do printf '    #%s\n' "$c"; done
    printf '\n  %sSlack is connected.%s\n\n' "$G" "$N"
  else
    printf '  %sThe token works, but the bot is not in any channel yet.%s\n' "$Y" "$N"
    printf '%s  In Slack, open the channel you want watched and send:\n' "$D"
    printf '      /invite @Care Ops\n'
    printf '  then run this again.%s\n\n' "$N"
  fi
else
  ERR=$(printf '%s' "$CONV" | sed -E 's/.*"error":"([^"]*)".*/\1/')
  printf '  %sToken saved, but listing channels failed: %s%s\n' "$Y" "$ERR" "$N"
  [[ "$ERR" == missing_scope* ]] && printf '%s  The channels:read permission was not granted - re-paste the manifest\n  and reinstall the app.%s\n' "$D" "$N"
  printf '\n'
fi
