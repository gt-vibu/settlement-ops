# PHASE_REVIEW.md — SettlementOps

> Earlier phase reviews are preserved below, newest first.

---

# Phase 4-8 - Experiment, generator, agent, evaluation

**Executed:** 2026-09-05
**Scope:** experiment freeze, isolated evaluation database, dataset generator, leakage audit,
Systems A/B/C, typed tools, bounded agent, terminal verifier, approval and staging,
benchmark, documentation.

## Decision

```
PASS on delivery - every phase implemented, gated and measured.
NEGATIVE on the hypothesis - the AI resolution claim is KILLED by its own preregistered
criteria. Reported as measured; nothing was tuned to change it.
```

## The result

| System | primary test ESRR | challenge ESRR | URR |
|---|---:|---:|---:|
| A deterministic | 15.8% | 6.7% | 0.0% |
| B fixed workflow | **51.7%** | **36.7%** | 0.0% |
| C bounded agent | **0.0%** | **0.0%** | 0.0% |

System C proposed zero resolutions across 180 scored cases. The verifier passed 174 of 180
proposals, so the gate was not the constraint - the model chose `REQUEST_EVIDENCE` on 107
cases, 71 of them provably resolvable. Full analysis in `EVALUATION_REPORT.md`.

## Defects found and fixed during the work

1. **Compound cases were not compound.** Each cause rendered a whole lifecycle and the union
   was keyed by record id, so the last injector silently won: `MDR_FEE + TIMING_LAG` came out
   as plain `TIMING_LAG` with the fee records restored. Would have made the hardest stratum
   the easiest. Rewritten as transforms over one lifecycle.
2. **Two novelty strata were unreachable.** `NOVELTY_ALLOCATION_REVIEW.md` §4.2's ordering
   made `NOVEL_COMBINATION` impossible to assign - the first run produced zero. Resolved by
   arity separation (CC-016).
3. **Leakage probes were scored in sample.** A majority-class predictor over 64 cells and 180
   cases memorises; every probe "failed" at 0.44-0.60. Cross-validated (CC-017).
4. **Three real leakage channels**: record count predicted the disposition at 0.84,
   adjustment presence at 0.77, fee-line count was a clean binary for `MDR_FEE`. All fixed in
   the generator, not by moving a threshold.
5. **Tool rejection leaked a valid tool name** - rejecting `drop_tables` replied
   "get_settlement_breakup failed". Caught by a test written for exactly that.
6. **`paymentIdFor` was missing** from the case repository, so nothing could load the unit an
   investigation reasons over.

## Gates

`pnpm verify` PASS - format, lint, typecheck, 243 unit tests, code size, dependency
direction, money safety, secret scan, UI boundary, build.
`pnpm test:integration` 46/46 PASS against real PostgreSQL, including bidirectional proof
that the application credential cannot reach hidden truth.
Frontend typecheck and production build PASS; `next-app/` unchanged except nothing.

---

# Audit read scoping defect

**Executed:** 2026-09-02
**Trigger:** owner review of the exception detail screen — the audit trail showed
`reconciliation exception created / MATCHING → EXCEPTION / actor SYSTEM / version 1`
four times on a single case.

## Decision

```
FIXED - read-path scoping, one file, with a regression test that fails without it
```

## What it actually was

Not duplicate events, and not a broken event model. Four **different cases**, all opened by
one reconciliation run under a single correlation id:

```
9a43e54b  reconciliation_exception_created  baa4db5d-…
f4ecf3d0  reconciliation_exception_created  baa4db5d-…
e43a4797  reconciliation_exception_created  baa4db5d-…
67e81f4a  reconciliation_exception_created  baa4db5d-…   ← the case being viewed
```

`AuditReader.listForCase` matched the case id **OR any event sharing its correlation id**.
The intent was to show the import/run/scenario chain that produced the case. The side effect
was that every sibling case opened by the same run appeared on this case's trail, rendered
identically and with no way to tell whose event it was.

On a financial audit trail that is misattribution, not extra context: three of the four rows
belonged to other cases.

## Fix

`packages/persistence/src/repositories/audit-reader.ts` — the correlation branch now excludes
`reconciliation_case` entities:

```sql
(entity_type = 'reconciliation_case' AND entity_id = $2)
OR (
  entity_type <> 'reconciliation_case'
  AND correlation_id IN (SELECT correlation_id FROM audit_events
                          WHERE merchant_id = $1
                            AND entity_type = 'reconciliation_case'
                            AND entity_id = $2)
)
```

The causal chain is preserved — only sibling cases are dropped. Verified live:

| Case | Before | After |
| --- | --- | --- |
| `67e81f4a` | 6 events, 4 of them creations from 4 different cases | 3 events, all its own: created → investigating → escalated |
| `c64d764a` (scenario-produced) | — | 4 events: `financial_record_ingested` (import), its own creation, `reconciliation_completed` (scenario_instance), `investigation_started` |

No frontend change was made. The defect was in the read path, so hiding it in the UI would
have left the API still reporting another case's history as this case's.

## Test

`tests/integration/audit-scope.test.ts` — one context, two mismatched imports, one run, two
cases under one correlation id. Asserts exactly one own-creation event, zero events belonging
to the sibling, and at least one `import` event still present. **Confirmed to fail against the
pre-fix query** (`expected true to be false`) before being accepted.

## Gates

`pnpm verify` PASS (format, lint, typecheck, unit, size, deps, money, secrets, UI boundary,
build). `pnpm test:integration` 41/41 PASS against real PostgreSQL.

---

# Phase 3 - Scenario engine and exception workflow

**Executed:** 2026-09-01
**Scope:** the 12 items directed by the owner.
**Excluded as directed:** LLM/AI agent, prompts, agent tools, dynamic reasoning,
evaluation treatment, frontend/UI. **None were implemented.** No Next.js file was touched.

## Decision

```
PASS - all gates executed and green against real PostgreSQL
```

---

## The rule this phase was really about

`SCENARIO_ENGINE.md` says a scenario must use the same pipeline as batch evaluation.
`instantiateScenario` therefore generates records and calls **`submitImport` and
`runReconciliation` - the identical functions the batch path uses.** There is no
scenario-specific matcher, no `isDemo` branch below the scenario package, and no way for
a scenario to write a case state directly.

The consequence is deliberate and load-bearing: **a scenario can fail to produce the
exception it was designed for.** It reports `cases_created: 0` rather than forcing the
intended outcome. That is what makes a scenario a real test of the matcher instead of an
animation - and it is exactly what caught the first bug below.

## Changes by scope item

| # | Item | Where |
|---|---|---|
| 1 | Persistent scenario instantiation | `packages/scenario/src/instantiate.ts`, `scenario_instances` table |
| 2 | Payment-to-settlement lifecycle records | `packages/scenario/src/generator.ts` - 6 scenarios, full lifecycle each |
| 3 | Scenario defect injection | Deterministic, seeded, expressed as *which records exist* |
| 4 | Deterministic reconciliation invocation | Shared `runReconciliation`, no special path |
| 5 | Persistent exception creation | Ordinary residual-case path from Phase 2 |
| 6 | Case prioritization data | `priority` band by discrepancy magnitude; queue aid only |
| 7 | Investigation lifecycle / transitions | `packages/workflow`, `investigations` table |
| 8 | Scenario replay | Same seed produces a new isolated instance, new correlation id |
| 9 | Same pipeline, interactive and batch | Enforced structurally; see above |
| 10 | Idempotency and duplicate protection | Three database-enforced guarantees |
| 11 | Audit events | Every transition and instantiation |
| 12 | API contracts | 8 new endpoints |

### Investigation lifecycle - without the agent

Phase 3 builds the durable lifecycle only: a run is recorded, the case transitions, and
the run terminates. No model is called, no prompt exists, no tool is registered.

With the AI kill switch **off**, a started investigation terminates as
`FAILED / MODEL_DISABLED` and the case escalates. That is what `SAFETY.md` section 7
requires - residuals route to safe deterministic handling - and **nothing is fabricated
to fill the gap.** With the switch on, the run stays `RUNNING` rather than pretending to
have completed; Phase 7 dispatches the agent there.

---

## Three bugs found - each by a different kind of test

### 1. The baseline accepted an impossible explanation (found by a scenario)

`misleading-adjustment` produced **zero** cases. An adjustment whose amount matched the
discrepancy exactly was accepted as an explanation - even though it was dated a **month
after** the settlement it purported to explain. The matcher checked the arithmetic and
never checked whether the relationship was possible.

Fixed by adding `checkAdjustmentTiming`: an adjustment falling outside every settlement
window cannot explain that settlement. **Amount agreement is not evidence when the
lifecycle makes the relationship impossible.**

This *strengthened* the baseline, which is the only permitted direction
(`BASELINES.md`, `VALIDATION_EXPERIMENT.md` kill criterion 6).

### 2. Role hierarchy was not modelled (found by an integration test)

An `APPROVER` was refused a transition permitting `OPERATOR`. `AUTHORIZATION_MODEL.md`
section 4 defines the roles as cumulative, but `isActorPermitted` did exact membership.

Fixed with an explicit hierarchy - and the important half is what it does **not** do:
`SYSTEM` sits outside it. No human, **not even ADMIN**, can perform a SYSTEM-only
transition such as `APPROVED -> STAGED`. That is what keeps staging machine-driven rather
than something a sufficiently privileged human can reach directly.

### 3. The AI kill switch could not be turned off (found by running the live API)

`AI_INVESTIGATION_ENABLED=false` produced `ai_enabled: true`.

`z.coerce.boolean()` applies JavaScript truthiness, so the **string** `"false"` coerces to
`true`. The safety flag was un-disableable, and `DEMO_SCENARIOS_ENABLED` had the same
defect - meaning demo routes could be live while an operator believed they were off.

Fixed with a parser that reads the text and **rejects an ambiguous value rather than
guessing**. Six regression tests added. Verified live: the switch now escalates with
`MODEL_DISABLED`.

Neither unit nor integration tests caught this, because both construct config objects
directly. It took a real process with a real environment variable - the same lesson as
the Phase 2 Fastify UUID bug.

---

## Verification results

| Gate | Result |
|---|---|
| `pnpm verify` | **PASS** |
| `test:unit` | **203 tests, 15 files** |
| `test:integration` (real PostgreSQL) | **40 tests, 2 files** |
| `pnpm audit --audit-level=high` | **No known vulnerabilities** |
| `pnpm build` | PASS |
| `check:size` | PASS - 102 files, 0 over 350 |
| `check:deps` / `check:money` / `check:secrets` / `check:ui` | PASS |
| Fresh-database migration | **PASS - 7 migrations, 25 tables from empty** |
| Audit immutability on the fresh DB | `UPDATE/DELETE = false/false` |

### The tests the owner asked for

| Requested | Result |
|---|---|
| Duplicate scenario creation | Replayed key returns the same instance; exactly 1 row, 1 case |
| Replay | Same seed produces a new isolated instance; original history untouched |
| Tenant isolation | Merchant B sees neither scenario nor case, even holding A's exact id |
| Invalid state transitions | `EXCEPTION -> STAGED` refused for `ADMIN`; nothing changes |
| Concurrent scenario execution | 3 parallel instantiations produce exactly 1 instance |
| Failure recovery | Failed scenario marked `FAILED` with a code; no partial state |
| API against real PostgreSQL | 403 / 409 / 400 / 404 all verified live |

### Live API verification

| Request | Result |
|---|---|
| `GET /v1/demo/scenarios` | Catalog with **no expected cause** |
| `POST .../instantiate` as `demo-operator` | **403** - ADMIN required |
| `POST .../instantiate` as `demo-admin` | 201, `cases_created: 1` |
| Same idempotency key again | 200, `replayed: true`, same id |
| Investigation with kill switch off | `ESCALATED`, `FAILED / MODEL_DISABLED` |
| Escalate with a stale `case_version` | **409** |
| Escalate with no reason | **400** |
| Case fetch across tenants | **404** |

---

## Leakage control

A scenario controls defect injection but must not hand the answer to the system under
test. `expected_cause` is written to `scenario_instances` and **never selected by any
read** - not in the case projection, not in the scenario projection, not in an audit
payload. Four tests assert this, including one that greps the serialized audit trail.

The generator emits **ordinary import records**: a test asserts no record carries
`scenario_id`, `expected_cause`, `defect` or `cause`. Downstream, a scenario record is
indistinguishable from a real one.

---

## Risks

### High

**H3-1 - `EXPERIMENT_CONSTANTS.md` sections 1-4 still `PROPOSED`.** Unchanged from Phase 2,
and now more load-bearing: the new `checkAdjustmentTiming` uses
`TIMING_LAG_TOLERANCE_HOURS`. Approving sections 1-4 remains the next gating decision
before the baseline can be frozen.

### Medium

**H3-2 - The human evidence-request path is unreachable until Phase 7.**
`REQUESTING_EVIDENCE` is reachable only from `INVESTIGATING` (SYSTEM-only),
`ACTION_PROPOSED` or `APPROVAL_PENDING` - and both human-reachable sources require a
verified proposal. The use case and endpoint are implemented and correct, but cannot be
exercised end to end yet. The test asserts the **refusal** from `EXCEPTION` rather than
bending the locked state machine to make a path exist.

**H3-3 - Worker job handlers still not wired.** `job-runner.ts` provides claiming,
heartbeat, retry and reclaim; scenario and reconciliation still run synchronously in the
request. Fine at these volumes; the async path remains unexercised.

**H3-4 - Docker instability.** The daemon stopped twice more this phase. All results
above are real, but reproducing them depends on Docker staying up.

### Low

**H3-5 - Four files in the 250-350 review band** (`checks.ts` 254, `record-writer.ts` 321,
`generator.ts` 282, `scenario-routes.ts` 326). Each reviewed: all are
single-responsibility dispatch or route tables where splitting adds indirection without
improving reviewability. None exceeds 350.

---

## Model provider recorded (not implemented)

The owner selected **Ollama (local inference)** - recorded as `CHANGE_CONTROL.md` CC-010,
closing Q5. No agent code was written; implementation is Phase 7.

Two consequences are documented in `MODEL_POLICY.md` Part II because they affect
evaluation validity, not just plumbing:

1. **Ollama tags are mutable.** The run manifest must pin the model **digest**, not the
   tag. A run with an unknown digest is not reproducible and cannot be reported as a
   preregistered result.
2. **Local models are materially weaker** at strict structured output and tool selection.
   If the AI treatment misses `ESRR_MIN_IMPROVEMENT`, the report must distinguish *the
   approach did not add value* from *this model could not execute the approach.*
   Reporting the latter as the former would be an overclaim.

---

## Evidence

```bash
pnpm verify                 # format, lint, types, 203 tests, 5 gates, build
pnpm test:integration       # 40 tests against real PostgreSQL
pnpm audit --audit-level=high
pnpm db:migrate             # 7 migrations, 25 tables on a fresh database
```

| Metric | Phase 2 | Phase 3 |
|---|---|---|
| Unit tests | 170 | **203** |
| Integration tests | 14 | **40** |
| Migrations | 6 | **7** |
| Tables | 22 | **25** |
| Files over 350 lines | 0 | **0** |
| Next.js files modified | 0 | **0** |

---

## Next

**Stopping here as instructed. Not proceeding to Phase 4 automatically.**

Open decisions:

1. **Approve `EXPERIMENT_CONSTANTS.md` sections 1-4** - gates the Phase 4 baseline freeze.
2. Confirm Phase 4 scope (baseline freeze + evaluation harness) or Phase 7 (agent).

---


---

# Phase 2 — Ingestion, normalization, deterministic reconciliation baseline

**Executed:** 2026-09-01
**Scope:** the 12 items directed by the owner.
**Excluded as directed:** AI agent, LLM, prompts, agent tools, dynamic reasoning,
evaluation treatment, frontend/UI. **None of these were implemented.**

## Decision

```
PASS — all gates executed and green, including against a real PostgreSQL instance
```

Every gate the owner listed was run. Unlike Phase 1, nothing is deferred: the database
was available, so the schema is now proven rather than merely written.

---

## Precondition check (as instructed)

The owner required verifying PostgreSQL was actually running before implementation, and
stopping rather than pretending otherwise.

Docker's daemon was **down** at the start of this phase. I started Docker Desktop, but
port `5433` was already taken by another project's container
(`leaddesk-mini-postgres-1`), so the compose port was moved to **`5434`** across
`docker-compose.yml`, `.env.example` and the CI workflow. PostgreSQL 16 then came up
healthy and all work below ran against it.

> **Environment instability worth recording:** the Docker daemon stopped **twice** more
> mid-phase and had to be restarted. This is a local-machine issue, not a code issue, but
> it means the ability to run integration tests here is not reliable. The suite is written
> to **skip rather than falsely pass** when no database is reachable — that behaviour was
> observed and confirmed during this phase, which is exactly when it matters.

---

## Changes by scope item

### 1–3. Ingestion contracts, input validation, normalization

`packages/application/src/ingestion/`

- **`contracts.ts`** — Zod schemas for all ten record kinds as a discriminated union.
  Imported data is treated as hostile (`SECURITY.md` §14): strict shapes, bounded string
  lengths, `MAX_IMPORT_RECORDS = 10_000`, and money accepted **only** as a safe integer
  with an explicit 3-character currency. A decimal amount is rejected at the boundary.
- **`normalizer.ts`** — the single place a validated DTO becomes a domain record. The
  merchant scope comes from `RequestContext`, **never from the payload**, so a crafted
  field cannot write into another tenant.

Validation is per-record: one malformed row in a 10,000-row batch does not discard the
other 9,999, but every rejection is counted and returned rather than silently dropped.

### 4. Canonical financial records

`packages/domain/src/records/financial-records.ts` — ten record types with every
amount-bearing field typed as `Money` (never a bare number) and every record carrying a
`MerchantScope` and `SourceLineage`.

### 5. Settlement/payment lifecycle persistence

`packages/persistence/src/repositories/`

| File | Responsibility |
|---|---|
| `record-writer.ts` | Per-kind inserts in dependency order, `ON CONFLICT DO NOTHING` |
| `unit-loader.ts` | Assembles a `ReconciliationUnit`; **every query filters on `merchant_id`** |
| `import-repository.ts` | Import lifecycle + idempotent creation |
| `run-repository.ts` | Reconciliation run lifecycle |
| `case-repository.ts` | Residual case creation + tenant-scoped queries |
| `audit-writer.ts` | Append-only; **no update or delete method exists** |

Migration **`0006_ingestion_and_runs.sql`**: `imports`, `reconciliation_runs`,
`case_source_records`, case↔run↔payment linkage, `import_id` lineage on all ten record
tables, and source-uniqueness constraints on the five tables that lacked them.

### 6. Deterministic reconciliation baseline

`packages/domain/src/reconciliation/` — the centre of this phase.

**Baseline integrity.** It was written *before* any agent exists and uses every
deterministic signal in the domain model. `BASELINES.md` requires it not be weak, and
`VALIDATION_EXPERIMENT.md` kill criterion 6 discards the AI if rules match it. Nine
checks run per unit:

| Check | Catches |
|---|---|
| `currency_consistency` | mixed currencies in one unit |
| `lifecycle_consistency` | capture before authorization, refunds exceeding the payment |
| `duplicate_detection` | exact and near-duplicate source records |
| `fee_matches_schedule` | missing fee record, fee disagreeing with the effective schedule |
| `settlement_present` | no settlement line references the payment |
| `amount_conservation` | expected net vs. actually settled, **summed across split legs** |
| `settlement_timing` | settlement outside the T+2 window |
| `refund_netting_window` | refund settled beyond the permitted cycles |
| `bank_credit` | missing credit, amount mismatch, credit outside the expected lag |

**It closes hard cases, not just easy ones** — a split settlement across two legs
reconciles when the legs conserve value (a naive one-to-one matcher fails there), and a
refund netted inside the window reconciles.

**It fails closed.** Any failed check produces an `EXCEPTION`. An incorrectly closed
financial record is worse than one more item in the operator's queue.

**It emits reason codes, never cause codes.** A test asserts no verdict ever contains a
value from the closed cause taxonomy — conflating the two would make the benchmark
measure the generator's own labelling instead of reasoning.

**No AI, no model, no network, no clock of its own.** `reconcileUnit` is pure, so the
future verifier can reuse the identical arithmetic.

### 7. Duplicate detection

`duplicate-detection.ts` — exact (merchant, source system, source record id) and near
(same payment/amount within 60s, the shape of a redelivered webhook). Enforced **at the
database** as well, because two concurrent imports would both pass an in-memory check.

### 8. Residual exception creation

`runReconciliation` creates a durable `EXCEPTION` case with discrepancy, reason codes,
the full check trace, evidence record ids, and `policy_version` — plus an immutable audit
event. A reconciled payment **never becomes a case**.

### 9. Idempotency

Three independent guarantees, all enforced by the **database**:

| Guarantee | Mechanism |
|---|---|
| Replayed import key returns the original | `imports_idempotency_unique` |
| Re-run cannot double-create a case | partial unique index on (run, payment) |
| Redelivered records are not double-counted | source-uniqueness per table |

### 10. API contracts

`apps/api/src/http/v1-routes.ts`: `POST/GET /v1/imports`, `POST/GET
/v1/reconciliation-runs`, `GET /v1/cases`, `GET /v1/cases/:id`,
`GET /v1/operations/summary`. `Idempotency-Key` is **required** on import. A resource in
another tenant returns **`404`**, not `403`.

### 11. Worker jobs

`apps/worker/src/jobs/job-runner.ts` — durable claiming via `FOR UPDATE SKIP LOCKED`,
heartbeat, bounded retries, and reclaim of jobs abandoned by a dead worker. State lives
in the `jobs` table, so a restart loses nothing. No Redis, no broker.

### 12. Automated tests

170 unit + 14 integration.

---

## Verification results

### Full pipeline

```
pnpm verify  →  PASS (exit 0)
```

| Gate | Result |
|---|---|
| `format:check` | PASS |
| `lint` | PASS |
| `typecheck` | PASS |
| `test:unit` | **PASS — 170 tests, 14 files** |
| `check:size` | PASS — 92 files, 1 in the 250–350 review band |
| `check:deps` | PASS |
| `check:money` | PASS |
| `check:secrets` | PASS — 98 files |
| `check:ui` | PASS |
| `build` | PASS |
| `pnpm audit --audit-level=high` | **PASS — no known vulnerabilities** |

### Database (real PostgreSQL 16, not a fake)

```
pnpm test:integration  →  14 passed
```

| Test | Proves |
|---|---|
| Clean batch → reconciled, no case | The baseline closes the normal path without AI |
| Broken settlement → durable case | Residual creation, exact `29500` discrepancy preserved as an integer string |
| Fresh connection still sees the case | State survives process restart |
| Import replay | Second submit returns the original; exactly 1 import row |
| Re-run reconciliation | Zero (run, payment) duplicates |
| Redelivered records | 0 accepted, 6 duplicates |
| **Merchant B cannot list or fetch merchant A's cases — even holding A's exact case id** | Tenant isolation |
| **`UPDATE`/`DELETE` on `audit_events` rejected with "permission denied"** | D5 audit immutability at the database |
| Audit event per residual case | Auditability |
| 4 validation tests | Malformed batch, fractional money, empty batch, unsupported currency |

### Fresh-database migration test

```
DROP DATABASE → CREATE DATABASE → all 6 migrations apply cleanly
22 tables created
audit_events UPDATE/DELETE for settlementops_app = false/false
```

### Live API smoke test (real server, real database)

| Request | Result |
|---|---|
| `GET /health` | `{"status":"ok"}` |
| `GET /v1/whoami` with no credential | **401** |
| `GET /v1/cases` as `demo-operator` | `{"items":[],...}` |
| **`GET /v1/cases` with a tenant header for a merchant the user does not belong to** | **403** |
| `POST /v1/imports` without `Idempotency-Key` | **400** |

The 403 confirms decision **D3-R1** holds end to end against a real database, not just
in unit tests.

---

## Bugs found and fixed during this phase

**Partial-index `ON CONFLICT` (found by integration tests, not by review).**
`ON CONFLICT (reconciliation_run_id, payment_id) DO NOTHING` failed at runtime with
*"there is no unique or exclusion constraint matching the ON CONFLICT specification"* —
PostgreSQL cannot infer a **partial** unique index unless the conflict target repeats the
index predicate. Five integration tests failed; the fix was to add
`WHERE reconciliation_run_id IS NOT NULL AND payment_id IS NOT NULL` to the conflict
target.

This is exactly the class of defect an in-memory test double would have hidden, and it
sat on the case-creation idempotency path — the guarantee that stops a retried job
double-creating a financial case. Worth stating plainly: **unit tests passed while this
bug was live.**

---

## Architecture checks

| Rule | Status |
|---|---|
| `packages/domain` has zero runtime dependencies | PASS — Zod stops at the application layer |
| Domain imports no HTTP framework, driver or LLM SDK | PASS (CI-enforced) |
| Application depends on ports, not on `pg`/Drizzle | PASS |
| Every merchant-owned query filters on `merchant_id` | PASS |
| One canonical financial calculation | PASS — `AmountBreakdown` is the only shape |
| No `isDemo` branch in domain/application | PASS — none exists |
| Nothing imports `apps/web` or `next-app` | PASS |

**Code-size review (250–350 band).** `record-writer.ts` is 321 lines. Reviewed and
accepted: it is a single responsibility (writing records) expressed as a per-kind
dispatch table. Splitting it would add indirection without improving reviewability. No
file exceeds 350; the matcher test suite was **split** rather than granted an exception
when formatting pushed it to 355.

---

## Risks

### Critical
None.

### High

**H2-1 — `EXPERIMENT_CONSTANTS.md` is still `PROPOSED` except X1.** The baseline now
*depends* on the proposed tolerances, windows and fee rates. They live in
`packages/domain/src/policy/` under `POLICY_VERSION = '1.0.0-proposed'`, are covered by
tests, and every case row records the policy version that produced it — so a later change
is greppable and its blast radius is visible. **Dataset generation remains blocked**, and
`BASELINES.md` requires freezing the baseline before the benchmark is scored. Approving
sections 1–4 of the constants file is the next gating decision.

### Medium

**H2-2 — Docker instability on this machine.** The daemon stopped twice mid-phase. All
database results above are real, but reproducing them depends on Docker staying up.

**H2-3 — Worker job handlers not yet wired.** `job-runner.ts` provides claiming,
heartbeat, retry and reclaim, and is tested by construction, but no job *type* is
registered yet: reconciliation currently runs synchronously in the API request. Fine at
Phase 2 volumes, and the boundary is ready — but the async path is not exercised.

**H2-4 — Adjustments are linked only through settlement lines.** `unit-loader` reaches
adjustments via `settlement_lines`, so an adjustment attached to a settlement with no
line for the payment will not load. Correct for the modelled scenarios; will need
revisiting when `ADJUSTMENT` cases are generated.

### Low

**H2-5 — `settlement_batches` is created but unused.** Ingestion accepts a batch
reference but does not yet populate the table.

---

## Evidence

```bash
pnpm verify                 # format, lint, types, 170 tests, 5 policy gates, build
pnpm test:integration       # 14 tests against real PostgreSQL
pnpm audit --audit-level=high   # No known vulnerabilities found
pnpm db:up && pnpm db:migrate   # 6 migrations, fresh database
```

| Metric | Value |
|---|---|
| Source lines | 5,217 |
| Test lines | 1,921 |
| SQL (migrations) | 438 |
| Unit tests | **170** |
| Integration tests | **14** |
| Files over 350 lines | **0** |
| Files under `apps/web` | 2 (unchanged) |
| Files under `next-app/` | **0 modified** |

---

## Not implemented (as directed)

AI agent · LLM · prompts · agent tools · dynamic reasoning · evaluation treatment ·
dataset generation · frontend/UI. No file in `next-app/` or `apps/web/` was created or
modified in this phase.

---

## Next

**Do not proceed to Phase 3 automatically** (as instructed).

Two decisions are open:

1. **Approve `EXPERIMENT_CONSTANTS.md` §1–§4** (fee rates, tolerances, timing windows) so
   the baseline can be frozen. This gates Phase 4 and Phase 11.
2. **The frontend.** The owner has asked for UI work next; the plan is in
   `UI_COMPONENT_PLAN.md` with six decisions pending (palette, status colours, radius,
   density, two dependencies, Skiper component selection).

---
---

# Phase 1 — Monorepo bootstrap, domain foundation, security context, state machine, CI gates

**Executed:** 2026-08-31 / 2026-09-01 · **Decision: PASS**

Phase 1 established the monorepo (pnpm workspaces, strict TypeScript, ESLint/Prettier/
Vitest), `apps/{api,worker,web}` with `apps/web` as a read-only user-owned placeholder,
eleven packages, PostgreSQL configuration with fail-fast D3/D5 startup assertions, five
migrations, the canonical domain types (`bigint` money, `AmountBreakdown`, lineage,
`MerchantScope`), the `RequestContext`/demo auth adapter implementing D3-R1, the
17-state machine as a data table, 132 tests, and five custom CI gates — each
**negative-tested** to confirm it actually fails on a real violation.

Two dependency vulnerabilities were found and fixed: `drizzle-orm` HIGH (SQL injection
via improperly escaped identifiers, a runtime dependency) and `vitest` CRITICAL.

**Two items were NOT VERIFIED at the time** because the Docker daemon was unavailable:
the fresh-database migration smoke test, and database-level audit immutability.

> **Both are now closed in Phase 2.** All six migrations apply cleanly to a freshly
> created database (22 tables), and `UPDATE`/`DELETE` on `audit_events` under the
> application role is rejected with "permission denied" — verified by integration test
> and by direct `has_table_privilege` inspection.

Also deferred in Phase 1 and still open: TypeScript project references (boundaries are
enforced by `scripts/check-deps.ts` instead, which is negative-tested).
