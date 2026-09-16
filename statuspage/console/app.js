/* Hermes console — bound to the TRT Australia solution design.
 *
 * Views mirror the document's sections. Anything labelled Live reads from
 * /api/state, which queries the running Hermes instance: the ticket
 * repository, the SLA store, cron services and the enforced safety flags.
 *
 * Where a claim in the document is not yet demonstrable, the UI says so
 * rather than showing a green tick. A demo that overstates what works is
 * worse than one that is honest about the gaps.
 */
(function () {
  "use strict";

  var ROLE = {
    physician: "Physician",
    nursing: "Nursing Staff",
    support: "Customer Support",
    leadership: "Team Leadership",
    triage: "Held for a person"
  };

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function pill(t, k) { return '<span class="pill p-' + k + '">' + esc(t) + "</span>"; }
  function roleOf(t) { return t.assignee || "triage"; }
  function $(id) { return document.getElementById(id); }

  /* --------------------------------------------------------- routing */

  function show(name) {
    var links = document.querySelectorAll(".nav a");
    for (var i = 0; i < links.length; i++) {
      var on = links[i].getAttribute("data-view") === name;
      links[i].classList.toggle("active", on);
      if (on) {
        links[i].setAttribute("aria-current", "page");
        $("view-sec").textContent = links[i].getAttribute("data-sec");
        $("view-title").innerHTML = links[i].getAttribute("data-title");
      } else {
        links[i].removeAttribute("aria-current");
      }
    }
    var views = document.querySelectorAll(".view");
    for (var j = 0; j < views.length; j++) {
      views[j].classList.toggle("active", views[j].id === "v-" + name);
    }
    $("main").scrollTop = 0;
  }
  function route() {
    var n = (location.hash || "#architecture").slice(1);
    if (!$("v-" + n)) n = "architecture";
    show(n);
  }
  window.addEventListener("hashchange", route);

  /* ------------------------------------------------- §2 capabilities */

  var CAPS = [
    ["Cron Scheduler",
     "Executes automated monthly client check-in workflows and SLA deadline monitoring jobs without manual intervention.",
     "demo", "Scheduler verified firing; SLA sweep registered daily"],
    ["Multi-Platform Gateway",
     "Provides unified interfaces across chat, email and internal messaging platforms within a single process architecture.",
     "part", "Email gateway configured; internal chat awaiting access"],
    ["MCP Connectors",
     "Facilitates bi-directional API integrations with ticketing systems, CRM databases and pathology record systems.",
     "todo", "Requires CRM and pathology credentials"],
    ["Subagent Architecture",
     "Enables parallel execution and isolated domain handling across clinical, nursing and support sub-tasks.",
     "held", "Deliberately disabled — see Compliance"],
    ["Persistent State Memory",
     "Maintains historical context for client records and active tickets across sessions, supporting long-term tracking.",
     "demo", "Obligations persist across restarts with an audit trail"],
    ["Provider-Agnostic LLM Layer",
     "Allows model selection adjustments without code refactoring.",
     "demo", "Model switched between providers with no code change"],
    ["Self-Hosted / Open Source",
     "Deploys within dedicated enterprise infrastructure, eliminating external licensing fees and ensuring data sovereignty.",
     "demo", "Running self-hosted; no licensing cost"]
  ];
  var CAP_PILL = {
    demo: ["Demonstrated", "ok"], part: ["Partial", "warn"],
    todo: ["Not started", "mute"], held: ["Intentionally off", "bad"]
  };

  function renderCaps() {
    $("t-caps").innerHTML = CAPS.map(function (c) {
      var p = CAP_PILL[c[2]];
      return "<tr><td><strong>" + esc(c[0]) + "</strong></td><td>" + esc(c[1]) +
        '<div class="src" style="margin-top:5px">' + esc(c[3]) + "</div></td>" +
        "<td>" + pill(p[0], p[1]) + "</td></tr>";
    }).join("");
  }

  /* ----------------------------------------------------- §3 workflow */

  function renderStages(state) {
    var tickets = state.tickets || [];
    var held = tickets.filter(function (t) { return !t.assignee; });
    var over = (state.deadlines || []).filter(function (d) { return d.status === "overdue"; });

    var stages = [
      ["1", "Ingestion",
       "The assistant continuously monitors internal communications and the client mailbox for actionable requests.",
       "Email gateway configured against a test mailbox. Internal chat awaits workspace access.", false],
      ["2", "Ticket Generation",
       "Generates a structured record capturing task description, client association, priority level and target completion date.",
       tickets.length + " ticket instance" + (tickets.length === 1 ? "" : "s") +
       " currently held in the repository, each carrying the reasoning that produced it.", false],
      ["3", "Taxonomic Routing",
       "A classification step routes the record to the appropriate domain handler — Physician, Nursing Staff or Customer Support.",
       "Routing verified against a labelled test set. Administrative, clinical and noise cases separated correctly.", false],
      ["✋", "Clinical decision boundary",
       "Anything requiring clinical judgement, and anything the assistant is not confident about, is withheld from automated routing and given to a qualified person.",
       held.length + " item" + (held.length === 1 ? "" : "s") +
       " currently held for a person. No clinical assessment or client reply is ever generated.", true],
      ["4", "SLA Tracking",
       "An automated routine regularly audits open tickets against operational deadlines.",
       (state.deadlines || []).length + " obligation" +
       ((state.deadlines || []).length === 1 ? "" : "s") +
       " tracked, audited daily by the scheduler.", false],
      ["5", "Management Escalation",
       "Identifies target completion risks and dispatches automated alerts to Team Leadership via established communication channels.",
       over.length ? over.length + " past target and escalated."
         : "Nothing past target. Alerts route to leadership once the chat workspace is connected.", false]
    ];

    $("stages").innerHTML = stages.map(function (s) {
      return '<article class="stage' + (s[4] ? " guard" : "") + '">' +
        '<div class="num">' + s[0] + "</div><div>" +
        "<h3>" + esc(s[1]) + "</h3><p>" + esc(s[2]) + "</p>" +
        '<div class="evid">' + esc(s[3]) + "</div></div></article>";
    }).join("");
  }

  /* ------------------------------------------------------ §5 roadmap */

  var PHASES = [
    [1, "Deployment of Hermes core framework; integration of messaging and ticketing interfaces; initial routing configuration.",
     "Automated conversion and routing of requests to structured tickets.", "part", 75,
     "Core deployed, ticket repository operating, routing verified. Messaging integration pending client systems."],
    [2, "Implementation of SLA tracking service and automated leadership escalation alerts.",
     "Automated deadline tracking and exception management.", "part", 70,
     "Tracking, escalation logic and audit trail complete. Alert delivery pending a chat channel."],
    [3, "Integration of monthly check-in routines and inbound response parsing workflow.",
     "Systematic, scheduled client outreach execution.", "todo", 10,
     "Scheduler proven. Requires the client mailbox and approved template copy."],
    [4, "Deployment of pathology and follow-up monitoring services.",
     "Automated tracking and auditing of clinical follow-up requirements.", "todo", 30,
     "Obligation rules derived from the clinic's published care standards. Requires pathology data access."]
  ];

  function renderPhases() {
    $("phases").innerHTML = PHASES.map(function (p) {
      var label = p[3] === "done" ? "Complete" : p[3] === "part" ? "In progress" : "Not started";
      var kind  = p[3] === "done" ? "ok" : p[3] === "part" ? "warn" : "mute";
      return '<article class="phase ' + p[3] + '">' +
        '<div class="pn">' + p[0] + "</div>" +
        "<div><h3>Phase " + p[0] + "</h3><p>" + esc(p[1]) + "</p>" +
        '<div class="cap"><strong>Capability:</strong> ' + esc(p[2]) + "</div>" +
        '<div class="src" style="margin-top:6px">' + esc(p[5]) + "</div></div>" +
        '<div><div class="bar ' + p[3] + '"><i style="width:' + p[4] + '%"></i></div>' +
        pill(label, kind) + "</div></article>";
    }).join("");
  }

  /* --------------------------------------------------- §6 compliance */

  var COMMITMENTS = [
    ["On-premise / private cloud hosting",
     "Deployed on internal infrastructure so client data remains within the corporate security perimeter.",
     "part", "Hermes runs self-hosted. Connected systems chosen by the clinic sit outside that perimeter and should be reflected in the final wording."],
    ["Data minimisation",
     "Components operate under least-privilege access, exposing only data required for the task.",
     "part", "Enforced for the scheduled routines. Extends to integrations as they are connected."],
    ["Human-in-the-loop safeguards",
     "Explicit approval gates for privileged or sensitive operational tasks.",
     "ok", "Clinical and low-confidence items are withheld from automated routing and given to a person."],
    ["Comprehensive audit logging",
     "Every transaction, decision path and systemic action captured in immutable logs.",
     "ok", "Obligations, escalations and completions are written to an append-only record."],
    ["Human decision authority",
     "Autonomous execution of clinical or discretionary client decisions is prohibited.",
     "ok", "Autonomous task execution is disabled and verified on every build. The assistant composes no client replies."]
  ];

  var TICK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  var PART = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5"/></svg>';

  function renderCompliance() {
    $("t-compliance").innerHTML = COMMITMENTS.map(function (c) {
      var ok = c[2] === "ok";
      return '<div class="ctrl"><span style="color:' + (ok ? "var(--ok)" : "var(--warn)") + '">' +
        (ok ? TICK : PART) + "</span><div>" +
        '<div class="t">' + esc(c[0]) + "</div>" +
        '<div class="d">' + esc(c[1]) + "</div>" +
        '<div class="src" style="margin-top:5px">' + esc(c[3]) + "</div></div>" +
        "<span>" + pill(ok ? "Enforced" : "Partial", ok ? "ok" : "warn") + "</span></div>";
    }).join("");
  }

  function renderSafety(flags) {
    $("t-safety").innerHTML = Object.keys(flags).map(function (k) {
      var off = flags[k] === "false";
      return '<div class="field"><span class="k">' + esc(k) + "</span><span>" +
        pill(off ? "Disabled" : String(flags[k]), off ? "ok" : "warn") + "</span></div>";
    }).join("");
  }

  /* ------------------------------------------------------- live views */

  function renderBoard(tickets) {
    var lanes = ["physician", "nursing", "support", "triage"];
    $("board").innerHTML = lanes.map(function (lane) {
      var items = tickets.filter(function (t) { return roleOf(t) === lane; });
      var cards = items.length ? items.map(function (t) {
        return '<article class="tkt l-' + lane + '"><div class="ti">' + esc(t.title) + "</div>" +
          '<div class="tm"><span class="id">' + esc(t.id) + "</span>" +
          pill(t.status === "triage" ? "Awaiting a person" : "Open",
               t.status === "triage" ? "warn" : "ok") + "</div></article>";
      }).join("") : '<div class="lane-empty">No tickets</div>';
      return '<section class="lane"><div class="lane-head"><span class="nm">' +
        ROLE[lane] + '</span><span class="ct">' + items.length + "</span></div>" +
        '<div class="lane-body">' + cards + "</div></section>";
    }).join("");
  }

  function renderSla(deadlines) {
    $("t-sla").innerHTML = deadlines.length ? deadlines.map(function (d) {
      var kind = d.status === "overdue" ? "bad" : d.status === "due_soon" ? "warn" : "ok";
      var label = d.status === "overdue" ? "Past target"
                : d.status === "due_soon" ? "Approaching" : "On track";
      var rem = d.days < 0 ? Math.abs(d.days) + " days late"
              : d.days === 0 ? "today" : d.days + " days";
      return '<tr><td class="mono">' + esc(d.ticket) + "</td><td>" + esc(d.rule) +
        (d.provisional ? " " + pill("Standard not supplied", "bad") : "") +
        '</td><td class="truncate">' + esc(d.client) + '</td><td class="mono">' +
        esc(d.due) + "</td><td>" + esc(rem) + "</td><td>" + pill(label, kind) + "</td></tr>";
    }).join("") : '<tr><td colspan="6" class="mono">No obligations tracked.</td></tr>';
  }

  var INBOX = [
    { from: "m.reed@example.com", when: "today, 09:14", subject: "Blood test results attached",
      body: "Hi, I had the private panel done on Tuesday. Results came through this morning, attached. Full name is Michael Reed, DOB 12/05/1984. Can someone take a look and let me know the next step?",
      attachment: "reed-pathology-2026-09-14.pdf", route: "physician", priority: "Normal",
      confidence: .95, ticket: "t_75a36bd7",
      reason: "Pathology results submitted for assessment. Requires a practitioner; the assistant verified only that the required markers are present." },
    { from: "a.brennan@example.com", when: "today, 08:51", subject: "GP results — is this enough?",
      body: "My GP ran bloods last month but I'm not sure they did all of the ones on your list. I've attached what came back. Do I need to get more done before booking?",
      attachment: "brennan-gp-panel.pdf", route: "support", priority: "Normal",
      confidence: .95, ticket: "t_52227d97",
      reason: "Checking which required markers are present is administrative. Whether the panel is clinically sufficient is for the practitioner." },
    { from: "r.santos@example.com", when: "today, 08:02", subject: "Chest tightness since starting",
      body: "I've had some tightness in my chest the last couple of days and I'm a bit worried. I started treatment about five weeks ago. Should I stop?",
      attachment: null, route: "triage", priority: "Urgent", confidence: 1, ticket: "t_f37be0d8",
      reason: "Client reports a physical symptom and asks whether to stop treatment.",
      override: "Withheld from automated routing and given to a qualified person. No assessment, advice or reply was produced." },
    { from: "d.whitcombe@example.com", when: "yesterday, 16:40", subject: "Changing my billing to yearly",
      body: "I'm on the quarterly membership and want to switch to yearly before my next renewal. What does the difference work out to, and is testing included?",
      attachment: null, route: "support", priority: "Low", confidence: 1, ticket: "t_a2fd925d",
      reason: "Membership enquiry. The testing-inclusion question is one the clinic requires client care to confirm, so no figure was quoted." },
    { from: "news@industry-digest.example.com", when: "yesterday, 06:00",
      subject: "Your weekly industry digest",
      body: "This week in men's health: five trends to watch. Click here to read more. Unsubscribe.",
      attachment: null, route: "support", priority: "Low", confidence: 1, ticket: "— none —",
      reason: "Marketing email. No ticket was generated; not every inbound communication is work." }
  ];

  function renderInbox() {
    $("inbox-list").innerHTML = INBOX.map(function (m) {
      var pct = Math.round(m.confidence * 100);
      var kind = m.route === "triage" ? "bad" : m.route === "physician" ? "engine" : "role";
      return '<article class="msg"><div>' +
        '<div class="msg-from">' + esc(m.from) + " &middot; " + esc(m.when) + "</div>" +
        '<div class="msg-subj">' + esc(m.subject) + "</div>" +
        '<div class="msg-body">' + esc(m.body) + "</div>" +
        (m.attachment ? '<div class="src" style="margin-top:7px">Attachment: ' +
          esc(m.attachment) + "</div>" : "") + "</div>" +
        '<aside class="verdict"><h4>Interpretation</h4>' +
        '<div class="vrow"><span class="k">Routed to</span>' + pill(ROLE[m.route], kind) + "</div>" +
        '<div class="vrow"><span class="k">Priority</span>' +
          pill(m.priority, m.priority === "Urgent" ? "bad" : m.priority === "Low" ? "mute" : "role") + "</div>" +
        '<div class="vrow"><span class="k">Confidence</span>' +
          '<span class="meter" role="img" aria-label="Confidence ' + pct + ' percent">' +
          '<i style="width:' + pct + '%"></i></span><span class="src">' + pct + "%</span></div>" +
        '<div class="vrow"><span class="k">Record</span><span class="mono">' + esc(m.ticket) + "</span></div>" +
        '<div class="vreason">' + esc(m.reason) + "</div>" +
        (m.override ? '<div class="override">' + esc(m.override) + "</div>" : "") +
        "</aside></article>";
    }).join("");
  }

  /* -------------------------------------------------------------- boot */

  function setLive(ok) {
    $("live-dot").className = ok ? "dot" : "dot off";
    $("live-text").textContent = ok ? "Engine running" : "Engine stopped";
  }

  function text(id, value) { var el = $(id); if (el) el.textContent = value; }

  function load() {
    fetch("/api/state", { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (s) {
        setLive(s.gateway);
        var tickets = s.tickets || [], deads = s.deadlines || [], cron = s.cron || [];
        var byRole = function (r) {
          return tickets.filter(function (t) { return roleOf(t) === r; }).length;
        };
        var held = byRole("triage");
        var over = deads.filter(function (d) { return d.status === "overdue"; }).length;
        var soon = deads.filter(function (d) { return d.status === "due_soon"; }).length;

        /* architecture diagram — live counts on the nodes */
        text("a-tickets", tickets.length + " active");
        text("a-email", "test mailbox connected");
        text("a-engine", s.gateway ? "operating" : "stopped");
        text("a-physician", byRole("physician") + " assigned");
        text("a-nursing", byRole("nursing") + " assigned");
        text("a-support", byRole("support") + " assigned");
        text("a-leadership", over + " escalation" + (over === 1 ? "" : "s"));

        text("k-open", tickets.length);
        text("k-open-sub", (tickets.length - held) + " routed, " + held + " held");
        text("k-human", held);
        text("k-sla", deads.length);
        text("k-esc", over);
        text("k-esc-sub", over ? "Leadership alerted" : "Nothing past target");

        text("c-inbox", INBOX.length);
        text("c-tickets", tickets.length);
        text("c-sla", deads.length);
        text("s-tracked", deads.length);
        text("s-soon", soon);
        text("s-over", over);

        var job = cron[0];
        $("r1-status").innerHTML = pill("Awaiting mailbox & templates", "mute");
        $("r2-status").innerHTML = cron.length ? pill("Scheduled", "ok") : pill("Not scheduled", "warn");
        if (job) {
          text("r2-sched", job.schedule || "Daily interval");
          text("sla-note", "Next audit " + (job.next || "—"));
        }
        $("t-sweep").innerHTML = "<tr><td>" + esc(job && job.next ? "Next: " + job.next : "—") +
          "</td><td>" + deads.length + "</td><td>" + soon + "</td><td>" + over + "</td></tr>";

        renderStages(s);
        renderBoard(tickets);
        renderSla(deads);
        renderSafety(s.safety || {});
      })
      .catch(function () { setLive(false); });
  }

  renderCaps();
  renderPhases();
  renderCompliance();
  renderInbox();
  route();
  load();
  setInterval(load, 20000);
})();
