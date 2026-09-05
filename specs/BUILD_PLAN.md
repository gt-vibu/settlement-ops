# Build Plan

## Phase 0 — Repository and specification inspection

**Goal:** understand existing repo before changing it.

Outputs:
- `IMPLEMENTATION_READINESS.md`;
- dependency map;
- architecture conflict report;
- UI boundary confirmation.

Gate: no unresolved Critical/High architecture/security contradiction.

## Phase 1 — Domain foundation

Implement money, currency, IDs, source lineage, domain entities and invariants.

Gate: unit tests for money and lineage pass.

## Phase 2 — Persistence

Implement PostgreSQL schema, migrations, repositories and transaction helpers.

Gate: fresh-database migration, repository integration tests, no unscoped tenant query.

## Phase 3 — Ingestion and normalization

Validated typed inputs, normalization, duplicate handling.

Gate: malformed and duplicate inputs handled safely.

## Phase 4 — Deterministic reconciliation

Implement strong baseline and residual exception creation.

Gate: baseline frozen and evaluated on development data.

## Phase 5 — Scenario engine

Implement scenario instantiation through the same domain pipeline.

Gate: scenario creates persistent records and a real case.

## Phase 6 — Agent tool layer

Implement typed read-only tools and audit traces.

Gate: authorization, tenant isolation and schema tests pass.

## Phase 7 — AI investigation

Implement model gateway, prompts, bounded loop, structured proposal.

Gate: agent cannot bypass tools or verifier.

## Phase 8 — Verification

Implement deterministic verifier and override semantics.

Gate: failed check always prevents effective `RESOLVE`.

## Phase 9 — Approval/staging

Implement approval, version checks, staging, outcome and reopening.

Gate: duplicate approval tests and invalid state tests pass.

## Phase 10 — Audit/observability

Implement immutable audit and structured telemetry.

Gate: complete trace for one end-to-end case.

## Phase 11 — Evaluation

Freeze benchmark, run leakage audit, execute baseline/treatment/challenge and statistical analysis.

Gate: no benchmark leakage; metrics reproducible.

## Phase 12 — Production hardening

Run security matrix, code-size policy, lint/typecheck/build, dependency and secret scans.

Gate: no Critical/High unresolved issue.

## UI

No frontend implementation is part of this build plan. UI ownership remains with the user.
