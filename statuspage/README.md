# Status page

Read-only page for sharing with the client. Serves **live** data from the
running system — kanban board, SLA store, cron jobs, gateway state.

## Run

```bash
.venv/bin/python statuspage/server.py --port 8090
cloudflared tunnel --url http://127.0.0.1:8090
```

cloudflared prints a `https://<random>.trycloudflare.com` URL. No account,
no DNS, no firewall changes.

## Why not just expose the Hermes dashboard (port 9119)

It is an admin console. Its own menu includes **Keys**, **Env**, **Config**
and a **Chat** tab, and the chat tab embeds a real terminal over a POSIX PTY.

Putting that behind a public URL would hand out:

- the Gemini API key (Keys page)
- the mailbox app password (Env page)
- the ability to re-enable the autonomous dispatcher (Config page)
- **shell access on the host** (Chat page)

Hermes refuses a public bind without an auth provider for exactly this
reason. The dashboard stays on localhost.

## What this page deliberately does not have

No controls, no configuration, no agent chat, no secrets. `POST` returns 405.
Everything it shows is read from the system and rendered as text.

## Before sharing a link

- A `trycloudflare.com` URL is **public to anyone holding it** — there is no
  password. Acceptable because the content is synthetic and read-only.
- Take the tunnel down after the demo; the URL changes each run anyway.
- Every client name on the page is invented, and the page says so at the top.
  Keep it that way: no real client data goes near a public URL.
