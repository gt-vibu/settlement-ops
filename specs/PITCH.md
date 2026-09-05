# Pitch

## One-line

**SettlementOps is the finance-operations control center for the exceptions that deterministic reconciliation cannot safely close.**

## Problem

Payments can succeed while the final settlement is still difficult to explain at the record level. Finance operators often end up tracing fees, refunds, settlement lines, bank credits and ledger records by hand.

## Product

SettlementOps keeps that work inside one persistent workflow:

```text
Financial lifecycle
 -> reconcile
 -> exception
 -> investigate
 -> verify
 -> approve
 -> stage
 -> close
```

## AI

The AI does not replace reconciliation or accounting. It investigates the difficult residual: it forms bounded hypotheses, finds relevant evidence through typed tools, and proposes a constrained disposition.

## Safety

The model is not trusted as financial authority. Deterministic verification recomputes the critical checks and can override the model. Human approval is required before staging.

## Demo

Create a controlled payment scenario, watch the lifecycle reach a real persistent exception, open the investigation workspace, watch evidence arrive, review the recommendation, approve or escalate, and observe the queue/audit state change.

## Proof

Show baseline versus AI residual-resolution metrics, unsupported-resolution rate, challenge-set behavior and verifier overrides. Never present synthetic results as production merchant impact.


---

# Part II — Claim redesign (v2.0.0, locked 2026-09-01)

Recorded as `CHANGE_CONTROL.md` CC-011.

## Product name for the capability

**Evidence-Gated Settlement Investigation.**

## One-line claim

> **SettlementOps reconciles the obvious deterministically, then uses a bounded
> investigation agent to resolve unfamiliar settlement exceptions from evidence — or
> explicitly abstain when the evidence is insufficient.**

## What we do NOT claim

| Not claimed | Why |
|---|---|
| "AI is more accurate than rules" | Aggregate accuracy is the wrong question, and against a strong baseline it is close to unwinnable without cheating |
| "AI-powered exception resolution" | Generic. Says nothing a hundred other submissions won't say |
| Any production accuracy or merchant-impact figure | The evaluation is synthetic (`EVALUATION.md` §21) |
| That the AI is on the critical path for normal work | It is deliberately not. Clean cases never reach it |

## What we do claim, and how it is tested

> On **previously unseen combinations** of known financial causes, a bounded
> evidence-investigation agent generalises beyond enumerated deterministic rules while
> maintaining **safe abstention** when evidence is insufficient.

Tested by building the strongest adversary we could and reporting what happened:

```text
System A   strong deterministic baseline
System B   a genuine attempt to extend the rules to cover the residual
System C   the investigation agent

reported separately on SEEN and UNSEEN cause combinations
```

## The honest framing for the pitch

> "We deliberately built a strong deterministic baseline, then built a second system that
> tried to beat our own AI with more rules, and tested both against financial situations
> whose cause combinations were never encoded. We report where reasoning added value and
> where it did not."

If System B matches System C, we say so and keep the deterministic workflow. A result that
kills our own hypothesis is still a result — and the willingness to look for it is the part
that is hard to fake.

## Why this framing is stronger

An aggregate win of one or two points against a strong baseline is unconvincing and
invites the obvious objection. A located, falsifiable claim — *rules are excellent where
enumerated; reasoning generalises where they are not; and the agent knows when to stop* —
is both more interesting and more likely to be true.
