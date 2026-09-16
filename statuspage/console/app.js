/* Hermes Ops Console — view routing and live data binding.
 *
 * Panels marked "Live" render from /api/state, which reads the running
 * agent: the kanban board, the deadline store, cron jobs and the safety
 * flags. Panels marked "Illustrative" are static and say so, because
 * pretending we have a client record we cannot reach would be worse than
 * showing the shape of one honestly.
 */
(function () {
  "use strict";

  var ROLE_LABEL = {
    physician: "Physician",
    nursing: "Nursing",
    support: "Client care",
    leadership: "Leadership",
    triage: "A person"
  };

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function pill(text, kind) {
    return '<span class="pill p-' + kind + '">' + esc(text) + "</span>";
  }

  function roleOf(ticket) {
    if (!ticket.assignee) return "triage";
    return ticket.assignee;
  }

  function rolePill(ticket) {
    var role = roleOf(ticket);
    return pill(ROLE_LABEL[role] || ticket.assignee, role);
  }

  /* ------------------------------------------------------------ routing */

  function show(name) {
    var links = document.querySelectorAll(".nav a");
    for (var i = 0; i < links.length; i++) {
      var on = links[i].getAttribute("data-view") === name;
      links[i].classList.toggle("active", on);
      if (on) links[i].setAttribute("aria-current", "page");
      else links[i].removeAttribute("aria-current");
    }
    var views = document.querySelectorAll(".view");
    for (var j = 0; j < views.length; j++) {
      views[j].classList.toggle("active", views[j].id === "v-" + name);
    }
    var link = document.querySelector('.nav a[data-view="' + name + '"]');
    document.getElementById("view-title").textContent =
      link ? link.textContent.trim().replace(/\s*\d+$/, "") : "Overview";
    document.getElementById("main").scrollTop = 0;
  }

  function routeFromHash() {
    var name = (location.hash || "#overview").slice(1);
    if (!document.getElementById("v" + "-" + name)) name = "overview";
    show(name);
  }

  window.addEventListener("hashchange", routeFromHash);

  /* --------------------------------------------------------------- data */

  function setLive(ok) {
    document.getElementById("live-dot").className = ok ? "dot" : "dot off";
    document.getElementById("live-text").textContent =
      ok ? "Agent running" : "Agent stopped";
  }

  function renderActivity(tickets) {
    var body = document.getElementById("t-activity");
    if (!tickets.length) {
      body.innerHTML = '<tr><td colspan="4" class="mono">No tickets yet.</td></tr>';
      return;
    }
    body.innerHTML = tickets.slice(0, 8).map(function (t) {
      var held = !t.assignee;
      return "<tr>" +
        '<td class="mono">' + esc(t.id) + "</td>" +
        '<td class="truncate">' + esc(t.title) + "</td>" +
        "<td>" + rolePill(t) + "</td>" +
        "<td>" + pill(held ? "Held" : "Assigned", held ? "warn" : "ok") + "</td>" +
        "</tr>";
    }).join("");
  }

  function renderAttention(state) {
    var held = state.tickets.filter(function (t) { return !t.assignee; });
    var over = state.deadlines.filter(function (d) { return d.status === "overdue"; });
    var soon = state.deadlines.filter(function (d) { return d.status === "due_soon"; });
    var out = [];

    if (over.length) {
      out.push('<div class="field"><span class="k">' + pill("Overdue", "bad") +
        " " + over.length + " deadline" + (over.length === 1 ? "" : "s") +
        '</span><span class="v src">Leadership alerted</span></div>');
    }
    if (soon.length) {
      out.push('<div class="field"><span class="k">' + pill("Due soon", "warn") +
        " " + soon.length + " approaching</span>" +
        '<span class="v src">Within the warning window</span></div>');
    }
    held.forEach(function (t) {
      out.push('<div class="field"><span class="k">' + pill("For a person", "bad") +
        " " + esc(t.title.slice(0, 46)) + '</span><span class="v src">Not assigned</span></div>');
    });
    if (!out.length) {
      out.push('<p class="src" style="margin:4px 0">Nothing needs attention.</p>');
    }
    document.getElementById("t-attention").innerHTML = out.join("");
  }

  function renderBoard(tickets) {
    var lanes = ["physician", "nursing", "support", "triage"];
    document.getElementById("board").innerHTML = lanes.map(function (lane) {
      var items = tickets.filter(function (t) { return roleOf(t) === lane; });
      var cards = items.length
        ? items.map(function (t) {
            return '<article class="tkt l-' + lane + '">' +
              '<div class="ti">' + esc(t.title) + "</div>" +
              '<div class="tm"><span class="id">' + esc(t.id) + "</span>" +
              pill(t.status === "triage" ? "Awaiting a person" : "Ready",
                   t.status === "triage" ? "warn" : "ok") +
              "</div></article>";
          }).join("")
        : '<div class="lane-empty">Nothing here</div>';
      return '<section class="lane"><div class="lane-head">' +
        '<span class="nm">' + ROLE_LABEL[lane] + "</span>" +
        '<span class="ct">' + items.length + "</span></div>" +
        '<div class="lane-body">' + cards + "</div></section>";
    }).join("");
  }

  function renderSla(deadlines) {
    var body = document.getElementById("t-sla");
    if (!deadlines.length) {
      body.innerHTML = '<tr><td colspan="6" class="mono">No deadlines tracked yet.</td></tr>';
      return;
    }
    body.innerHTML = deadlines.map(function (d) {
      var kind = d.status === "overdue" ? "bad" : d.status === "due_soon" ? "warn" : "ok";
      var label = d.status === "overdue" ? "Overdue"
                : d.status === "due_soon" ? "Due soon" : "On track";
      var remaining = d.days < 0 ? Math.abs(d.days) + "d late"
                    : d.days === 0 ? "today" : "in " + d.days + "d";
      return "<tr>" +
        '<td class="mono">' + esc(d.ticket) + "</td>" +
        "<td>" + esc(d.rule) +
          (d.provisional ? " " + pill("Not yet agreed", "bad") : "") + "</td>" +
        '<td class="truncate">' + esc(d.client) + "</td>" +
        '<td class="mono">' + esc(d.due) + "</td>" +
        "<td>" + esc(remaining) + "</td>" +
        "<td>" + pill(label, kind) + "</td></tr>";
    }).join("");
  }

  function renderRules(rules) {
    document.getElementById("t-rules").innerHTML = rules.map(function (r) {
      return "<tr><td>" + esc(r.label) +
        (r.provisional ? " " + pill("Not yet agreed", "bad") : "") + "</td>" +
        "<td>" + r.days + " days</td>" +
        "<td>" + r.warn + " days before</td>" +
        '<td class="src">' + esc(r.source) + "</td></tr>";
    }).join("");
  }

  function renderSafety(flags) {
    var rows = Object.keys(flags).map(function (k) {
      var off = flags[k] === "false";
      return '<div class="field"><span class="k">' + esc(k) + "</span>" +
        '<span class="v">' + pill(off ? "Disabled" : flags[k], off ? "ok" : "warn") +
        "</span></div>";
    });
    document.getElementById("t-safety").innerHTML = rows.join("");
  }

  function renderInbox(messages) {
    document.getElementById("inbox-list").innerHTML = messages.map(function (m) {
      var pct = Math.round(m.confidence * 100);
      return '<article class="msg">' +
        "<div>" +
          '<div class="msg-from">' + esc(m.from) + " &middot; " + esc(m.when) + "</div>" +
          '<div class="msg-subj">' + esc(m.subject) + "</div>" +
          '<div class="msg-body">' + esc(m.body) + "</div>" +
          (m.attachment
            ? '<div class="src" style="margin-top:7px">Attachment: ' + esc(m.attachment) + "</div>"
            : "") +
        "</div>" +
        '<aside class="verdict"><h4>Assessment</h4>' +
          '<div class="vrow"><span class="k">Routed to</span>' + pill(ROLE_LABEL[m.route], m.route) + "</div>" +
          '<div class="vrow"><span class="k">Priority</span>' +
            pill(m.priority, m.priority === "Urgent" ? "bad"
                 : m.priority === "Low" ? "mute" : "info") + "</div>" +
          '<div class="vrow"><span class="k">Confidence</span>' +
            '<span class="meter" role="img" aria-label="Confidence ' + pct + ' percent">' +
            '<i style="width:' + pct + '%"></i></span>' +
            '<span class="src">' + pct + "%</span></div>" +
          '<div class="vrow"><span class="k">Ticket</span><span class="mono">' +
            esc(m.ticket) + "</span></div>" +
          '<div class="vreason">' + esc(m.reason) + "</div>" +
          (m.override ? '<div class="override">' + esc(m.override) + "</div>" : "") +
        "</aside></article>";
    }).join("");
  }

  /* ------------------------------------------------------- illustrative */

  var INBOX = [
    {
      from: "m.reed@example.com", when: "today, 09:14",
      subject: "Blood test results attached",
      body: "Hi, I had the private panel done on Tuesday. Results came through this morning, attached. Full name is Michael Reed, DOB 12/05/1984. Can someone take a look and let me know the next step?",
      attachment: "reed-pathology-2026-09-14.pdf",
      route: "physician", priority: "Normal", confidence: 0.95, ticket: "t_75a36bd7",
      reason: "Pathology results submitted for assessment. Requires a practitioner to review; the assistant has checked only that the required markers are present."
    },
    {
      from: "a.brennan@example.com", when: "today, 08:51",
      subject: "GP results — is this enough?",
      body: "My GP ran bloods last month but I'm not sure they did all of the ones on your list. I've attached what came back. Do I need to go and get more done before booking?",
      attachment: "brennan-gp-panel.pdf",
      route: "support", priority: "Normal", confidence: 0.95, ticket: "t_52227d97",
      reason: "Checking which required markers are present or missing is administrative. Whether the panel is clinically sufficient is for the practitioner."
    },
    {
      from: "r.santos@example.com", when: "today, 08:02",
      subject: "Chest tightness since starting",
      body: "I've had some tightness in my chest the last couple of days and I'm a bit worried. I started treatment about five weeks ago. Should I stop?",
      attachment: null,
      route: "triage", priority: "Urgent", confidence: 1.0, ticket: "t_f37be0d8",
      reason: "Client reports a physical symptom and asks whether to stop treatment.",
      override: "Held for a qualified person. No assessment, advice or reply was produced."
    },
    {
      from: "d.whitcombe@example.com", when: "yesterday, 16:40",
      subject: "Changing my billing to yearly",
      body: "I'm on the quarterly membership at the moment and want to switch to the yearly one before my next renewal. Can you tell me what the difference works out to and whether the testing is included?",
      attachment: null,
      route: "support", priority: "Low", confidence: 1.0, ticket: "t_a2fd925d",
      reason: "Membership and billing enquiry. The testing-inclusion question is one the clinic requires client care to confirm, so no figure was quoted."
    },
    {
      from: "news@industry-digest.example.com", when: "yesterday, 06:00",
      subject: "Your weekly industry digest",
      body: "This week in men's health: five trends to watch. Click here to read more. Unsubscribe.",
      attachment: null,
      route: "support", priority: "Low", confidence: 1.0, ticket: "— none —",
      reason: "Marketing email. No ticket was created; not every inbound message is work.",
      override: null
    }
  ];

  /* --------------------------------------------------------------- boot */

  function load() {
    fetch("/api/state", { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (state) {
        setLive(state.gateway);

        var tickets = state.tickets || [];
        var deadlines = state.deadlines || [];
        var held = tickets.filter(function (t) { return !t.assignee; }).length;
        var over = deadlines.filter(function (d) { return d.status === "overdue"; }).length;
        var soon = deadlines.filter(function (d) { return d.status === "due_soon"; }).length;

        document.getElementById("k-today").textContent = tickets.length;
        document.getElementById("k-today-sub").textContent =
          tickets.length ? "From the live ticket store" : "No activity yet";
        document.getElementById("k-open").textContent = tickets.length;
        document.getElementById("k-open-sub").textContent =
          (tickets.length - held) + " assigned, " + held + " held";
        document.getElementById("k-human").textContent = held;
        document.getElementById("k-overdue").textContent = over;
        document.getElementById("k-overdue-sub").textContent =
          over ? "Leadership alerted" : "Nothing past due";

        document.getElementById("c-inbox").textContent = INBOX.length;
        document.getElementById("c-tickets").textContent = tickets.length;
        document.getElementById("c-sla").textContent = deadlines.length;

        document.getElementById("s-tracked").textContent = deadlines.length;
        document.getElementById("s-soon").textContent = soon;
        document.getElementById("s-over").textContent = over;

        renderActivity(tickets);
        renderAttention({ tickets: tickets, deadlines: deadlines });
        renderBoard(tickets);
        renderSla(deadlines);
        renderRules(state.rules || []);
        renderSafety(state.safety || {});

        document.getElementById("i-engine").innerHTML =
          pill(state.gateway ? "Operating" : "Stopped", state.gateway ? "ok" : "bad");
        document.getElementById("i-cron").innerHTML =
          (state.cron || []).length ? pill("Operating", "ok") : pill("No jobs", "warn");
      })
      .catch(function () {
        setLive(false);
      });
  }

  renderInbox(INBOX);
  routeFromHash();
  load();
  setInterval(load, 20000);
})();
