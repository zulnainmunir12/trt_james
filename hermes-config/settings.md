# Hermes configuration

`~/.hermes/config.yaml` is a 115 KB vendor file that `hermes update` rewrites,
so it is not tracked here. This records only the settings **we** changed, with
the reason. Re-apply with `setup/configure-provider.py`.

## Applied settings

| Key | Value | Why |
|---|---|---|
| `model.default` | `"gemini-3.6-flash"` | Pinned version. `gemini-3.7-flash` returns 503, `2.5-flash` is retired (404), and `-latest` could shift under us while we measure routing accuracy |
| `model.provider` | `"gemini"` | First-class provider. `custom` loses model metadata and produces misleading errors |
| `model.base_url` | *(unset)* | The gemini provider supplies its own endpoint |
| `model.context_length` | *(unset)* | Auto-detected — 1,048,576 tokens |
| `reasoning_effort` | `"low"` | Enough for classification and routing; keeps latency and cost down |

## Secrets

Live in `~/.hermes/.env`, chmod 600, never committed. See `.env.example`
for the variable names.

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` / `GOOGLE_API_KEY` | Model provider |
| `GROQ_API_KEY` | Unused for chat; Groq's free tier caps at 8k TPM. Kept only because Hermes can use Groq for Whisper transcription |

## Settings we will need later

Not yet configured — listed so they are not forgotten.

| Area | Key | Note |
|---|---|---|
| Email gateway | IMAP/SMTP host, user, password, allowed senders | Needs a dedicated mailbox, not a shared human inbox |
| Email polling | `EMAIL_POLL_INTERVAL` | Defaults to 15s |
| Slack gateway | Bot token, channels | `hermes slack` generates the app manifest |
| Cron | Job definitions | Monthly check-in, daily pathology monitor |
| OCR | `ocr-and-documents` skill | ~3-5 GB. Required for scanned pathology PDFs |

## Things that bit us

Recorded so nobody re-derives them:

- `reasoning_effort: "none"` still sends the parameter. The docstring says
  **"YAML False = disabled"** — it wants a boolean. (Moot on Gemini, which
  accepts the parameter; it mattered on Groq's compound-mini.)
- With `provider: "custom"`, pinning `context_length` manually does **not**
  fix the false "conversation too large" error, because the real cause is a
  413 from the provider.
