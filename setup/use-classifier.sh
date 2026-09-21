#!/usr/bin/env bash
# Choose which model proposes the route.
#
#   bash setup/use-classifier.sh jev      (default)
#   bash setup/use-classifier.sh gemini
#
# Selectable rather than swapped in place, so a bad result is reverted
# with one command instead of a deploy. The deterministic safety rules
# run after whichever is chosen and are not affected either way.
ENV_FILE="$HOME/.hermes/.env"
WANT="${1:-jev}"
TMP=$(mktemp)
grep -vE '^HERMES_TRT_CLASSIFIER=' "$ENV_FILE" > "$TMP" 2>/dev/null || true
printf 'HERMES_TRT_CLASSIFIER=%s\n' "$WANT" >> "$TMP"
mv "$TMP" "$ENV_FILE"; chmod 600 "$ENV_FILE"
echo "HERMES_TRT_CLASSIFIER=$WANT"

# The cron runners exec python directly, so the value has to reach the
# process environment. Source the env file in each runner.
for r in "$HOME/.hermes/scripts/trt_mailpoll.sh" "$HOME/.hermes/scripts/trt_slackpoll.sh"; do
  [ -f "$r" ] || continue
  if ! grep -q 'HERMES_TRT_CLASSIFIER' "$r"; then
    python3 - "$r" "$WANT" <<'PY'
import sys
path, want = sys.argv[1], sys.argv[2]
lines = open(path).read().splitlines()
out = []
for ln in lines:
    if ln.startswith("PYTHONPATH="):
        ln = f'HERMES_TRT_CLASSIFIER={want} ' + ln
    out.append(ln)
open(path, "w").write("\n".join(out) + "\n")
PY
  else
    sed -i -E "s/HERMES_TRT_CLASSIFIER=[a-z]+/HERMES_TRT_CLASSIFIER=$WANT/" "$r"
  fi
  echo "  updated $(basename "$r")"
done
