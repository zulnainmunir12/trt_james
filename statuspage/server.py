#!/usr/bin/env python3
"""Read-only status page for the TRT Australia operations assistant.

Deliberately NOT the Hermes dashboard. That one exposes API keys, the .env
file, the config, and a chat tab with a real terminal attached - putting it
behind a public URL would hand out shell access on this machine.

This serves live data from the real system (kanban board, SLA store, cron,
gateway) with no secrets, no controls and no way to talk to the agent.

    python3 statuspage/server.py --port 8090
    cloudflared tunnel --url http://localhost:8090
"""
from __future__ import annotations

import argparse
import html
import json
import re
import subprocess
import sys
from datetime import date, datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "src"))

HERMES = Path.home() / ".local" / "bin" / "hermes"
CONFIG = Path.home() / ".hermes" / "config.yaml"


def run(args: list[str], timeout: int = 30) -> str:
    try:
        proc = subprocess.run([str(HERMES), *args], capture_output=True,
                              text=True, timeout=timeout)
        return proc.stdout
    except Exception:  # noqa: BLE001 - the page must render even if a probe fails
        return ""


def strip_ansi(text: str) -> str:
    return re.sub(r"\x1b\[[0-9;]*m", "", text)


# --------------------------------------------------------------------------
# Data gathering - every value below comes from the running system
# --------------------------------------------------------------------------

def gateway_up() -> bool:
    return "is running" in run(["gateway", "status"])


def cron_jobs() -> list[dict]:
    out = strip_ansi(run(["cron", "list"]))
    jobs, current = [], {}
    for line in out.splitlines():
        line = line.strip()
        if line.startswith("Name:"):
            current["name"] = line.split(":", 1)[1].strip()
        elif line.startswith("Schedule:"):
            current["schedule"] = line.split(":", 1)[1].strip()
        elif line.startswith("Next run:"):
            current["next"] = line.split(":", 1)[1].strip()
            jobs.append(current)
            current = {}
    return jobs


def tickets() -> list[dict]:
    out = strip_ansi(run(["kanban", "list"]))
    rows = []
    for line in out.splitlines():
        match = re.match(r"^\s*\S?\s*(t_[0-9a-f]+)\s+(\S+)\s+(.+?)\s{2,}(.+)$", line)
        if match:
            ticket_id, status, assignee, title = match.groups()
            rows.append({
                "id": ticket_id,
                "status": status,
                "assignee": "" if assignee.strip() == "(unassigned)" else assignee.strip(),
                "title": title.strip(),
            })
    return rows


def deadlines() -> list[dict]:
    try:
        from hermes_trt.store import DeadlineStore
        store = DeadlineStore()
        today = date.today()
        return [
            {
                "ticket": d.ticket_id,
                "rule": d.rule.label,
                "client": d.client_ref,
                "due": d.due_date.isoformat(),
                "status": d.status(today).value,
                "days": d.days_remaining(today),
                "provisional": d.rule.provisional,
            }
            for d in store.open_deadlines()
        ]
    except Exception:  # noqa: BLE001
        return []


def sla_rules() -> list[dict]:
    try:
        from hermes_trt.sla import ALL_RULES
        return [
            {
                "label": r.label,
                "days": r.days_from_trigger,
                "warn": r.warn_days_before,
                "source": r.source,
                "provisional": r.provisional,
            }
            for r in ALL_RULES.values()
        ]
    except Exception:  # noqa: BLE001
        return []


def safety_flags() -> dict:
    try:
        text = CONFIG.read_text(encoding="utf-8")
    except Exception:  # noqa: BLE001
        return {}
    def flag(name: str) -> str:
        m = re.search(rf"{name}:\s*(\w+)", text)
        return m.group(1) if m else "unset"
    return {
        "Autonomous dispatch": flag("dispatch_in_gateway"),
        "Auto task decomposition": flag("auto_decompose"),
        "Telemetry": flag("enabled"),
    }


# --------------------------------------------------------------------------
# Rendering
# --------------------------------------------------------------------------

STYLE = """
:root{--bg:#0f1720;--panel:#16212c;--line:#24323f;--ink:#e8eef4;--dim:#93a4b3;
--ok:#4ec9a8;--warn:#e0b44a;--bad:#e06c6c;--accent:#6fb3e0}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
font:15px/1.55 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
.wrap{max-width:1060px;margin:0 auto;padding:28px 20px 60px}
h1{font-size:25px;margin:0 0 4px}
h2{font-size:15px;text-transform:uppercase;letter-spacing:.09em;color:var(--dim);
margin:34px 0 12px;font-weight:600}
.sub{color:var(--dim);margin:0 0 22px}
.banner{background:#3a2f16;border:1px solid #6b5520;color:#f0d79a;
padding:11px 14px;border-radius:7px;margin-bottom:24px;font-size:14px}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:9px;
padding:16px 18px;margin-bottom:12px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(168px,1fr));gap:12px}
.stat{background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:14px 16px}
.stat .n{font-size:27px;font-weight:600}
.stat .l{color:var(--dim);font-size:13px;margin-top:2px}
table{width:100%;border-collapse:collapse;font-size:14px}
th{text-align:left;color:var(--dim);font-weight:600;padding:7px 10px;
border-bottom:1px solid var(--line);font-size:12px;text-transform:uppercase;letter-spacing:.05em}
td{padding:9px 10px;border-bottom:1px solid var(--line);vertical-align:top}
tr:last-child td{border-bottom:none}
.pill{display:inline-block;padding:2px 9px;border-radius:11px;font-size:12px;font-weight:600}
.ok{background:rgba(78,201,168,.15);color:var(--ok)}
.warn{background:rgba(224,180,74,.15);color:var(--warn)}
.bad{background:rgba(224,108,108,.15);color:var(--bad)}
.neutral{background:rgba(147,164,179,.15);color:var(--dim)}
.flow{display:flex;flex-wrap:wrap;align-items:center;gap:9px;font-size:14px}
.node{background:#1d2a36;border:1px solid var(--line);border-radius:7px;padding:8px 13px}
.node.accent{border-color:var(--accent);color:var(--accent)}
.arrow{color:var(--dim)}
.src{color:var(--dim);font-size:12.5px;font-style:italic}
code{background:#0c141c;padding:1px 6px;border-radius:4px;font-size:13px}
.foot{color:var(--dim);font-size:13px;margin-top:34px;border-top:1px solid var(--line);padding-top:16px}
@media(max-width:620px){.wrap{padding:18px 14px 44px}h1{font-size:21px}}
"""


def pill(text: str, kind: str) -> str:
    return f'<span class="pill {kind}">{html.escape(text)}</span>'


def render() -> str:
    up = gateway_up()
    jobs = cron_jobs()
    tix = tickets()
    dls = deadlines()
    rules = sla_rules()
    flags = safety_flags()

    by_role: dict[str, int] = {}
    for t in tix:
        by_role[t["assignee"] or "unassigned"] = by_role.get(t["assignee"] or "unassigned", 0) + 1

    overdue = sum(1 for d in dls if d["status"] == "overdue")
    due_soon = sum(1 for d in dls if d["status"] == "due_soon")

    rows = "".join(
        f"<tr><td><code>{html.escape(t['id'])}</code></td>"
        f"<td>{html.escape(t['title'])}</td>"
        f"<td>{pill(t['assignee'] or 'awaiting a human', 'neutral' if t['assignee'] else 'warn')}</td>"
        f"<td>{pill(t['status'], 'warn' if t['status'] == 'triage' else 'ok')}</td></tr>"
        for t in tix
    ) or '<tr><td colspan="4" style="color:#93a4b3">No open tickets.</td></tr>'

    rule_rows = "".join(
        f"<tr><td>{html.escape(r['label'])}"
        + (" " + pill("OUR PLACEHOLDER", "bad") if r["provisional"] else "")
        + f"</td><td>{r['days']} days</td><td>{r['warn']} days before</td>"
        f"<td class='src'>{html.escape(r['source'][:150])}</td></tr>"
        for r in rules
    )

    job_rows = "".join(
        f"<tr><td><code>{html.escape(j.get('name', '?'))}</code></td>"
        f"<td>{html.escape(j.get('schedule', '?'))}</td>"
        f"<td>{html.escape(j.get('next', '?'))}</td></tr>"
        for j in jobs
    ) or '<tr><td colspan="3" style="color:#93a4b3">No scheduled jobs.</td></tr>'

    flag_rows = "".join(
        f"<tr><td>{html.escape(k)}</td><td>"
        + pill("disabled" if v == "false" else v, "ok" if v == "false" else "warn")
        + "</td></tr>"
        for k, v in flags.items()
    )

    stamp = datetime.now(timezone.utc).strftime("%d %b %Y, %H:%M UTC")

    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Hermes - TRT Australia operations assistant</title>
<style>{STYLE}</style></head><body><div class="wrap">

<h1>Hermes &mdash; internal operations assistant</h1>
<p class="sub">TRT Australia &middot; development build &middot; live system status</p>

<div class="banner"><strong>All data shown is synthetic.</strong> Client names,
messages and dates are invented for testing. No real client information is held
in this system.</div>

<h2>Status</h2>
<div class="grid">
  <div class="stat"><div class="n">{pill('running', 'ok') if up else pill('stopped', 'bad')}</div>
    <div class="l">Agent gateway</div></div>
  <div class="stat"><div class="n">{len(tix)}</div><div class="l">Open tickets</div></div>
  <div class="stat"><div class="n">{len(dls)}</div><div class="l">Tracked deadlines</div></div>
  <div class="stat"><div class="n" style="color:{'#e06c6c' if overdue else '#4ec9a8'}">{overdue}</div>
    <div class="l">Overdue</div></div>
  <div class="stat"><div class="n" style="color:{'#e0b44a' if due_soon else '#4ec9a8'}">{due_soon}</div>
    <div class="l">Due soon</div></div>
</div>

<h2>How a request flows</h2>
<div class="panel"><div class="flow">
  <span class="node">Client email</span><span class="arrow">&rarr;</span>
  <span class="node accent">Hermes reads &amp; classifies</span><span class="arrow">&rarr;</span>
  <span class="node">Ticket created</span><span class="arrow">&rarr;</span>
  <span class="node">Physician / Nursing / Support</span><span class="arrow">&rarr;</span>
  <span class="node">Deadline tracked</span><span class="arrow">&rarr;</span>
  <span class="node">Escalated to leadership if overdue</span>
</div>
<p class="sub" style="margin:14px 0 0">Anything clinical, or anything the assistant
is unsure about, is routed to a person instead. Hermes coordinates work; it does
not make clinical decisions.</p></div>

<h2>Live ticket board</h2>
<div class="panel"><table>
<tr><th>Ticket</th><th>Subject</th><th>Owner</th><th>State</th></tr>
{rows}</table></div>

<h2>Deadline rules</h2>
<div class="panel"><table>
<tr><th>Rule</th><th>Due</th><th>Warning</th><th>Where this came from</th></tr>
{rule_rows}</table></div>

<h2>Scheduled routines</h2>
<div class="panel"><table>
<tr><th>Job</th><th>Schedule</th><th>Next run</th></tr>
{job_rows}</table></div>

<h2>Safety controls</h2>
<div class="panel"><table>{flag_rows}</table>
<p class="sub" style="margin:12px 0 0">Autonomous execution is switched off. The
assistant may not act on clinical work by itself; every such item goes to a
qualified human.</p></div>

<h2>Not yet connected</h2>
<div class="panel"><table>
<tr><td>Internal chat (Slack)</td><td>{pill('awaiting workspace access', 'warn')}</td></tr>
<tr><td>Client mailbox</td><td>{pill('test mailbox connected', 'warn')}</td></tr>
<tr><td>Client records (HubSpot)</td><td>{pill('awaiting API access', 'warn')}</td></tr>
<tr><td>Staff roster</td><td>{pill('placeholder roles in use', 'warn')}</td></tr>
</table></div>

<p class="foot">Generated {stamp} from the running system. Read-only page &mdash;
no controls, no configuration, no client data.</p>
</div></body></html>"""


#: v2 is the console. v1 is kept on disk for reference but is not served.
CONSOLE_DIR = Path(__file__).resolve().parent / "console-v2"

#: Only these files are servable. An allowlist rather than path arithmetic:
#: this is going behind a public URL, and a traversal bug here would expose
#: the filesystem.
STATIC = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/index.html": ("index.html", "text/html; charset=utf-8"),
    "/app.css": ("app.css", "text/css; charset=utf-8"),
    "/app.js": ("app.js", "text/javascript; charset=utf-8"),
    "/trt-logo.webp": ("trt-logo.webp", "image/webp"),
    "/_m.html": ("_m.html", "text/html; charset=utf-8"),
}


def api_state() -> dict:
    """Everything the console renders from the running system."""
    return {
        "gateway": gateway_up(),
        "tickets": tickets(),
        "deadlines": deadlines(),
        "rules": sla_rules(),
        "cron": cron_jobs(),
        "safety": safety_flags(),
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


class Handler(BaseHTTPRequestHandler):
    def _send(self, body: bytes, content_type: str, status: int = 200) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        path = self.path.split("?", 1)[0]

        if path.startswith("/health"):
            self._send(json.dumps({"ok": True, "gateway": gateway_up()}).encode(),
                       "application/json")
            return

        if path.startswith("/api/console"):
            try:
                from hermes_trt.console_api import state as console_state
                payload = console_state()
            except Exception as err:  # noqa: BLE001 - never 500 the console
                payload = {"live": False, "error": str(err), "tickets": []}
            self._send(json.dumps(payload, default=str).encode(),
                       "application/json")
            return

        if path.startswith("/api/state"):
            self._send(json.dumps(api_state(), default=str).encode(),
                       "application/json")
            return

        if path == "/status":          # the plain summary page, kept as a fallback
            self._send(render().encode("utf-8"), "text/html; charset=utf-8")
            return

        entry = STATIC.get(path)
        if entry:
            filename, content_type = entry
            try:
                self._send((CONSOLE_DIR / filename).read_bytes(), content_type)
            except OSError:
                self._send(b"Not found", "text/plain; charset=utf-8", 404)
            return

        self._send(b"Not found", "text/plain; charset=utf-8", 404)

    def do_POST(self) -> None:  # noqa: N802
        """The console's write path.

        There is no authentication yet, which is a deliberate, temporary
        state agreed for the demo: the console is reachable over a tunnel
        and anyone with that link can move work. Before this is pointed at
        the clinic's real data it needs a login, and these handlers are the
        surface that has to be behind it.

        Deliberately narrow even so - each route does one thing and
        validates its own input, rather than accepting a general update.
        """
        path = self.path.split("?", 1)[0]
        try:
            length = int(self.headers.get("Content-Length") or 0)
            payload = json.loads(self.rfile.read(length) or b"{}")
        except Exception:  # noqa: BLE001
            self._send(json.dumps({"ok": False, "error": "bad JSON"}).encode(),
                       "application/json", 400)
            return

        if path == "/api/ticket/status":
            self._ticket_status(payload)
            return

        if path == "/api/schedule":
            self._schedule(payload)
            return

        self._send(json.dumps({"ok": False, "error": "unknown route"}).encode(),
                   "application/json", 404)

    def _schedule(self, payload: dict) -> None:
        """Change when a routine runs, or pause it."""
        try:
            from hermes_trt.schedules import ScheduleError, set_enabled, set_schedule
            job = str(payload.get("id", ""))
            if "enabled" in payload:
                job_state = set_enabled(job, bool(payload["enabled"]))
            else:
                job_state = set_schedule(job, str(payload.get("schedule", "")))
        except ScheduleError as err:
            self._send(json.dumps({"ok": False, "error": str(err)}).encode(),
                       "application/json", 400)
            return
        except Exception as err:  # noqa: BLE001
            self._send(json.dumps({"ok": False, "error": str(err)}).encode(),
                       "application/json", 500)
            return
        self._send(json.dumps({"ok": True, "job": job_state}).encode(),
                   "application/json")

    def _ticket_status(self, payload: dict) -> None:
        try:
            from hermes_trt.board import BoardError, set_status
            result = set_status(str(payload.get("id", "")),
                                str(payload.get("status", "")),
                                str(payload.get("by", "")))
        except BoardError as err:
            self._send(json.dumps({"ok": False, "error": str(err)}).encode(),
                       "application/json", 400)
            return
        except Exception as err:  # noqa: BLE001
            self._send(json.dumps({"ok": False, "error": str(err)}).encode(),
                       "application/json", 500)
            return
        self._send(json.dumps({"ok": True, **result}).encode(),
                   "application/json")

    def log_message(self, fmt: str, *args) -> None:
        pass


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8090)
    ap.add_argument("--host", default="127.0.0.1")
    args = ap.parse_args()
    server = HTTPServer((args.host, args.port), Handler)
    print(f"Status page: http://{args.host}:{args.port}/")
    server.serve_forever()
    return 0


if __name__ == "__main__":
    sys.exit(main())
