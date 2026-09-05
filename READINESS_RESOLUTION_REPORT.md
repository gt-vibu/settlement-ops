# READINESS_RESOLUTION_REPORT.md — SettlementOps

**Date:** 2026-08-31
**Supersedes:** `IMPLEMENTATION_READINESS.md` §16
**Scope:** documentation only. **No application code has been written. No dataset has been generated. No evaluation has been run. No file under `apps/web` exists or has been touched.**

---

## Summary

| Decision | Category | Status | Blocks |
|---|---|---|---|
| **D1** Technology stack | Architecture | ✅ **RESOLVED** | — |
| **D2** Monorepo + UI boundary | Architecture / UI | ✅ **RESOLVED** | — |
| **D3** Authentication | Security | ✅ **RESOLVED** — 1 refinement to confirm | — |
| **D4** State machine | State machine / financial semantics | ✅ **RESOLVED** — 1 naming item open | — |
| **D5** Hidden-truth isolation | Security / evaluation | ✅ **RESOLVED** | — |
| **D6** Terminal verifier gate | AI responsibility / evaluation | ✅ **RESOLVED** — D6b open | — |
| **D7** Experiment constants | Financial correctness / evaluation | 🟡 **PROPOSED** | Phases 4, 11 |

```
PHASE 1 (monorepo bootstrap → domain):        ✅ READY FOR IMPLEMENTATION
PHASE 2–3 (persistence, auth adapter):        ✅ READY
PHASE 4  (baseline freeze):                   🟡 BLOCKED on D7 approval
PHASE 11 (dataset generation, scoring):       🔴 BLOCKED on D7 approval
```

**Nothing blocks the start of implementation.** D7 blocks only the evaluation track, and its approval is not needed until the deterministic baseline is ready to freeze.

---

## D1 — Technology stack

**Decision (LOCKED).** One consistent TypeScript stack across the monorepo:

TypeScript (strict) · Node.js 24 LTS · pnpm workspaces · Fastify · PostgreSQL · Drizzle · Zod · Vitest · OpenAPI · Pino · OpenTelemetry-compatible instrumentation · Docker/Compose.

Frameworks are confined to the edges: **Fastify only in `apps/api`, Drizzle only in `packages/persistence`, the model SDK only behind `ModelGateway` in `packages/agent`.** `packages/domain` has zero runtime dependencies, enforced by `scripts/check-deps.ts` rather than by review.

**Documents updated:** `REPOSITORY_STRUCTURE.md` (v2.0.0) · `ARCHITECTURE.md` §25 · `CI_GATES.md` · `TESTING.md` §15 · `DEPLOYMENT.md` · `CONFIGURATION.md` · `DEPENDENCY_POLICY.md` · `OBSERVABILITY.md` §6 · `DEVELOPMENT_WORKFLOW.md` · `MIGRATIONS.md` · `DECISION_LOG.md` 009 · `CHANGE_CONTROL.md` CC-001 · `AGENTS.md` 19

**Remaining ambiguity:** none. The command surface (`pnpm verify` and friends) is fixed in `REPOSITORY_STRUCTURE.md` §6 and becomes binding from Phase 1.

**Status:** ✅ RESOLVED

---

## D2 — Monorepo and UI boundary

**Decision (LOCKED).** `apps/{api,worker,web}` plus eleven packages. **`apps/web` exists in the monorepo and is owned by the user.**

The agent may define and publish backend contracts the web app consumes; it may not create, modify, rename, move or delete any file under `apps/web`, and may not add a frontend dependency to any manifest.

Enforced mechanically, not by convention:

1. CI fails if any backend package imports from `apps/web`;
2. CI fails if `apps/web` appears in a backend manifest;
3. CI fails if the implementation pipeline touches a file under `apps/web`;
4. TypeScript project references make the package graph a compile-time constraint.

Dependency direction is one-way: `apps/web` consumes the published OpenAPI contract and never reaches the database.

**Documents updated:** `REPOSITORY_STRUCTURE.md` §2–§5 · `ARCHITECTURE.md` §26 · `FRONTEND_BACKEND_CONTRACT.md` · `SECURITY.md` §21 · `CI_GATES.md` · `DECISION_LOG.md` 010 · `CHANGE_CONTROL.md` CC-002 · `AGENTS.md` 20

**Remaining ambiguity:** none.

**Status:** ✅ RESOLVED

---

## D3 — Authentication and authorization

**Decision (LOCKED).** A swappable `AuthenticationAdapter` resolves a credential into a server-constructed `RequestContext { userId, tenantId, roles, requestId, correlationId }`. The MVP ships a **demo adapter** (seeded identities); a real IdP later implements the same interface with no change below the boundary.

**Documents updated:** `AUTHORIZATION_MODEL.md` (v2.0.0, full rewrite) · `SECURITY.md` §17 · `API_SPEC.md` §10 · `DATA_MODEL.md` §7 (`User`, `UserMerchantRole`) · `DATABASE_SCHEMA.md` · `CONFIGURATION.md` · `TESTING.md` §16 · `DEPLOYMENT.md` · `SCENARIO_ENGINE.md` · `DECISION_LOG.md` 011 · `CHANGE_CONTROL.md` CC-003 · `AGENTS.md` 21

### ⚠ Refinement applied — please confirm (D3-R1)

Your lock named two headers: `X-Demo-User-ID` and `X-Demo-Tenant-ID`. Taken literally — the adapter reading both and populating `RequestContext` from them — **any client could set an arbitrary tenant ID and read another merchant's data.** That is `SECURITY.md` threat T1 and a `PRODUCTION_READINESS.md` hard blocker.

Your own stated rule resolves it ("these should not be trusted directly"; "the frontend must never be the source of tenant authorization"), so I implemented that rule rather than the literal header list:

| Header | Treatment |
|---|---|
| `X-Demo-User-ID` | Identity assertion, resolved against the `users` table. Unknown/inactive ⇒ `401` |
| `X-Demo-Tenant-ID` | **Selector only** — honoured only if the user is already a member of that merchant (checked against `user_merchant_roles`); otherwise `403` |

**Tenant membership is always read from the database, never from the request.** A user with one membership needs no tenant header at all.

Also applied: a resource in another tenant returns **`404`, not `403`**, so the API is not a cross-tenant existence oracle.

This is a security boundary, so I am surfacing it rather than treating it as settled. **Confirm the selector semantics and I will consider D3 fully closed.**

**Status:** ✅ RESOLVED (one refinement awaiting confirmation)

---

## D4 — State machine

**Decision (LOCKED).** `STATE_MACHINE.md` rewritten to v2.0.0: **seventeen states**, each specifying entry conditions, exit conditions, authorized actor, allowed transitions, invalid transitions, audit event, idempotency semantics and failure behavior.

Added per your diagram: `RECONCILED`, `EXECUTED`, `OUTCOME_LOGGED`.

### Readiness gaps closed

| Gap | Resolution |
|---|---|
| A-2 — verified `RESOLVE` with `action = NONE` was stranded | `APPROVAL_PENDING → APPROVED → CLOSED`, with an `Outcome` written in the same transaction. No empty staged action is fabricated |
| A-3 — `REQUEST_EVIDENCE` routing ambiguous | Routing is decided by the **verified effective disposition** at `ACTION_PROPOSED`, never by the model proposal |
| A-4(a) — no exit from `EXCEPTION` with AI disabled | `EXCEPTION → ESCALATED` (kill switch, policy-ineligible, or operator) |
| A-4(b) — `REQUESTING_EVIDENCE` could strand | 7-day expiry → `ESCALATED` |
| A-4(c) — late evidence could not invalidate a proposal | `ACTION_PROPOSED`/`APPROVAL_PENDING → INVESTIGATING`, incrementing the case version so an in-flight approval fails with `CONFLICT` |
| A-4(d) — `POST /escalate` had no legal source states | Six enumerated; all others return `INVALID_STATE` |

**Global invariants locked:** the AI agent appears in **no** "Authorized actor" field anywhere; every transition increments the case version and writes one immutable audit event; `APPROVED → STAGED` plus the staging insert are one transaction; `CLOSED` requires an `Outcome` except via `RECONCILED`.

**Documents updated:** `STATE_MACHINE.md` (v2.0.0, full rewrite) · `API_SPEC.md` §12 · `DISPOSITION_SCHEMA.md` §9 · `DATABASE_SCHEMA.md` · `TESTING.md` §16 · `OBSERVABILITY.md` §7 · `DECISION_LOG.md` 012 · `CHANGE_CONTROL.md` CC-004 · `AGENTS.md` 22

### ⚠ Open item — the name `EXECUTED` (D4-R1)

The semantics I wrote are safe: `EXECUTED` means the staged action was applied to **SettlementOps' own internal representation**. No external system is mutated, there is no external adapter, and none may be added without a change record. `SAFETY.md` §4, `PRD.md` §6.7 and `APPROVAL_AND_STAGING.md` §2 all prohibit live financial mutation in the MVP.

The concern is the **label**, not the behavior. To an outside reviewer — exactly the audience `REVIEWER_ATTACKS.md` anticipates — "EXECUTED" reads as *money moved*. `APPLIED` or `ACTION_APPLIED` carries the same meaning with none of that risk.

This touches financial semantics, so I did not rename it unilaterally. The definition is documented prominently in `STATE_MACHINE.md` §3 either way.

**Status:** ✅ RESOLVED (one naming decision open)

---

## D5 — Hidden-truth isolation

**Decision (LOCKED).** Two databases, two credentials, no path between them.

```text
settlementops_app     ← apps/api, apps/worker, and therefore agent tools
settlementops_eval    ← evaluation harness ONLY (hidden truth, seeds, oracle)
```

The application runtime **never loads the evaluation credential**. Hidden truth is *unreachable*, not merely unread — materially stronger than a code-level promise.

Also locked:

1. **`Outcome.actual_cause` → `human_assigned_cause`**, writable only by a human decision. The generator, harness, oracle and agent may never write it. Permanent regression test required.
2. **Two database roles:** `settlementops_migrator` owns the schema; `settlementops_app` has `UPDATE`/`DELETE` **revoked** on `audit_events`. A test asserts the revocation holds *at the database*, not that no code path attempts an update.
3. `EVAL_DATABASE_URL` must be **absent** from the api/worker config schemas — startup fails if present.
4. The scoring oracle joins visible results to hidden truth inside the evaluation boundary and emits aggregates only; per-case labels never return to the application database.

**Documents updated:** `DATASET.md` §10–§12 · `EVALUATION.md` §24 · `SECURITY.md` §18–§19 · `DATA_MODEL.md` §8 · `DATABASE_SCHEMA.md` · `CONFIGURATION.md` · `DEPLOYMENT.md` · `LEAKAGE_AUDIT.md` §9 · `MIGRATIONS.md` · `TESTING.md` §16 · `ARCHITECTURE.md` §29 · `PRODUCTION_READINESS.md` · `DECISION_LOG.md` 013 · `CHANGE_CONTROL.md` CC-005 · `AGENTS.md` 23

**Remaining ambiguity:** none.

**Status:** ✅ RESOLVED

---

## D6 — Terminal verifier gate

**Decision (LOCKED).** The verifier is a **single-pass terminal gate whose output never reaches the model.**

```text
agent investigates (evidence tools only) → submits final proposal
        → ONE verifier pass → effective disposition → human
                                    ↑
                     result NEVER returned to the model
```

Locked properties:

1. The verifier runs **exactly once** per proposal.
2. Output never appears in a prompt, tool result, or agent context.
3. A downgrade routes to `ESCALATED` — it does **not** re-enter `INVESTIGATING`.
4. Re-investigation requires a **human** action, and the new run does not receive the prior verifier result.
5. **`validate_candidate_resolution` is removed from the tool catalog.**

### Which tool was removed, and why one similar tool stayed

`validate_candidate_resolution` returned "deterministic check results required by the disposition policy" — verifier output. With it present, the model could propose → see which checks failed → adjust → re-check, turning the gate into a feedback oracle. That breaks safety (proposals fitted to the checker rather than to evidence) and invalidates the primary metric (ESRR would measure checker-satisfaction, not reasoning).

`calculate_expected_net_amount` **stays**. It computes arithmetic over records the agent names; it does not adjudicate the agent's proposal. The governing rule: **tools may compute; tools may not judge.**

The tool catalog is now **ten** read-only evidence tools. A useful side effect: `tool_calls_per_case` now counts only evidence retrieval, so it is comparable across the ablations in `EXPERIMENTS.md`.

New threat recorded: **T9 — verifier oracle abuse**, controlled because the verifier is not callable by the agent and returns nothing to it.

**Documents updated:** `TOOLS.md` (v2.0.0, rewrite) · `AGENT_SPEC.md` §10 · `AGENT_POLICY.md` · `ARCHITECTURE.md` §28 · `DISPOSITION_SCHEMA.md` §7 · `EVALUATION.md` §23 · `SECURITY.md` §20 · `TESTING.md` §16 · `OBSERVABILITY.md` §8 · `DECISION_LOG.md` 014 · `CHANGE_CONTROL.md` CC-006 · `AGENTS.md` 24

### ⚠ Open item — D6b, `certainty_measure`

`DISPOSITION_SCHEMA.md` §2 permits `type: "CALIBRATED_PROBABILITY"`. An LLM's self-reported number is not a calibrated probability, and `EVALUATION.md` §8 evaluates calibration as a separate metric — so emitting a raw model number under that label would be an unearned claim in an AI-responsibility-sensitive system.

**Proposed:** v1 accepts only `ORDINAL_BAND` (`LOW`/`MEDIUM`/`HIGH`). `CALIBRATED_PROBABILITY` becomes permissible once a calibration curve is actually fitted and reported. Either way, certainty stays diagnostic and is never sufficient for `RESOLVE`.

Documented as `PROPOSED` in `DISPOSITION_SCHEMA.md` §8 and tracked as Q3 in `EXPERIMENT_CONSTANTS.md` §10. **Not adopted without your approval.**

**Status:** ✅ RESOLVED (D6b open)

---

## D7 — Experiment constants

**Decision (as instructed): nothing invented, nothing generated.** Created `EXPERIMENT_CONSTANTS.md` enumerating every unspecified numerical assumption, each with parameter name, where it is used, proposed value, rationale, class (`INVARIANT` / `EXPERIMENT` / `OPERATIONAL`) and freeze point (`BEFORE-GEN` / `BEFORE-SCORE` / `TUNABLE`).

**Status of the file: `PROPOSED — NOT APPROVED`.**

### What it covers

| Section | Contents |
|---|---|
| §1 Money | Currency scope, minor units, `bigint`, sign convention |
| §2 Fee/tax | Fee rates, GST, rounding modes, **two effective-dated schedule versions** |
| §3 Tolerances | Rounding drift per-record / aggregate / **absolute cap**, exact-match rule |
| §4 Timing | T+2 cycle, cutoff, refund-netting window, timing-lag bound |
| §5 Agent budget | 8 tool calls, 8 steps, temperature 0, loop detection |
| §6 Operational | Page sizes, payload bounds, idempotency retention, job retries |
| §7 Dataset | Split sizes, **merchant-disjoint splits**, cause distribution, seed, period |
| §8 Thresholds | **URR ceiling, ESRR improvement, challenge retention, `AMBIGUOUS` ceiling = 0**, bootstrap config |
| §9 Leakage | Probe thresholds against a stated chance baseline |

### Two things worth your attention

**The fee and tax rates are derived, not invented.** `DEMO_SCENARIOS.md` Scenario 1 (₹10,000 → ₹250 fee, ₹45 tax) and `ARCHITECTURE.md` §16 (`1000000` → `25000` → `4500`) independently imply **2.50% fee and 18% GST**, and they agree. Adopting those keeps the spec's own worked example reproducible bit-for-bit.

**The rounding tolerance has a hard absolute cap (₹1.00).** Without it, a large multi-line settlement accumulates an arbitrarily large "rounding" allowance — which is exactly how a tolerance quietly becomes a laundering channel for real errors.

### Five open questions (§10)

| # | Question | Recommendation |
|---|---|---|
| Q1 | Keep the second fee-schedule version? | Keep — makes `get_fee_schedule` load-bearing |
| Q2 | Is "≤ 200 lines" the right bar for *modest deterministic rule expansion* (kill criterion 6)? | **Least defensible number in the file** — your call |
| Q3 | Restrict `certainty_measure` to `ORDINAL_BAND`? | Yes, until calibration is fitted |
| Q4 | Simulated period spanning the fee-schedule change? | Keep; date demo scenarios away from the boundary |
| Q5 | Model provider/version for the frozen run | Claude (latest Opus-class) behind `ModelGateway`; pin the exact ID at freeze |

**Documents updated:** `EXPERIMENT_CONSTANTS.md` (new) · `DATASET.md` §11–§12 · `EVALUATION.md` §22, §25–§27 · `LEAKAGE_AUDIT.md` §8 · `BASELINES.md` · `CONFIGURATION.md` · `AGENT_SPEC.md` §11 · `DECISION_LOG.md` 015 · `CHANGE_CONTROL.md` CC-007 · `AGENTS.md` 25

**Remaining ambiguity:** every value, by design. Nothing is adopted.

**Status:** 🟡 PROPOSED — blocks Phase 4 baseline freeze and Phase 11

---

## Documentation consistency check

Run against `CONSISTENCY_CHECKLIST.md` plus automated cross-reference sweeps.

| Check | Result |
|---|---|
| PRD ↔ PRODUCT_SCOPE | ✅ unchanged, no conflict introduced |
| PRD ↔ state machine | ✅ `PRD.md` §18 labels mapped in `STATE_MACHINE.md` §7; PRD self-subordinates |
| Architecture ↔ repository structure | ✅ both v2.0.0, same layout and dependency rules |
| System design ↔ architecture | ✅ no contradiction |
| Data model supports every API contract | ✅ `User`/`UserMerchantRole`/`SettlementBatch`/`InvoiceLine`/`evidence_requests` added |
| Every financial amount has a currency | ✅ unchanged invariant |
| Audit fields sufficient | ✅ plus database-level immutability |
| Agent spec ↔ tool catalog | ✅ both v2.0.0; ten tools; `validate_candidate_resolution` referenced **only** as removed |
| Prompts contain no hidden truth | ✅ unchanged; strengthened by D5 |
| Disposition schema ↔ verifier | ✅ terminal single-pass in both |
| Dataset can produce every cause | ✅ distribution in constants §7 |
| Leakage audit runs before freeze | ✅ order fixed in `EVALUATION.md` §26 |
| Baseline/treatment definitions stable | ✅ freeze order fixed in `BASELINES.md` |
| Tool authorization explicit | ✅ `AgentToolContext`, pinned tenant |
| Tenant scope on every merchant-owned operation | ✅ `RequestContext` → `MerchantScope`, CI-checked |
| State transitions server-enforced | ✅ agent in no actor field |
| API supports required product surfaces | ✅ six endpoints added (`API_SPEC.md` §11) |
| UI not implemented by the agent | ✅ zero files under `apps/web` |

### Automated sweeps

| Sweep | Result |
|---|---|
| `validate_candidate_resolution` | 9 files — **all** describing its removal. No file still offers it |
| `actual_cause` | 7 files — **all** rename notes. Canonical field is `human_assigned_cause` |
| `STAGED -> CLOSED` (direct, superseded) | **0** stale occurrences |
| Stale brownfield auth assumption | 1 occurrence, in `AUTHORIZATION_MODEL.md` §0 quoting the old text to explain why it changed |
| New states present | `RECONCILED` 14 · `EXECUTED` 21 · `OUTCOME_LOGGED` 7 |
| `specs/` file count | 71 — matches `SPEC_MANIFEST.json` |

**No unresolved contradiction found.**

---

## UI boundary confirmation

- `apps/web` **does not exist yet** — the repository still contains only `specs/` and the three root reports.
- No frontend file has been created, modified, renamed, moved or deleted.
- No frontend dependency exists in any manifest.
- No visual design, styling, component, layout or frontend-architecture decision has been made.
- The boundary is now specified as **CI-enforced** (`REPOSITORY_STRUCTURE.md` §3, §5), so it will hold mechanically once Phase 1 creates the workspace.

---

## Verdict

```
D1  ✅ RESOLVED
D2  ✅ RESOLVED
D3  ✅ RESOLVED   — confirm D3-R1 (tenant header = selector, not grant)
D4  ✅ RESOLVED   — confirm D4-R1 (rename EXECUTED → APPLIED?)
D5  ✅ RESOLVED
D6  ✅ RESOLVED   — D6b open (certainty_measure → ORDINAL_BAND?)
D7  🟡 PROPOSED   — blocks Phase 4 and Phase 11 only

READY FOR IMPLEMENTATION: PHASES 1–3
BLOCKED: PHASE 4 (baseline freeze) and PHASE 11 (evaluation), pending D7 approval
```

The three open items (D3-R1, D4-R1, D6b) are **confirmations, not blockers** — each has a safe default already written into the documents, and none prevents Phase 1 from starting.

### Recommended implementation order (unchanged from your instruction)

```text
monorepo bootstrap → shared types → domain model → PostgreSQL → migrations
→ RequestContext/auth adapter → state machine → deterministic reconciliation
→ scenario engine → exception cases
```

**The AI comes last.** If the domain model, financial rules, state machine and persistence are wrong, an AI layer on top will conceal those defects rather than reveal them.

---

**No application code has been written. Stopping here.**

---

# Addendum — 2026-08-31 (owner review round 2)

## Items closed

| Item | Resolution |
|---|---|
| **D3-R1** — tenant header as membership-checked selector | ✅ **CONFIRMED by owner** ("Keep that design"). `X-Demo-Tenant-ID` remains a selector validated against `user_merchant_roles`; foreign-tenant resources return `404`. No further action |
| **D4-R1** — the `EXECUTED` label | ✅ **CLOSED.** State renamed **`EXECUTED` → `APPLIED`** across all specs at owner direction. Naming only; no behavior change. Rationale recorded in `STATE_MACHINE.md` §3 and `CHANGE_CONTROL.md` CC-004 |
| **Q2** — "modest deterministic rule expansion" = ≤200 lines | ✅ **CLOSED.** Line count **replaced with a functional parity criterion** (`EXPERIMENT_CONSTANTS.md` §8): the AI claim dies if a rule system of materially comparable complexity and maintainability reaches equivalent performance on **both** frozen splits. Implementation complexity is now tracked separately as an engineering metric, not used as the criterion |
| **D6** — verifier feedback loop | ✅ **CONFIRMED by owner.** Single terminal pass; no result returned to the model |

## D7 revisions applied

**Dataset split — adopted owner's structure** (410 cases, was 1,000):

| Split | Cases | Merchants | Scored? |
|---|---|---|---|
| showcase | 50 | 5 | **Never** |
| development | 120 | 12 | No |
| validation | 60 | 6 | No |
| primary test | 120 | 12 | **Yes** |
| challenge | 60 | 6 | Yes, separately |

Splits remain **merchant-disjoint** — the property that keeps the confidence intervals valid.

**One statistical adjustment forced by the smaller dataset (X7).** Merchant-level bootstrap over 12 units is unstable and yields intervals too wide to support or refute anything. `EVALUATION.md` §10 permits "merchant and/or settlement batch", so the **primary bootstrap unit is now `settlement_batch`** (≈96 units in the primary test split), with merchant-level reported as a sensitivity check. Paired case-level evaluation at 95% CI is unchanged, as you specified.

**Honest consequence, recorded rather than buried:** 120 primary-test cases supports a credible *aggregate* claim but not per-cause point estimates — the smallest cause cells hold 12–16 cases, with CIs spanning roughly ±20 pp. Reporting rules follow from that: aggregate is primary; per-cause figures are descriptive and always published with CIs; the powered subgroup comparison is two-way (`simple` ≈54 vs `hard` ≈66), not seven-way. Raised as Q6 — reaching per-cause precision would need ~280–350 test cases.

## Still open

| # | Item | Status |
|---|---|---|
| **Q7** | **`URR_CEILING` — the safety ceiling** | **Awaiting your sign-off.** You named this as the decision that must be made on safety grounds, not tuned. Proposal: `2.0%` point estimate, 95% CI upper ≤ `5.0%`. Three framings tabled in `EXPERIMENT_CONSTANTS.md` §10 |
| Q1 | Keep the second fee-schedule version? | Recommend keep |
| Q3 | `certainty_measure` → `ORDINAL_BAND` only in v1? | Recommend yes |
| Q4 | Simulated period spanning the schedule change? | Recommend keep |
| Q5 | Model provider/version to pin at freeze | Claude, Opus-class; pin at freeze |
| Q6 | Accept wide per-cause CIs at 120 test cases? | Accept, with the reporting rules above |

**None of these blocks Phase 1.** All six gate the Phase 4 baseline freeze and Phase 11 evaluation only.

## Status

```
D1 ✅  D2 ✅  D3 ✅ (R1 confirmed)  D4 ✅ (R1 closed, EXECUTED→APPLIED)
D5 ✅  D6 ✅ (D6b/Q3 open)  D7 🟡 revised; Q7 awaiting safety sign-off

PHASE 1: PROCEEDING — no D7 dependency
```

Phase 1 will **not** transcribe any `BEFORE-GEN` threshold constant (tolerances, fee rates, timing windows) into code, since those await D7 approval. Only structural invariants — currency scope, minor-unit representation, the sign convention — are implemented, and those are derived from the specification's own worked example rather than chosen.
