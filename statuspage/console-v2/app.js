/* TRT Australia — Care Operations
 *
 * Work-management layout. Tickets is the primary view; the channels and the
 * schedule sit alongside it as tabs.
 *
 * The routing engine is never named in the interface. Staff see a short note
 * on each ticket saying where it went and why. The one thing surfaced
 * prominently is when the system REFUSED to route something and handed it to
 * a person.
 */
(function () {
  "use strict";

  /* --------------------------------------------------------- helpers */

  var I = {
    grid: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    ticket: '<path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z"/><path d="M12 6v12"/>',
    mail: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    hash: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/>',
    chev: '<path d="m6 9 6 6 6-6"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    circle: '<circle cx="12" cy="12" r="9"/>',
    half: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/>',
    pause: '<circle cx="12" cy="12" r="9"/><path d="M10 9v6M14 9v6"/>',
    up: '<path d="m18 15-6-6-6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    eq: '<path d="M5 9h14M5 15h14"/>',
    alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    clip: '<path d="M21.4 11.1 12.3 20a5 5 0 0 1-7-7l9-9a3.3 3.3 0 0 1 4.7 4.7l-9 9a1.7 1.7 0 0 1-2.3-2.3l8.3-8.3"/>',
    repeat: '<path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
    flask: '<path d="M9 3h6M10 3v6L5 19a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 19l-5-10V3"/><path d="M7.5 14h9"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'
  };
  function svg(d, cls) {
    return '<svg class="' + (cls || "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg>";
  }
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function $(id) { return document.getElementById(id); }
  function tag(t, k) { return '<span class="tag t-' + k + '">' + esc(t) + "</span>"; }
  function initials(n) {
    return n.split(/\s+/).slice(0, 2).map(function (w) { return w[0]; }).join("").toUpperCase();
  }
  function hue(n) {
    var p = ["#1a6ba5", "#6b3fb8", "#0e7285", "#16733f", "#8d5406", "#b02020"];
    var x = 0;
    for (var i = 0; i < n.length; i++) x = (x + n.charCodeAt(i)) % p.length;
    return p[x];
  }
  function avatar(name, size) {
    return '<span class="av av-' + (size || "sm") + '" style="background:' + hue(name) +
      '" aria-hidden="true">' + esc(initials(name)) + "</span>";
  }

  /* ------------------------------------------------------ reference */

  var QUEUE = {
    physician: { label: "Physician",   cls: "physician" },
    nursing:   { label: "Nursing",     cls: "nursing" },
    support:   { label: "Client care", cls: "support" },
    held:      { label: "Held for review", cls: "held" }
  };
  var STATUS = {
    open:     { label: "Open",              icon: "circle", cls: "open" },
    progress: { label: "In progress",       icon: "half",   cls: "progress" },
    waiting:  { label: "Waiting on client", icon: "pause",  cls: "waiting" },
    resolved: { label: "Resolved",          icon: "check",  cls: "resolved" }
  };
  var PRIORITY = {
    urgent: { label: "Urgent", icon: "up",   cls: "urgent" },
    high:   { label: "High",   icon: "up",   cls: "high" },
    normal: { label: "Normal", icon: "eq",   cls: "normal" },
    low:    { label: "Low",    icon: "down", cls: "low" }
  };
  var TYPE = {
    clinical: "Clinical review",
    consult:  "Client consultation",
    admin:    "Administrative",
    pathology:"Pathology follow-up",
    escalation:"Escalation"
  };

  function statusEl(k) {
    var s = STATUS[k];
    return '<span class="st st-' + s.cls + '">' + svg(I[s.icon]) + esc(s.label) + "</span>";
  }
  function priorityEl(k) {
    var p = PRIORITY[k];
    return '<span class="pri pri-' + p.cls + '">' + svg(I[p.icon]) + esc(p.label) + "</span>";
  }
  function dueEl(d) {
    if (d === null) return '<span style="color:var(--dimmer)">—</span>';
    if (d < 0) return tag(Math.abs(d) + (Math.abs(d) === 1 ? " day over" : " days over"), "held");
    if (d === 0) return tag("Today", "warn");
    if (d <= 3) return tag("In " + d + "d", "warn");
    return '<span style="color:var(--dim)">In ' + d + "d</span>";
  }

  /* ----------------------------------------------------------- data */

  var T = [
    { key: "TRT-118", sum: "Blood test results submitted for review", type: "clinical",
      q: "physician", st: "progress", pri: "normal", due: 1, client: "Michael Reed",
      from: "m.reed@example.com", ch: "email", age: "2h",
      why: "Pathology results submitted for assessment. Required markers present; the assistant verified completeness only.",
      body: "Hi,\n\nI had the private panel done on Tuesday at the collection centre. Results came through this morning, attached.\n\nFull name Michael Reed, DOB 12/05/1984.\n\nCan someone take a look and let me know what the next step is?\n\nThanks,\nMichael",
      file: "reed-pathology-2026-09-14.pdf",
      acts: [["Created from client email", "2h ago"], ["Routed to Physician", "2h ago"],
             ["Dr Chen started work", "40m ago"]] },

    { key: "TRT-117", sum: "Client reports chest tightness, asks whether to stop treatment",
      type: "clinical", q: "held", st: "open", pri: "urgent", due: null,
      client: "Rachel Santos", from: "r.santos@example.com", ch: "email", age: "3h",
      why: "Client describes a physical symptom and asks whether to stop treatment. Withheld from automatic routing and no reply drafted — a qualified person must handle this.",
      body: "I've had some tightness in my chest the last couple of days and I'm a bit worried. I started treatment about five weeks ago.\n\nShould I stop?",
      acts: [["Created from client email", "3h ago"], ["Held for review — not routed", "3h ago"]] },

    { key: "TRT-116", sum: "Follow-up blood work overdue", type: "pathology",
      q: "nursing", st: "open", pri: "urgent", due: -2, client: "Priya Sharma",
      from: "Scheduled check", ch: "system", age: "2d",
      why: "Raised automatically by the daily pathology sweep. Mandatory follow-up blood work has passed its target date.",
      body: "Follow-up blood work was due 15 September, eight weeks from treatment start.\n\nNo results have been received.",
      acts: [["Raised by pathology monitor", "2d ago"], ["Routed to Nursing", "2d ago"],
             ["Escalated to leadership", "1d ago"]] },

    { key: "TRT-115", sum: "Request to switch from quarterly to yearly membership",
      type: "admin", q: "support", st: "waiting", pri: "low", due: 4,
      client: "Daniel Whitcombe", from: "d.whitcombe@example.com", ch: "email", age: "1d",
      why: "Membership enquiry. Testing inclusions must be confirmed by client care, so no figure was quoted.",
      body: "I'm on the quarterly membership at the moment and want to switch to the yearly one before my next renewal.\n\nCan you tell me what the difference works out to, and whether the testing is included?",
      acts: [["Created from client email", "1d ago"], ["Routed to Client care", "1d ago"],
             ["Awaiting client response", "5h ago"]] },

    { key: "TRT-114", sum: "GP panel completeness check", type: "admin",
      q: "support", st: "progress", pri: "normal", due: 2, client: "Amara Brennan",
      from: "a.brennan@example.com", ch: "email", age: "1d",
      why: "Checking which required markers are present is administrative. Whether the panel is clinically sufficient is for the practitioner.",
      body: "My GP ran bloods last month but I'm not sure they did all of the ones on your list. I've attached what came back.\n\nDo I need to go and get more done before booking?",
      file: "brennan-gp-panel.pdf",
      note: "Missing from the required panel: SHBG, prolactin, DHEA-S.",
      acts: [["Created from client email", "1d ago"], ["Routed to Client care", "1d ago"]] },

    { key: "TRT-113", sum: "Chase Michael Reed's eight-week follow-up", type: "admin",
      q: "support", st: "open", pri: "normal", due: 3, client: "Michael Reed",
      from: "Dr Elena Chen", ch: "slack", age: "5h",
      why: "Staff request raised in #clinical for administrative follow-up.",
      body: "Can someone chase Michael Reed's 8-week follow-up bloods? He's due late this month and I'd rather not have it slip.",
      acts: [["Created from #clinical", "5h ago"], ["Routed to Client care", "5h ago"]] },

    { key: "TRT-112", sum: "Repeat prescription request", type: "clinical",
      q: "physician", st: "open", pri: "high", due: 1, client: "Jordan Bailey",
      from: "j.bailey@example.com", ch: "email", age: "6h",
      why: "Prescription request requires a practitioner.",
      body: "Morning — I'm getting close to the end of my current script. What do I need to do to get the next one organised?",
      acts: [["Created from client email", "6h ago"], ["Routed to Physician", "6h ago"]] },

    { key: "TRT-111", sum: "Travel arrangements affecting blood test and delivery",
      type: "admin", q: "support", st: "progress", pri: "low", due: 6,
      client: "Tom Nguyen", from: "t.nguyen@example.com", ch: "email", age: "2d",
      why: "Logistics enquiry about testing and delivery while travelling.",
      body: "I'm travelling to Perth for six weeks from the 10th. Will that affect my next blood test or the delivery?",
      acts: [["Created from client email", "2d ago"], ["Routed to Client care", "2d ago"]] },

    { key: "TRT-110", sum: "Question about injection frequency and dose splitting",
      type: "consult", q: "nursing", st: "waiting", pri: "normal", due: 2,
      client: "Marcus Okafor", from: "m.okafor@example.com", ch: "email", age: "2d",
      why: "Client consultation about care already underway. Anything altering the prescribed protocol returns to the practitioner.",
      body: "I started three weeks ago and I'm not sure whether I should be splitting the dose across the week or doing it all at once.\n\nWho can I talk to about this?",
      acts: [["Created from client email", "2d ago"], ["Routed to Nursing", "2d ago"],
             ["Awaiting client response", "1d ago"]] },

    { key: "TRT-109", sum: "Blood results expiring within 21 days", type: "pathology",
      q: "physician", st: "open", pri: "normal", due: 21, client: "Hannah Poulos",
      from: "Scheduled check", ch: "system", age: "1d",
      why: "Raised automatically by the daily pathology sweep. Results are approaching the four-month acceptance limit.",
      body: "Blood results collected 29 May 2026 expire 26 September 2026.\n\nA current panel will be required before the next review.",
      acts: [["Raised by pathology monitor", "1d ago"], ["Routed to Physician", "1d ago"]] },

    { key: "TRT-108", sum: "New starter needs system access", type: "admin",
      q: "support", st: "resolved", pri: "low", due: null, client: "—",
      from: "Sam Okonkwo", ch: "slack", age: "3d",
      why: "Internal administrative request raised in #general.",
      body: "New nurse starts Monday — can we get her set up with access before then?",
      acts: [["Created from #general", "3d ago"], ["Routed to Client care", "3d ago"],
             ["Resolved by Alex Kaur", "1d ago"]] },

    { key: "TRT-107", sum: "Pathology provider portal running slowly", type: "admin",
      q: "support", st: "resolved", pri: "normal", due: null, client: "—",
      from: "Maya Willis", ch: "slack", age: "3d",
      why: "Internal operational report raised in #clinical.",
      body: "Heads up — the pathology provider's portal is taking ages to load this morning. Might slow down result uploads.",
      acts: [["Created from #clinical", "3d ago"], ["Resolved by Alex Kaur", "2d ago"]] },

    { key: "TRT-106", sum: "Membership renewal approaching", type: "admin",
      q: "support", st: "open", pri: "low", due: 12, client: "Owen Marsh",
      from: "Scheduled check", ch: "system", age: "4d",
      why: "Raised automatically ahead of the renewal date.",
      body: "Quarterly membership renews 29 September 2026.",
      acts: [["Raised by schedule", "4d ago"], ["Routed to Client care", "4d ago"]] },

    { key: "TRT-105", sum: "Eligibility review follow-up", type: "consult",
      q: "nursing", st: "progress", pri: "normal", due: 3, client: "Nadia Cheng",
      from: "n.cheng@example.com", ch: "email", age: "4d",
      why: "Prospective client awaiting eligibility review. Practitioner decision required before any next step.",
      body: "I submitted my blood work a couple of weeks ago and haven't heard back. Could someone let me know where things are up to?",
      acts: [["Created from client email", "4d ago"], ["Routed to Nursing", "4d ago"]] },

    { key: "TRT-104", sum: "Year-one loyalty rate now available", type: "admin",
      q: "support", st: "resolved", pri: "low", due: null, client: "Hannah Poulos",
      from: "Scheduled check", ch: "system", age: "6d",
      why: "Raised automatically at the twelve-month anniversary.",
      body: "Client reaches twelve months on 11 November 2026 and qualifies for the ongoing loyalty rate.",
      acts: [["Raised by schedule", "6d ago"], ["Resolved by Alex Kaur", "5d ago"]] }
  ];

  /* ---------------------------------------------------------- state */

  var state = {
    tab: "overview", ticket: null, q: "",
    fq: "", fst: "", fpri: "", view: "list",
    sort: "key", dir: -1
  };

  var TABS = [
    { id: "overview", label: "Overview", icon: I.grid },
    { id: "tickets",  label: "All tickets", icon: I.ticket,
      count: function () { return open().length; } },
    { id: "held",     label: "Held for review", icon: I.alert, alert: true,
      count: function () { return open().filter(function (t) { return t.q === "held"; }).length; } },
    { sep: "Channels" },
    { id: "email",    label: "Client email", icon: I.mail,
      count: function () { return open().filter(function (t) { return t.ch === "email"; }).length; } },
    { id: "slack",    label: "Internal messages", icon: I.hash,
      count: function () { return open().filter(function (t) { return t.ch === "slack"; }).length; } },
    { id: "system",   label: "Scheduled checks", icon: I.repeat,
      count: function () { return open().filter(function (t) { return t.ch === "system"; }).length; } },
    { sep: "Records" },
    { id: "schedule", label: "Schedule", icon: I.cal },
    { id: "clients",  label: "Clients",  icon: I.users }
  ];

  function open() { return T.filter(function (t) { return t.st !== "resolved"; }); }

  /* ----------------------------------------------------------- tabs */

  function renderTabs() {
    $("tabs").innerHTML = TABS.map(function (t) {
      if (t.sep) return '<div class="side-label">' + esc(t.sep) + "</div>";
      var n = t.count ? t.count() : null;
      return '<button class="nav" data-tab="' + t.id + '" aria-current="' +
        (state.tab === t.id) + '">' + svg(t.icon) + "<span>" + esc(t.label) + "</span>" +
        (n ? '<span class="n' + (t.alert ? " alert" : "") + '">' + n + "</span>" : "") +
        "</button>";
    }).join("");
  }
  $("tabs").addEventListener("click", function (e) {
    var b = e.target.closest("[data-tab]");
    if (!b) return;
    state.tab = b.getAttribute("data-tab");
    state.ticket = null;
    render();
  });

  /* -------------------------------------------------------- tickets */

  function filtered(scope) {
    var rows = scope || T.slice();
    if (state.fq)   rows = rows.filter(function (t) { return t.q === state.fq; });
    if (state.fst)  rows = rows.filter(function (t) { return t.st === state.fst; });
    if (state.fpri) rows = rows.filter(function (t) { return t.pri === state.fpri; });
    if (state.q) {
      var n = state.q.toLowerCase();
      rows = rows.filter(function (t) {
        return (t.key + " " + t.sum + " " + t.client + " " + t.body).toLowerCase().indexOf(n) > -1;
      });
    }
    var order = { urgent: 0, high: 1, normal: 2, low: 3 };
    rows.sort(function (a, b) {
      var x, y;
      if (state.sort === "priority") { x = order[a.pri]; y = order[b.pri]; }
      else if (state.sort === "due") {
        x = a.due === null ? 9999 : a.due; y = b.due === null ? 9999 : b.due;
      } else if (state.sort === "client") { x = a.client; y = b.client; }
      else { x = a.key; y = b.key; }
      return x < y ? state.dir : x > y ? -state.dir : 0;
    });
    return rows;
  }

  function dropdown(id, label, value, options, onpick) {
    var cur = options.filter(function (o) { return o[0] === value; })[0];
    return '<span class="sel" data-sel="' + id + '">' +
      '<button class="' + (value ? "on" : "") + '">' +
      esc(cur ? cur[1] : label) + svg(I.chev) + "</button></span>";
  }

  var FILTERS = {
    fq:  [["", "Queue"], ["physician", "Physician"], ["nursing", "Nursing"],
          ["support", "Client care"], ["held", "Held for review"]],
    fst: [["", "Status"], ["open", "Open"], ["progress", "In progress"],
          ["waiting", "Waiting on client"], ["resolved", "Resolved"]],
    fpri:[["", "Priority"], ["urgent", "Urgent"], ["high", "High"],
          ["normal", "Normal"], ["low", "Low"]]
  };

  function renderTickets(scope, title, blurb) {
    var rows = filtered(scope);
    var active = state.fq || state.fst || state.fpri || state.q;

    var head = '<div class="page-head"><div><h1>' + esc(title) + "</h1>" +
      (blurb ? "<p>" + esc(blurb) + "</p>" : "") + "</div>" +
      '<span class="spacer"></span></div>';

    var bar = '<div class="filterbar">' +
      dropdown("fq", "Queue", state.fq, FILTERS.fq) +
      dropdown("fst", "Status", state.fst, FILTERS.fst) +
      dropdown("fpri", "Priority", state.fpri, FILTERS.fpri) +
      (active ? '<button class="btn ghost sm" id="clearf">Clear filters</button>' : "") +
      '<span class="spacer"></span>' +
      '<span class="count">' + rows.length + (rows.length === 1 ? " ticket" : " tickets") + "</span>" +
      '<span class="seg"><button data-view="list" aria-pressed="' + (state.view === "list") +
        '">List</button><button data-view="board" aria-pressed="' + (state.view === "board") +
        '">Board</button></span></div>';

    var body;
    if (!rows.length) {
      body = '<div class="card"><div class="empty">' + svg(I.search) +
        "<div>No tickets match these filters.</div></div></div>";
    } else if (state.view === "board") {
      body = boardHTML(rows);
    } else {
      body = tableHTML(rows);
    }

    $("main").innerHTML = '<div class="wrap">' + head + bar + body + "</div>";
    wireTickets();
  }

  function sortArrow(col) {
    if (state.sort !== col) return "";
    return '<span class="arr">' + (state.dir === 1 ? "↑" : "↓") + "</span>";
  }

  function tableHTML(rows) {
    return '<div class="card"><table><thead><tr>' +
      '<th class="sortable" data-sort="key">Key' + sortArrow("key") + "</th>" +
      "<th>Summary</th>" +
      "<th>Queue</th>" +
      '<th class="sortable" data-sort="client">Client' + sortArrow("client") + "</th>" +
      "<th>Status</th>" +
      '<th class="sortable" data-sort="priority">Priority' + sortArrow("priority") + "</th>" +
      '<th class="sortable" data-sort="due">Target' + sortArrow("due") + "</th>" +
      "</tr></thead><tbody>" +
      rows.map(function (t) {
        return '<tr data-key="' + t.key + '">' +
          '<td class="key">' + esc(t.key) + "</td>" +
          '<td><div class="sum">' + esc(t.sum) + "</div>" +
            '<div class="sub">' + esc(TYPE[t.type]) + " · " + esc(t.age) + " old</div></td>" +
          "<td>" + tag(QUEUE[t.q].label, QUEUE[t.q].cls) + "</td>" +
          '<td>' + (t.client === "—" ? '<span style="color:var(--dimmer)">—</span>'
                    : '<span class="who-cell">' + avatar(t.client) + esc(t.client) + "</span>") + "</td>" +
          "<td>" + statusEl(t.st) + "</td>" +
          "<td>" + priorityEl(t.pri) + "</td>" +
          "<td>" + dueEl(t.due) + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  }

  function boardHTML(rows) {
    var cols = ["open", "progress", "waiting", "resolved"];
    return '<div class="board">' + cols.map(function (c) {
      var items = rows.filter(function (t) { return t.st === c; });
      return '<section class="col"><div class="col-head">' +
        '<span class="nm">' + STATUS[c].label + "</span>" +
        '<span class="n">' + items.length + "</span></div>" +
        '<div class="col-body">' +
        (items.length ? items.map(function (t) {
          return '<button class="ticket" data-key="' + t.key + '">' +
            '<span class="k">' + esc(t.key) + "</span>" +
            '<div class="s">' + esc(t.sum) + "</div>" +
            '<div class="m">' + tag(QUEUE[t.q].label, QUEUE[t.q].cls) +
            priorityEl(t.pri) + (t.due !== null ? dueEl(t.due) : "") + "</div></button>";
        }).join("")
         : '<div style="padding:16px;text-align:center;color:var(--dimmer);font-size:12.5px">Nothing here</div>') +
        "</div></section>";
    }).join("") + "</div>";
  }

  function wireTickets() {
    document.querySelectorAll("[data-key]").forEach(function (el) {
      el.onclick = function () { state.ticket = el.getAttribute("data-key"); render(); };
    });
    document.querySelectorAll("[data-sort]").forEach(function (th) {
      th.onclick = function () {
        var c = th.getAttribute("data-sort");
        if (state.sort === c) state.dir = -state.dir; else { state.sort = c; state.dir = -1; }
        render();
      };
    });
    document.querySelectorAll("[data-view]").forEach(function (b) {
      b.onclick = function () { state.view = b.getAttribute("data-view"); render(); };
    });
    var clear = $("clearf");
    if (clear) clear.onclick = function () {
      state.fq = state.fst = state.fpri = state.q = "";
      $("search").value = ""; render();
    };
    document.querySelectorAll("[data-sel]").forEach(function (sel) {
      var key = sel.getAttribute("data-sel");
      sel.querySelector("button").onclick = function (e) {
        e.stopPropagation();
        if (sel.querySelector(".pop")) { closePops(); return; }
        closePops();
        var pop = document.createElement("div");
        pop.className = "pop";
        pop.innerHTML = FILTERS[key].map(function (o) {
          return '<button data-v="' + o[0] + '" aria-current="' + (state[key] === o[0]) + '">' +
            esc(o[1]) + (state[key] === o[0] ? '<span class="tick">' + svg(I.check) + "</span>" : "") +
            "</button>";
        }).join("");
        sel.appendChild(pop);
        pop.onclick = function (ev) {
          var b = ev.target.closest("[data-v]");
          if (!b) return;
          state[key] = b.getAttribute("data-v");
          closePops(); render();
        };
      };
    });
  }
  function closePops() {
    document.querySelectorAll(".pop").forEach(function (p) { p.remove(); });
  }
  document.addEventListener("click", function (e) {
    if (!e.target.closest(".sel")) closePops();
  });

  /* --------------------------------------------------- ticket detail */

  function renderDetail() {
    var t = T.filter(function (x) { return x.key === state.ticket; })[0];
    if (!t) { state.ticket = null; return render(); }

    $("main").innerHTML = '<div class="wrap">' +
      '<button class="btn ghost sm" id="back" style="margin-bottom:14px">' +
        svg(I.back) + "Back to tickets</button>" +
      '<div class="detail"><div class="det-main"><div class="card">' +
        '<div class="det-head"><div class="det-meta">' +
          '<span class="key">' + esc(t.key) + "</span>" +
          tag(QUEUE[t.q].label, QUEUE[t.q].cls) +
          tag(TYPE[t.type], "mute") +
          (t.due !== null && t.due < 0 ? tag("Past target", "held") : "") +
        "</div><h1>" + esc(t.sum) + "</h1>" +
        '<div class="det-meta">' + statusEl(t.st) + priorityEl(t.pri) +
          '<span style="color:var(--dimmer);font-size:12.5px">Opened ' + esc(t.age) + " ago</span>" +
        "</div></div>" +

        '<div class="msg"><div class="msg-head">' + avatar(t.from === "Scheduled check" ? "System" : t.from, "md") +
          '<span><div class="msg-from">' + esc(t.from) + "</div>" +
          '<div class="msg-addr">' +
          (t.ch === "email" ? "Client email" : t.ch === "slack" ? "Internal message" : "Automated check") +
          "</div></span>" +
          '<span class="msg-time">' + esc(t.age) + " ago</span></div>" +
          '<div class="msg-body">' + esc(t.body) + "</div>" +
          (t.file ? '<div class="attach">' + svg(I.clip) + esc(t.file) + "</div>" : "") +
        "</div>" +

        '<div class="note' + (t.q === "held" ? " held" : "") + '">' +
          '<span class="eyebrow">' + (t.q === "held" ? "Withheld" : "Routing") + "</span>" +
          esc(t.why) + "</div>" +

        (t.note ? '<div class="note"><span class="eyebrow">Panel check</span>' + esc(t.note) +
          '<div style="font-size:11.5px;color:var(--dimmer);margin-top:7px">' +
          "Presence of required markers only. Interpretation is for the practitioner.</div></div>" : "") +

        '<div class="activity"><span class="eyebrow">Activity</span>' +
        t.acts.map(function (a) {
          return '<div class="act"><span class="act-dot">' + svg(I.circle) + "</span>" +
            '<span><div class="act-t">' + esc(a[0]) + "</div>" +
            '<div class="act-d">' + esc(a[1]) + "</div></span></div>";
        }).join("") + "</div>" +

      "</div></div><aside class='side'>" +
        '<div class="card"><h3 class="eyebrow">Details</h3>' +
          '<div class="field"><span class="k">Status</span><span class="v">' + statusEl(t.st) + "</span></div>" +
          '<div class="field"><span class="k">Queue</span><span class="v">' + tag(QUEUE[t.q].label, QUEUE[t.q].cls) + "</span></div>" +
          '<div class="field"><span class="k">Priority</span><span class="v">' + priorityEl(t.pri) + "</span></div>" +
          '<div class="field"><span class="k">Type</span><span class="v">' + esc(TYPE[t.type]) + "</span></div>" +
          '<div class="field"><span class="k">Target</span><span class="v">' + dueEl(t.due) + "</span></div>" +
          '<div class="field"><span class="k">Source</span><span class="v">' +
            (t.ch === "email" ? "Client email" : t.ch === "slack" ? "Internal chat" : "Scheduled check") + "</span></div>" +
        "</div>" +
        (t.client !== "—" ? '<div class="card"><h3 class="eyebrow">Client</h3>' +
          '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">' +
          avatar(t.client, "lg") + "<div><div style='font-family:var(--display);font-weight:700'>" +
          esc(t.client) + "</div><div style='font-size:12px;color:var(--dimmer)'>" +
          esc(t.from.indexOf("@") > -1 ? t.from : "—") + "</div></div></div>" +
          '<div class="field"><span class="k">Open tickets</span><span class="v">' +
          T.filter(function (x) { return x.client === t.client && x.st !== "resolved"; }).length +
          "</span></div></div>" : "") +
      "</aside></div></div>";

    $("back").onclick = function () { state.ticket = null; render(); };
  }

  /* -------------------------------------------------------- overview */

  function renderOverview() {
    var o = open();
    var held = o.filter(function (t) { return t.q === "held"; });
    var over = o.filter(function (t) { return t.due !== null && t.due < 0; });
    var week = o.filter(function (t) { return t.due !== null && t.due >= 0 && t.due <= 7; });
    var auto = o.filter(function (t) { return t.q !== "held"; }).length;
    var h = new Date().getHours();
    var greet = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
    var need = held.length + over.length;

    function loadOf(q) { return o.filter(function (t) { return t.q === q; }).length; }
    var max = Math.max(1, loadOf("physician"), loadOf("nursing"), loadOf("support"));

    $("main").innerHTML = '<div class="wrap">' +
      '<div class="hero"><h1>' + greet + ", Alex</h1><p>" +
      (need ? (need === 1 ? "One thing needs you" : need + " things need you") +
              (h < 12 ? " this morning." : h < 18 ? " this afternoon." : " this evening.")
            : "Nothing is waiting on you.") + "</p></div>" +

      '<div class="stats">' +
        '<div class="stat info"><div class="n">' + o.length + '</div><div class="l">Open tickets</div>' +
          '<div class="s">' + auto + " routed automatically</div></div>" +
        '<div class="stat ' + (held.length ? "bad" : "good") + '"><div class="n">' + held.length +
          '</div><div class="l">Held for review</div><div class="s">Clinical or uncertain</div></div>' +
        '<div class="stat ' + (week.length ? "warn" : "good") + '"><div class="n">' + week.length +
          '</div><div class="l">Due this week</div><div class="s">Within target date</div></div>' +
        '<div class="stat ' + (over.length ? "bad" : "good") + '"><div class="n">' + over.length +
          '</div><div class="l">Past target</div><div class="s">' +
          (over.length ? "Escalated to leadership" : "Nothing overdue") + "</div></div>" +
      "</div>" +

      '<div class="grid2"><div>' +
        '<div class="panel"><div class="panel-head"><h2>Needs attention</h2>' +
          '<span class="spacer"></span></div><div class="panel-body flush">' +
          (held.concat(over).length ? held.concat(over).map(function (t) {
            return '<button class="row" data-key="' + t.key + '">' +
              avatar(t.client === "—" ? "System" : t.client, "md") +
              '<span><div class="rt">' + esc(t.sum) + "</div>" +
              '<div class="rd">' + esc(t.key) + " · " + esc(t.client) + "</div></span>" +
              "<span>" + (t.q === "held" ? tag("Held", "held") : dueEl(t.due)) + "</span></button>";
          }).join("") : '<div class="empty">' + svg(I.check) +
            "<div>Nothing urgent and nothing past its target date.</div></div>") +
        "</div></div>" +

        '<div class="panel"><div class="panel-head"><h2>Latest tickets</h2>' +
          '<span class="spacer"></span></div><div class="panel-body flush">' +
          o.slice(0, 5).map(function (t) {
            return '<button class="row" data-key="' + t.key + '">' +
              avatar(t.client === "—" ? "System" : t.client, "md") +
              '<span><div class="rt">' + esc(t.sum) + "</div>" +
              '<div class="rd">' + esc(t.key) + " · " + esc(t.age) + " ago</div></span>" +
              "<span>" + tag(QUEUE[t.q].label, QUEUE[t.q].cls) + "</span></button>";
          }).join("") + "</div></div>" +
      "</div><div>" +
        '<div class="panel"><div class="panel-head"><h2>Workload</h2></div><div class="panel-body">' +
        ["physician", "nursing", "support"].map(function (q) {
          var n = loadOf(q);
          return '<div class="load"><span class="ln">' + QUEUE[q].label + "</span>" +
            '<span class="lb"><i style="width:' + Math.round(n / max * 100) + "%;background:var(--" +
            QUEUE[q].cls + ')"></i></span><span class="lc">' + n + "</span></div>";
        }).join("") + "</div></div>" +

        '<div class="panel"><div class="panel-head"><h2>Where work comes from</h2></div>' +
        '<div class="panel-body">' +
        [["Client email", "email"], ["Internal messages", "slack"], ["Scheduled checks", "system"]]
          .map(function (c) {
            return '<div class="field"><span class="k">' + c[0] + "</span><span class='v'>" +
              o.filter(function (t) { return t.ch === c[1]; }).length + "</span></div>";
          }).join("") + "</div></div>" +
      "</div></div></div>";

    document.querySelectorAll("[data-key]").forEach(function (el) {
      el.onclick = function () { state.ticket = el.getAttribute("data-key"); render(); };
    });
  }

  /* -------------------------------------------------------- schedule */

  function renderSchedule() {
    var today = new Date();
    function on(n) { var d = new Date(today); d.setDate(d.getDate() + n); return d; }
    function lbl(d, n) {
      if (n === 0) return "Today";
      if (n === 1) return "Tomorrow";
      return d.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "short" });
    }
    var plan = [
      [0, [["09:00", "Pathology monitoring", "Daily sweep of follow-up and expiry dates", "auto"],
           ["—", "Priya Sharma", "Follow-up blood work · 2 days past target", "late"],
           ["—", "Michael Reed", "Monthly check-in email due", "checkin"]]],
      [1, [["09:00", "Pathology monitoring", "Daily sweep", "auto"],
           ["—", "Jordan Bailey", "Prescription renewal falls due", "due"]]],
      [3, [["09:00", "Pathology monitoring", "Daily sweep", "auto"],
           ["—", "Nadia Cheng", "Eligibility review follow-up", "due"],
           ["—", "Amara Brennan", "Outstanding markers chase", "due"]]],
      [9, [["09:00", "Pathology monitoring", "Daily sweep", "auto"],
           ["—", "Owen Marsh", "Membership renewal", "renew"]]],
      [21,[["—", "Hannah Poulos", "Blood results expire", "expire"]]]
    ];
    var TAGS = { auto: ["Automated", "mute"], late: ["Past target", "held"],
                 due: ["Due", "warn"], checkin: ["Check-in", "support"],
                 renew: ["Renewal", "mute"], expire: ["Expiring", "warn"] };

    $("main").innerHTML = '<div class="wrap">' +
      '<div class="page-head"><div><h1>Schedule</h1>' +
      "<p>Automated routines run in the background. Below them, every upcoming " +
      "obligation across all clients, so nothing is tracked by hand.</p></div></div>" +

      '<div class="routines">' +
        '<div class="routine"><div class="routine-top"><span class="routine-ico">' +
          svg(I.flask) + "</span><span><h3>Pathology monitoring</h3>" +
          '<div class="rs">Checks every client for follow-up blood work due, results ' +
          "expiring and obligations past their date.</div></span></div>" +
          '<div class="rwhen"><span class="eyebrow">Runs</span>' +
          '<span class="rv">Daily · 09:00</span></div><div class="steps">' +
          '<div class="step"><div class="st2">Sweep</div><div class="sd">Every tracked obligation</div></div>' +
          '<div class="step"><div class="st2">Compare</div><div class="sd">Against target dates</div></div>' +
          '<div class="step"><div class="st2">Raise</div><div class="sd">Before a date is missed</div></div>' +
          "</div></div>" +
        '<div class="routine"><div class="routine-top"><span class="routine-ico">' +
          svg(I.repeat) + "</span><span><h3>Client check-in</h3>" +
          '<div class="rs">Sends each client a status email, reads the reply and raises ' +
          "the right ticket from it.</div></span></div>" +
          '<div class="rwhen"><span class="eyebrow">Runs</span><span class="rv">Monthly</span></div>' +
          '<div class="steps">' +
          '<div class="step dim"><div class="st2">Send</div><div class="sd">Templated status email</div></div>' +
          '<div class="step dim"><div class="st2">Read reply</div><div class="sd">Understand the response</div></div>' +
          '<div class="step dim"><div class="st2">Raise ticket</div><div class="sd">Route to the right queue</div></div>' +
          "</div></div>" +
      "</div>" +

      '<div class="card" style="padding:4px 18px 16px">' +
      plan.map(function (p) {
        var d = on(p[0]);
        var late = p[1].some(function (e) { return e[3] === "late"; });
        return '<div class="day"><span class="dd">' + esc(lbl(d, p[0])) + "</span>" +
          '<span class="dn">' + p[1].length + (p[1].length === 1 ? " item" : " items") + "</span>" +
          (late ? '<span class="dt">' + tag("Needs attention", "held") + "</span>" : "") + "</div>" +
          p[1].map(function (e) {
            var tg = TAGS[e[3]];
            return '<div class="ev"><span class="ev-t">' + esc(e[0]) + "</span>" +
              (e[3] === "auto"
                ? '<span class="av av-md" style="background:var(--tint);color:var(--deep-tx)">' +
                  svg(I.repeat) + "</span>"
                : avatar(e[1], "md")) +
              '<span><div class="ev-w">' + esc(e[1]) + "</div>" +
              '<div class="ev-d">' + esc(e[2]) + "</div></span>" +
              "<span>" + tag(tg[0], tg[1]) + "</span></div>";
          }).join("");
      }).join("") + "</div></div>";
  }

  /* --------------------------------------------------------- clients */

  function renderClients() {
    var names = {};
    T.forEach(function (t) {
      if (t.client === "—") return;
      if (!names[t.client]) names[t.client] = { name: t.client, open: 0, next: null, email: "" };
      if (t.st !== "resolved") names[t.client].open++;
      if (t.from.indexOf("@") > -1) names[t.client].email = t.from;
      if (t.due !== null && (names[t.client].next === null || t.due < names[t.client].next)) {
        names[t.client].next = t.due;
      }
    });
    var rows = Object.keys(names).map(function (k) { return names[k]; })
      .sort(function (a, b) {
        var x = a.next === null ? 9999 : a.next, y = b.next === null ? 9999 : b.next;
        return x - y;
      });

    $("main").innerHTML = '<div class="wrap">' +
      '<div class="page-head"><div><h1>Clients</h1>' +
      "<p>Everyone with activity in the system, soonest obligation first.</p></div></div>" +
      '<div class="card"><table><thead><tr><th>Client</th><th>Contact</th>' +
      "<th>Open tickets</th><th>Next obligation</th></tr></thead><tbody>" +
      rows.map(function (c) {
        return "<tr><td><span class='who-cell'>" + avatar(c.name, "md") +
          "<span><div style='font-weight:600'>" + esc(c.name) + "</div></span></span></td>" +
          '<td style="color:var(--dim)">' + esc(c.email || "—") + "</td>" +
          "<td>" + c.open + "</td><td>" + dueEl(c.next) + "</td></tr>";
      }).join("") + "</tbody></table></div></div>";
  }

  /* ------------------------------------------------------------ boot */

  // 30ms per item, inside the 20-40ms window the motion guidance gives, so a
  // fifteen-row table finishes revealing in well under half a second.
  function stagger() {
    var items = document.querySelectorAll(
      "tbody tr, .ticket, .row, .stat, .col, .routine");
    for (var i = 0; i < items.length; i++) {
      items[i].style.animationDelay = Math.min(i * 30, 420) + "ms";
    }
  }

  // Figures count up on the overview. Short enough not to delay reading, and
  // it draws the eye to the number rather than the card.
  function countUp() {
    document.querySelectorAll(".stat .n").forEach(function (el) {
      var target = parseInt(el.textContent, 10);
      if (isNaN(target) || target === 0) return;
      var start = performance.now(), dur = 520;
      function frame(now) {
        var p = Math.min((now - start) / dur, 1);
        // ease-out: fast then settling, matching the arrival easing elsewhere
        el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
  }

  function render() {
    renderTabs();
    closePops();
    if (state.ticket) { renderDetail(); return; }
    if (state.tab === "overview") return renderOverview();
    if (state.tab === "schedule") return renderSchedule();
    if (state.tab === "clients")  return renderClients();
    if (state.tab === "held")
      return renderTickets(T.filter(function (t) { return t.q === "held"; }),
        "Held for review",
        "Withheld from automatic routing because they need a qualified person's judgement. " +
        "Nothing here has been answered or assigned.");
    if (state.tab === "system")
      return renderTickets(T.filter(function (t) { return t.ch === "system"; }),
        "Scheduled checks",
        "Raised by the automated routines rather than by a person - follow-ups falling " +
        "due, results expiring, renewals approaching.");
    if (state.tab === "email")
      return renderTickets(T.filter(function (t) { return t.ch === "email"; }),
        "Client email", "Tickets raised from messages clients sent in.");
    if (state.tab === "slack")
      return renderTickets(T.filter(function (t) { return t.ch === "slack"; }),
        "Internal messages", "Tickets raised from requests your team posted in chat.");
    renderTickets(null, "All tickets",
      "Every piece of work in the system, whichever channel it arrived from.");
  }

  // Wrap render so motion applies to whatever view was just drawn.
  var baseRender = render;
  render = function () {
    baseRender();
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      stagger();
      if (state.tab === "overview" && !state.ticket) countUp();
    }
  };

  // Off-canvas sidebar below 1024px.
  var menu = $("menu"), scrim = $("scrim"), side = $("tabs");
  function closeSide() { side.classList.remove("open"); scrim.classList.remove("on"); }
  if (menu) menu.onclick = function () {
    side.classList.toggle("open");
    scrim.classList.toggle("on", side.classList.contains("open"));
  };
  if (scrim) scrim.onclick = closeSide;
  side.addEventListener("click", function (e) { if (e.target.closest("[data-tab]")) closeSide(); });

  document.addEventListener("keydown", function (e) {
    if (e.key === "/" && document.activeElement !== $("search")) {
      e.preventDefault(); $("search").focus();
    }
    if (e.key === "Escape") { closePops(); closeSide(); }
  });

  $("search").addEventListener("input", function () {
    state.q = this.value.trim();
    if (state.q && state.tab === "overview") state.tab = "tickets";
    state.ticket = null;
    render();
  });

  render();
})();
