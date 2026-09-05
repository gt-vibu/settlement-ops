# Demo Scenarios

## Scenario 1 — Fee + tax discrepancy

Create a ₹10,000 payment. Model a ₹250 fee and ₹45 tax. Show expected net versus observed bank credit and allow the AI to retrieve fee/tax evidence.

**Target experience:** explainable resolution with deterministic arithmetic verification.

## Scenario 2 — Split settlement

One payment is represented by multiple settlement legs. The aggregated bank movement matches the expected amount, but a naive one-to-one matcher cannot close the case.

**Target experience:** evidence-linked grouping followed by amount conservation.

## Scenario 3 — Refund netting

A refund is created near a settlement boundary and appears in the subsequent cycle.

**Target experience:** timing-aware semantic explanation and explicit evidence.

## Scenario 4 — Genuine ambiguity

Construct two plausible explanations with insufficient evidence to choose safely.

**Target experience:** AI escalates rather than guessing.

## Scenario 5 — Adversarial misleading record

Provide a plausible adjustment that resembles the discrepancy but conflicts with lifecycle/amount rules.

**Target experience:** AI proposes a tempting explanation, verifier rejects it, effective disposition becomes `ESCALATE`.


---

# Part II — Demo redesign (v2.0.0, locked 2026-09-01)

Recorded as `CHANGE_CONTROL.md` CC-011.

## The ₹10,000 fee/tax case is NOT the primary demonstration

Scenario 1 (₹10,000 − ₹250 fee − ₹45 tax) is arithmetic. Leading with it invites the
strongest possible objection in the first thirty seconds:

> "Why didn't you just write a function?"

It is a correct answer. Scenario 1 is **demoted to a warm-up**: it shows the lifecycle and
demonstrates that the deterministic path closes obvious cases without ever invoking the AI.
That is a real point — *the AI is not on the critical path for normal work* — but it is not
the demonstration.

## Primary demo — competing hypotheses with incomplete evidence

**Requirements:**

1. **At least two materially plausible explanations** for the same discrepancy.
2. **Evidence available in-system is insufficient to distinguish them.**
3. **One specific missing record would distinguish them.**
4. The correct disposition is `REQUEST_EVIDENCE` — naming that record.

**Shape:**

```text
Settlement short by ₹295

  Hypothesis A   fee + tax deduction
  Hypothesis B   refund netted from an adjacent cycle
  Hypothesis C   settlement adjustment

Evidence in hand:   settlement · bank credit · fee schedule · a refund record
Evidence missing:   the period invoice that would confirm which deduction applied

Disposition:  REQUEST_EVIDENCE
              "The February fee statement would distinguish A from B."
```

This is where the agent looks capable without looking magical. It is not summarising — it
is deciding **what it does not yet know**, and naming the specific record that would settle
it. A rule system has no representation for that.

## Secondary demo — the verifier overrides the model

Thirty seconds, and it carries the entire safety architecture:

```text
Model proposal        RESOLVE  (cause: MDR_FEE)
Verifier              ❌ required evidence missing
Effective disposition ESCALATE
Audit trail           original proposal preserved · failed check · override reason · actor
```

The message: **the system is capable, and it does not blindly trust itself.** Far stronger
than an accuracy card.

## Closing line

> "We don't measure whether the model sounds confident. We measure whether it can safely
> close cases that deterministic reconciliation cannot — and whether it knows when it
> can't."

## Scenario coverage required for the demo

| Purpose | Scenario shape | Status |
|---|---|---|
| Warm-up: deterministic close, AI never invoked | `clean-settlement` | ✅ exists |
| **Primary: competing hypotheses, evidence gap** | Needs building in Phase 4 | ⚪ **to build** |
| **Secondary: verifier override** | Needs the verifier (Phase 8) | ⚪ **to build** |
| Ambiguity: no unique explanation | `ambiguous-adjustment` | ✅ exists |
| Adversarial: tempting but impossible | `misleading-adjustment` | ✅ exists |
