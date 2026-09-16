/* TRT Australia — Care Operations
 *
 * A working shared inbox for clinic staff. Email and internal chat arrive in
 * one queue, already routed. Staff assign, reply, snooze and close.
 *
 * The routing engine is deliberately unnamed in the interface. Staff see a
 * short line saying where something went and why; they never see an agent,
 * a model, or a confidence score. The one thing they must see is when the
 * system has REFUSED to route something and handed it to a person.
 *
 * Live ticket and deadline counts come from /api/state where available;
 * conversation content is synthetic and labelled as such.
 */
(function () {
  "use strict";

  /* ------------------------------------------------------------ icons */
  var I = {
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    stethoscope: '<path d="M4 3v7a5 5 0 0 0 10 0V3"/><path d="M4 3H2M14 3h2"/><circle cx="19" cy="14" r="2"/><path d="M9 15v1a5 5 0 0 0 8 3"/>',
    nurse: '<path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6z"/><path d="M12 8v6M9 11h6"/>',
    headset: '<path d="M4 14v-3a8 8 0 0 1 16 0v3"/><path d="M4 14h3v5H5a1 1 0 0 1-1-1zM20 14h-3v5h2a1 1 0 0 0 1-1z"/>',
    alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    hash: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    filter: '<path d="M22 3H2l8 9.5V19l4 2v-8.5z"/>',
    reply: '<path d="M9 17 4 12l5-5"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>',
    clip: '<path d="M21.4 11.1 12.3 20a5 5 0 0 1-7-7l9-9a3.3 3.3 0 0 1 4.7 4.7l-9 9a1.7 1.7 0 0 1-2.3-2.3l8.3-8.3"/>',
    back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
    repeat: '<path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
    flask: '<path d="M9 3h6M10 3v6L5 19a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 19l-5-10V3"/><path d="M7.5 14h9"/>'
  };
  function svg(d, cls) {
    return '<svg class="' + (cls || "") + '" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
      'stroke-linejoin="round" aria-hidden="true">' + d + "</svg>";
  }

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function $(id) { return document.getElementById(id); }
  function tag(t, k) { return '<span class="tag t-' + k + '">' + esc(t) + "</span>"; }

  var TEAM = {
    physician: { label: "Physician", colour: "#6aa6f7", tag: "physician" },
    nursing:   { label: "Nursing",   colour: "#a98bf5", tag: "nursing" },
    support:   { label: "Client care", colour: "#37b6c9", tag: "support" },
    held:      { label: "Needs a person", colour: "#f4736f", tag: "urgent" }
  };

  function initials(name) {
    return name.split(/\s+/).slice(0, 2).map(function (w) { return w[0]; })
      .join("").toUpperCase();
  }
  function hue(name) {
    var palette = ["#6aa6f7", "#a98bf5", "#37b6c9", "#4ec97f", "#edb44a", "#f4736f"];
    var n = 0;
    for (var i = 0; i < name.length; i++) n = (n + name.charCodeAt(i)) % palette.length;
    return palette[n];
  }

  /* ------------------------------------------------------------- data */

  var seq = 100;
  function msg(o) { o.id = "m" + (++seq); o.thread = o.thread || []; return o; }

  var DATA = [
    msg({
      channel: "email", from: "Michael Reed", addr: "m.reed@example.com",
      subject: "Blood test results attached", time: "09:14", unread: true,
      route: "physician", urgent: false, due: "Review within 2 working days",
      why: "Pathology results submitted for assessment. Required markers present.",
      client: { name: "Michael Reed", member: "Yearly · $860", since: "1 Jul 2026",
                started: "1 Jul 2026", next: "Follow-up bloods — due in 13 days" },
      body: "Hi,\n\nI had the private panel done on Tuesday at the collection centre. Results came through this morning, attached.\n\nFull name Michael Reed, DOB 12/05/1984.\n\nCan someone take a look and let me know what the next step is?\n\nThanks,\nMichael",
      attach: "reed-pathology-2026-09-14.pdf"
    }),
    msg({
      channel: "email", from: "Rachel Santos", addr: "r.santos@example.com",
      subject: "Chest tightness since starting", time: "08:02", unread: true,
      route: "held", urgent: true, due: "Immediate",
      why: "Client describes a physical symptom and asks whether to stop treatment. Not routed automatically and no reply drafted — a qualified person must handle this.",
      client: { name: "Rachel Santos", member: "Quarterly · $240", since: "8 Aug 2026",
                started: "12 Aug 2026", next: "Follow-up bloods — due in 41 days" },
      body: "I've had some tightness in my chest the last couple of days and I'm a bit worried. I started treatment about five weeks ago.\n\nShould I stop?"
    }),
    msg({
      channel: "slack", from: "Dr Elena Chen", addr: "#clinical", time: "08:47",
      subject: "Chasing Reed's follow-up bloods", unread: true,
      route: "support", urgent: false, due: "Action within 3 working days",
      why: "Staff request for administrative follow-up.",
      body: "Can someone chase Michael Reed's 8-week follow-up bloods? He's due late this month and I'd rather not have it slip."
    }),
    msg({
      channel: "email", from: "Amara Brennan", addr: "a.brennan@example.com",
      subject: "GP results — is this enough?", time: "08:51", unread: false,
      route: "support", urgent: false, due: "Action within 3 working days",
      why: "Checking which required markers are present is administrative. Clinical sufficiency is for the practitioner.",
      client: { name: "Amara Brennan", member: "Not yet a member", since: "—",
                started: "—", next: "Awaiting eligibility review" },
      body: "My GP ran bloods last month but I'm not sure they did all of the ones on your list. I've attached what came back.\n\nDo I need to go and get more done before booking?",
      attach: "brennan-gp-panel.pdf",
      note: "Missing from the required panel: SHBG, prolactin, DHEA-S."
    }),
    msg({
      channel: "email", from: "Priya Sharma", addr: "p.sharma@example.com",
      subject: "Re: Your monthly check-in", time: "Yesterday", unread: false,
      route: "nursing", urgent: true, due: "Overdue by 2 days",
      why: "Reply to the monthly check-in. Client reports a change to their routine.",
      client: { name: "Priya Sharma", member: "Six months · $480", since: "3 Mar 2026",
                started: "9 Mar 2026", next: "Follow-up bloods — OVERDUE by 2 days" },
      body: "All fine thanks. One thing — I've been travelling and missed the blood test appointment you sent. Can I rebook for next week?"
    }),
    msg({
      channel: "email", from: "Daniel Whitcombe", addr: "d.whitcombe@example.com",
      subject: "Changing my billing to yearly", time: "Yesterday", unread: false,
      route: "support", urgent: false, due: "Action within 3 working days",
      why: "Membership enquiry. Testing inclusions must be confirmed by client care, so no figure was quoted.",
      client: { name: "Daniel Whitcombe", member: "Quarterly · $240", since: "14 Jan 2026",
                started: "20 Jan 2026", next: "Renewal — 14 Oct 2026" },
      body: "I'm on the quarterly membership at the moment and want to switch to the yearly one before my next renewal.\n\nCan you tell me what the difference works out to, and whether the testing is included?"
    }),
    msg({
      channel: "slack", from: "Sam Okonkwo", addr: "#general", time: "Yesterday",
      subject: "New starter needs system access", unread: false,
      route: "support", urgent: false, due: "Action within 3 working days",
      why: "Internal administrative request.",
      body: "New nurse starts Monday — can we get her set up with access before then?"
    }),
    msg({
      channel: "email", from: "Tom Nguyen", addr: "t.nguyen@example.com",
      subject: "Travelling to Perth for six weeks", time: "Mon", unread: false,
      route: "support", urgent: false, due: "Action within 3 working days",
      why: "Logistics enquiry about testing and delivery.",
      client: { name: "Tom Nguyen", member: "Yearly · $860", since: "2 Feb 2026",
                started: "8 Feb 2026", next: "Renewal — 2 Feb 2027" },
      body: "I'm travelling to Perth for six weeks from the 10th. Will that affect my next blood test or the delivery?"
    })
  ];

  var FILTERED = [
    msg({ channel: "email", from: "Industry Digest", addr: "news@digest.example.com",
      subject: "Your weekly industry digest", time: "Mon", unread: false,
      route: null, filtered: true,
      why: "Marketing email. No task was created — not every incoming message is work.",
      body: "This week in men's health: five trends to watch. Click here to read more. Unsubscribe." })
  ];

  var DONE = [];

  /* ----------------------------------------------------------- queues */

  var QUEUES = [
    { id: "inbox",     name: "All open",      icon: I.inbox, test: function (m) { return true; } },
    { id: "held",      name: "Needs a person", icon: I.alert, alert: true,
      test: function (m) { return m.route === "held"; } },
    { id: "physician", name: "Physician",     icon: I.stethoscope,
      test: function (m) { return m.route === "physician"; } },
    { id: "nursing",   name: "Nursing",       icon: I.nurse,
      test: function (m) { return m.route === "nursing"; } },
    { id: "support",   name: "Client care",   icon: I.headset,
      test: function (m) { return m.route === "support"; } },
    { id: "overdue",   name: "Past due",      icon: I.clock, alert: true,
      test: function (m) { return /overdue/i.test(m.due || ""); } },
    { sep: "Channels" },
    { id: "email",     name: "Client email",  icon: I.inbox,
      test: function (m) { return m.channel === "email"; } },
    { id: "slack",     name: "Internal chat", icon: I.hash,
      test: function (m) { return m.channel === "slack"; } },
    { sep: "Scheduled" },
    { id: "schedule",  name: "Schedule",      icon: I.calendar, wide: true,
      test: function () { return true; } },
    { sep: "Other" },
    { id: "filtered",  name: "Filtered out",  icon: I.filter, source: "filtered",
      test: function () { return true; } },
    { id: "done",      name: "Closed",        icon: I.check, source: "done",
      test: function () { return true; } }
  ];

  var state = { queue: "inbox", selected: null, unreadOnly: false, urgentOnly: false, q: "" };

  function source(qid) {
    var q = QUEUES.filter(function (x) { return x.id === qid; })[0];
    if (q && q.source === "filtered") return FILTERED;
    if (q && q.source === "done") return DONE;
    return DATA;
  }
  function inQueue(qid) {
    var q = QUEUES.filter(function (x) { return x.id === qid; })[0];
    if (!q) return [];
    return source(qid).filter(q.test);
  }
  function visible() {
    var rows = inQueue(state.queue);
    if (state.unreadOnly) rows = rows.filter(function (m) { return m.unread; });
    if (state.urgentOnly) rows = rows.filter(function (m) { return m.urgent; });
    if (state.q) {
      var needle = state.q.toLowerCase();
      rows = rows.filter(function (m) {
        return (m.from + " " + m.subject + " " + m.body + " " + (m.addr || ""))
          .toLowerCase().indexOf(needle) > -1;
      });
    }
    return rows;
  }

  /* ---------------------------------------------------------- render */

  function renderRail() {
    $("rail").innerHTML = QUEUES.map(function (q) {
      if (q.sep) return '<div class="rail-label">' + esc(q.sep) + "</div>";
      // Badge is always the number of open items in that queue - the same
      // number the list header shows. Unread is indicated by the dot on the
      // row, not by a second conflicting count.
      var rows = inQueue(q.id);
      var n = rows.length;
      return '<button class="q" data-q="' + q.id + '" role="link" aria-current="' +
        (state.queue === q.id) + '">' + svg(q.icon, "qi") +
        "<span>" + esc(q.name) + "</span>" +
        (n ? '<span class="qn' + (q.alert ? " alert" : "") + '">' + n + "</span>" : "") +
        "</button>";
    }).join("");
  }

  function renderList() {
    var rows = visible();
    var qname = (QUEUES.filter(function (x) { return x.id === state.queue; })[0] || {}).name;
    $("queue-name").textContent = qname || "Inbox";

    // One consistent count. Showing "10 items" beside a badge reading "2"
    // made the same queue look like two different sizes.
    var unread = rows.filter(function (m) { return m.unread; }).length;
    $("queue-count").textContent =
      rows.length + " open" + (unread ? " · " + unread + " unread" : "");

    if (!rows.length) {
      $("list").innerHTML = '<div class="empty">' + svg(I.check) +
        "<div>Nothing here.</div></div>";
      return;
    }

    $("list").innerHTML = rows.map(function (m) {
      var t = m.route ? TEAM[m.route] : null;
      return '<button class="item' + (m.unread ? " unread" : "") + '" data-id="' + m.id +
        '" role="listitem" aria-current="' + (state.selected === m.id) + '">' +
        '<span class="av' + (m.channel === "slack" ? " slack" : "") +
          '" style="background:' + hue(m.from) + '" aria-hidden="true">' +
          esc(initials(m.from)) + "</span><span>" +
        '<span class="it-top"><span class="it-from">' + esc(m.from) + "</span>" +
          (m.unread ? '<span class="unread-dot"></span>' : "") +
          '<span class="it-time">' + esc(m.time) + "</span></span>" +
        '<div class="it-subj">' + esc(m.subject) + "</div>" +
        '<div class="it-prev">' + esc(m.body.replace(/\n+/g, " ").slice(0, 110)) + "</div>" +
        '<div class="it-meta">' +
          (m.channel === "slack" ? tag(m.addr, "mute") : "") +
          (t ? tag(t.label, t.tag) : "") +
          (m.urgent ? tag("Urgent", "urgent") : "") +
          (m.attach ? tag("1 file", "mute") : "") +
          (m.filtered ? tag("No task created", "mute") : "") +
        "</div></span></button>";
    }).join("");
  }

  function renderPane() {
    var pane = $("pane");
    var m = DATA.concat(FILTERED, DONE).filter(function (x) {
      return x.id === state.selected;
    })[0];

    if (!m) {
      pane.innerHTML = '<div class="empty" style="margin:auto">' + svg(I.inbox) +
        "<div>Select a conversation</div></div>";
      pane.classList.remove("open");
      return;
    }
    pane.classList.add("open");
    var t = m.route ? TEAM[m.route] : null;
    var closed = DONE.indexOf(m) > -1;

    pane.innerHTML =
      '<div class="pane-head">' +
        '<button class="btn ghost back-btn" id="back" style="margin-bottom:9px">' +
          svg(I.back) + "Back</button>" +
        "<h1>" + esc(m.subject) + "</h1>" +
        '<div class="pane-meta">' +
          (m.channel === "slack" ? tag("Internal chat " + m.addr, "mute")
                                 : tag("Client email", "mute")) +
          (t ? tag(t.label, t.tag) : "") +
          (m.urgent ? tag("Urgent", "urgent") : "") +
          (m.due ? tag(m.due, /overdue/i.test(m.due) ? "urgent" : "warn") : "") +
          (closed ? tag("Closed", "ok") : "") +
        "</div></div>" +

      '<div class="actions">' +
        '<button class="btn primary" id="a-reply">' + svg(I.reply) + "Reply</button>" +
        '<span class="menu"><button class="btn" id="a-assign">' + svg(I.user) +
          "Assign</button></span>" +
        '<button class="btn" id="a-snooze">' + svg(I.clock) + "Snooze</button>" +
        '<span class="spacer"></span>' +
        '<button class="btn" id="a-done"' + (closed ? " disabled" : "") + ">" +
          svg(I.check) + (closed ? "Closed" : "Mark done") + "</button>" +
      "</div>" +

      '<div class="pane-body"><div class="pane-grid"><div>' +
        (m.filtered ? '<div class="banner">' + svg(I.alert) +
          "<span>Held back automatically. No task was created — " +
          "it is kept here so nothing is silently lost.</span></div>" : "") +

        '<div class="bubble"><div class="bubble-head">' +
          '<span class="av" style="background:' + hue(m.from) + '" aria-hidden="true">' +
            esc(initials(m.from)) + "</span>" +
          '<span><div class="bubble-from">' + esc(m.from) + "</div>" +
          '<div class="bubble-addr">' + esc(m.addr || "") + "</div></span>" +
          '<span class="bubble-time">' + esc(m.time) + "</span></div>" +
          '<div class="bubble-text">' + esc(m.body) + "</div>" +
          (m.attach ? '<div class="attach">' + svg(I.clip) + esc(m.attach) + "</div>" : "") +
        "</div>" +

        (m.thread.length ? m.thread.map(function (r) {
          return '<div class="bubble out"><div class="bubble-head">' +
            '<span class="av" style="background:#37b6c9" aria-hidden="true">AK</span>' +
            '<span><div class="bubble-from">Alex Kaur</div>' +
            '<div class="bubble-addr">Client care</div></span>' +
            '<span class="bubble-time">' + esc(r.time) + "</span></div>" +
            '<div class="bubble-text">' + esc(r.text) + "</div></div>";
        }).join("") : "") +

        '<div id="composer-slot"></div>' +
      "</div><aside>" +

        (t ? '<div class="side-card"><h3>Routing</h3><div class="routed' +
          (m.route === "held" ? " held" : "") + '">' + esc(m.why) + "</div>" +
          '<div class="kv" style="margin-top:9px"><span class="k">Queue</span>' +
          '<span class="v">' + esc(t.label) + "</span></div>" +
          (m.due ? '<div class="kv"><span class="k">Target</span><span class="v">' +
            esc(m.due) + "</span></div>" : "") + "</div>"
          : '<div class="side-card"><h3>Routing</h3><div class="routed">' +
            esc(m.why) + "</div></div>") +

        (m.note ? '<div class="side-card"><h3>Panel check</h3>' +
          '<div style="font-size:12.5px;color:var(--ink-2);line-height:1.5">' +
          esc(m.note) + "</div>" +
          '<div style="font-size:11.5px;color:var(--dimmer);margin-top:8px;line-height:1.45">' +
          "Presence of required markers only. Interpretation is for the practitioner." +
          "</div></div>" : "") +

        (m.client ? '<div class="side-card"><h3>Client</h3>' +
          '<div style="font-weight:700;margin-bottom:8px">' + esc(m.client.name) + "</div>" +
          '<div class="kv"><span class="k">Membership</span><span class="v">' +
            esc(m.client.member) + "</span></div>" +
          '<div class="kv"><span class="k">Member since</span><span class="v">' +
            esc(m.client.since) + "</span></div>" +
          '<div class="kv"><span class="k">Treatment from</span><span class="v">' +
            esc(m.client.started) + "</span></div>" +
          '<div class="kv"><span class="k">Next obligation</span><span class="v">' +
            esc(m.client.next) + "</span></div></div>" : "") +

      "</aside></div></div>";

    var back = $("back"); if (back) back.onclick = function () { pane.classList.remove("open"); };
    $("a-reply").onclick = openComposer;
    $("a-assign").onclick = openAssign;
    $("a-snooze").onclick = function () { toast(I.clock, "Snoozed until tomorrow morning."); };
    if (!closed) $("a-done").onclick = markDone;
  }

  function render() {
    renderRail();
    if (state.queue === "schedule") { renderSchedule(); return; }
    document.querySelector(".app").classList.remove("wide");
    renderList();
    renderPane();
  }


  /* -------------------------------------------------------- schedule */

  // Populated from /api/state — the actual cron services running behind
  // the product. Falls back to the configured intervals if unreachable.
  var CRON = { pathology: null, checkin: null };

  // Upcoming obligations per client. Dates are relative to today so the
  // view never looks stale during a demonstration.
  function scheduleDays() {
    var today = new Date();
    function on(offset) {
      var d = new Date(today); d.setDate(d.getDate() + offset); return d;
    }
    function label(d, offset) {
      if (offset === 0) return "Today";
      if (offset === 1) return "Tomorrow";
      return d.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "short" });
    }
    var plan = [
      [0, [
        ["09:00", "Pathology monitoring", "Daily sweep of follow-up and expiry dates", "routine", null],
        ["—", "Priya Sharma", "Follow-up bloods · overdue by 2 days", "overdue", "nursing"],
        ["—", "Michael Reed", "Monthly check-in email due", "checkin", "support"]
      ]],
      [1, [
        ["09:00", "Pathology monitoring", "Daily sweep", "routine", null],
        ["—", "Daniel Whitcombe", "Membership renewal reminder", "renewal", "support"]
      ]],
      [3, [
        ["09:00", "Pathology monitoring", "Daily sweep", "routine", null],
        ["—", "Amara Brennan", "Eligibility review follow-up", "followup", "support"]
      ]],
      [9, [
        ["09:00", "Pathology monitoring", "Daily sweep", "routine", null],
        ["—", "Tom Nguyen", "Blood results expire in 21 days", "expiry", "physician"],
        ["—", "Rachel Santos", "Monthly check-in email due", "checkin", "support"]
      ]],
      [13, [
        ["—", "Michael Reed", "Follow-up bloods due — 8 weeks from treatment start", "due", "physician"]
      ]]
    ];
    return plan.map(function (p) {
      var d = on(p[0]);
      return { date: d, offset: p[0], label: label(d, p[0]), events: p[1] };
    });
  }

  var EV_TAG = {
    routine:  ["Automated", "mute"],
    overdue:  ["Overdue", "urgent"],
    due:      ["Due", "warn"],
    checkin:  ["Check-in", "support"],
    renewal:  ["Renewal", "mute"],
    expiry:   ["Expiring", "warn"],
    followup: ["Follow-up", "mute"]
  };

  function renderSchedule() {
    var pane = $("pane");
    document.querySelector(".app").classList.add("wide");
    pane.classList.add("open");

    var days = scheduleDays();

    var routines =
      '<div class="routines">' +
        '<article class="routine"><div class="routine-top">' +
          '<span class="routine-ico">' + svg(I.flask) + "</span><span>" +
          "<h3>Pathology monitoring</h3>" +
          '<div class="rsub">Checks every client for follow-up bloods due, ' +
          "results expiring and overdue obligations.</div></span></div>" +
          '<div class="rwhen"><span class="rk">Runs</span>' +
          '<span class="rv" id="cron-path">Daily · 09:00</span></div>' +
          '<div class="steps">' +
            '<div class="step"><div class="st">Sweep</div><div class="sd">Every tracked obligation</div></div>' +
            '<div class="step"><div class="st">Compare</div><div class="sd">Against target dates</div></div>' +
            '<div class="step"><div class="st">Alert</div><div class="sd">Before a date is missed</div></div>' +
          "</div>" +
          '<div style="font-size:11.5px;color:var(--dimmer);margin-top:10px" id="cron-next">&nbsp;</div>' +
        "</article>" +

        '<article class="routine"><div class="routine-top">' +
          '<span class="routine-ico">' + svg(I.repeat) + "</span><span>" +
          "<h3>Client check-in</h3>" +
          '<div class="rsub">Sends each client a status email, reads the reply ' +
          "and raises the right task from it.</div></span></div>" +
          '<div class="rwhen"><span class="rk">Runs</span>' +
          '<span class="rv">Monthly</span></div>' +
          '<div class="steps">' +
            '<div class="step dim"><div class="st">Send</div><div class="sd">Templated status email</div></div>' +
            '<div class="step dim"><div class="st">Read reply</div><div class="sd">Understand the response</div></div>' +
            '<div class="step dim"><div class="st">Raise task</div><div class="sd">Route to the right queue</div></div>' +
          "</div>" +
          '<div style="font-size:11.5px;color:var(--dimmer);margin-top:10px">' +
          "Not yet switched on — awaiting approved email wording.</div>" +
        "</article>" +
      "</div>";

    var timeline = days.map(function (d) {
      var alert = d.events.some(function (e) { return e[3] === "overdue"; });
      return '<div class="day-head"><span class="dd">' + esc(d.label) + "</span>" +
        '<span class="dn">' + d.events.length +
        (d.events.length === 1 ? " item" : " items") + "</span>" +
        (alert ? '<span class="dtag">' + tag("Needs attention", "urgent") + "</span>" : "") +
        "</div>" +
        d.events.map(function (e) {
          var t = EV_TAG[e[3]] || ["", "mute"];
          var isRoutine = e[3] === "routine";
          return '<div class="ev">' +
            '<span class="ev-time">' + esc(e[0]) + "</span>" +
            (isRoutine
              ? '<span class="av" style="background:var(--raised);color:var(--accent-2)" aria-hidden="true">' +
                svg(I.repeat) + "</span>"
              : '<span class="av" style="background:' + hue(e[1]) +
                '" aria-hidden="true">' + esc(initials(e[1])) + "</span>") +
            '<span><div class="ev-who">' + esc(e[1]) + "</div>" +
            '<div class="ev-what">' + esc(e[2]) + "</div></span>" +
            "<span>" + tag(t[0], t[1]) +
            (e[4] ? " " + tag(TEAM[e[4]].label, TEAM[e[4]].tag) : "") + "</span>" +
            "</div>";
        }).join("");
    }).join("");

    pane.innerHTML =
      '<div class="sched-head"><h1>Schedule</h1>' +
      "<p>Automated routines run in the background. Below them, every upcoming " +
      "obligation across all clients — follow-up blood work, expiring results, " +
      "renewals and check-ins — so nothing has to be tracked by hand.</p></div>" +
      '<div class="sched-body">' + routines +
      '<div style="margin-top:6px">' + timeline + "</div></div>";

    if (CRON.pathology) {
      var el = $("cron-path"); if (el) el.textContent = CRON.pathology.schedule;
      var nx = $("cron-next");
      if (nx && CRON.pathology.next) nx.textContent = "Next run: " + CRON.pathology.next;
    }
  }

  /* -------------------------------------------------------- actions */

  function current() {
    return DATA.concat(FILTERED, DONE).filter(function (x) {
      return x.id === state.selected;
    })[0];
  }

  function openComposer() {
    var slot = $("composer-slot");
    if (!slot || slot.firstChild) { var ta = slot.querySelector("textarea"); if (ta) ta.focus(); return; }
    slot.innerHTML =
      '<div class="composer"><textarea id="reply-text" ' +
      'placeholder="Write a reply…" aria-label="Reply"></textarea>' +
      '<div class="composer-bar"><button class="btn primary" id="send">Send reply</button>' +
      '<button class="btn ghost" id="cancel">Cancel</button>' +
      '<span class="note">Replies are written and sent by staff.</span></div></div>';
    $("reply-text").focus();
    $("cancel").onclick = function () { slot.innerHTML = ""; };
    $("send").onclick = function () {
      var text = $("reply-text").value.trim();
      if (!text) { $("reply-text").focus(); return; }
      var m = current();
      m.thread.push({ text: text, time: "just now" });
      renderPane();
      toast(I.check, "Reply sent to " + m.from + ".");
    };
  }

  function openAssign() {
    var host = $("a-assign").parentNode;
    if (host.querySelector(".menu-pop")) { closeMenus(); return; }
    closeMenus();
    var now = current();
    var pop = document.createElement("div");
    pop.className = "menu-pop";
    pop.innerHTML =
      '<div class="menu-cap">Move to</div>' +
      Object.keys(TEAM).map(function (k) {
        var isCurrent = now && now.route === k;
        return '<button data-to="' + k + '"' + (isCurrent ? ' aria-current="true"' : "") + ">" +
          '<span class="swatch" style="background:' + TEAM[k].colour + '"></span>' +
          esc(TEAM[k].label) +
          (isCurrent ? '<span class="tick">' + svg(I.check) + "</span>" : "") +
          "</button>";
      }).join("") +
      '<div class="sep"></div><button data-to="">Unassign</button>';
    host.appendChild(pop);
    pop.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-to]");
      if (!b) return;
      var to = b.getAttribute("data-to");
      var m = current();
      if (m.route === to) { closeMenus(); return; }   // already there
      m.route = to || null;
      m.why = to
        ? "Reassigned to " + TEAM[to].label + " by Alex Kaur."
        : "Unassigned by Alex Kaur.";
      closeMenus();
      render();
      toast(I.user, to ? "Moved to " + TEAM[to].label + "." : "Unassigned.");
    });
  }
  function closeMenus() {
    var pops = document.querySelectorAll(".menu-pop");
    for (var i = 0; i < pops.length; i++) pops[i].remove();
  }
  document.addEventListener("click", function (e) {
    if (!e.target.closest(".menu")) closeMenus();
  });

  function markDone() {
    var m = current();
    var i = DATA.indexOf(m);
    if (i > -1) DATA.splice(i, 1);
    var j = FILTERED.indexOf(m);
    if (j > -1) FILTERED.splice(j, 1);
    DONE.unshift(m);
    state.selected = null;
    render();
    toast(I.check, "Closed — " + m.subject + ".");
  }

  /* ---------------------------------------------------------- toasts */

  function toast(icon, text) {
    var el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = svg(icon) + "<span>" + esc(text) + "</span>";
    $("toasts").appendChild(el);
    setTimeout(function () { el.remove(); }, 3600);
  }

  /* --------------------------------------------------------- events */

  $("rail").addEventListener("click", function (e) {
    var b = e.target.closest("[data-q]");
    if (!b) return;
    state.queue = b.getAttribute("data-q");
    state.selected = null;
    render();
  });

  $("list").addEventListener("click", function (e) {
    var b = e.target.closest("[data-id]");
    if (!b) return;
    state.selected = b.getAttribute("data-id");
    var m = current();
    if (m) m.unread = false;
    render();
  });

  $("f-unread").onclick = function () {
    state.unreadOnly = !state.unreadOnly;
    this.setAttribute("aria-pressed", state.unreadOnly);
    renderList();
  };
  $("f-urgent").onclick = function () {
    state.urgentOnly = !state.urgentOnly;
    this.setAttribute("aria-pressed", state.urgentOnly);
    renderList();
  };
  $("search").addEventListener("input", function () {
    state.q = this.value.trim();
    renderList();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "/" && document.activeElement !== $("search")) {
      e.preventDefault(); $("search").focus();
    }
    if (e.key === "Escape") { closeMenus(); $("search").blur(); }
  });

  /* ------------------------------------------ live arrival + clock */

  var ARRIVALS = [
    { channel: "email", from: "Jordan Bailey", addr: "j.bailey@example.com",
      subject: "Repeat prescription request", time: "now", unread: true,
      route: "physician", urgent: false, due: "Review within 2 working days",
      why: "Prescription request requires a practitioner.",
      body: "Morning — I'm getting close to the end of my current script. What do I need to do to get the next one organised?" },
    { channel: "slack", from: "Maya Willis", addr: "#clinical", time: "now",
      subject: "Pathology portal is slow", unread: true,
      route: "support", urgent: false, due: "Action within 3 working days",
      why: "Internal operational report.",
      body: "Heads up — the pathology provider's portal is taking ages to load this morning. Might slow down result uploads." }
  ];
  var arrived = 0;

  function tickClock() {
    var d = new Date();
    $("clock").textContent = d.toLocaleTimeString("en-AU",
      { hour: "2-digit", minute: "2-digit" });
  }

  function arrive() {
    if (arrived >= ARRIVALS.length) return;
    var m = msg(JSON.parse(JSON.stringify(ARRIVALS[arrived++])));
    DATA.unshift(m);
    render();
    toast(I.inbox, "New " + (m.channel === "slack" ? "message" : "email") +
      " from " + m.from + " — routed to " + TEAM[m.route].label + ".");
  }

  /* ------------------------------------------- live backend figures */

  function pollBackend() {
    fetch("/api/state", { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (s) {
        // Real schedule from the cron service behind the product, so the
        // times shown are what is actually configured rather than a caption.
        (s.cron || []).forEach(function (j) {
          if (/sla|patholog/i.test(j.name || "")) {
            CRON.pathology = {
              schedule: /0 9/.test(j.schedule || "") ? "Daily · 09:00"
                        : (j.schedule || "Daily"),
              next: j.next || null
            };
          }
        });
        if (state.queue === "schedule") renderSchedule();
      })
      .catch(function () { /* schedule falls back to configured defaults */ });
  }

  tickClock();
  setInterval(tickClock, 30000);
  render();
  setTimeout(arrive, 22000);
  setTimeout(arrive, 68000);
  pollBackend();
})();
