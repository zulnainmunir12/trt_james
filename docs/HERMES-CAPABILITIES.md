# What Hermes gives us, verified

Tested on the running install, 16 September 2026. Everything below was run,
not read off a docs page.

## The finding that changes our scope

**Hermes has a built-in kanban board, and it is a usable ticketing substrate.**

We had it in the plan to build a ticketing system, or self-host FreeScout /
Zammad. Neither may be necessary. The board is a durable SQLite store with a
dispatcher that already runs inside the gateway.

Verified by creating a real ticket:

```
$ hermes kanban create "Review pathology results for client James Harding (synthetic)"
Created t_b61c04c2  (ready, assignee=-)

$ hermes kanban list
▶ t_b61c04c2  ready  (unassigned)  Review pathology results for client ...
```

### What maps directly onto our requirements

| Our requirement | Kanban feature |
|---|---|
| Create a ticket | `kanban create` with `title`, `--body` |
| Route to a role | `--assignee` (profile name) |
| Priority | `--priority` |
| **Don't guess when unsure** | **`--triage`** — parks the task for a human to flesh out and promote |
| **Don't duplicate a ticket** | **`--idempotency-key`** — returns the existing id instead of creating a second |
| Attach blood results | `kanban attach <id> <path>` with MIME type |
| Progress and audit trail | `comment`, `show` (comments + events), `log`, `runs` |
| Completion / blocking | `complete`, `block`, `unblock`, `request-review` |
| Stale work detection | Dispatcher reclaims stale claims and auto-blocks after `failure_limit` |
| Per-client namespacing | `--project`, `--tenant` |
| Notifications | `notify-subscribe` / `notify-list` |

`--triage` and `--idempotency-key` are the two that matter most:

- **`--triage`** implements the "routing must be allowed to say I don't know"
  rule from ARCHITECTURE.md, natively.
- **`--idempotency-key`** prevents duplicate tickets. The email gateway polls
  every 15 seconds; without dedup, one client email could raise several
  tickets. We would have had to build this.

### What is still ours to build

**Deadlines and SLA tracking.** There is no due-date field. `kanban schedule`
sounds like it but is only a status transition with a note:

```
usage: hermes kanban schedule [-h] [--ids IDS [IDS ...]] task_id [reason ...]
```

So the SLA layer — due dates, the pre-expiry warning, the escalation to
leadership — sits on top of the board. That is a much smaller job than a
whole ticketing system, and it is the part that is specific to this client
anyway (8-week follow-up, 4-month result expiry, renewal dates).

**Recommendation:** build the SLA layer over the native kanban board. Revisit
FreeScout only if the client needs a staff-facing web UI the board cannot give
them — worth asking, because staff will need *somewhere* to look at their work.

## Scheduler — verified working

Cron fires. Proven with a `--no-agent` script job on a 1-minute schedule:

```
2026-09-16T17:00:03+05:00
2026-09-16T17:02:03+05:00
```

Two constraints found:

1. **Cron scripts must live in `~/.hermes/scripts/`** and be referenced by
   filename only. Absolute paths are rejected outright.
2. **Cron only fires while the gateway process is running.** The gateway *is*
   the scheduler. On the client's server this must be a supervised service
   (systemd), not a terminal process. In WSL, `hermes gateway run` in the
   foreground (or under tmux) is the supported mode.

## Production concern: SQLite version

The gateway logs this on every database, once per process:

> linked SQLite 3.45.1 ... is vulnerable to the WAL-reset corruption bug
> (https://sqlite.org/wal.html#walresetbug) — using journal_mode=DELETE
> instead of enabling WAL. Upgrade to SQLite 3.51.3+

Hermes is protecting itself by disabling WAL, so it is not unsafe — but
`journal_mode=DELETE` is slower under concurrent writes, and every ticket,
comment and audit event goes through SQLite.

**For a health-records system with immutable audit logging, this needs
resolving before go-live.** The client's server should run SQLite 3.51.3+
(or the 3.50.7 / 3.44.6 backports). Ubuntu 24.04 ships 3.45.1, so this is not
WSL-specific — it will recur on their server.

Added to DEPLOYMENT-NOTES.

## Security defaults — good

Two warnings on gateway start, both sensible defaults:

- `No env user allowlists configured` — messaging platforms **deny unknown
  senders** by default. We opt in explicitly per platform. Correct posture for
  a health context.
- `No messaging platforms enabled` — nothing is connected until we configure
  it with real credentials.

Telemetry is already off:

```yaml
telemetry:
  shared_metrics:
    enabled: false
    send: false
```

Worth stating to the client: no usage data leaves their machine.

## Skills already bundled that we will use

From `~/.hermes/hermes-agent/skills/`:

| Skill area | Relevance |
|---|---|
| `productivity/pdf` | Pathology result extraction |
| `productivity/document-to-action-items` | Turning documents into tasks |
| `email` | Email handling patterns |
| `autonomous-ai-agents` | Hermes' own reference docs — cron, kanban, gateway |

Still to install: `ocr-and-documents` (~3–5 GB) for scanned pathology PDFs.
