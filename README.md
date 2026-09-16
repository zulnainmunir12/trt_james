# Hermes — TRT Australia internal operations assistant

Build repo for the AI operations coordinator described in `TRT_Solution_Design_v8`.
Hermes watches the client's internal chat and client email, turns incoming
requests into tickets, routes them to the right role, tracks deadlines, and
escalates to leadership when work is going overdue.

**Hermes coordinates work. It does not make clinical decisions.** Every
clinical or discretionary judgement routes to a qualified human. See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Status

| Piece | State |
|---|---|
| Hermes Agent runtime | ✅ Installed and verified (v0.21.3) |
| Model provider | ✅ Google Gemini, `gemini-3.6-flash` |
| Tool calling | ✅ Verified |
| Slack ingestion | ⬜ Not started |
| Email ingestion | ⬜ Not started |
| Ticketing system | ⬜ Not started — must be built |
| SLA tracking + escalation | ⬜ Not started — must be built |
| HubSpot integration | ⬜ Not started |

Nothing is connected to any real client system. All work so far is local,
against dummy data.

## Where things live

Hermes itself is **not** in this repo. It installs to the user's home
directory and is overwritten by `hermes update`, so it must not be tracked here.

| What | Path |
|---|---|
| Hermes code | `~/.hermes/hermes-agent` (inside WSL Ubuntu) |
| Hermes config | `~/.hermes/config.yaml` |
| API keys | `~/.hermes/.env` — **never committed** |
| Scheduler jobs | `~/.hermes/cron/` |
| Persistent memory | `~/.hermes/sessions/` |
| `hermes` binary | `~/.local/bin/hermes` |
| This repo | `C:\Projects\hermes-trt-ops` = `/mnt/c/Projects/hermes-trt-ops` in WSL |

This repo holds what we author: setup scripts, config-as-code, the ticketing
and SLA services, dummy fixtures, and the documentation.

## Environment

Development runs in **WSL2 Ubuntu 24.04**, not native Windows. Nous flag
native Windows as still in testing, and the client's production target is a
Linux server — so developing on Linux keeps parity.

## Quick start

```bash
# From Windows PowerShell — install OS dependencies FIRST (see docs/DEPLOYMENT-NOTES.md
# for why: the Hermes installer hangs forever on sudo prompts otherwise).
wsl -d Ubuntu -u root apt update
wsl -d Ubuntu -u root apt install -y build-essential libatomic1 ripgrep ffmpeg

# Then, inside WSL:
bash setup/install-hermes.sh
python3 setup/configure-provider.py gemini "$YOUR_API_KEY"
bash setup/smoke-test.sh
```

## Documentation

| Doc | What's in it |
|---|---|
| [docs/FINDINGS-client-systems.md](docs/FINDINGS-client-systems.md) | What the client actually runs today, with evidence |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | What we're building and the safety boundary |
| [docs/DEPLOYMENT-NOTES.md](docs/DEPLOYMENT-NOTES.md) | Install gotchas that will recur on the client's server |
| [docs/OPEN-QUESTIONS.md](docs/OPEN-QUESTIONS.md) | What we still need from the client, and what blocks what |
