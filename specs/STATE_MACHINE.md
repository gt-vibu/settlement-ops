# State Machine — Reconciliation Case

**Version:** 2.0.0 (Readiness Decision D4 — locked 2026-08-31)
**Supersedes:** 1.0.0. Change recorded in `CHANGE_CONTROL.md` as CC-004.

## 0. Authority and scope

This document is the **canonical, authoritative** definition of reconciliation-case lifecycle. `PRD.md` §18 presents a simplified product-facing label set and explicitly subordinates itself to this document ("the backend remains authoritative"). The mapping is in §7.

Three rules govern everything below:

1. **All transitions are server-side.** No client, frontend or model may assert a state.
2. **The AI agent is never an authorized actor for any transition.** It has no row in any "Authorized actor" field in this document. It produces a proposal; deterministic code moves the case.
3. **Every transition emits exactly one immutable audit event** carrying previous state, next state, actor, correlation ID and case version (`AUDIT_TRAIL.md` §3).

## 1. States

Seventeen states. Three (`RECONCILED`, `APPLIED`, `OUTCOME_LOGGED`) were added in v2.0.0 by Decision D4.

| State | Kind | Meaning |
|---|---|---|
| `RECEIVED` | pipeline | Source records accepted, not yet normalized |
| `NORMALIZED` | pipeline | Records typed, validated, lineage-tagged |
| `MATCHING` | pipeline | Deterministic reconciliation in progress |
| `RECONCILED` | pipeline | Deterministically closed with no residual — **AI never invoked** |
| `EXCEPTION` | queue | Residual that deterministic logic could not safely close |
| `INVESTIGATING` | active | Investigation job running or awaiting agent completion |
| `ACTION_PROPOSED` | active | Proposal exists and has passed the terminal verifier gate |
| `APPROVAL_PENDING` | queue | Awaiting an authorized human decision |
| `APPROVED` | active | Human approved; effect not yet applied |
| `REJECTED` | queue | Human rejected the proposal |
| `REQUESTING_EVIDENCE` | queue | Specific evidence has been requested |
| `ESCALATED` | queue | No safe automated path; human ownership required |
| `STAGED` | active | Durable bounded action record created |
| `APPLIED` | active | Staged action applied to the **internal bounded target** — see §6 |
| `OUTCOME_LOGGED` | active | Outcome record written |
| `CLOSED` | terminal | Case complete; requires an `Outcome` record |
| `REOPENED` | active | Controlled re-entry from `ESCALATED` or `CLOSED` |

## 2. Transition graph

```text
RECEIVED
   ↓
NORMALIZED
   ↓
MATCHING ──────────────→ RECONCILED ────────────────────────────────→ CLOSED
   ↓
EXCEPTION ─────────────────────────────────────────────→ ESCALATED
   ↓
INVESTIGATING ─────────→ REQUESTING_EVIDENCE ──────────→ ESCALATED
   ↓                            ↓
   │                     (evidence received)
   │                            ↓
   ├────────────────────→ INVESTIGATING
   ↓
ACTION_PROPOSED ───────────────────────────────────────→ ESCALATED
   ↓         ↑
   │    (proposal invalidated by late evidence)
   ↓         │
APPROVAL_PENDING ──┬──→ REJECTED ──→ INVESTIGATING | ESCALATED
                   ├──→ ESCALATED
                   ├──→ REQUESTING_EVIDENCE
                   └──→ APPROVED
                           │
              ┌────────────┴────────────┐
              │                         │
   (action requires staging)   (recommended_action = NONE)
              ↓                         ↓
           STAGED                     CLOSED
              ↓                    (Outcome written
           APPLIED                 atomically)
              ↓
        OUTCOME_LOGGED
              ↓
            CLOSED

ESCALATED ──→ REOPENED ──→ INVESTIGATING
ESCALATED ──→ CLOSED        (resolved outside the system; Outcome required)
CLOSED    ──→ REOPENED      (ADMIN only, audited)
```

## 3. Per-state specification

Every state defines: entry conditions, exit conditions, authorized actor, allowed transitions, invalid transitions, audit event, idempotency semantics, failure behavior.

---

### `RECEIVED`

| Property | Definition |
|---|---|
| **Entry** | Import job accepted a batch containing at least one candidate record |
| **Exit** | All records in scope pass normalization |
| **Authorized actor** | `SYSTEM` (import worker) |
| **Allowed** | → `NORMALIZED` |
| **Invalid** | → any state other than `NORMALIZED` |
| **Audit** | `financial_record_ingested` |
| **Idempotency** | Import idempotency key; replaying the same key returns the original import, creates no new case |
| **Failure** | Malformed records are rejected at validation and never create a case; the import records a per-record validation error |

---

### `NORMALIZED`

| Property | Definition |
|---|---|
| **Entry** | Records typed, currency explicit, lineage attached, duplicates collapsed |
| **Exit** | Reconciliation run claims the batch |
| **Authorized actor** | `SYSTEM` |
| **Allowed** | → `MATCHING` |
| **Invalid** | → `EXCEPTION` directly (must pass through `MATCHING`); → `CLOSED` |
| **Audit** | `record_normalized` |
| **Idempotency** | Normalizing an already-normalized record is a no-op |
| **Failure** | Normalization failure leaves records in `RECEIVED` with an explicit error; no silent drop |

---

### `MATCHING`

| Property | Definition |
|---|---|
| **Entry** | Deterministic reconciliation run started |
| **Exit** | Matcher reaches a verdict for the record group |
| **Authorized actor** | `SYSTEM` (reconciliation worker) |
| **Allowed** | → `RECONCILED` (fully reconciled within tolerances); → `EXCEPTION` (residual) |
| **Invalid** | → `INVESTIGATING`, `ACTION_PROPOSED`, `STAGED`, `APPROVED` |
| **Audit** | `reconciliation_completed` |
| **Idempotency** | Re-running reconciliation over an already-decided group produces the same verdict or an explicit conflict; it never double-creates a case |
| **Failure** | Matcher error → case remains in `MATCHING`, job marked retryable. **A matcher failure never produces `RECONCILED`** (fail closed) |

---

### `RECONCILED`

| Property | Definition |
|---|---|
| **Entry** | All amounts reconcile within `T1`–`T5` tolerances; no residual; lineage complete |
| **Exit** | Immediate — closed in the same transaction |
| **Authorized actor** | `SYSTEM` |
| **Allowed** | → `CLOSED` |
| **Invalid** | → `EXCEPTION`, `INVESTIGATING`. **The AI is never invoked for a `RECONCILED` case** (`PRODUCT_PRINCIPLES.md` §2) |
| **Audit** | `reconciliation_completed` with `residual: false` |
| **Idempotency** | Terminal path; repeat is a no-op |
| **Failure** | n/a |

> `RECONCILED` exists to make the clean path explicit and separately countable. It is deliberately a distinct state from `CLOSED` so that "closed because nothing was wrong" and "closed after an investigation" are never conflated in metrics or audit.

---

### `EXCEPTION`

| Property | Definition |
|---|---|
| **Entry** | Deterministic reconciliation could not safely close; discrepancy amount, deterministic reason and source lineage persisted |
| **Exit** | Investigation authorized, or routed to a human |
| **Authorized actor** | `SYSTEM`, `OPERATOR` |
| **Allowed** | → `INVESTIGATING` (authorized investigation); → `ESCALATED` (**AI kill switch off**, policy-ineligible, or operator escalates) |
| **Invalid** | → `ACTION_PROPOSED`, `STAGED`, `APPROVED`, `CLOSED` |
| **Audit** | `reconciliation_exception_created` |
| **Idempotency** | One case per (merchant, record group, reconciliation run); enforced by unique constraint |
| **Failure** | n/a — this is a durable resting state |

> **Resolves readiness risk A-4(a).** `SAFETY.md` §7 requires that disabling AI investigation routes residuals to safe deterministic handling. `EXCEPTION → ESCALATED` is that route. With the kill switch off, cases queue for humans instead of becoming unreachable.

---

### `INVESTIGATING`

| Property | Definition |
|---|---|
| **Entry** | Investigation job created against a specific case version; case version recorded on the run |
| **Exit** | Agent returns a proposal, or the run ends in a safe non-resolve path |
| **Authorized actor** | `SYSTEM` (investigation worker), started by `OPERATOR` |
| **Allowed** | → `ACTION_PROPOSED` (schema-valid proposal, verifier gate passed); → `REQUESTING_EVIDENCE`; → `ESCALATED` |
| **Invalid** | → `CLOSED`, `APPROVED`, `STAGED`, `APPLIED` |
| **Audit** | `investigation_started`, `tool_call_completed` (per call), `disposition_proposed` |
| **Idempotency** | One active run per case. A retry reuses the run ID and must not duplicate tool-call or evidence rows |
| **Failure** | Model timeout, schema-invalid output, tool exhaustion, budget exhaustion or policy violation → `ESCALATED` with a failure code. **Never `ACTION_PROPOSED`, never `RESOLVE`** |

---

### `ACTION_PROPOSED`

| Property | Definition |
|---|---|
| **Entry** | A proposal exists **and the terminal verifier gate has run** (D6). The stored `effective_disposition` is the verifier's, not the model's |
| **Exit** | Routed by effective disposition |
| **Authorized actor** | `SYSTEM` |
| **Allowed** | → `APPROVAL_PENDING` (effective `RESOLVE`, eligible); → `REQUESTING_EVIDENCE` (effective `REQUEST_EVIDENCE`); → `ESCALATED` (effective `ESCALATE`, or verifier downgrade); → `INVESTIGATING` (**proposal invalidated by late evidence**) |
| **Invalid** | → `STAGED` (must pass through approval); → `APPROVED`; → `CLOSED`; → `APPLIED` |
| **Audit** | `verification_completed` including every check, the override reason, and both `model_proposal` and `verified_disposition` |
| **Idempotency** | One effective verification result per proposal. **The verifier runs exactly once per proposal** (D6) |
| **Failure** | Verifier cannot complete → effective disposition is **not** `RESOLVE`; case → `ESCALATED` |

> **Resolves A-3.** Routing out of `ACTION_PROPOSED` is decided by the **verified effective disposition**, never by the model's proposal and never by a human guess.

---

### `APPROVAL_PENDING`

| Property | Definition |
|---|---|
| **Entry** | Verified `RESOLVE`, eligible for a human decision; proposal ID and case version pinned |
| **Exit** | Authorized human decision, or invalidation |
| **Authorized actor** | `APPROVER` (decide); `SYSTEM` (invalidate) |
| **Allowed** | → `APPROVED`; → `REJECTED`; → `REQUESTING_EVIDENCE`; → `ESCALATED`; → `INVESTIGATING` (proposal invalidated by late evidence) |
| **Invalid** | → `STAGED` **without approval**; → `APPLIED`; → `CLOSED` |
| **Audit** | `approval_recorded` with actor, decision, reason, and `case_version_at_decision` |
| **Idempotency** | Approval accepts an idempotency key (retention `O5` = 30 days). A repeat returns the original decision and **creates no second staging record** |
| **Failure** | **Stale case version → `CONFLICT`, no transition, no staging.** Both histories preserved (`SECURITY.md` T4) |

---

### `APPROVED`

| Property | Definition |
|---|---|
| **Entry** | Authorized `APPROVER` decision recorded; case version matched at decision time |
| **Exit** | Branches on `recommended_action.type` |
| **Authorized actor** | `SYSTEM` |
| **Allowed** | → `STAGED` (action type `STAGE_LEDGER_ADJUSTMENT` or `DRAFT_EVIDENCE_REQUEST`); → `CLOSED` (action type **`NONE`**, with an `Outcome` written in the same transaction) |
| **Invalid** | → `APPLIED` directly; → `REJECTED`; → `APPROVAL_PENDING` |
| **Audit** | `approval_recorded`, then `staging_created` or `outcome_logged` |
| **Idempotency** | The approval transaction covers version check, authorization, transition, staging (or outcome) and audit **atomically**. A unique constraint on (case, proposal) prevents concurrent double-staging |
| **Failure** | Any failure rolls the whole transaction back. A case is never left `APPROVED` with no staging record and no outcome |

> **Resolves readiness risk A-2.** A verified `RESOLVE` whose recommended action is `NONE` now has an explicit, audited path to closure without fabricating an empty staged action. `APPROVED → CLOSED` still requires an `Outcome` row, so `PRD.md` §21's audit-trail guarantee holds on both branches.

---

### `REJECTED`

| Property | Definition |
|---|---|
| **Entry** | Authorized `APPROVER` rejection with a mandatory reason |
| **Exit** | Operator decides the next step |
| **Authorized actor** | `OPERATOR`, `APPROVER` |
| **Allowed** | → `INVESTIGATING` (re-investigate); → `ESCALATED` |
| **Invalid** | → `APPROVED`, `STAGED`, `APPLIED`, `CLOSED` |
| **Audit** | `approval_recorded` with `decision: REJECTED` and reason |
| **Idempotency** | Repeat rejection returns the original |
| **Failure** | n/a |

> A rejection **never** overwrites the model's original proposal. Original proposal, verifier result, human decision, correction reason and final outcome are all retained separately (`PRD.md` §21).

---

### `REQUESTING_EVIDENCE`

| Property | Definition |
|---|---|
| **Entry** | Verified `REQUEST_EVIDENCE`, or a human requested evidence from `APPROVAL_PENDING` |
| **Exit** | Evidence arrives, or the request expires |
| **Authorized actor** | `OPERATOR`, `SYSTEM` |
| **Allowed** | → `INVESTIGATING` (evidence received; case version incremented); → `ESCALATED` (**request expired after `W8` = 7 days, or operator escalates**) |
| **Invalid** | → `APPROVED`, `STAGED`, `CLOSED`, `RECONCILED` |
| **Audit** | `evidence_requested`, later `evidence_received` or `evidence_request_expired` |
| **Idempotency** | One active evidence request per case; a duplicate request returns the existing one |
| **Failure** | Evidence that never arrives must not strand the case — the expiry path is mandatory, not optional |

> **Resolves A-4(b).** v1.0.0 allowed only `REQUESTING_EVIDENCE → INVESTIGATING`, leaving a case permanently stuck if evidence never came.

---

### `ESCALATED`

| Property | Definition |
|---|---|
| **Entry** | No safe automated path: ambiguity, verifier downgrade, budget exhaustion, model/tool failure, AI disabled, expired evidence request, or explicit human escalation |
| **Exit** | Human reopens it, or resolves it outside the system |
| **Authorized actor** | `OPERATOR`, `APPROVER`, `ADMIN` |
| **Allowed** | → `REOPENED`; → `CLOSED` (resolved externally; `Outcome` required, with reason) |
| **Invalid** | → `APPROVED`, `STAGED`, `APPLIED` directly |
| **Audit** | `case_escalated` with a **concrete** reason code (never a bare "escalated") |
| **Idempotency** | Re-escalating an escalated case is a no-op that still records the actor's intent |
| **Failure** | n/a — this is the designated safe resting state |

**Legal source states for `POST /v1/cases/{id}/escalate`** (resolves A-4(d)): `EXCEPTION`, `INVESTIGATING`, `ACTION_PROPOSED`, `APPROVAL_PENDING`, `REQUESTING_EVIDENCE`, `REJECTED`. From any other state the endpoint returns `INVALID_STATE`.

---

### `STAGED`

| Property | Definition |
|---|---|
| **Entry** | Approval committed and a durable `StagedAction` created **in the same transaction** |
| **Exit** | The bounded internal executor runs |
| **Authorized actor** | `SYSTEM` |
| **Allowed** | → `APPLIED`; → `ESCALATED` (execution failed) |
| **Invalid** | → `CLOSED` directly (must record execution and outcome); → `APPROVED` |
| **Audit** | `staging_created` with action type and payload summary |
| **Idempotency** | Unique constraint: at most one active staged action per (case, proposal). Concurrent approvals cannot both stage |
| **Failure** | Executor failure → `ESCALATED`. **The staged action is never silently retried into a duplicate effect** |

---

### `APPLIED`

| Property | Definition |
|---|---|
| **Entry** | The staged action was applied to the **internal bounded target** |
| **Exit** | Outcome recorded |
| **Authorized actor** | `SYSTEM` |
| **Allowed** | → `OUTCOME_LOGGED` |
| **Invalid** | → `CLOSED` directly; → `STAGED`; → `APPROVED` |
| **Audit** | `staged_action_applied` |
| **Idempotency** | Keyed on staged-action ID. Re-execution is refused, not repeated |
| **Failure** | Failure → `ESCALATED`, staged action marked failed, no partial effect retained |

> ### Safety definition of `APPLIED` — read this before implementing
>
> In the MVP, `APPLIED` means **the staged action was applied to SettlementOps' own internal representation**. It does **not** mean money moved, a payout was issued, a refund was processed, or an external ledger was mutated.
>
> `SAFETY.md` §4, `PRD.md` §6.7 and `APPROVAL_AND_STAGING.md` §2 all prohibit live financial mutation in the MVP. The executor is therefore a **bounded internal adapter** that records the intended effect and marks the action complete. There is no external-system adapter, and none may be added without a `CHANGE_CONTROL.md` record.
>
> **Naming resolved (D4-R1, owner decision 2026-08-31).** This state was called `EXECUTED` in the first v2.0.0 draft. It was renamed to `APPLIED` because "executed" invites a reviewer to ask whether a real financial transaction was executed. `APPLIED` states the actual semantics — the approved staged action was applied *inside the synthetic system* — and removes an avoidable line of attack. This was a naming change only; no behavior changed.

---

### `OUTCOME_LOGGED`

| Property | Definition |
|---|---|
| **Entry** | `Outcome` record written: human result, whether the model was accepted or corrected, correction reason |
| **Exit** | Immediate |
| **Authorized actor** | `SYSTEM`, `OPERATOR` |
| **Allowed** | → `CLOSED` |
| **Invalid** | → `STAGED`, `APPROVED`, `INVESTIGATING` |
| **Audit** | `outcome_logged` |
| **Idempotency** | One outcome per case per lifecycle iteration |
| **Failure** | Outcome write failure blocks closure. **A case never closes without an outcome** |

> `Outcome` **must not** contain the generator's hidden cause. See D5 and `DATA_MODEL.md` — the field is `human_assigned_cause`, populated only by a human.

---

### `CLOSED`

| Property | Definition |
|---|---|
| **Entry** | Reached via `RECONCILED`, `OUTCOME_LOGGED`, `APPROVED` (action `NONE`), or `ESCALATED` (external resolution). **Every path except `RECONCILED` requires an `Outcome` record** |
| **Exit** | Only through a controlled reopen |
| **Authorized actor** | `SYSTEM` |
| **Allowed** | → `REOPENED` (`ADMIN` only) |
| **Invalid** | → `APPROVED`, `STAGED`, `APPLIED`, `INVESTIGATING`, `ACTION_PROPOSED` |
| **Audit** | `case_closed` with the closure path |
| **Idempotency** | Terminal; repeat close is a no-op |
| **Failure** | n/a |

---

### `REOPENED`

| Property | Definition |
|---|---|
| **Entry** | Authorized reopen from `ESCALATED` or `CLOSED`; case version incremented; reason mandatory |
| **Exit** | Investigation resumes |
| **Authorized actor** | `ADMIN` (from `CLOSED`); `OPERATOR` or `APPROVER` (from `ESCALATED`) |
| **Allowed** | → `INVESTIGATING` |
| **Invalid** | → `APPROVED`, `STAGED`, `APPLIED`, `CLOSED` |
| **Audit** | `case_reopened` with actor and reason |
| **Idempotency** | One active reopen per case |
| **Failure** | n/a |

> Reopening **never** deletes or rewrites prior history. Prior proposals, verifications, approvals and outcomes stay intact; the reopened lifecycle appends (`AUDIT_TRAIL.md` §2).

---

## 4. Late-evidence invalidation

`PRD.md` §20 requires the backend to decide what a newly-arrived record does to an in-flight case. v1.0.0 defined no transition for this; v2.0.0 does.

When a new record attaches to a case whose state is `ACTION_PROPOSED` or `APPROVAL_PENDING`, the system classifies it deterministically:

| Classification | Effect |
|---|---|
| Informational only | Attach evidence; **no** state change; case version unchanged |
| Closes the evidence gap | Attach; if state is `REQUESTING_EVIDENCE` → `INVESTIGATING` |
| Changes the candidate explanation | **Invalidate proposal** → `INVESTIGATING`; increment case version |
| Contradicts the proposal | **Invalidate proposal** → `INVESTIGATING`; increment case version; audit the invalidation |

**Invariant:** invalidation increments the case version, so any approval already in flight against the old version fails with `CONFLICT`. This is the mechanism that makes `SECURITY.md` T4 ("stale approval") structurally impossible rather than merely discouraged.

## 5. Global invariants

1. Every transition is server-side and authorization-checked before the domain transition runs.
2. **The AI agent appears in no "Authorized actor" field anywhere in this document.**
3. Every mutable transition increments `case_version`.
4. Every transition writes exactly one immutable audit event.
5. `APPROVED → STAGED` and the `StagedAction` insert are one transaction.
6. `CLOSED` requires an `Outcome`, except via `RECONCILED`.
7. A stale case version fails with `CONFLICT` and changes nothing.
8. Concurrent approvals cannot both stage — enforced by unique constraint, not by application checks alone.
9. A verifier failure or `NOT_RUN` mandatory check can never yield effective `RESOLVE`.
10. Illegal transitions fail **even if a caller manipulates the request payload**.

## 6. Illegal transitions — explicit negative tests required

`TESTING.md` §9 requires a negative test per critical illegal transition. At minimum:

```text
EXCEPTION        -> STAGED
EXCEPTION        -> APPROVED
EXCEPTION        -> CLOSED
INVESTIGATING    -> CLOSED
INVESTIGATING    -> APPROVED
ACTION_PROPOSED  -> STAGED          (approval bypass)
ACTION_PROPOSED  -> APPLIED
APPROVAL_PENDING -> STAGED          (approval bypass)
APPROVAL_PENDING -> APPLIED
APPROVED         -> APPLIED        (staging bypass)
STAGED           -> CLOSED          (outcome bypass)
APPLIED         -> CLOSED          (outcome bypass)
CLOSED           -> APPROVED
CLOSED           -> STAGED
RECONCILED       -> INVESTIGATING   (AI on a clean case)
MATCHING         -> RECONCILED      on matcher failure (fail closed)
any              -> any, driven by a model-supplied state value
```

## 7. Product-label mapping (`PRD.md` §18 → canonical)

Presentation only. The backend never stores these labels.

| `PRD.md` §18 label | Canonical state(s) |
|---|---|
| `NEW` | `RECEIVED`, `NORMALIZED` |
| `MATCHED` | `MATCHING`, `RECONCILED` |
| `EXCEPTION` | `EXCEPTION` |
| `INVESTIGATING` | `INVESTIGATING` |
| `ACTION_PROPOSED` | `ACTION_PROPOSED` |
| `AWAITING_APPROVAL` | `APPROVAL_PENDING` |
| `REQUESTING_EVIDENCE` | `REQUESTING_EVIDENCE` |
| `STAGED` | `STAGED`, `APPLIED`, `OUTCOME_LOGGED` |
| `ESCALATED` | `ESCALATED`, `REJECTED` |
| `CLOSED` | `CLOSED` |
| *(no product label)* | `APPROVED`, `REOPENED` — transient/administrative |

## 8. Audit

Every transition emits an immutable audit event containing previous state, next state, actor type and ID, correlation ID, case version, and — for AI-related transitions — model, prompt and policy versions.
