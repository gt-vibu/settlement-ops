# Product Principles

## 1. Financial truth is deterministic

Financial arithmetic, identity, lineage, and lifecycle rules are not delegated to an LLM.

## 2. AI handles the exception tail

The system does not waste model calls on obvious matches. AI is reserved for unresolved cases where semantic context can plausibly help.

## 3. Evidence before action

No material disposition can rely solely on model confidence or prose.

## 4. The model is a proposer, never the authority

The model proposes; deterministic verification determines the effective disposition.

## 5. Abstention is a valid result

A safe system may conclude that evidence is insufficient.

## 6. Human approval is explicit

Approval is a deliberate state transition, not a hidden side effect.

## 7. The product is stateful

An action changes durable state and the result remains observable after refresh.

## 8. Evaluation must be hostile enough to fail

Synthetic data must include ambiguous, compound, adversarial, and unseen combinations.

## 9. Claims must match evidence

Never convert synthetic benchmark output into a production-impact claim.

## 10. Simple architecture is a feature

Use a modular monolith and worker unless actual evidence requires a service split.

## 11. Security is part of product behavior

Tenant isolation, authorization, validation, and auditability are not post-processing tasks.

## 12. Product breadth must remain coherent

Every module must connect to the same payment-to-settlement operational narrative. Avoid unrelated modules added only to compete on feature count.


---

# Part II — The operations-workspace rule (v2.0.0, locked 2026-09-01)

Recorded as `CHANGE_CONTROL.md` CC-013.

## 13. Every screen exists to act or to hold state — never merely to inform

> **The primary purpose of every screen is an operational action or persistent state, not
> information display.**

This is the line that separates a finance operations product from a report builder with
buttons. Both can show the same numbers. Only one leaves the system different afterwards.

### The failure mode this forbids

```text
REPORT BUILDER                       OPERATIONS WORKSPACE

upload data                          financial activity arrives
    |                                    |
process everything                   system holds current state
    |                                    |
generate report                      exception becomes a WORK ITEM
    |                                    |
read findings                        operator acts on it
    |                                    |
(system is finished)                 state changes, audit written
                                         |
                                     work item still there tomorrow
```

A report is complete when it renders. A work item is complete when someone has **done
something to it**.

### Concretely

**Not this** — a case screen that displays a difference, a cause, a confidence, and ends:

```
Exception detail
  Difference   Rs 295
  AI says      Refund netting
  Confidence   93%
```

**This** — a case screen whose purpose is a decision:

```
Exception investigation
  Rs 295 unresolved. Two plausible causes remain.

  Evidence available     settlement / refund / fee schedule
  Evidence missing       settlement-period invoice

  System recommendation  REQUEST EVIDENCE

  [ Request evidence ]  [ Escalate ]
```

And `Request evidence` must actually move `INVESTIGATING -> REQUESTING_EVIDENCE`, open a
durable request, and write an audit event. If the button only reveals text, the screen is a
report.

## 14. The five properties that make it a product

| # | Property | Enforced by |
|---|---|---|
| 1 | Cases persist across sessions and restarts | `reconciliation_cases`, verified by integration test |
| 2 | Real state transitions | `STATE_MACHINE.md` v2.0.0, 17 states, server-enforced |
| 3 | User actions mutate state | The workflow endpoints — **and a UI that calls them** |
| 4 | A continuously useful work queue | Cases in *different* states, actionable from the queue |
| 5 | Scenarios flow through the real backend | `SCENARIO_ENGINE.md` same-pipeline rule |

Properties 1, 2, 3 (backend) and 5 are implemented and tested. **Property 4 depends on the
queue containing a realistic distribution of states** — see section 16.

## 15. The AI appears only when a decision is hard

A product that labels everything "AI-powered" is advertising. A finance product surfaces the
model **only where a difficult decision actually needs it.**

| Case | What the operator should see |
|---|---|
| Reconciled deterministically | Closed. **No AI mentioned at all** |
| Residual exception, no investigation started | The discrepancy and the deterministic reasons. **No AI panel** |
| Investigation running | Evidence being gathered, tool trace |
| Proposal verified | Verified disposition dominant; model proposal secondary and labelled |

A dormant "AI investigation - not yet available" panel on every case is the worst version of
this: it advertises a capability while providing none.

**Corollary:** for a `RECONCILED` case the AI is not merely hidden — it was never invoked.
That is a product statement worth making explicitly, because it is what makes the AI's
appearance meaningful when it does happen.

## 16. Queue realism has a phase dependency

A work queue only reads as a workbench when cases sit in **different** states. A list of
seventeen identical `EXCEPTION` rows is a list, not a queue.

But `APPROVAL_PENDING` requires a verified proposal, which requires the agent (Phase 7) and
the verifier (Phase 8); `STAGED` and `CLOSED` require the approval path (Phase 9).

**Consequence, stated so it is not a surprise:** until Phases 7-9 land, the queue can only
show `EXCEPTION`, `INVESTIGATING`, `ESCALATED` and `REQUESTING_EVIDENCE`. The full
workbench feel - *"5 awaiting approval, 3 investigating, 12 resolved"* - is gated on the
approval path existing, not on UI work.

Do not fake the missing states with seeded rows. A queue populated by hand is a screenshot.
