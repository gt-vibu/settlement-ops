# Decision Log

## Decision 001 — Track
Track 4 selected because its public brief aligns with a finance-operations agent loop and measurable synthetic evaluation.

## Decision 002 — Product form
Use a finance operations control center rather than a report viewer. Persistent state is a product requirement.

## Decision 003 — Core intelligence
Focus on residual settlement exception resolution. Do not rebuild generic reconciliation.

## Decision 004 — AI boundary
AI investigates and proposes. Deterministic verification is authoritative.

## Decision 005 — Architecture
Use modular monolith + worker + PostgreSQL for the MVP.

## Decision 006 — UI ownership
UI/UX remains with the user. Coding agent builds backend/system contracts only.

## Decision 007 — Demo architecture
Interactive scenarios must use the same backend pipeline as evaluation.

## Decision 008 — Evaluation
AI contribution is a hypothesis to validate, not a pre-assumed success.

---

## Readiness resolutions (2026-08-31)

## Decision 009 — Technology stack (D1)
TypeScript · Node 24 · pnpm · Fastify · PostgreSQL · Drizzle · Zod · Vitest · OpenAPI · Pino · OTel · Docker. One consistent stack across the monorepo; frameworks confined to the edges.

## Decision 010 — Monorepo and UI ownership (D2)
`apps/api`, `apps/worker`, `apps/web` + eleven packages. **`apps/web` is user-owned and read-only to the coding agent**, enforced by CI rather than convention.

## Decision 011 — Demo authentication adapter (D3)
A swappable `AuthenticationAdapter` produces a server-constructed `RequestContext { userId, tenantId, roles }`. Demo adapter for non-production only. **Tenant scope is always resolved from stored membership; a client-supplied tenant ID is a selector, never a grant.**

## Decision 012 — Complete state machine (D4)
Seventeen states, each with entry/exit conditions, authorized actor, allowed and invalid transitions, audit event, idempotency semantics and failure behavior. Adds `RECONCILED`, `APPLIED`, `OUTCOME_LOGGED`; defines the non-staging closure path, evidence-request expiry, and late-evidence invalidation.

## Decision 013 — Hidden-truth isolation (D5)
Two databases (`settlementops_app` / `settlementops_eval`) with separate credentials; the application runtime never loads the evaluation credential. Two database roles enforce append-only audit. `Outcome.actual_cause` → `human_assigned_cause`, human-written only.

## Decision 014 — Terminal verifier gate (D6)
The verifier runs exactly once and its result never reaches the model. `validate_candidate_resolution` removed from the tool catalog. A downgrade routes to `ESCALATED`; re-investigation requires a human action.

## Decision 015 — Preregistered constants (D7)
All unspecified numerical assumptions enumerated in `EXPERIMENT_CONSTANTS.md`, marked `PROPOSED`. **No dataset generation or scoring until approved.**
