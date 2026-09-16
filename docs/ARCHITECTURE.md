# Architecture

What we are building, and the boundary it must not cross.

## The loop

```
  Slack (staff)          Email (client queries)
        |                        |
        +-----------+------------+
                    |
              [ HERMES ENGINE ]
                    |
        1. Ingest      — watch both channels continuously
        2. Interpret   — what is being asked, which client, how urgent, due when
        3. Ticket      — create a structured record
        4. Route       — to the role that should handle it
        5. Track       — keep watching until it is resolved
        6. Escalate    — warn leadership before it goes overdue
                    |
        +-----------+-----------+-----------+
        |           |           |           |
    Physician    Nursing     Support    Leadership
    (clinical)  (client      (admin)    (escalations
                consults)               only)
```

Plus two scheduled routines:

| Routine | Interval | What it does |
|---|---|---|
| Client check-in | Monthly | Send templated email → read the reply → create a ticket → assign |
| Pathology / follow-up monitor | Daily | Check what is due or expiring → alert before the deadline passes |

## The hard boundary

**Hermes coordinates work. It never makes clinical decisions.**

| Allowed | Not allowed |
|---|---|
| "This looks clinical — ticket #123 created, routed to the physician" | "This client needs treatment X" |
| "Blood panel is missing SHBG and prolactin" | "These testosterone levels indicate deficiency" |
| "Follow-up blood work is due in 6 days" | "The results look fine, no action needed" |
| "Escalating — ticket #88 is 2 days overdue" | Any judgement about whether treatment is appropriate |

Checking whether a *required marker is present* is administrative. Interpreting
a *value* is clinical. The line sits exactly there.

This is not caution we are imposing. It is the client's own operating model —
their website states on every page that independent AHPRA-registered doctors
make every medical decision.

## Routing must be allowed to say "I don't know"

If the classifier cannot confidently tell whether something is clinical or
administrative, it routes to a human to decide rather than guessing. A
misrouted clinical query in a health setting is a real risk, and the solution
design commits us to human-in-the-loop safeguards.

Design rule: **low confidence is an outcome, not a failure.**

## The hard part is memory, not intelligence

Understanding a single message is easy. Reliably holding 200 open tickets
across weeks and knowing which are drifting is the actual engineering. That
is the ticketing and SLA layer, and it is ours to build.

## What we build vs what already exists

| Component | Status |
|---|---|
| Hermes engine | Configure — installed |
| Chat ingestion | Connect — Hermes supports Slack natively |
| Email ingestion | Connect — Hermes has an IMAP/SMTP gateway |
| Scheduler | Use — Hermes has a built-in cron |
| Persistent memory | Use — Hermes has session memory |
| **Ticketing system** | **Build or self-host** — client has nothing |
| **SLA tracking + escalation** | **Build** — client has nothing |
| HubSpot integration | Build — client has HubSpot, it has a REST API |
| Booking | **Do not build** — Simply Schedule Appointments already exposes 112 REST routes |

### On ticketing

Writing a ticketing system from scratch is weeks of CRUD and staff UI, and
none of it is what makes this project valuable. Since APP compliance pushes us
to self-host anyway, self-hosting an open-source helpdesk and pointing Hermes
at its API is worth evaluating first.

- **FreeScout** — email-first, which matches how this clinic actually works; PHP, sits beside their existing WordPress stack
- **Zammad** — heavier, more featureful

Decision not yet made. Build-vs-buy should be a deliberate call, not a default.

## Attachment handling

Clients email blood results as PDFs. Verified from the Hermes docs:

- Inbound attachments are cached locally; PDFs are available for file access, images go to the vision tool
- PDF text extraction reads the **text layer only**, converted to Markdown, under 50 MB
- Scanned pages with no text layer *"silently convert to nothing"* — a coverage warning fires above 20% of pages or 10+ pages
- **OCR is not automatic.** It needs the bundled `ocr-and-documents` skill (~3–5 GB, runs locally via pymupdf and marker-pdf)

**Design rule:** Hermes must never mark a pathology ticket "results received"
on the strength of extraction alone. Empty extraction or a coverage warning
routes to a human.

**Open item:** PDF support auto-installs via `firecrawl-anydoc`. Whether that
converts locally or uploads to a cloud service is **unverified**. If it is
cloud, blood results leave the client's perimeter and we must use the local
OCR path instead. Resolve before this goes near real data.
