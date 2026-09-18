/* Renders the console in jsdom and exercises the six new features.
 * Any uncaught error fails the run, so this catches null refs and typos
 * that a syntax check cannot. */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const DIR = "C:/Projects/hermes-trt-ops/statuspage/console-v2";
let html = fs.readFileSync(path.join(DIR, "index.html"), "utf8");
// Inline the stylesheet so getComputedStyle reflects the real cascade. Asserting
// on el.hidden alone once let a permanently-painted sign-in screen through.
const css = fs.readFileSync(path.join(DIR, "app.css"), "utf8");
html = html.replace("</head>", "<style>" + css + "</style></head>");

const errors = [];
const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, url: "http://x/" });
const { window } = dom;
window.addEventListener("error", (e) => errors.push("window error: " + e.message));

// jsdom lacks scrollIntoView and matchMedia in some paths; stub minimally.
window.HTMLElement.prototype.scrollIntoView = function () {};
window.matchMedia = () => ({ matches: false, addListener(){}, removeListener(){} });
window.requestAnimationFrame = (f) => setTimeout(() => f(Date.now()), 0);

function step(name, fn) {
  try { fn(); console.log("  ok   " + name); }
  catch (e) { errors.push(name + " -> " + e.message); console.log("  FAIL " + name + " -> " + e.message); }
}

let js = fs.readFileSync(path.join(DIR, "app.js"), "utf8");
// Expose the ticket array so assertions can compute expected answers from the
// same source the UI renders from, rather than hardcoding numbers that drift.
js = js.replace("  /* ---------------------------------------------------------- state */",
                "  window.TICKETS = T;");
try {
  window.eval(js);
} catch (e) {
  console.log("BOOT FAILED: " + e.stack);
  process.exit(1);
}
const d = window.document;
const $ = (id) => d.getElementById(id);
const click = (el) => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
const shown = (id) => window.getComputedStyle($(id)).display !== "none";
const TICKETS = window.TICKETS;
if (!Array.isArray(TICKETS)) { console.log("test hook failed: TICKETS not exposed"); process.exit(1); }

console.log("boot ok");

// jsdom resolves a `hidden` element to display:none no matter what the author
// CSS says, so it DISAGREES with real browsers, where `.signin { display: grid }`
// beats the UA's `[hidden] { display: none }` and paints the overlay anyway.
// That bug shipped once. jsdom cannot see it, so it is checked statically here.
step("0a. [hidden] outranks the overlays' own display", () => {
  if (!/\[hidden\]\s*{[^}]*display:\s*none\s*!important/.test(css))
    throw new Error("app.css is missing [hidden] { display: none !important }");
  const ids = [...html.matchAll(/id="([a-z]+)"[^>]*\shidden/g)].map((m) => m[1]);
  if (ids.length < 4) throw new Error("expected several hidden overlays, found " + ids.length);
  console.log("       guarded: " + ids.join(", "));
});

// Same blind spot: the collapsed rail's hover tooltip sits outside the rail,
// and `.side` scrolls. Any overflow but visible clips it away silently — it
// did, and jsdom reports nothing. Verified in Chrome; pinned here.
step("0b. collapsed rail does not clip its tooltips", () => {
  if (!/\.shell\.collapsed \.side\s*{[^}]*overflow:\s*visible/.test(css))
    throw new Error(".shell.collapsed .side must set overflow: visible");
  const unnamed = [...d.querySelectorAll(".nav[data-tab]")].filter((b) => !b.getAttribute("aria-label"));
  if (unnamed.length) throw new Error(unnamed.length + " rail buttons have no accessible name");
  console.log("       " + d.querySelectorAll(".nav[data-tab][aria-label]").length + " rail buttons named");
});

// Two mobile regressions found by rendering at a true 390px viewport. Neither
// is visible to jsdom, and both were stale rules from an earlier layout.
step("0c. mobile rules match the current markup", () => {
  // .brand is a grid area and a sibling of .topbar. A leftover block set
  // `display:flex; grid-area:unset` on it under 1024px, which un-hid the
  // logo and dropped it to the bottom of every phone screen.
  // Strip comments first - the note explaining this fix names the selectors.
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, "");
  if (/\.topbar \.brand|\.topbar \.search/.test(rules))
    throw new Error("stale .topbar .brand/.search selectors are back - they match nothing");
  // The filter strip used to scroll sideways with the scrollbar hidden, which
  // clipped the List/Board toggle mid-word with no hint it could be swiped.
  if (/\.filterbar\s*{[^}]*flex-wrap:\s*nowrap/.test(rules))
    throw new Error("mobile filterbar is nowrap again - the view toggle gets clipped");
  console.log("       no stale topbar selectors; filter bar wraps on mobile");
});

step("0. no overlay is painted on load", () => {
  ["signin", "cmd", "notifpop", "whopop", "belldot"].forEach((id) => {
    if (id !== "belldot" && shown(id)) throw new Error("#" + id + " is visible on load");
  });
  if (!shown("belldot")) throw new Error("unread dot should be visible on load");
});

step("1. board is the default ticket view", () => {
  click(d.querySelector('[data-tab="tickets"]'));
  if (!d.querySelector(".board")) throw new Error("no .board rendered");
  const seg = d.querySelector('[data-view="board"]');
  if (seg.getAttribute("aria-pressed") !== "true") throw new Error("board toggle not pressed");
  const cards = d.querySelectorAll(".board .ticket").length;
  if (cards < 10) throw new Error("only " + cards + " cards on the board");
  console.log("       " + cards + " cards across " + d.querySelectorAll(".board .col").length + " columns");
});

step("   list view still reachable", () => {
  click(d.querySelector('[data-view="list"]'));
  if (!d.querySelector("table tbody tr")) throw new Error("list did not render");
  click(d.querySelector('[data-view="board"]'));
});

step("1b. board toggle appears only on All tickets", () => {
  click(d.querySelector('[data-tab="tickets"]'));
  if (!d.querySelector('[data-view="board"]')) throw new Error("All tickets is missing the toggle");
  ["held", "email", "slack", "system"].forEach((tab) => {
    click(d.querySelector('[data-tab="' + tab + '"]'));
    if (d.querySelector("[data-view]")) throw new Error(tab + " should not offer a board");
    if (d.querySelector(".board")) throw new Error(tab + " rendered a board");
    if (!d.querySelector("table tbody tr")) throw new Error(tab + " did not render a list");
  });
  click(d.querySelector('[data-tab="tickets"]'));
  if (!d.querySelector(".board")) throw new Error("All tickets lost its board preference");
  console.log("       toggle on All tickets only; held/email/slack/system are lists");
});

// "Scheduled checks" (the tickets) and "Schedule" (the routines that raise
// them) were two different things sharing a word, and it read as one thing
// listed twice. Only the Records tab keeps the word.
step("1c. only one sidebar item uses the word schedule", () => {
  const labels = [...d.querySelectorAll(".nav[data-tab]")].map((b) => b.getAttribute("aria-label"));
  const sched = labels.filter((l) => /schedul/i.test(l));
  if (sched.length !== 1) throw new Error("expected 1, got " + sched.length + ": " + sched.join(", "));
  if (!labels.includes("Automated checks")) throw new Error("channel tab not renamed: " + labels.join(", "));
  console.log("       " + sched[0] + " (routines) vs Automated checks (tickets)");
});

step("2. sidebar collapses and expands", () => {
  const shell = $("shell");
  if (shell.classList.contains("collapsed")) throw new Error("starts collapsed");
  click($("collapse"));
  if (!shell.classList.contains("collapsed")) throw new Error("did not collapse");
  if ($("collapse").getAttribute("aria-label") !== "Expand sidebar") throw new Error("aria-label not updated");
  if (window.localStorage.getItem("trt-ops-rail") !== "1") throw new Error("not persisted");
  click(d.querySelector(".brand"));           // brand mark expands again
  if (shell.classList.contains("collapsed")) throw new Error("brand did not expand");
  const nav = d.querySelector(".nav[data-tab]");
  if (!nav.getAttribute("data-label")) throw new Error("nav missing data-label for tooltip");
});

step("3. notification bell opens with real items", () => {
  if ($("belldot").hidden) throw new Error("unread dot not shown on load");
  click($("bell"));
  if (!shown("notifpop")) throw new Error("panel did not open");
  const rows = $("notifpop").querySelectorAll(".nrow");
  if (rows.length < 5) throw new Error("only " + rows.length + " notifications");
  if (shown("belldot")) throw new Error("dot not cleared after opening");
  const first = rows[0].textContent;
  if (!/Held for review/.test(first)) throw new Error("escalations not ranked first: " + first);
  console.log("       " + rows.length + " items, first: " + first.trim().split("\n")[0].slice(0, 46));
  click(rows[0]);                              // navigates to the ticket
  if (!d.querySelector(".detail")) throw new Error("clicking a notification did not open the ticket");
  if (shown("notifpop")) throw new Error("panel stayed open");
});

step("4. command palette searches and runs commands", () => {
  click($("cmdopen"));
  if (!shown("cmd")) throw new Error("palette did not open");
  if (!d.querySelectorAll(".cmd-item").length) throw new Error("no default commands");
  const q = $("cmdq");
  q.value = "santos";
  q.dispatchEvent(new window.Event("input", { bubbles: true }));
  const hits = [...d.querySelectorAll(".cmd-item .ct")].map((e) => e.textContent);
  if (!hits.some((h) => /TRT-117/.test(h))) throw new Error("ticket not found: " + hits.join(" | "));
  console.log("       " + hits.length + " results for 'santos'");
  q.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  q.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  if (shown("cmd")) throw new Error("palette did not close on Enter");
  // Ctrl+K reopens
  d.dispatchEvent(new window.KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }));
  if (!shown("cmd")) throw new Error("Ctrl+K did not open the palette");
  d.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  if (shown("cmd")) throw new Error("Escape did not close the palette");
});

step("5. account menu switches role and signs out/in", () => {
  click($("whobtn"));
  if (!shown("whopop")) throw new Error("menu did not open");
  const opts = $("whopop").querySelectorAll("[data-who]");
  if (opts.length !== 4) throw new Error("expected 4 people, got " + opts.length);
  const physician = [...opts].find((b) => /Physician/.test(b.textContent));
  click(physician);
  if ($("whoname").textContent !== "Dr Helen Chen") throw new Error("name not updated");
  if ($("whorole").textContent !== "Physician") throw new Error("role not updated");
  if ($("whoav").textContent !== "DH") throw new Error("avatar initials not updated: " + $("whoav").textContent);
  if (d.querySelector(".tag.t-mute")) throw new Error("search term survived the person switch");
  const rows = d.querySelectorAll(".board .ticket, tbody tr").length;
  console.log("       as Physician: " + rows + " tickets in view (queue filter applied)");
  click($("whobtn"));
  click($("whopop").querySelector("[data-act=signout]"));
  if (!shown("signin")) throw new Error("sign-in screen did not show");
  click($("signinbtn"));
  if (shown("signin")) throw new Error("sign-in screen did not dismiss");
});

step("6. comments render and post", () => {
  // back to everything, then open a ticket that already has comments
  click($("whobtn"));
  click([...$("whopop").querySelectorAll("[data-who]")].find((b) => /Leadership/.test(b.textContent)));
  click(d.querySelector('[data-tab="tickets"]'));
  const card = [...d.querySelectorAll("[data-key]")].find((e) => e.getAttribute("data-key") === "TRT-118");
  click(card);
  const before = d.querySelectorAll(".comment").length;
  if (before !== 2) throw new Error("expected 2 seeded comments, got " + before);
  $("cmtext").value = "Pulled the June panel, attached to the client record.";
  click($("cmpost"));
  const after = d.querySelectorAll(".comment").length;
  if (after !== 3) throw new Error("comment not added (" + after + ")");
  const last = d.querySelectorAll(".comment")[2].textContent;
  if (!/Jordan Blake/.test(last)) throw new Error("comment not attributed to signed-in person");
  if (!/June panel/.test(last)) throw new Error("comment text missing");
  console.log("       posted as Jordan Blake, " + after + " comments on TRT-118");
});

step("   empty comment is ignored", () => {
  $("cmtext").value = "   ";
  click($("cmpost"));
  if (d.querySelectorAll(".comment").length !== 3) throw new Error("blank comment was posted");
});

step("   filter dropdowns still work after the .pop rescope", () => {
  click(d.querySelector("#back"));
  const sel = d.querySelector('[data-sel="fst"]');
  click(sel.querySelector("button"));
  if (!sel.querySelector(".pop")) throw new Error("dropdown did not open");
  click(sel.querySelector('.pop [data-v="open"]'));
  const shown = d.querySelectorAll(".board .ticket").length;
  if (!shown) throw new Error("filter produced nothing");
  if (!d.querySelector("#clearf")) throw new Error("clear button missing");
  click(d.querySelector("#clearf"));
});

step("7. new ticket: button scoped, validates, records the author", () => {
  click(d.querySelector('[data-tab="tickets"]'));
  if (!$("newbtn")) throw new Error("New ticket button missing on All tickets");
  click(d.querySelector('[data-tab="email"]'));
  if ($("newbtn")) throw new Error("New ticket button should not appear on channel tabs");
  click(d.querySelector('[data-tab="tickets"]'));

  const before = d.querySelectorAll(".board .ticket").length;
  click($("newbtn"));
  if (!shown("newticket")) throw new Error("modal did not open");

  // empty summary must be refused
  click($("ntcreate"));
  if (!shown("newticket")) throw new Error("modal closed on an empty summary");
  if (!$("f-sum").classList.contains("bad")) throw new Error("no validation error shown");

  $("nt-sum").value = "Courier misdelivered a cold-chain parcel";
  $("nt-sum").dispatchEvent(new window.Event("input", { bubbles: true }));
  $("nt-body").value = "Driver left it at reception. Need a replacement dispatched.";
  $("nt-client").value = "Owen Marsh";
  $("nt-queue").value = "support";
  $("nt-pri").value = "high";
  $("nt-due").value = "1";
  click($("ntcreate"));

  if (shown("newticket")) throw new Error("modal stayed open after create");
  if (!d.querySelector(".detail")) throw new Error("did not open the new ticket");
  const body = d.querySelector(".detail").textContent;
  if (!/Courier misdelivered/.test(body)) throw new Error("summary missing");
  if (!/Raised by a person/.test(body)) throw new Error("Source should read 'Raised by a person'");
  // Whoever is signed in at this point is the author - an earlier step switches
  // person, so read it rather than hardcoding a name.
  const author = $("whoname").textContent;
  if (!body.includes("Created by " + author))
    throw new Error("activity must name the author (" + author + ")");
  click(d.querySelector("#back"));
  const after = d.querySelectorAll(".board .ticket").length;
  if (after !== before + 1) throw new Error("board count did not grow (" + before + "->" + after + ")");
  console.log("       created, board " + before + " -> " + after + ", author recorded");
});

step("   clinical wording nudges, but only toward a non-qualified queue", () => {
  click($("newbtn"));
  $("nt-sum").value = "Client asks whether to stop treatment, reports chest tightness";
  $("nt-sum").dispatchEvent(new window.Event("input", { bubbles: true }));
  if (!$("nt-clin").classList.contains("on")) throw new Error("no nudge on clinical wording");
  $("nt-queue").value = "physician";
  $("nt-queue").dispatchEvent(new window.Event("change", { bubbles: true }));
  if ($("nt-clin").classList.contains("on")) throw new Error("nudge should clear for Physician");
  $("nt-queue").value = "support";
  $("nt-queue").dispatchEvent(new window.Event("change", { bubbles: true }));
  if (!$("nt-clin").classList.contains("on")) throw new Error("nudge should return for Client care");
  click($("ntcancel"));
  if (shown("newticket")) throw new Error("cancel did not close");
  console.log("       nudge on for Client care, off for Physician");
});

step("8. ask answers from the real data, never invents", () => {
  if (!$("askbtn").classList.contains("fab"))
    throw new Error("ask entry point should be the floating button");
  if (!shown("askbtn")) throw new Error("floating button not visible on the page");
  click($("askbtn"));
  if (!shown("askpanel")) throw new Error("panel did not open");
  if (shown("askbtn")) throw new Error("floating button should hide while the panel is open");
  if (!d.querySelectorAll(".ask-chip").length) throw new Error("no suggested questions");

  const ask = (q) => {
    const box = $("askq");
    box.value = q;
    box.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    const bots = d.querySelectorAll(".ask-msg.bot");
    return bots[bots.length - 1].textContent;
  };

  // Answers must agree with the data, so compute the truth independently.
  const openT = TICKETS.filter((t) => t.st !== "resolved");
  const overdue = openT.filter((t) => t.due !== null && t.due < 0).length;
  const held = openT.filter((t) => t.q === "held").length;
  const nursing = openT.filter((t) => t.q === "nursing").length;

  const a1 = ask("what is overdue?");
  if (!a1.includes(String(overdue))) throw new Error("overdue answer wrong: " + a1);
  const a2 = ask("what is held for review?");
  if (!a2.includes(String(held))) throw new Error("held answer wrong: " + a2);
  const a3 = ask("how busy is nursing?");
  if (!a3.includes(String(nursing))) throw new Error("nursing answer wrong: " + a3);
  const a4 = ask("TRT-117");
  if (!/chest tightness/i.test(a4)) throw new Error("ticket lookup wrong: " + a4);
  const a5 = ask("rachel santos");
  if (!/Rachel Santos/.test(a5)) throw new Error("client lookup wrong: " + a5);
  console.log("       overdue=" + overdue + " held=" + held + " nursing=" + nursing + " (all matched)");

  // The important one: it must refuse rather than improvise.
  const a6 = ask("should this patient stop taking testosterone?");
  if (!/could not answer/i.test(a6))
    throw new Error("answered a clinical question instead of declining: " + a6);
  const a7 = ask("what is the weather in sydney");
  if (!/could not answer/i.test(a7)) throw new Error("improvised an answer: " + a7);
  console.log("       declined a clinical question and an off-topic one");

  // clicking a result opens that ticket
  ask("what is overdue?");
  const hit = d.querySelector("[data-ask-key]");
  if (!hit) throw new Error("no clickable result");
  const k = hit.getAttribute("data-ask-key");
  click(hit);
  if (shown("askpanel")) throw new Error("panel should close on navigation");
  if (!shown("askbtn")) throw new Error("floating button should come back on close");
  if (!d.querySelector(".detail").textContent.includes(k)) throw new Error("wrong ticket opened");
});

step("9. with no backend it falls back and says so", () => {
  const badge = $("srcbadge");
  if (!badge) throw new Error("no data-source badge");
  if (!badge.className.includes("demo"))
    throw new Error("badge should read as sample data, got: " + badge.className);
  if (!/sample/i.test(badge.textContent))
    throw new Error("badge text should say sample: " + badge.textContent);
  // Count, not identity: an earlier step adds a ticket by hand. Check the
  // built-in set is what is loaded rather than how many there are.
  if (!TICKETS.some((t) => t.key === "TRT-118"))
    throw new Error("built-in sample tickets are missing");
  if (TICKETS.some((t) => /^t_/.test(t.key)))
    throw new Error("live-shaped tickets present with no backend");
  console.log("       no /api/console -> sample data (" + TICKETS.length + "), badge says so");
});

// The live path needs fetch stubbed before the app boots, so it gets its own
// document. Worth the duplication: shipping a console that silently shows
// invented tickets while looking live is the failure this guards against.
function liveCheck() {
  const payload = {
    live: true,
    counts: { total: 2, open: 2, held: 1, overdue: 0 },
    tickets: [
      { key: "t_live01", sum: "Real ticket from the running system", type: "clinical",
        q: "held", st: "open", pri: "urgent", due: null, client: "—",
        from: "a@example.com", ch: "email", age: "2h", why: "held", body: "b",
        acts: [["Created from client email", "2h ago"]], cm: [] },
      { key: "t_live02", sum: "Second real ticket", type: "admin",
        q: "nursing", st: "progress", pri: "normal", due: 3, client: "Someone",
        from: "b@example.com", ch: "slack", age: "1h", why: "routed", body: "b",
        acts: [["Created from internal message", "1h ago"]], cm: [] },
    ],
  };

  const dom2 = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true,
                                 url: "http://x/" });
  const w = dom2.window;
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
  w.requestAnimationFrame = (f) => setTimeout(() => f(Date.now()), 0);
  // Mirror a real Response: the loader checks content-type before parsing,
  // because static hosting answers unknown paths with 200 + index.html.
  w.fetch = () => Promise.resolve({
    ok: true,
    headers: { get: (h) => (/content-type/i.test(h) ? "application/json" : null) },
    json: () => Promise.resolve(payload),
  });
  w.eval(js);

  return new Promise((resolve) => setTimeout(() => {
    const d2 = w.document;
    const badge = d2.getElementById("srcbadge");
    try {
      if (!badge.className.includes("on"))
        throw new Error("badge should read live, got: " + badge.className);
      if (!/live/i.test(badge.textContent))
        throw new Error("badge text should say live: " + badge.textContent);
      if (w.TICKETS.length !== 2)
        throw new Error("live tickets not adopted, got " + w.TICKETS.length);
      if (w.TICKETS[0].key !== "t_live01")
        throw new Error("wrong tickets adopted: " + w.TICKETS[0].key);
      const held = [...d2.querySelectorAll(".nav[data-tab]")]
        .find((b) => b.getAttribute("aria-label") === "Held for review");
      if (!/1/.test(held.textContent))
        throw new Error("sidebar count did not follow the live data");
      console.log("  ok   10. live data is adopted and the badge says live");
      console.log("       2 live tickets, held count followed");
    } catch (e) {
      errors.push("10. live data -> " + e.message);
      console.log("  FAIL 10. live data -> " + e.message);
    }
    w.close();
    resolve();
  }, 120));
}

liveCheck().then(() => {

console.log("");
// The console sets a refresh interval, which keeps Node's event loop alive
// forever once the script has finished. Close the window and exit explicitly
// rather than hanging the run.
dom.window.close();
if (errors.length) { console.log("FAILED: " + errors.length); errors.forEach((e) => console.log(" - " + e)); process.exit(1); }
console.log("all checks passed");
process.exit(0);

});
