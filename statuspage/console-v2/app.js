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
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>'
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
             ["Dr Chen started work", "40m ago"]],
      cm: [{ who: "Alex Kaur", role: "Client care", when: "1h ago",
             text: "Panel is the full one, not the short screen. Nothing needed from our side before review." },
           { who: "Dr Helen Chen", role: "Physician", when: "35m ago",
             text: "Looking at it now. I'll want the previous panel alongside it — Alex, can you pull the June one?" }] },

    { key: "TRT-117", sum: "Client reports chest tightness, asks whether to stop treatment",
      type: "clinical", q: "held", st: "open", pri: "urgent", due: null,
      client: "Rachel Santos", from: "r.santos@example.com", ch: "email", age: "3h",
      why: "Client describes a physical symptom and asks whether to stop treatment. Withheld from automatic routing and no reply drafted — a qualified person must handle this.",
      body: "I've had some tightness in my chest the last couple of days and I'm a bit worried. I started treatment about five weeks ago.\n\nShould I stop?",
      acts: [["Created from client email", "3h ago"], ["Held for review — not routed", "3h ago"]],
      cm: [{ who: "Jordan Blake", role: "Leadership", when: "2h ago",
             text: "Flagged to me on the morning check. No reply has gone out and none should until a clinician has seen it." }] },

    { key: "TRT-116", sum: "Follow-up blood work overdue", type: "pathology",
      q: "nursing", st: "open", pri: "urgent", due: -2, client: "Priya Sharma",
      from: "Automated check", ch: "system", age: "2d",
      why: "Raised automatically by the daily pathology sweep. Mandatory follow-up blood work has passed its target date.",
      body: "Follow-up blood work was due 15 September, eight weeks from treatment start.\n\nNo results have been received.",
      acts: [["Raised by pathology monitor", "2d ago"], ["Routed to Nursing", "2d ago"],
             ["Escalated to leadership", "1d ago"]],
      cm: [{ who: "Sarah Mitchell", role: "Nursing", when: "1d ago",
             text: "Called twice, no answer. Sending the pathology form again and will try again Thursday." }] },

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
      from: "Automated check", ch: "system", age: "1d",
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
      from: "Automated check", ch: "system", age: "4d",
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
      from: "Automated check", ch: "system", age: "6d",
      why: "Raised automatically at the twelve-month anniversary.",
      body: "Client reaches twelve months on 11 November 2026 and qualifies for the ongoing loyalty rate.",
      acts: [["Raised by schedule", "6d ago"], ["Resolved by Alex Kaur", "5d ago"]] }
  ];

  /* ---------------------------------------------------------- state */

  // view defaults to "board": the board is what people asked to land on, and a
  // column count reads faster than a row count when you are deciding what to
  // pick up next. The list is one click away and the choice is remembered.
  var state = {
    tab: "overview", ticket: null, q: "",
    fq: "", fst: "", fpri: "", view: "board",
    sort: "key", dir: -1,
    me: "support", signedIn: true, collapsed: false
  };

  /* People who can be signed in. Role is not a permission model — it decides
   * whose name goes on a comment and which queue the ticket views open on. */
  var PEOPLE = {
    support:   { name: "Alex Kaur",      role: "Client care",  queue: "support" },
    nursing:   { name: "Sarah Mitchell", role: "Nursing",      queue: "nursing" },
    physician: { name: "Dr Helen Chen",  role: "Physician",    queue: "physician" },
    lead:      { name: "Jordan Blake",   role: "Leadership",   queue: "" }
  };
  function me() { return PEOPLE[state.me]; }

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
    { id: "system",   label: "Automated checks", icon: I.repeat,
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
      // data-label feeds the hover tooltip when the rail is collapsed to icons.
      // aria-label carries the same text because the visible <span> is
      // display:none in that state, which takes it out of the accessibility
      // tree and would leave nine unnamed buttons.
      return '<button class="nav" data-tab="' + t.id + '" data-label="' + esc(t.label) +
        '" aria-label="' + esc(t.label) +
        '" aria-current="' + (state.tab === t.id) + '">' +
        svg(t.icon) + "<span>" + esc(t.label) + "</span>" +
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

  // `board` is opt-in per view. The board answers "what is everyone working on
  // and what is stuck", which is an All-tickets question. The channel tabs and
  // Held for review are already narrow slices — Held is almost entirely one
  // status, so a board there is one tall column and three empty ones.
  function renderTickets(scope, title, blurb, board) {
    var rows = filtered(scope);
    var active = state.fq || state.fst || state.fpri || state.q;
    var asBoard = board && state.view === "board";

    var head = '<div class="page-head"><div><h1>' + esc(title) + "</h1>" +
      (blurb ? "<p>" + esc(blurb) + "</p>" : "") + "</div>" +
      '<span class="spacer"></span>' +
      // Same scoping as the board: All tickets is the one view that owns the
      // whole queue, so it is where work gets added.
      (board ? '<button class="btn primary" id="newbtn">' + svg(I.plus) +
               "New ticket</button>" : "") + "</div>";

    var bar = '<div class="filterbar">' +
      dropdown("fq", "Queue", state.fq, FILTERS.fq) +
      dropdown("fst", "Status", state.fst, FILTERS.fst) +
      dropdown("fpri", "Priority", state.fpri, FILTERS.fpri) +
      // The search field moved into the command palette, so the active term has
      // to be visible here or a filtered list looks like a broken one.
      (state.q ? '<span class="tag t-mute">Matching “' + esc(state.q) + '”</span>' : "") +
      (active ? '<button class="btn ghost sm" id="clearf">Clear filters</button>' : "") +
      '<span class="spacer"></span>' +
      '<span class="count">' + rows.length + (rows.length === 1 ? " ticket" : " tickets") + "</span>" +
      (board
        ? '<span class="seg"><button data-view="list" aria-pressed="' + (state.view === "list") +
          '">List</button><button data-view="board" aria-pressed="' + (state.view === "board") +
          '">Board</button></span>'
        : "") + "</div>";

    var body;
    if (!rows.length) {
      body = '<div class="card"><div class="empty">' + svg(I.search) +
        "<div>No tickets match these filters.</div></div></div>";
    } else if (asBoard) {
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
    return '<div class="card"><div class="table-scroll"><table><thead><tr>' +
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
          '<td class="key" data-l="Key">' + esc(t.key) + "</td>" +
          '<td class="cell-sum" data-l="Summary"><div class="sum">' + esc(t.sum) + "</div>" +
            '<div class="sub">' + esc(TYPE[t.type]) + " · " + esc(t.age) + " old</div></td>" +
          '<td data-l="Queue">' + tag(QUEUE[t.q].label, QUEUE[t.q].cls) + "</td>" +
          '<td data-l="Client">' + (t.client === "—" ? '<span style="color:var(--dimmer)">—</span>'
                    : '<span class="who-cell">' + avatar(t.client) + esc(t.client) + "</span>") + "</td>" +
          '<td data-l="Status">' + statusEl(t.st) + "</td>" +
          '<td data-l="Priority">' + priorityEl(t.pri) + "</td>" +
          '<td data-l="Target">' + dueEl(t.due) + "</td></tr>";
      }).join("") + "</tbody></table></div></div>";
  }

  function boardHTML(rows) {
    var cols = ["open", "progress", "waiting", "resolved"];
    return '<div class="board">' + cols.map(function (c) {
      var items = rows.filter(function (t) { return t.st === c; });
      return '<section class="col" data-col="' + c + '"><div class="col-head">' +
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
    var nb = $("newbtn");
    if (nb) nb.onclick = ntOpen;
    var clear = $("clearf");
    if (clear) clear.onclick = function () {
      state.fq = state.fst = state.fpri = state.q = "";
      render();
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
  // Only the filter dropdowns are disposable. The notification and account
  // popovers live in the markup, so removing every .pop would delete them.
  function closePops() {
    document.querySelectorAll(".sel .pop").forEach(function (p) { p.remove(); });
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

        // On a client email the sender is an address, and initials() on an
        // address yields one letter in a different colour to the same
        // person's avatar in the Client panel. Show the person, address
        // underneath, and key the avatar off the name so they match.
        '<div class="msg"><div class="msg-head">' +
          avatar(t.ch === "email" ? t.client
               : t.ch === "system" ? "System" : t.from, "md") +
          '<span><div class="msg-from">' +
          esc(t.ch === "email" ? t.client : t.from) + "</div>" +
          '<div class="msg-addr">' +
          (t.ch === "email" ? esc(t.from)
           : t.ch === "slack" ? "Internal message"
           : t.ch === "manual" ? esc(t.fromRole || "Raised by hand") : "Automated check") +
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

        commentsHTML(t) +

      "</div></div><aside class='det-side'>" +
        '<div class="card"><h3 class="eyebrow">Details</h3>' +
          '<div class="field"><span class="k">Status</span><span class="v">' + statusEl(t.st) + "</span></div>" +
          // Cards cannot be dragged on a touch screen, so the same move is
          // available here. Live data only: on the sample set there is
          // nothing to write to.
          (live ? '<div class="st-picker">' +
            ["open", "progress", "waiting", "resolved"].map(function (k) {
              return '<button class="st-opt" data-move="' + k + '" aria-pressed="' +
                (t.st === k) + '">' + esc(STATUS[k].label) + "</button>";
            }).join("") + "</div>" +
            '<div class="st-note">Resolving also closes any deadline being ' +
            "tracked against this ticket.</div>" : "") +
          '<div class="field"><span class="k">Queue</span><span class="v">' + tag(QUEUE[t.q].label, QUEUE[t.q].cls) + "</span></div>" +
          '<div class="field"><span class="k">Priority</span><span class="v">' + priorityEl(t.pri) + "</span></div>" +
          '<div class="field"><span class="k">Type</span><span class="v">' + esc(TYPE[t.type]) + "</span></div>" +
          '<div class="field"><span class="k">Target</span><span class="v">' + dueEl(t.due) + "</span></div>" +
          '<div class="field"><span class="k">Source</span><span class="v">' +
            (t.ch === "email" ? "Client email" : t.ch === "slack" ? "Internal chat"
             : t.ch === "manual" ? "Raised by a person" : "Automated check") + "</span></div>" +
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
    document.querySelectorAll("[data-move]").forEach(function (b) {
      b.onclick = function () { moveTicket(t.key, b.getAttribute("data-move"), null); };
    });
    wireComments(t);
  }

  /* ------------------------------------------------------- comments */

  // Comments are staff-to-staff notes on a ticket. They are deliberately kept
  // separate from Activity: activity is what the system did, comments are what
  // people said. Nothing here is sent to the client.
  function commentsHTML(t) {
    var list = (t.cm || []).map(function (c) {
      return '<div class="comment">' + avatar(c.who, "md") +
        '<div><div class="cm-head"><span class="cm-who">' + esc(c.who) + "</span>" +
        '<span class="cm-role">' + esc(c.role) + "</span>" +
        '<span class="cm-time">' + esc(c.when) + "</span></div>" +
        '<div class="cm-body">' + esc(c.text).replace(/\n/g, "<br>") + "</div></div></div>";
    }).join("");

    return '<div class="comments"><span class="eyebrow">Comments' +
      ((t.cm || []).length ? " (" + t.cm.length + ")" : "") + "</span>" +
      (list || '<div style="padding:10px 0;color:var(--dimmer);font-size:13px">' +
        "No comments yet. Notes added here stay internal.</div>") +
      '<div class="cm-form">' + avatar(me().name, "md") +
      '<div><div class="cm-box">' +
      '<textarea id="cmtext" rows="2" aria-label="Add a comment" placeholder="Add a note for the team…"></textarea>' +
      '<div class="cm-bar"><button class="btn primary sm" id="cmpost">Comment</button>' +
      '<span class="hint">Internal only — the client never sees this.</span>' +
      "</div></div></div></div></div>";
  }

  function wireComments(t) {
    var box = $("cmtext"), post = $("cmpost");
    if (!box || !post) return;
    function submit() {
      var v = box.value.trim();
      if (!v) return;
      t.cm = t.cm || [];
      t.cm.push({ who: me().name, role: me().role, when: "just now", text: v });
      render();
    }
    post.onclick = submit;
    // Ctrl/Cmd+Enter to send, matching every other comment box people use.
    box.onkeydown = function (e) {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); }
    };
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
      // First name of whoever is signed in, not a hardcoded one.
      '<div class="hero"><h1>' + greet + ", " +
        esc(me().name.split(/\s+/)[0]) + "</h1><p>" +
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
        [["Client email", "email"], ["Internal messages", "slack"], ["Automated checks", "system"]]
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
      "<p>The routines that run in the background, and every obligation coming up " +
      "across all clients. Nothing here is a task for you yet - when one of these " +
      "dates arrives, a ticket is raised under Automated checks.</p></div></div>" +

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

      routinesBlock() +

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
      '<div class="card"><div class="table-scroll"><table><thead><tr><th>Client</th><th>Contact</th>' +
      "<th>Open tickets</th><th>Next obligation</th></tr></thead><tbody>" +
      rows.map(function (c) {
        return "<tr><td><span class='who-cell'>" + avatar(c.name, "md") +
          "<span><div style='font-weight:600'>" + esc(c.name) + "</div></span></span></td>" +
          '<td style="color:var(--dim)">' + esc(c.email || "—") + "</td>" +
          "<td>" + c.open + "</td><td>" + dueEl(c.next) + "</td></tr>";
      }).join("") + "</tbody></table></div></div></div>";
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
        "Automated checks",
        "Work the routines raised on their own rather than a person asking - follow-ups " +
        "falling due, results expiring, renewals approaching. The routines that " +
        "produce these, and what they will raise next, are under Schedule.");
    if (state.tab === "email")
      return renderTickets(T.filter(function (t) { return t.ch === "email"; }),
        "Client email", "Tickets raised from messages clients sent in.");
    if (state.tab === "slack")
      return renderTickets(T.filter(function (t) { return t.ch === "slack"; }),
        "Internal messages", "Tickets raised from requests your team posted in chat.");
    renderTickets(null, "All tickets",
      "Every piece of work in the system, whichever channel it arrived from.", true);
  }

  // Wrap render so motion applies to whatever view was just drawn.
  var baseRender = render;
  render = function () {
    baseRender();
    wireDragAndDrop();
    wireRoutines();
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

  /* ------------------------------------------------ collapsible rail */

  // The collapsed state is a per-person habit, not a session detail, so it is
  // remembered. localStorage can throw in a locked-down browser; a rail that
  // opens expanded is a fine failure, a console that does not load is not.
  var STORE = "trt-ops-rail";
  try { state.collapsed = localStorage.getItem(STORE) === "1"; } catch (err) { /* ignore */ }

  var shell = $("shell"), collapseBtn = $("collapse");
  function applyRail() {
    shell.classList.toggle("collapsed", state.collapsed);
    if (collapseBtn) {
      collapseBtn.setAttribute("aria-label", state.collapsed ? "Expand sidebar" : "Collapse sidebar");
      collapseBtn.title = collapseBtn.getAttribute("aria-label");
    }
  }
  function toggleRail() {
    state.collapsed = !state.collapsed;
    try { localStorage.setItem(STORE, state.collapsed ? "1" : "0"); } catch (err) { /* ignore */ }
    applyRail();
  }
  if (collapseBtn) collapseBtn.onclick = toggleRail;
  // Expanding again has to be possible once the button is hidden, so the
  // brand mark itself becomes the expand control in the collapsed state.
  document.querySelector(".brand").addEventListener("click", function (e) {
    if (state.collapsed && !e.target.closest("#collapse")) toggleRail();
  });
  applyRail();

  /* ----------------------------------------------------- header pops */

  var bell = $("bell"), notifpop = $("notifpop");
  var whobtn = $("whobtn"), whopop = $("whopop");

  function closeHeaderPops(except) {
    [notifpop, whopop].forEach(function (p) { if (p && p !== except) p.hidden = true; });
  }
  document.addEventListener("click", function (e) {
    if (!e.target.closest(".menu-wrap")) closeHeaderPops();
  });

  /* --------------------------------------------------- notifications */

  // Built from the ticket data rather than hand-written, so the bell can never
  // disagree with the board. Each one carries the ticket it came from.
  var readIds = {};
  function notifications() {
    var out = [];
    T.forEach(function (t) {
      if (t.q === "held")
        out.push({ id: t.key + ":held", cls: "esc", icon: I.alert, when: t.age + " ago",
          txt: "Held for review — " + t.key,
          sub: t.client + " · withheld from routing, needs a qualified person", key: t.key });
      if (t.st !== "resolved" && t.due !== null && t.due < 0)
        out.push({ id: t.key + ":over", cls: "held", icon: I.alert, when: t.age + " ago",
          txt: "Past target date — " + t.key,
          sub: Math.abs(t.due) + (Math.abs(t.due) === 1 ? " day" : " days") +
               " over · escalated to leadership", key: t.key });
      if (t.ch === "email" && t.st === "open")
        out.push({ id: t.key + ":mail", cls: "mail", icon: I.mail, when: t.age + " ago",
          txt: "New client email — " + t.key,
          sub: t.client + " · " + t.sum, key: t.key });
      if (t.ch === "slack" && t.st === "open")
        out.push({ id: t.key + ":chat", cls: "chat", icon: I.hash, when: t.age + " ago",
          txt: "Request raised in chat — " + t.key, sub: t.sum, key: t.key });
      if (t.ch === "system" && t.st !== "resolved")
        out.push({ id: t.key + ":auto", cls: "auto", icon: I.repeat, when: t.age + " ago",
          txt: "Automated check raised " + t.key, sub: t.sum, key: t.key });
      if (t.st === "progress")
        out.push({ id: t.key + ":prog", cls: "done", icon: I.half, when: t.age + " ago",
          txt: t.key + " picked up", sub: QUEUE[t.q].label + " is working on it", key: t.key });
    });
    // Escalations and overdue work first; the rest in the order raised.
    var rank = { esc: 0, held: 1, mail: 2, chat: 3, auto: 4, done: 5 };
    out.sort(function (a, b) { return rank[a.cls] - rank[b.cls]; });
    return out.slice(0, 12);
  }

  function unread() {
    return notifications().filter(function (n) { return !readIds[n.id]; }).length;
  }
  function paintDot() {
    var d = $("belldot");
    if (d) d.hidden = unread() === 0;
  }

  function renderNotifs() {
    var items = notifications();
    notifpop.innerHTML = '<div class="notif-head"><h3>Notifications</h3>' +
      '<span class="spacer"></span>' +
      '<button class="btn ghost sm" id="markread">Mark all read</button></div>' +
      '<div class="notif-list">' +
      (items.length ? items.map(function (n) {
        return '<button class="nrow" data-nkey="' + esc(n.key) + '">' +
          '<span class="nico ' + n.cls + '">' + svg(n.icon) + "</span>" +
          '<span><div class="ntxt">' + esc(n.txt) + "</div>" +
          '<div class="nsub">' + esc(n.sub) + "</div>" +
          '<div class="ntime">' + esc(n.when) + "</div></span></button>";
      }).join("") : '<div class="cmd-empty">Nothing needs your attention.</div>') +
      "</div>";

    $("markread").onclick = function (e) {
      e.stopPropagation();
      notifications().forEach(function (n) { readIds[n.id] = true; });
      paintDot();
    };
    notifpop.querySelectorAll("[data-nkey]").forEach(function (b) {
      b.onclick = function () {
        state.ticket = b.getAttribute("data-nkey");
        closeHeaderPops();
        render();
      };
    });
  }

  if (bell) bell.onclick = function (e) {
    e.stopPropagation();
    var opening = notifpop.hidden;
    closeHeaderPops(notifpop);
    notifpop.hidden = !opening;
    if (opening) {
      renderNotifs();
      // Opening the panel is the acknowledgement; the dot clears, the items stay.
      notifications().forEach(function (n) { readIds[n.id] = true; });
      paintDot();
    }
  };

  /* ------------------------------------------------------- account */

  function paintWho() {
    var p = me();
    $("whoname").textContent = p.name;
    $("whorole").textContent = p.role;
    var av = $("whoav");
    av.textContent = initials(p.name);
    av.style.background = hue(p.name);
  }

  function renderWho() {
    var p = me();
    whopop.innerHTML =
      '<div style="display:flex;align-items:center;gap:11px;padding:6px 10px 12px">' +
      avatar(p.name, "md") + '<span><div style="font-family:var(--display);font-weight:700;font-size:13.5px">' +
      esc(p.name) + '</div><div style="font-size:12px;color:var(--dim)">' + esc(p.role) + "</div></span></div>" +
      '<div class="cap">Signed in as</div>' +
      Object.keys(PEOPLE).map(function (k) {
        return '<button data-who="' + k + '" aria-current="' + (state.me === k) + '">' +
          esc(PEOPLE[k].name) + " · " + esc(PEOPLE[k].role) +
          (state.me === k ? '<span class="tick">' + svg(I.check) + "</span>" : "") + "</button>";
      }).join("") +
      '<div class="cap">Session</div>' +
      '<button data-act="signout">' + svg(I.logout) + "Sign out</button>";

    whopop.querySelectorAll("[data-who]").forEach(function (b) {
      b.onclick = function () {
        state.me = b.getAttribute("data-who");
        // Switching person opens the ticket views on that person's queue.
        // Leadership has no queue of its own, so it sees everything. A stale
        // search term from the previous person survives into a view it was
        // never meant for, so it is cleared with the switch.
        state.fq = me().queue;
        state.q = "";
        state.ticket = null;
        closeHeaderPops();
        paintWho();
        render();
      };
    });
    whopop.querySelector("[data-act=signout]").onclick = function () {
      closeHeaderPops();
      state.signedIn = false;
      $("signin").hidden = false;
    };
  }

  if (whobtn) whobtn.onclick = function (e) {
    e.stopPropagation();
    var opening = whopop.hidden;
    closeHeaderPops(whopop);
    whopop.hidden = !opening;
    if (opening) renderWho();
  };

  $("signinbtn").onclick = function () {
    state.signedIn = true;
    $("signin").hidden = true;
  };

  /* ------------------------------------------------ command palette */

  var cmdOverlay = $("cmd"), cmdq = $("cmdq"), cmdres = $("cmdres");
  var cmdSel = 0, cmdItems = [];

  function commands() {
    var list = [];
    TABS.forEach(function (t) {
      if (t.sep) return;
      list.push({ g: "Go to", t: t.label, s: "Section", icon: t.icon,
        run: function () { state.tab = t.id; state.ticket = null; render(); } });
    });
    list.push({ g: "View", t: "Show tickets as a board", s: "Grouped by status", icon: I.grid,
      run: function () { state.view = "board"; state.tab = "tickets"; state.ticket = null; render(); } });
    list.push({ g: "View", t: "Show tickets as a list", s: "Sortable table", icon: I.ticket,
      run: function () { state.view = "list"; state.tab = "tickets"; state.ticket = null; render(); } });
    list.push({ g: "View", t: (state.collapsed ? "Expand" : "Collapse") + " the sidebar",
      s: "Keyboard and pointer", icon: I.chev, run: toggleRail });
    Object.keys(PEOPLE).forEach(function (k) {
      if (k === state.me) return;
      list.push({ g: "Switch person", t: PEOPLE[k].name, s: PEOPLE[k].role, icon: I.users,
        run: function () {
          state.me = k; state.fq = PEOPLE[k].queue; state.q = ""; state.ticket = null;
          paintWho(); render();
        } });
    });
    return list;
  }

  function cmdMatches(q) {
    var n = q.trim().toLowerCase();
    var out = [];

    if (n) {
      T.filter(function (t) {
        return (t.key + " " + t.sum + " " + t.client + " " + t.body).toLowerCase().indexOf(n) > -1;
      }).slice(0, 6).forEach(function (t) {
        out.push({ g: "Tickets", t: t.key + " — " + t.sum,
          s: QUEUE[t.q].label + " · " + t.client, icon: I.ticket,
          run: function () { state.ticket = t.key; render(); } });
      });

      var seen = {};
      T.forEach(function (t) {
        if (t.client === "—" || seen[t.client]) return;
        if (t.client.toLowerCase().indexOf(n) === -1) return;
        seen[t.client] = true;
        var mine = T.filter(function (x) { return x.client === t.client && x.st !== "resolved"; });
        out.push({ g: "Clients", t: t.client,
          s: mine.length + (mine.length === 1 ? " open ticket" : " open tickets"), icon: I.users,
          run: function () {
            state.q = t.client; state.tab = "tickets"; state.ticket = null; render();
          } });
      });
    }

    commands().filter(function (c) {
      return !n || c.t.toLowerCase().indexOf(n) > -1 || c.s.toLowerCase().indexOf(n) > -1;
    }).slice(0, n ? 5 : 20).forEach(function (c) { out.push(c); });

    if (n) {
      var hits = T.filter(function (t) {
        return (t.key + " " + t.sum + " " + t.client + " " + t.body).toLowerCase().indexOf(n) > -1;
      }).length;
      if (hits) out.push({ g: "Search", t: "Filter all tickets by “" + q.trim() + "”",
        s: hits + (hits === 1 ? " match" : " matches"), icon: I.search, kbd: "enter",
        run: function () {
          state.q = q.trim(); state.tab = "tickets"; state.ticket = null; render();
        } });
    }
    return out;
  }

  function renderCmd() {
    cmdItems = cmdMatches(cmdq.value);
    if (cmdSel >= cmdItems.length) cmdSel = 0;
    if (!cmdItems.length) {
      cmdres.innerHTML = '<div class="cmd-empty">Nothing matches that.</div>';
      return;
    }
    var group = "";
    cmdres.innerHTML = cmdItems.map(function (c, i) {
      var head = c.g !== group ? '<div class="cmd-group">' + esc(c.g) + "</div>" : "";
      group = c.g;
      return head + '<button class="cmd-item' + (i === cmdSel ? " sel" : "") + '" data-i="' + i + '">' +
        '<span class="ci">' + svg(c.icon) + "</span>" +
        '<span><div class="ct">' + esc(c.t) + "</div>" +
        '<div class="cs">' + esc(c.s) + "</div></span>" +
        (c.kbd ? '<span class="ck">' + esc(c.kbd) + "</span>" : "") + "</button>";
    }).join("");
    cmdres.querySelectorAll("[data-i]").forEach(function (b) {
      b.onclick = function () { runCmd(parseInt(b.getAttribute("data-i"), 10)); };
    });
  }

  function runCmd(i) {
    var c = cmdItems[i];
    if (!c) return;
    closeCmd();
    c.run();
  }
  function openCmd() {
    cmdOverlay.hidden = false;
    cmdq.value = ""; cmdSel = 0;
    renderCmd();
    cmdq.focus();
  }
  function closeCmd() { cmdOverlay.hidden = true; }

  $("cmdopen").onclick = openCmd;
  cmdq.addEventListener("input", function () { cmdSel = 0; renderCmd(); });
  cmdOverlay.addEventListener("click", function (e) {
    if (e.target === cmdOverlay) closeCmd();
  });
  cmdq.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown") { e.preventDefault(); cmdSel = (cmdSel + 1) % cmdItems.length; renderCmd(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); cmdSel = (cmdSel - 1 + cmdItems.length) % cmdItems.length; renderCmd(); }
    else if (e.key === "Enter") { e.preventDefault(); runCmd(cmdSel); }
    else if (e.key === "Escape") { e.preventDefault(); closeCmd(); }
    // Keep the highlighted row in view when arrowing past the fold.
    var sel = cmdres.querySelector(".cmd-item.sel");
    if (sel) sel.scrollIntoView({ block: "nearest" });
  });


  /* --------------------------------------------------- new ticket */

  // Work does not only arrive by email, chat or a routine. A phone call or
  // something a nurse notices has to be able to get in, and a board that has
  // no way to add to it reads as a report rather than a place work lives.
  var ntOverlay = $("newticket");

  // Mirrors the signals classify.py holds a message for. Here it is advisory,
  // not a block: a person typing this has context the classifier does not.
  var CLINICAL = [
    /\bchest (pain|tight)/i, /\bshort(ness)? of breath\b/i, /\bpalpitation/i,
    /\bshould (i|they|we) (stop|quit|halt|cease|pause)\b/i, /\bside ?effects?\b/i,
    /\bis (this|that) (normal|safe|dangerous)\b/i, /\bdizz(y|iness)\b/i,
    /\bblood pressure\b/i, /\bdose (change|increase|reduc)/i, /\breaction\b/i
  ];
  function readsClinical(text) {
    return CLINICAL.some(function (re) { return re.test(text); });
  }

  function daysUntil(value) {
    if (!value) return null;
    var picked = new Date(value + "T00:00:00");
    if (isNaN(picked.getTime())) return null;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((picked - today) / 86400000);
  }

  function dateInDays(n) {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + n);
    // toISOString would shift by the timezone offset and land on the wrong
    // day for anyone east of UTC, which is everyone here.
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }

  function ntCheck() {
    var text = $("nt-sum").value + " " + $("nt-body").value;
    var q = $("nt-queue").value;
    // Only nag when the wording is clinical AND it is not already going
    // somewhere qualified. Warning about a ticket already bound for the
    // physician would be noise, and noise gets ignored.
    var show = readsClinical(text) && q !== "physician" && q !== "held";
    $("nt-clin").classList.toggle("on", show);
  }

  function ntOpen() {
    ["nt-sum", "nt-body", "nt-client"].forEach(function (id) { $(id).value = ""; });
    $("nt-type").value = "admin";
    $("nt-queue").value = me().queue || "support";
    $("nt-pri").value = "normal";
    $("nt-due").value = "";
    $("f-sum").classList.remove("bad");
    $("nt-clin").classList.remove("on");
    ntOverlay.hidden = false;
    $("nt-sum").focus();
  }
  function ntClose() { ntOverlay.hidden = true; }

  function nextKey() {
    var top = T.reduce(function (m, t) {
      var n = parseInt(t.key.split("-")[1], 10);
      return n > m ? n : m;
    }, 0);
    return "TRT-" + (top + 1);
  }

  function ntCreate() {
    var sum = $("nt-sum").value.trim();
    if (!sum) { $("f-sum").classList.add("bad"); $("nt-sum").focus(); return; }

    // The form now takes a date, the board thinks in days-from-today.
    // Compare at midnight so a ticket created this afternoon and due
    // tomorrow reads as 1 day, not 0.
    var due = daysUntil($("nt-due").value);
    var t = {
      key: nextKey(), sum: sum, type: $("nt-type").value, q: $("nt-queue").value,
      st: "open", pri: $("nt-pri").value,
      due: due,
      client: $("nt-client").value.trim() || "—",
      from: me().name, fromRole: me().role, ch: "manual", age: "just now",
      why: "Raised by hand by " + me().name + " (" + me().role + "), not by the " +
           "routing engine. The queue was chosen by a person.",
      body: $("nt-body").value.trim() || "No further detail was given.",
      acts: [["Created by " + me().name, "just now"],
             ["Placed in " + QUEUE[$("nt-queue").value].label, "just now"]],
      cm: []
    };
    T.unshift(t);
    ntClose();
    state.ticket = t.key;
    render();
  }

  if (ntOverlay) {
    $("ntclose").onclick = ntClose;
    $("ntcancel").onclick = ntClose;
    $("ntcreate").onclick = ntCreate;
    ["nt-sum", "nt-body"].forEach(function (id) {
      $(id).addEventListener("input", function () {
        if (id === "nt-sum" && this.value.trim()) $("f-sum").classList.remove("bad");
        ntCheck();
      });
    });
    $("nt-queue").addEventListener("change", ntCheck);
    ntOverlay.querySelectorAll("[data-due]").forEach(function (b) {
      b.onclick = function () {
        var v = b.getAttribute("data-due");
        $("nt-due").value = v === "clear" ? "" : dateInDays(parseInt(v, 10));
      };
    });
    ntOverlay.addEventListener("click", function (e) {
      if (e.target === ntOverlay) ntClose();
    });
  }

  /* ---------------------------------------------------------- ask */

  // Every answer is computed from the same array the board renders from, so
  // it cannot disagree with what is on screen. There is no model here and
  // nothing is scripted - if it cannot answer, it says so and shows what it
  // does cover, which is far better in a clinical setting than a confident
  // wrong answer.
  var askPanel = $("askpanel"), askScrim = $("askscrim"), askLog = $("asklog");

  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }

  function hitList(rows) {
    if (!rows.length) return "";
    var shown = rows.slice(0, 6);
    return '<div class="ask-hits">' + shown.map(function (t) {
      return '<button class="ask-hit" data-ask-key="' + t.key + '">' +
        '<span class="k">' + esc(t.key) + "</span>" +
        '<span class="s">' + esc(t.sum) + "</span></button>";
    }).join("") +
    (rows.length > shown.length
      ? '<div style="font-size:11.5px;color:var(--dimmer);padding:3px 2px 0">and ' +
        (rows.length - shown.length) + " more</div>" : "") + "</div>";
  }

  // Split so the fallback does not repeat "the tickets on this board" twice
  // in a row, which is how it read when both sentences carried the phrase.
  var ASK_CAN =
    "I can tell you what is overdue, what is held for review, what a queue is " +
    "carrying, what is due soon, where work came from, or everything for one client.";

  function askAnswer(raw) {
    var q = raw.toLowerCase().trim();
    var o = open();
    var A = function (html, rows) { return { html: html, rows: rows || [] }; };

    if (/^(help|what can you|what do you)/.test(q))
      return A("I read the tickets on this board. " + ASK_CAN +
        " I cannot give clinical advice, and I cannot change anything.");

    // A specific ticket, by key
    var key = q.match(/trt[\s-]?(\d{3})/);
    if (key) {
      var hit = T.filter(function (t) { return t.key === "TRT-" + key[1]; })[0];
      if (!hit) return A("There is no ticket numbered TRT-" + key[1] + " on this board.");
      return A("<b>" + esc(hit.key) + "</b> — " + esc(hit.sum) + ".<br>" +
        esc(QUEUE[hit.q].label) + " · " + esc(STATUS[hit.st].label) + " · " +
        esc(PRIORITY[hit.pri].label) +
        (hit.client !== "—" ? " · " + esc(hit.client) : "") +
        (hit.due !== null && hit.due < 0
          ? "<br>It is " + plural(Math.abs(hit.due), "day", "days") + " past its target."
          : ""), [hit]);
    }

    if (/overdue|past target|late|behind|over due|slipped/.test(q)) {
      var over = o.filter(function (t) { return t.due !== null && t.due < 0; });
      if (!over.length) return A("Nothing is past its target date.");
      return A("<b>" + plural(over.length, "ticket is", "tickets are") +
        "</b> past target. Anything here has already been escalated to leadership " +
        "by the daily sweep.", over);
    }

    if (/held|withheld|not routed|safety|clinical judgement|judgment/.test(q)) {
      var held = o.filter(function (t) { return t.q === "held"; });
      if (!held.length) return A("Nothing is being held for review right now.");
      return A("<b>" + plural(held.length, "ticket is", "tickets are") +
        "</b> held for review. These were withheld from automatic routing " +
        "because they need a qualified person. No reply has been drafted for any " +
        "of them.", held);
    }

    if (/due|soon|this week|upcoming|coming up|deadline/.test(q)) {
      var soon = o.filter(function (t) { return t.due !== null && t.due >= 0 && t.due <= 7; });
      if (!soon.length) return A("Nothing falls due in the next seven days.");
      return A("<b>" + plural(soon.length, "ticket", "tickets") +
        "</b> due within seven days.", soon);
    }

    // A queue
    var qmap = [["physician", /physician|doctor|dr\b|clinical review/],
                ["nursing", /nursing|nurse/],
                ["support", /client care|support|admin/]];
    for (var i = 0; i < qmap.length; i++) {
      if (qmap[i][1].test(q)) {
        var rows = o.filter(function (t) { return t.q === qmap[i][0]; });
        return A("<b>" + esc(QUEUE[qmap[i][0]].label) + "</b> is carrying " +
          plural(rows.length, "open ticket", "open tickets") + ".", rows);
      }
    }

    // A channel
    if (/email|inbox|client wrote|mailbox/.test(q)) {
      var em = o.filter(function (t) { return t.ch === "email"; });
      return A("<b>" + plural(em.length, "open ticket", "open tickets") +
        "</b> came in from client email.", em);
    }
    if (/slack|internal|chat|channel/.test(q)) {
      var sl = o.filter(function (t) { return t.ch === "slack"; });
      return A("<b>" + plural(sl.length, "open ticket", "open tickets") +
        "</b> came from internal messages.", sl);
    }
    if (/automated|automatic|routine|scheduled|sweep|monitor/.test(q)) {
      var sy = o.filter(function (t) { return t.ch === "system"; });
      return A("<b>" + plural(sy.length, "open ticket", "open tickets") +
        "</b> were raised by the routines rather than by a person.", sy);
    }

    // A status
    if (/in progress|being worked|working on/.test(q)) {
      var pr = T.filter(function (t) { return t.st === "progress"; });
      return A("<b>" + plural(pr.length, "ticket is", "tickets are") +
        "</b> in progress.", pr);
    }
    if (/waiting/.test(q)) {
      var wa = T.filter(function (t) { return t.st === "waiting"; });
      return A("<b>" + plural(wa.length, "ticket is", "tickets are") +
        "</b> waiting on a client.", wa);
    }
    if (/resolved|closed|done|finished/.test(q)) {
      var rs = T.filter(function (t) { return t.st === "resolved"; });
      return A("<b>" + plural(rs.length, "ticket has", "tickets have") +
        "</b> been resolved.", rs);
    }

    // A client, by name
    var names = {};
    T.forEach(function (t) { if (t.client !== "—") names[t.client] = true; });
    var who = Object.keys(names).filter(function (nm) {
      return nm.toLowerCase().split(/\s+/).some(function (part) {
        return part.length > 2 && q.indexOf(part) > -1;
      });
    })[0];
    if (who) {
      var mine = T.filter(function (t) { return t.client === who; });
      var openMine = mine.filter(function (t) { return t.st !== "resolved"; });
      return A("<b>" + esc(who) + "</b> has " +
        plural(openMine.length, "open ticket", "open tickets") +
        (mine.length > openMine.length
          ? " and " + plural(mine.length - openMine.length, "resolved one", "resolved ones")
          : "") + ".", mine);
    }

    if (/summary|overview|how are we|needs attention|what should i|where do i|status/.test(q)) {
      var h = o.filter(function (t) { return t.q === "held"; }).length;
      var ov = o.filter(function (t) { return t.due !== null && t.due < 0; }).length;
      return A("<b>" + plural(o.length, "ticket is", "tickets are") + "</b> open. " +
        (h ? plural(h, "is", "are") + " held for review. " : "Nothing is held. ") +
        (ov ? plural(ov, "is", "are") + " past target and escalated." : "Nothing is past target."));
    }

    if (/how many|count|total|number of/.test(q))
      return A("<b>" + plural(o.length, "ticket is", "tickets are") + "</b> open, out of " +
        T.length + " on the board.");

    return A("I could not answer that from the tickets on this board. " + ASK_CAN);
  }

  function askPush(cls, html, rows) {
    var el = document.createElement("div");
    el.className = "ask-msg " + cls;
    el.innerHTML = '<div class="bub">' + html + (rows ? hitList(rows) : "") + "</div>";
    askLog.appendChild(el);
    askLog.scrollTop = askLog.scrollHeight;
  }

  function askAsk(text) {
    if (!text.trim()) return;
    askPush("you", esc(text));
    var a = askAnswer(text);
    askPush("bot", a.html, a.rows);
  }

  function askGreet() {
    askLog.innerHTML = "";
    askPush("bot", "Ask me about the work on this board — I read the same " +
      "tickets you can see." +
      '<div class="ask-chips">' +
      ["What needs attention?", "What is overdue?", "What is held for review?",
       "How busy is nursing?", "Anything due this week?"]
        .map(function (c) { return '<button class="ask-chip">' + esc(c) + "</button>"; })
        .join("") + "</div>");
  }

  function askOpen() {
    askPanel.hidden = false;
    askScrim.hidden = false;
    // The panel carries its own close, and on a phone it covers the whole
    // screen - a floating button on top of it would just be in the way.
    $("askbtn").hidden = true;
    if (!askLog.children.length) askGreet();
    $("askq").focus();
  }
  function askClose() {
    askPanel.hidden = true;
    askScrim.hidden = true;
    $("askbtn").hidden = false;
  }

  if (askPanel) {
    $("askbtn").onclick = function () {
      askPanel.hidden ? askOpen() : askClose();
    };
    $("askclose").onclick = askClose;
    askScrim.onclick = askClose;
    $("asksend").onclick = function () {
      askAsk($("askq").value); $("askq").value = "";
    };
    $("askq").addEventListener("keydown", function (e) {
      if (e.key === "Enter") { askAsk(this.value); this.value = ""; }
      else if (e.key === "Escape") askClose();
    });
    askLog.addEventListener("click", function (e) {
      var chip = e.target.closest(".ask-chip");
      if (chip) { askAsk(chip.textContent); return; }
      var hit = e.target.closest("[data-ask-key]");
      if (hit) {
        state.ticket = hit.getAttribute("data-ask-key");
        askClose();
        render();
      }
    });
  }


  /* ------------------------------------------------ moving work */

  /* Dragging a card writes the new column straight back to the system.
   * Only when the board is live: on the sample data there is nothing to
   * write to, and a drag that appears to work and silently does nothing is
   * worse than one that is plainly unavailable.
   *
   * The card moves as soon as it is dropped rather than waiting for the
   * round trip - a board that lags behind the hand feels broken - and it
   * moves back if the write fails. */

  function moveTicket(key, status, card) {
    var t = T.filter(function (x) { return x.key === key; })[0];
    if (!t || t.st === status) return;

    var previous = t.st;
    t.st = status;
    if (card) card.classList.add("saving");
    render();

    fetch("/api/ticket/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: key, status: status, by: me().name }),
    })
      .then(function (r) { return r.json().catch(function () { return null; }); })
      .then(function (d) {
        if (!d || !d.ok) throw new Error((d && d.error) || "write failed");
        t.acts = t.acts || [];
        t.acts.push([
          "Moved to " + STATUS[status].label + " by " + me().name,
          "just now",
        ]);
        if (d.deadlines_closed) {
          t.acts.push([
            "Closed " + d.deadlines_closed +
            (d.deadlines_closed === 1 ? " tracked deadline" : " tracked deadlines"),
            "just now",
          ]);
          t.due = null;
        }
        render();
        flash(key, "saved");
      })
      .catch(function (err) {
        // Put it back. Leaving it in the new column would show the person a
        // state the system does not actually have.
        t.st = previous;
        render();
        flash(key, "failed");
        toast("Could not move " + key + ": " + err.message);
      });
  }

  function flash(key, cls) {
    var el = document.querySelector('[data-key="' + key + '"]');
    if (!el) return;
    el.classList.remove("saving");
    el.classList.add(cls);
    setTimeout(function () { el.classList.remove(cls); }, 1400);
  }

  function toast(text) {
    var el = document.createElement("div");
    el.className = "toast";
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 5000);
  }

  function wireDragAndDrop() {
    var board = document.querySelector(".board");
    if (!board || !live) return;
    board.classList.add("live");

    var dragging = null;

    board.querySelectorAll(".ticket").forEach(function (card) {
      card.setAttribute("draggable", "true");
      card.addEventListener("dragstart", function (e) {
        dragging = card.getAttribute("data-key");
        card.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
        // Firefox will not start a drag without data set.
        e.dataTransfer.setData("text/plain", dragging);
      });
      card.addEventListener("dragend", function () {
        card.classList.remove("dragging");
        board.querySelectorAll(".col").forEach(function (c) {
          c.classList.remove("drop");
        });
        dragging = null;
      });
    });

    board.querySelectorAll(".col").forEach(function (col) {
      col.addEventListener("dragover", function (e) {
        if (!dragging) return;
        e.preventDefault();               // without this, no drop fires
        e.dataTransfer.dropEffect = "move";
        col.classList.add("drop");
      });
      col.addEventListener("dragleave", function (e) {
        // Moving between a column's own children fires dragleave on the
        // column; ignore those or the highlight strobes.
        if (!col.contains(e.relatedTarget)) col.classList.remove("drop");
      });
      col.addEventListener("drop", function (e) {
        e.preventDefault();
        col.classList.remove("drop");
        var key = dragging || e.dataTransfer.getData("text/plain");
        var status = col.getAttribute("data-col");
        if (key && status) {
          moveTicket(key, status,
                     document.querySelector('[data-key="' + key + '"]'));
        }
      });
    });
  }


  /* ------------------------------------------- editable routines */

  /* The routines the clinic can adjust for themselves. Reads come from the
   * same payload as the tickets; writes go one field at a time so a failed
   * change never leaves the form and the system disagreeing.
   *
   * Only rendered against live data - on the sample set there is no
   * scheduler to talk to, and an editable control that silently does
   * nothing is worse than a static one. */

  var SCHEDULES = [];

  /* A schedule in words.
   *
   * "Runs 0 9 * * *" is meaningless to anyone who does not write cron, and
   * the asterisks read as corrupted text next to ordinary prose. The raw
   * expression is still shown, but quietly and after the plain version, so
   * it can be checked without being the first thing read. */

  var DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday",
                   "Friday", "Saturday"];

  function clockTime(hour, minute) {
    var h = parseInt(hour, 10);
    var m = parseInt(minute, 10);
    // Out-of-range fields mean this is not a shape we understand. Returning
    // null sends it back to showing the raw expression, which is honest;
    // an hour of 30 would otherwise render as a confident, wrong "6pm".
    if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
    var suffix = h < 12 ? "am" : "pm";
    var display = h % 12 === 0 ? 12 : h % 12;
    return display + (m ? ":" + String(m).padStart(2, "0") : "") + suffix;
  }

  function readableSchedule(expr) {
    expr = (expr || "").trim();
    if (!expr) return "not scheduled";

    // "every 2m" / "30m" / "every 2h"
    var iv = expr.match(/^(?:every\s+)?(\d+)\s*(m|min(?:ute)?s?|h|hrs?|hours?|d|days?)$/i);
    if (iv) {
      var n = parseInt(iv[1], 10);
      var unit = iv[2].toLowerCase();
      var word = unit.charAt(0) === "m" ? "minute"
               : unit.charAt(0) === "h" ? "hour" : "day";
      if (n === 1) return "every " + word;
      return "every " + n + " " + word + "s";
    }

    // Five-field cron. Only the shapes we actually produce are spelled out;
    // anything more exotic keeps its raw form rather than being described
    // wrongly, which would be worse than not describing it at all.
    var f = expr.split(/\s+/);
    if (f.length === 5) {
      var min = f[0], hour = f[1], dom = f[2], mon = f[3], dow = f[4];
      var at = clockTime(hour, min);
      if (at && dom === "*" && mon === "*") {
        if (dow === "*") return "every day at " + at;
        if (dow === "1-5") return "every weekday at " + at;
        if (/^[0-6]$/.test(dow)) return "every " + DAY_NAMES[+dow] + " at " + at;
      }
      if (at && dom !== "*" && mon === "*" && dow === "*") {
        return "on the " + ordinal(+dom) + " of each month at " + at;
      }
    }
    return expr;
  }

  function ordinal(n) {
    if (n % 100 >= 11 && n % 100 <= 13) return n + "th";
    return n + ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th");
  }


  function schedulePresets() {
    return [
      ["0 7 * * *", "Every day at 7am"],
      ["0 9 * * *", "Every day at 9am"],
      ["0 17 * * *", "Every day at 5pm"],
      ["0 9 * * 1-5", "Every weekday at 9am"],
      ["every 2m", "Every 2 minutes"],
      ["every 3m", "Every 3 minutes"],
      ["every 5m", "Every 5 minutes"],
      ["every 30m", "Every 30 minutes"],
      ["every 1h", "Every hour"],
    ];
  }

  function routineHTML(j) {
    var presets = schedulePresets()
      .map(function (p) {
        return '<option value="' + esc(p[0]) + '"' +
          (p[0] === j.schedule ? " selected" : "") + ">" + esc(p[1]) + "</option>";
      }).join("");

    return '<div class="routine-row" data-job="' + esc(j.id) + '">' +
      '<div class="rr-main">' +
        '<div class="rr-name">' + esc(j.label) +
          (j.enabled ? "" : '<span class="rr-off">Paused</span>') + "</div>" +
        (j.blurb ? '<div class="rr-blurb">' + esc(j.blurb) + "</div>" : "") +
      "</div>" +
      '<div class="rr-controls">' +
        '<select class="rr-preset" aria-label="Schedule for ' + esc(j.label) + '">' +
          presets +
          '<option value="__custom">Custom...</option>' +
        "</select>" +
        '<input class="rr-custom" type="text" hidden placeholder="e.g. 0 8 * * 1-5" ' +
          'value="' + esc(j.schedule) + '" aria-label="Custom schedule">' +
        '<button class="btn ghost sm rr-toggle">' +
          (j.enabled ? "Pause" : "Resume") + "</button>" +
      "</div>" +
      '<div class="rr-now">Runs <b>' + esc(readableSchedule(j.schedule)) + "</b>" +
        '<code class="rr-raw">' + esc(j.schedule) + "</code></div>" +
      "</div>";
  }

  function routinesBlock() {
    if (!live || !SCHEDULES.length) return "";
    return '<div class="card routines-card">' +
      '<h3 class="eyebrow">When these run</h3>' +
      '<p class="rr-intro">Change the timing to suit the clinic. A change ' +
      "takes effect from the next run; nothing already scheduled is lost.</p>" +
      SCHEDULES.map(routineHTML).join("") + "</div>";
  }

  function saveSchedule(row, body) {
    row.classList.add("saving");
    fetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(function (r) { return r.json().catch(function () { return null; }); })
      .then(function (d) {
        row.classList.remove("saving");
        if (!d || !d.ok) throw new Error((d && d.error) || "change refused");
        // Replace our copy with what the scheduler actually holds, rather
        // than assuming the change landed as typed.
        SCHEDULES = SCHEDULES.map(function (j) {
          return j.id === d.job.id ? d.job : j;
        });
        render();
        toast("Saved. " + d.job.label + " now runs " +
              readableSchedule(d.job.schedule) + ".");
      })
      .catch(function (err) {
        row.classList.remove("saving");
        render();                       // put the controls back as they were
        toast(err.message);
      });
  }

  function wireRoutines() {
    document.querySelectorAll(".routine-row").forEach(function (row) {
      var id = row.getAttribute("data-job");
      var preset = row.querySelector(".rr-preset");
      var custom = row.querySelector(".rr-custom");

      // A schedule not in the list shows as Custom with the box already open.
      var known = schedulePresets().some(function (p) {
        return p[0] === custom.value;
      });
      if (!known) { preset.value = "__custom"; custom.hidden = false; }

      preset.onchange = function () {
        if (preset.value === "__custom") {
          custom.hidden = false;
          custom.focus();
          return;
        }
        custom.hidden = true;
        saveSchedule(row, { id: id, schedule: preset.value });
      };

      custom.onkeydown = function (e) {
        if (e.key !== "Enter") return;
        e.preventDefault();
        saveSchedule(row, { id: id, schedule: custom.value });
      };
      custom.onblur = function () {
        var current = row.querySelector(".rr-now b");
        if (custom.value.trim() && custom.value.trim() !== (current && current.textContent)) {
          saveSchedule(row, { id: id, schedule: custom.value });
        }
      };

      row.querySelector(".rr-toggle").onclick = function () {
        var job = SCHEDULES.filter(function (j) { return j.id === id; })[0];
        saveSchedule(row, { id: id, enabled: !(job && job.enabled) });
      };
    });
  }

  /* ----------------------------------------------------- global keys */

  document.addEventListener("keydown", function (e) {
    var typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
    if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      cmdOverlay.hidden ? openCmd() : closeCmd();
      return;
    }
    if (e.key === "/" && !typing) { e.preventDefault(); openCmd(); return; }
    if (e.key === "Escape") { closePops(); closeHeaderPops(); closeSide(); closeCmd(); }
  });

  /* ------------------------------------------------------------ go */

  /* --------------------------------------------------- live data */

  /* One build has to work in two places: served by the local system, where
   * real tickets exist, and on static hosting with no backend at all. So it
   * asks for live data and falls back to the sample set when there is none,
   * rather than shipping two builds that drift apart.
   *
   * Which one is showing is stated in the header. A console that quietly
   * shows invented tickets while looking live is the worst outcome here. */
  var SAMPLE = T.slice();          // keep the built-in set for the fallback
  var live = false;

  function sourceBadge() {
    var el = $("srcbadge");
    if (!el) return;
    el.className = "srcbadge " + (live ? "on" : "demo");
    el.textContent = live ? "Live data" : "Sample data";
    el.title = live
      ? "Reading the running system"
      : "No backend reachable - showing the built-in sample set";
  }

  function adopt(rows) {
    // Replace in place: closures elsewhere hold a reference to T.
    T.length = 0;
    rows.forEach(function (r) { T.push(r); });
  }

  function loadLive() {
    if (!window.fetch) { sourceBadge(); return; }
    var done = false;
    // Static hosting answers this with the SPA fallback or a 404, and either
    // way we must not hang the console waiting for it.
    var timer = setTimeout(function () {
      if (!done) { done = true; sourceBadge(); }
    }, 4000);

    fetch("/api/console", { headers: { Accept: "application/json" } })
      .then(function (r) {
        // Static hosting answers unknown paths with index.html and a 200, so
        // a status check alone is not enough - check it is actually JSON
        // before parsing, or every load throws on the way to the fallback.
        var ct = (r.headers && r.headers.get("content-type")) || "";
        if (!r.ok || ct.indexOf("json") === -1) return null;
        return r.json();
      })
      .then(function (d) {
        if (done) return;
        done = true; clearTimeout(timer);
        if (d && d.live && d.tickets && d.tickets.length) {
          adopt(d.tickets);
          SCHEDULES = d.schedules || [];
          live = true;
          state.ticket = null;
          render();
        }
        sourceBadge();
      })
      .catch(function () {
        if (done) return;
        done = true; clearTimeout(timer);
        sourceBadge();
      });
  }

  /* ------------------------------------------------------------ go */

  paintWho();
  paintDot();
  render();
  sourceBadge();
  loadLive();

  // Re-read periodically so a ticket raised by email or Slack appears without
  // a refresh. Skipped while a ticket is open so the page does not move under
  // someone who is reading it.
  setInterval(function () {
    if (!live) return;
    if (state.ticket) return;                 // someone is reading a ticket
    if (!$("cmd").hidden) return;             // command palette open
    if (!$("askpanel").hidden) return;        // ask panel open
    if (!$("newticket").hidden) return;       // form part-filled
    loadLive();
  }, 60000);
})();
