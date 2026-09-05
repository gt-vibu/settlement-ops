# Change Control

## Categories requiring review

- product scope;
- AI responsibility;
- cause taxonomy;
- disposition schema;
- financial invariants;
- state machine;
- evaluation methodology;
- security boundary;
- architecture boundary;
- external integration.

## Change record format

```text
Change ID:
Date:
Author:
Affected documents:
Current behavior:
Proposed change:
Reason:
Risk:
Evaluation impact:
Security impact:
Decision:
Approved by:
```

## Rule

Do not silently alter benchmark definitions or business semantics to accommodate an implementation shortcut.

---

# Change Records

## CC-001 — Technology stack
**Date:** 2026-08-31 · **Affected:** ARCHITECTURE, REPOSITORY_STRUCTURE, CI_GATES, TESTING, DEPLOYMENT, CONFIGURATION, DEPENDENCY_POLICY, OBSERVABILITY, DEVELOPMENT_WORKFLOW
**Current:** no stack specified. **Proposed:** TypeScript/Node 24/pnpm/Fastify/PostgreSQL/Drizzle/Zod/Vitest/OpenAPI/Pino/OTel/Docker.
**Reason:** unimplementable without it; the "typecheck" CI gate implies a typed stack. **Risk:** low — greenfield, no migration. **Evaluation impact:** none. **Security impact:** none.
**Decision:** APPROVED by owner (readiness D1).

## CC-002 — Monorepo layout and UI boundary
**Affected:** REPOSITORY_STRUCTURE, ARCHITECTURE, FRONTEND_BACKEND_CONTRACT, CI_GATES
**Current:** conceptual layout only; UI location unknown. **Proposed:** `apps/{api,worker,web}` + eleven packages; `apps/web` user-owned, read-only, CI-enforced.
**Risk:** low. **Security impact:** positive — the UI boundary becomes machine-enforced.
**Decision:** APPROVED by owner (readiness D2).

## CC-003 — Demo authentication adapter
**Affected:** AUTHORIZATION_MODEL, SECURITY, API_SPEC, DATA_MODEL, DATABASE_SCHEMA, CONFIGURATION, TESTING
**Current:** "map onto the existing auth system" — none exists. **Proposed:** swappable adapter → server-constructed `RequestContext`; demo adapter non-production only; tenant from stored membership.
**Reason:** tenant isolation is unimplementable without a resolved identity. **Risk:** medium — a demo adapter must never reach production; mitigated by a startup assertion.
**Security impact:** significant and positive; **the refinement that `X-Demo-Tenant-ID` is a selector rather than a grant closes a cross-tenant hole that trusting the header would have opened.**
**Decision:** APPROVED by owner (readiness D3), with the selector refinement noted for confirmation.

## CC-004 — State machine v2.0.0
**Affected:** STATE_MACHINE, API_SPEC, DISPOSITION_SCHEMA, TESTING, OBSERVABILITY, DATABASE_SCHEMA
**Current:** 14 states, several with no legal exit; `RESOLVE` + action `NONE` stranded. **Proposed:** 17 fully specified states; explicit non-staging closure; evidence expiry; late-evidence invalidation.
**Risk:** medium — more states to implement and test. **Evaluation impact:** `RECONCILED` separates clean closures from post-investigation closures, improving metric clarity.
**Security impact:** positive — closes the approval-bypass and stranded-case paths.
**Decision:** APPROVED by owner (readiness D4). **D4-R1 closed 2026-08-31:** state renamed `EXECUTED` → `APPLIED` at owner's direction; naming only, no behavior change.

## CC-005 — Hidden-truth isolation and audit immutability
**Affected:** DATASET, EVALUATION, SECURITY, DATA_MODEL, DATABASE_SCHEMA, CONFIGURATION, DEPLOYMENT, LEAKAGE_AUDIT, TESTING
**Current:** hidden truth had no storage boundary; `Outcome.actual_cause` was a leakage channel; audit immutability was an application promise.
**Proposed:** two databases with separate credentials; two database roles; field renamed to `human_assigned_cause`, human-written only.
**Risk:** low. **Evaluation impact:** decisive — without it the benchmark is not credible. **Security impact:** closes T8 and audit tampering structurally.
**Decision:** APPROVED by owner (readiness D5).

## CC-006 — Terminal verifier gate
**Affected:** TOOLS, AGENT_SPEC, AGENT_POLICY, ARCHITECTURE, DISPOSITION_SCHEMA, EVALUATION, SECURITY, TESTING
**Current:** `validate_candidate_resolution` exposed verifier output to the agent. **Proposed:** tool removed; single terminal pass; result never returned to the model.
**Reason:** a queryable verifier is a feedback oracle. **Risk:** low. **Evaluation impact:** decisive — otherwise ESRR measures checker-satisfaction, not reasoning. **Security impact:** closes new threat T9.
**Decision:** APPROVED by owner (readiness D6).

## CC-007 — Preregistered experiment constants
**Affected:** EXPERIMENT_CONSTANTS (new), DATASET, EVALUATION, LEAKAGE_AUDIT, BASELINES, CONFIGURATION
**Current:** no tolerances, windows, fee/tax rates, dataset sizes, safety ceiling or leakage threshold anywhere in the package. **Proposed:** all enumerated, marked `PROPOSED`.
**Risk:** high if skipped — post-hoc numbers forfeit preregistration. **Evaluation impact:** total.
**Decision:** **PENDING OWNER APPROVAL.** No dataset generated; no scoring run.

---

## CC-008 — UI implementation authorized

```
Change ID:     CC-008
Date:          2026-09-01
Author:        Owner (explicit instruction)
Affected documents:
               AGENTS.md (constraint 1), REPOSITORY_STRUCTURE.md section 3,
               FRONTEND_BACKEND_CONTRACT.md, DECISION_LOG.md 006,
               READINESS_RESOLUTION_REPORT.md D2

Current behavior:
  UI/frontend was out of scope for the coding agent. `AGENTS.md` constraint 1:
  "UI/frontend is untouched unless the user explicitly changes that instruction."
  Decision D2 assigned `apps/web` to the user; Phase 1 and Phase 2 scopes both
  explicitly excluded frontend work. CI gates (`check-ui-boundary.ts`) enforce it.

Proposed change:
  The owner has explicitly authorized UI work, directing the agent to inspect the
  Skiper UI components and produce a UI/component plan, then implement on approval.
  This is the escape hatch AGENTS.md constraint 1 provides for.

Reason:
  Owner instruction, 2026-09-01.

Risk:
  Low to product semantics; none to financial correctness, AI responsibility, the
  state machine, or evaluation methodology. The UI remains a presentation layer:
  it is never a source of tenant authorization, financial truth, or state
  transitions (FRONTEND_BACKEND_CONTRACT.md UI safety contract).

Evaluation impact:
  None. No benchmark, dataset or metric is affected.

Security impact:
  The UI must honour two boundaries that already exist server-side:
    1. `X-Demo-Tenant-ID` is a SELECTOR, not a grant. The tenant switcher lists only
       memberships returned by /v1/whoami; the backend refuses others.
    2. `verified_disposition` is authoritative; `certainty_measure` is diagnostic and
       must never be presented as confidence-in-correctness.
  No server-side control is relaxed. The agent still cannot weaken auth for a demo.

Open items:
  The frontend lives at `next-app/`, not `apps/web/` as D2 specified. The repository
  currently has two UI locations, one empty. Still awaiting an owner decision
  (PHASE_REVIEW.md, "Owner decisions before Phase 2", item 2).

Decision:  APPROVED by owner.
Approved by: Owner, 2026-09-01.
```

---

## CC-009 — UI authorization withdrawn; frontend returns to user ownership

```
Change ID:     CC-009
Date:          2026-09-01
Author:        Owner (explicit instruction)
Affected documents:
               CHANGE_CONTROL.md CC-008 (superseded), AGENTS.md constraint 1,
               REPOSITORY_STRUCTURE.md section 3, UI_COMPONENT_PLAN.md

Current behavior:
  CC-008 authorized UI work. Under it the agent built a functional frontend scaffold
  in next-app/ (app shell, operations overview, exception queue, case detail, audit
  placeholder) wired to the real API.

Proposed change:
  The authorization granted in CC-008 is WITHDRAWN. The frontend returns to user
  ownership. The agent implements backend/API contracts only, and does not modify
  Next.js UI files unless the owner explicitly authorizes it again.

Reason:
  Owner instruction, 2026-09-01: "Do NOT perform additional frontend/UI work.
  The frontend is now user-owned."

Risk:
  None. The scaffold built under CC-008 remains in place and working; it is now the
  owner's to evolve. No backend behavior depends on it.

Security impact:
  None. The UI never held a boundary: tenant scope, roles, financial truth and state
  transitions are all server-owned, and the CI gate scripts/check-ui-boundary.ts
  continues to fail any backend import of next-app/ or apps/web/.

Decision:  APPROVED by owner. CC-008 superseded.
Approved by: Owner, 2026-09-01.
```

---

## CC-010 — Model provider: Ollama (local inference)

```
Change ID:     CC-010
Date:          2026-09-01
Author:        Owner
Affected documents: MODEL_POLICY.md (Part II), EXPERIMENT_CONSTANTS.md Q5,
                    CONFIGURATION.md, DEPENDENCY_POLICY.md, LIMITATIONS.md

Current behavior:  Provider undecided; Q5 open.
Proposed change:   Model inference runs locally via Ollama. The project is not hosted.

Reason:            Owner instruction: no hosting.

Risk:
  Architecture: none. ModelGateway is already provider-neutral and the model SDK is
  confined to packages/agent by a CI-enforced dependency rule.

Evaluation impact:  MATERIAL — this is the part that must not be glossed over.
  1. Ollama tags are mutable, so the run manifest must pin the model DIGEST.
     A run with an unknown digest is not reproducible and cannot be reported as a
     preregistered result.
  2. Local models are materially weaker at strict structured output and tool
     selection. If the AI treatment misses ESRR_MIN_IMPROVEMENT, the report must
     distinguish "the approach did not add value" from "this model could not execute
     the approach". Reporting the latter as the former would be an overclaim.
     A stronger-model reference run is recommended as a diagnostic capability ceiling.

Security impact:   Reduced external exposure - no prompt data leaves the machine, no
                   provider API key to manage. The D5 boundary is unchanged.

Decision:    APPROVED by owner.
Approved by: Owner, 2026-09-01. Implementation deferred to Phase 7 per BUILD_PLAN.md.
```


---

## CC-011 — Experimental redesign: generalisation and evidence-gated abstention

```
Change ID:     CC-011
Date:          2026-09-01
Author:        Owner
Affected documents:
               VALIDATION_EXPERIMENT.md (Part II), EVALUATION.md (Part III),
               DATASET.md (Part III), EXPERIMENTS.md (Part II),
               DEMO_SCENARIOS.md (Part II), PITCH.md (Part II),
               REVIEWER_ATTACKS.md (Part II)

Current behavior:
  Primary hypothesis was an aggregate evidence-supported resolution rate comparison
  between a deterministic baseline and an AI treatment on the baseline residual.

Proposed change:
  Primary hypothesis becomes: on previously UNSEEN combinations of known financial
  causes, a bounded evidence-investigation agent generalises beyond enumerated
  deterministic rules while maintaining safe abstention when evidence is insufficient.

  Adds a third arm: System B, a good-faith expanded deterministic rule system.
  Adds novelty strata, frozen before generation and stored as hidden truth.
  Adds two-sided abstention-quality metrics.
  Adds a stronger-model capability diagnostic.

Reason:
  The aggregate framing was in direct tension with the requirement to build and keep
  strengthening a strong baseline. Phases 2 and 3 strengthened the baseline twice in
  response to counterexamples; each improvement made an aggregate AI win less likely.
  The only reliable route to a headline win would have been to stop improving the
  baseline, which BASELINES.md forbids. The redesign asks a question that a strong
  baseline does not make unanswerable.

Risk:
  LOW to validity, and the direction is favourable. The change makes the hypothesis
  HARDER to satisfy: it introduces a third system built specifically to defeat the AI
  claim, and strata where rules are expected to win.

Evaluation impact:
  MATERIAL but non-invalidating. NO dataset has been generated, NO treatment has been
  run, and NOTHING has been scored. The redesign therefore precedes all evidence and
  invalidates no comparison. Had any result been observed first, this change would have
  required a new experiment version per EVALUATION.md section 19.

Security impact:
  One addition: the novelty label is experimental hidden truth and must never reach a
  visible record, API payload, audit event or tool result. Added to the LEAKAGE_AUDIT.md
  software-level checks.

Decision:    APPROVED by owner.
Approved by: Owner, 2026-09-01. No implementation changed; documentation only.
```

---

## CC-012 — Four-way outcome matrix and derived ambiguity ground truth

```
Change ID:     CC-012
Date:          2026-09-01
Author:        Owner
Affected documents: EVALUATION.md (Part IV), NOVELTY_ALLOCATION_REVIEW.md,
                    MODEL_REPRODUCIBILITY.md

Current behavior:
  CC-011 introduced two abstention metrics (correct abstention, unnecessary escalation)
  alongside ESRR and URR, but did not define their relationship or the ground-truth rule
  for when a case is genuinely ambiguous.

Proposed change:
  1. A four-way outcome matrix: ESRR, URR, correct abstention, unnecessary abstention,
     reported per novelty stratum per system and never collapsed into one number.
  2. Ambiguity ground truth DERIVED by the oracle rather than asserted by the generator:
     a case is ambiguous iff no single cause uniquely satisfies all its required
     deterministic checks over the reachable evidence set.
  3. Ambiguity is reachability-relative and budget-relative; the tool budget is recorded
     in the manifest, and changing it constitutes a new experiment version.

Reason:
  Abstention count alone is meaningless - a system that escalates everything scores
  perfectly on safety and is worthless. Credit for abstention must depend on whether the
  evidence AVAILABLE TO THE SYSTEM could have distinguished the explanations.

Risk:
  LOW. URR keeps its all-cases denominator, so the approved X1 ceiling applies unchanged.
  The three new conditional rates are additive.

Evaluation impact:
  MATERIAL but non-invalidating. No dataset generated, no treatment run, nothing scored.

Security impact:
  None beyond CC-011. Ambiguity labels are hidden truth on the same footing as the gold
  cause and the novelty stratum.

Decision:    APPROVED by owner.
Approved by: Owner, 2026-09-01. Documentation only; no implementation changed.
```


---

## CC-013 — Operations-workspace rule

```
Change ID:     CC-013
Date:          2026-09-01
Author:        Owner
Affected documents: PRODUCT_PRINCIPLES.md (Part II), FRONTEND_BACKEND_CONTRACT.md (Part III)

Current behavior:
  PRD.md section 14 required "meaningful state, user actions, state transitions" but did
  not state a rule a screen could be checked against. The Phase-3 UI scaffold satisfies
  the backend half and none of the interaction half: zero state-mutating calls and zero
  interactive controls across all four screens.

Proposed change:
  Product rule - the primary purpose of every screen is an operational action or
  persistent state, not information display. Every operational surface must offer at
  least one state-mutating action; audit is the single deliberate exception.
  Plus: the AI surfaces only where a decision is genuinely hard.

Reason:
  Owner instruction. Without this rule the product degrades into a report builder with
  buttons - same numbers, but the system is unchanged after use.

Risk:              None to correctness. Product/UX scope only.
Evaluation impact: None.
Security impact:   None. The actions already enforce authorization, case version and
                   legal source state server-side; a UI calling them changes no boundary.

Decision:    APPROVED by owner.
Approved by: Owner, 2026-09-01. Documentation only; no implementation or UI changed.
```

---

## CC-014 — UI implementation re-authorized

```
Change ID:     CC-014
Date:          2026-09-01
Author:        Owner (explicit directive)
Affected documents: CHANGE_CONTROL.md CC-009 (superseded), CC-008, AGENTS.md constraint 1,
                    REPOSITORY_STRUCTURE.md section 3

Current behavior:
  CC-009 withdrew UI authorization and returned the frontend to user ownership. The
  agent implemented backend/API contracts only.

Proposed change:
  UI implementation is re-authorized under a detailed owner directive naming the agent
  as lead frontend engineer. Phase 0 is audit-only: three planning documents, then stop.

Reason:
  Owner directive, 2026-09-01.

Risk:
  LOW. The directive itself forbids the failure modes that matter - no fabricated data,
  no frontend-only state, no authoritative financial calculation in the browser, no
  invented API behavior.

Security impact:
  None. The UI holds no boundary: tenant scope, roles, financial truth and state
  transitions remain server-owned. The frontend calling existing endpoints changes no
  control. scripts/check-ui-boundary.ts continues to forbid any backend import of
  next-app/.

Decision:    APPROVED by owner. Supersedes CC-009.
Approved by: Owner, 2026-09-01. Phase 0 delivered; no UI code written.
```
