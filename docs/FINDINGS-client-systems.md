# What TRT Australia actually runs today

Investigated 16 September 2026. Everything below was verified by inspecting
the handoff repo and the live public site — not inferred from the brief.

## Summary

The client sent us a **WordPress website handoff package**, not a systems
export. It contains no backend, no ticketing, no database and no client
portal. The Hermes agent, the ticketing system and the SLA tracker all have
to be built.

## The repo they sent

`TRT-Australia-WordPress-Handoff-2026-09-16` — a static front-end reference
for rebuilding trtaustralia.com in WordPress.

| Check | Result |
|---|---|
| Files | 74 total: 6 HTML, 16 CSS, 15 JS, images and fonts |
| Mentions of Hermes / ticketing / Slack / SLA / MCP | **Zero** |
| Backend API calls in JS | 1 — an image loader in `scrollcraft.js` |
| HTML forms that submit | 0 (three radio inputs for a plan selector) |
| Integrity | 73/73 files match `CHECKSUMS.sha256` |
| Preview | All 5 routes serve 200 via `node preview.cjs` |

Their own README confirms it: *"There is no booking backend, payment checkout,
health-record upload service, patient portal, database or WordPress content
export in these files."*

## Their live stack

Fingerprinted from trtaustralia.com.

| Layer | Product |
|---|---|
| CMS | WordPress + **Divi** theme |
| Hosting | **SiteGround** (`sg-ai-studio` API namespace) |
| Booking | **Simply Schedule Appointments** — `/wp-json/ssa/v1/`, 112 REST routes |
| Contact form | Divi's built-in form — emails the admin, no ticket, no tracking |
| Forms plugin | Forminator (installed) |
| Security | Wordfence |
| Cache / SEO | WP Rocket, RankMath |
| Ad protection | ClickCease |
| **MCP** | **MCP adapter already installed** — `/mcp/mcp-adapter-default-server`, plus an OAuth server |
| **CRM** | **HubSpot** (confirmed by client) |
| **Internal chat** | **Slack** (confirmed by client) |
| Partner pharmacy | Adelaide Compounding Pharmacy (named in their privacy policy) |

### WooCommerce is installed but dead

`/shop/`, `/cart/`, `/checkout/` and `/my-account/` all return HTTP 200 with
real page titles, but **zero WooCommerce assets load on any page**. They are
leftover pages from a deactivated plugin.

This matters: **the "client portal" the website advertises does not exist.**
It was started and abandoned.

## How work reaches them today

| Channel | Detail |
|---|---|
| Email | `info@trtaustralia.com` |
| Email | `Support@trtaustralia.com` |
| Phone | +61 483 984 020 (a mobile number) |
| Contact form | Divi form → email to admin |
| Booking | SSA appointment type `free-consultation-phone-call` |

Blood results arrive as **PDF attachments on email**. That is the entire
intake mechanism. It is the highest-value thing for Hermes to take over.

## Roles, in their own words

The client deliberately says **"client"**, not "patient" — 56 uses vs 4 across
the five pages, and the 4 are an FAQ heading and two third-party article
titles. Their disclaimer states they *"facilitate access to medical
practitioners"* and are *"not a pharmacy"*. The doctors hold the clinical
relationship, not the company. **Use their terminology.**

| Role | Scope |
|---|---|
| Client care team | Free consultation, process questions, admin. Explicitly *not* a medical appointment |
| Independent AHPRA-registered doctors | Every clinical decision, without exception |

## Four SLA deadlines already documented

These came from the client's own site copy. They need owner sign-off, but they
are not guesses.

| Rule | Source |
|---|---|
| **Follow-up blood work due within 8 weeks** of starting TRT | Homepage, "Ongoing care" |
| **Blood results expire after 4 months** — older panels rejected | Blood-work and eligibility pages |
| **Membership renewal** at 3 / 6 / 12 months ($240 / $480 / $860) | Membership section |
| **Year-1 anniversary** → $650 grandfathered loyalty rate | Loyalty timeline |

## Required pathology panel

An incomplete panel is, in their words, *"one of the most common reasons an
assessment stalls."* Checking which markers are **present or missing** is
administrative work Hermes can safely do. Interpreting the values is not.

Total and free testosterone, SHBG, oestradiol (E2), LH, FSH, prolactin,
progesterone, DHEA-S, IGF-1 and GH, cortisol, TSH with FT3 and FT4, LFT, UEC,
cholesterol/triglycerides/HDL/LDL, glucose, full blood count including
haematocrit, iron studies, magnesium.

## Two things to raise with the client

### 1. The website sells features that do not exist

The membership section promises a *"client portal, messaging and treatment
reminders"*, *"blood-test and treatment reminders"* and *"practitioner
messaging between reviews"*. None of it is built.

Hermes is, in practice, what makes already-sold promises real. That may mean
reminders and follow-up tracking matter more to them than internal chat
triage — which would move roadmap phases 3 and 4 earlier.

### 2. Our own solution design contradicts itself on privacy

Section 2 proposes routing through OpenRouter. Section 6 promises data stays
*"within the corporate security perimeter"* for Australian Privacy Principles
compliance.

Both cannot be true. And the point is now moot in the client's favour: their
client data is **already** in HubSpot's US cloud and discussed in Slack. The
"nothing leaves Australia" claim was broken before we arrived.

Section 6 should be reworded to: Hermes is self-hosted on their
infrastructure and connects out to the systems they have already chosen.
Better we correct it than their compliance reviewer finds it.

## Unresolved

A hidden 0×0 iframe on every page points at `obseu.siliconvalleybz.com`
(and a variant, `obseu.kingofbzcc.com`). Probably ClickCease bot detection —
**not verified**. An unidentified third-party tracker on a site handling
health enquiries is worth confirming before we own the compliance story.
