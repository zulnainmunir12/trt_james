# Deployment notes

Problems hit during the development install that **will recur** on the
client's Linux server. Recorded as they happened, with the evidence.

## 1. Install OS dependencies before running the Hermes installer

**Symptom:** the installer prints a line and then hangs forever. No timeout,
no error. It looks like a slow download.

**Cause:** it shells out to `sudo apt-get` in several places. When sudo wants
a password and nothing can supply one, the process blocks indefinitely.
`--non-interactive` does **not** prevent this. Confirmed by inspecting the
blocked process:

```
$ ps --ppid <pid> -o pid,stat,etime,cmd
631 S+  06:14  sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq libatomic1
```

It happened three separate times — `libatomic1`, `apt-get update`, and
`python3-dev` / `libffi-dev`.

**Fix — run this first:**

```bash
sudo apt update
sudo apt install -y build-essential libatomic1 ripgrep ffmpeg
```

`build-essential` is genuinely required: without a C++ compiler the installer
cannot build `node-pty` and exits 1. The others are optional but each one
causes another hang.

**If you must run unattended** (CI, provisioning script), put a `sudo` shim
that exits non-zero at the front of `PATH`. The installer's package steps are
best-effort (`|| true`) and degrade cleanly when sudo is simply unavailable —
they only hang when sudo exists but cannot authenticate.

```bash
mkdir -p /tmp/noskip && printf '#!/bin/sh\nexit 1\n' > /tmp/noskip/sudo
chmod +x /tmp/noskip/sudo
PATH=/tmp/noskip:$PATH bash install.sh --non-interactive --skip-setup
```

## 2. The model provider needs a high per-minute token allowance

**This has cost implications. Raise it with the client before committing.**

Hermes' baseline request — system prompt plus tool definitions — is large,
before the user types anything. It exceeded 8,000 tokens even with all
toolsets disabled (`-t ""`).

**Groq's free tier is unusable.** Verified directly against their API:

```
Request too large for model `openai/gpt-oss-120b` ... service tier `on_demand`
on tokens per minute (TPM): Limit 8000, Requested 50077
```

| Groq model | Free-tier TPM |
|---|---|
| openai/gpt-oss-120b | 8,000 |
| openai/gpt-oss-20b | 8,000 |
| qwen/qwen3.8-27b | 8,000 |
| groq/compound-mini | 70,000 |

`groq/compound-mini` clears the size limit but rejects `reasoning_effort`, and
it is an agentic model with its own tool loop — it fights Hermes rather than
serving it. Not a viable workaround.

## 3. Prefer a first-class provider over `provider: "custom"`

With `provider: "custom"` Hermes loses model metadata and cannot auto-detect
the context window, producing misleading "conversation too large" errors that
are actually HTTP 413s from the provider. Pinning `context_length` manually
did not fix it.

Google Gemini is first-class (`provider: "gemini"`, reads `GEMINI_API_KEY`)
and worked without any of that friction.

## 4. Gemini model availability is not what the model list implies

Probed 16 September 2026:

| Model | Result |
|---|---|
| `gemini-2.5-flash` | **404 — retired** (still listed by the API) |
| `gemini-2.5-pro` | **404 — retired** (still listed) |
| `gemini-3.7-flash` | 503 — overloaded, too new |
| `gemini-3.6-flash` | ✅ 200 |
| `gemini-3.5-flash` | ✅ 200 |
| `gemini-3-flash-preview` | ✅ 200 |

**Pin an explicit version** rather than `gemini-flash-latest`, so the model
cannot change under us while we are measuring routing accuracy.

Current choice: `gemini-3.6-flash` — 1,048,576 token context.

## 5. WSL-specific (development only)

The WSL Linux user password is separate from the Windows/RDP password. If
`sudo` rejects your Windows password, reset it from PowerShell:

```powershell
wsl -d Ubuntu -u root passwd <username>
```

`wsl -d Ubuntu -u root <cmd>` also runs as root with no password at all,
which is the quickest way to install packages during development.

Not applicable to the client's real Linux server.

## Verified working configuration

| Setting | Value |
|---|---|
| Hermes Agent | v0.21.3 (2026.9.14) |
| OS | Ubuntu 24.04 LTS (WSL2) |
| Python | 3.12.3 (installer accepts it in place of 3.11) |
| Node | v24.21.0, Hermes-managed |
| Provider | `gemini` |
| Model | `gemini-3.6-flash` |
| `reasoning_effort` | `low` |

Both smoke tests pass: plain generation, and tool calling.
