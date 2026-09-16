# Open questions

What we still need, and what each one blocks. Ordered by how much it holds up.

## Answered

| Question | Answer |
|---|---|
| Which CRM? | **HubSpot** |
| Internal communication platform? | **Slack** |
| Mailbox attachments for development? | Use dummy data; real mailboxes later |

## Blocking — Phase 1 cannot finish without these

| # | Need | Blocks |
|---|---|---|
| 1 | **HubSpot private app token**, with scopes for reading contacts and their properties | Everything SLA-related. Hermes needs a client list and treatment start dates or it has nothing to track deadlines against |
| 2 | **Which Slack workspace and channels** Hermes should watch, and a bot token | Chat ingestion |
| 3 | **Which mailbox** client queries actually arrive at — `info@`, `Support@`, or both | Email ingestion |
| 4 | **A dedicated mailbox for Hermes** (e.g. `assistant@trtaustralia.com`) with IMAP/SMTP credentials | Email. Hermes takes full inbox access with the password on disk, so it must not sit on a shared human inbox |
| 5 | **Staff roster** — how many physicians, nurses, support staff; who is leadership | Routing has no destinations without it |

## Needed before go-live

| # | Need | Why |
|---|---|---|
| 6 | **Sign-off on the four SLA deadlines** we derived from their website | They are evidence-based but unconfirmed. See FINDINGS |
| 7 | **Approved copy for the monthly check-in email** | Must pass their compliance rules (below) |
| 8 | **Which actions require human approval** before Hermes acts | Our own Section 6 commits to approval gates |
| 9 | **Where Hermes gets hosted** — their server or private cloud | We committed to self-hosting |
| 10 | **Message volume estimate** | Determines LLM cost. We will not quote a figure without it |

## Needs confirming

| # | Item | Note |
|---|---|---|
| 11 | Does the client actually have **OpenRouter infrastructure**? | Our solution design states it as fact. We have seen no evidence |
| 12 | Is the **MCP adapter on their WordPress** deliberate? | It is installed and exposes an OAuth server. Could be a useful integration path, or an unnoticed plugin default |
| 13 | How do doctors see blood results **today**? | Email, shared drive, or HubSpot — changes where the pathology routine reads from |
| 14 | The hidden `obseu.siliconvalleybz.com` iframe | Unidentified third-party tracker on a health site. Likely ClickCease, unverified |

## Compliance constraints already known

From comments in the client's own page source — these govern any client-facing
copy Hermes generates:

> No superlatives. No medicine names or prices. No promised outcomes or result
> timelines. Australian English. No em dashes. Every free-consultation / $0
> mention must link the full terms block.

They also run a compliance scan after copy changes. **Ask for that tool** — it
gives us an automated check for Hermes-generated email.

## Our own document needs a correction

`TRT_Solution_Design_v8` Section 2 proposes OpenRouter; Section 6 promises data
stays inside the corporate perimeter. Those contradict. Since the client's data
is already in HubSpot and Slack (both US cloud), the honest wording is that
Hermes is self-hosted and connects out to the systems they have already chosen.

Fix it before their compliance reviewer does.
