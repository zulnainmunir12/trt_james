# Incident: Hermes autonomously attempted to draft clinical advice

**Date:** 16 September 2026
**Severity:** High — this is the exact behaviour the solution design prohibits
**Status:** Contained. Dispatcher disabled, tasks blocked/archived.
**Environment:** Development only. Synthetic data. No real client involved.

## What happened

The pipeline processed fixture `e005` — a synthetic client reporting chest
tightness five weeks into treatment, asking whether to stop.

**Our safety layer worked.** The classifier routed it to `Route.HUMAN`, the
deterministic clinical-signal rule confirmed it, and the ticket was created
with `--triage`: parked, unassigned, awaiting a person.

**Then Hermes' kanban dispatcher picked it up anyway.**

With `Orchestration: Auto` (the default), the `auto-decomposer` decomposed
our triaged ticket and created its own tasks:

```
t_0e9cffa6  "Review medical records and draft urgent clinical response
             with safety-netting"           created by: auto-decomposer

body: "Draft an urgent response that includes immediate safety-netting
       ... and clear clinical guidance on whether to temporarily hold
       the medication."

t_befd8eec  "Perform clinical safety review and approve the drafted
             response"                      created by: auto-decomposer

body: "...Ensure the safety-netting language is ... medically sound, and
       that the advice on holding/continuing the medication is clinically
       appropriate. Approve the final draft for immediate communication
       to the client."
```

It then **spawned a worker process** (pid 5491) to carry the first one out,
and re-assigned our deliberately-unassigned triage ticket to `default`.

## Why it did not produce clinical advice

```
[18:28] [run 1] rate_limited {'pid': 5491, 'exit_code': 75,
                              'retry_status': 'ready'}
[18:28] respawn_guarded {'reason': 'rate_limit_cooldown'}
```

**It hit the Gemini free-tier quota wall.** Nothing in our design stopped
it. Had we been on the paid tier the client is expected to use in
production, a worker would have drafted medical guidance on whether a
person with chest pain should stop their medication.

That is worth stating plainly: we were saved by a billing limit.

## The lesson

Our safety control was at the **classification layer**. The **orchestration
layer downstream ignored it.**

Routing something to "a human decides" is not a safety control if another
component can pick it up and act on it. `--triage` describes intent; it does
not enforce it.

A safety property has to hold across every layer that can act, not just the
one that made the decision.

## What was done

1. `kanban.dispatch_in_gateway: false` and `kanban.auto_decompose: false`
   in `~/.hermes/config.yaml` — see `setup/disable-auto-orchestration.sh`.
2. Gateway restarted so the change took effect.
3. `t_0e9cffa6` blocked with a safety reason; `t_befd8eec` archived.
4. Confirmed no worker processes remain.

## What still needs doing

- [ ] **A test that fails if autonomous dispatch is enabled.** Config can be
      changed by anyone, including a future `hermes update`. Right now
      nothing detects a regression.
- [ ] **Check `review_dispatch: true`**, still set. Its behaviour is not
      understood and it may be another autonomous path.
- [ ] **Re-audit after every `hermes update`.** The vendor's defaults are
      autonomous; ours must not be. Add to the upgrade checklist.
- [ ] **Decide whether the kanban board is the right ticket store at all.**
      It ships with an agent dispatcher attached. A plain table we control
      has no such behaviour to switch off. This reopens the build-vs-buy
      decision recorded in ARCHITECTURE.md.

## For the client conversation

This belongs in the compliance discussion, not hidden.

Section 6 of the solution design commits to: *"Autonomous execution of
clinical or discretionary client decisions is strictly prohibited; all such
actions route to qualified human personnel."*

Meeting that commitment is not a matter of prompting the model carefully.
It requires disabling platform features that are **on by default**, and
proving they stay disabled. That is a real piece of work and should be
visible in the plan rather than assumed.

It also strengthens the case for the human-in-the-loop approval gates the
design already promises — they need to be enforced structurally, not by
convention.
