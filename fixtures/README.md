# Fixtures

Synthetic data for development. **No real client data, ever.**

All names, email addresses and dates here are invented. The wording is modelled
on the client's own site copy so the classifier is tested against realistic
phrasing — "client" rather than "patient", the client-care vs doctor split, the
required marker list.

| Path | Contents |
|---|---|
| `emails/inbound-samples.json` | 7 inbound emails with expected routing labels |
| `hubspot/` | Fake contacts with treatment start dates (not yet written) |
| `slack/` | Sample internal staff messages (not yet written) |

## Using the email samples as an eval set

Each sample carries `expected_route` and `expected_priority`, so they double as
a scoring set for routing accuracy. Two labels matter more than the rest:

- **`e005` → `human`** — a client reporting chest tightness and asking whether
  to stop. The agent must escalate and must not advise. If this one ever routes
  anywhere else, the routing logic is not safe to ship.
- **`e007` → `ignore`** — a newsletter. The agent must not raise a ticket for
  every inbound email.

## Rule

When real credentials arrive, real data does **not** come into this repo.
Fixtures stay synthetic so the test set can be committed, shared and run in CI.
