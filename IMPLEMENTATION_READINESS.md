# IMPLEMENTATION_READINESS.md — SettlementOps

> **SUPERSEDED IN PART — 2026-08-31.** The owner accepted this report and locked decisions D1–D6; D7 is drafted as `EXPERIMENT_CONSTANTS.md` (status `PROPOSED`). Sections 1–15 remain an accurate record of the Phase 0 inspection. **§16 is superseded by `READINESS_RESOLUTION_REPORT.md`**, which carries the current status of every decision.

**Phase:** 0 — Repository and specification inspection (`BUILD_PLAN.md` Phase 0)
**Date:** 2026-08-31
**Spec package:** `SettlementOps_From_Scratch_Detailed_Spec_v3`, manifest `3.0.0-from-scratch-detailed`, 71 files — all read.
**Working directory:** `D:\rpb`
**Repository structure:** **Monorepo** (confirmed by product owner during Phase 0).
**Readiness verdict:** **BLOCKED** — 6 decisions remain open before Phase 1 code is written. See §16.

---

## 0. Headline finding

`AGENTS.md` §"Repository operating procedure", `REPOSITORY_STRUCTURE.md` and `CODING_AGENT_START_PROMPT.md` Step 0 all instruct the agent to treat the **existing repository as authoritative** and to "not assume the repository is empty, even if the task description sounds greenfield."

I inspected it. It **is** empty.

```
D:\rpb
└── specs\            (71 specification files, extracted from the supplied zip)
```

There is no `package.json`, no workspace file, no lockfile, no `src/`, no `apps/`, no `packages/`, no migrations, no tests, no CI config, no `.env.example`, no `Dockerfile`, no dotfiles of any kind, and **no `.git` directory** (`git status` → `fatal: not a git repository`).

This inverts a core assumption of the specification package. Roughly a dozen instructions ("preserve the existing monorepo conventions", "map roles onto the existing repository's auth system", "run the repository's actual package-manager commands", "do not create a parallel application") have **no existing artifact to preserve or map onto**. Sections 1–8 below are therefore short and negative by fact, not by omission, and §16 lists the decisions this creates.

**Both supplied zips are byte-identical** (82,437 bytes each); `SettlementOps_From_Scratch_Detailed_Spec_v3 (1).zip` was extracted. All 71 files listed in `SPEC_MANIFEST.json` are present and accounted for — the file count matches exactly.

---

## 1. Current repository / monorepo structure

| Property | Finding |
|---|---|
| Version control | **None.** Not a git repository. |
| Package manager | **None declared.** No `package.json`, `pnpm-workspace.yaml`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `pom.xml`. |
| Workspace/monorepo tool | **None.** No pnpm/npm/yarn workspaces, no Nx, Turborepo, Lerna, Bazel. |
| Lockfile | **None.** |
| Root config files | **None.** No `tsconfig.json`, `.editorconfig`, `.gitignore`, `.nvmrc`, `.env.example`. |
| Source directories | **None.** |
| Total non-spec files | **0** |

**Consequence:** there are no "monorepo/workspace conventions" to preserve (`AGENTS.md` constraint 2). The monorepo convention will be *established* in Phase 1 and must then be preserved for the rest of the build. Because `EVALUATION.md` §18 requires every benchmark run to record a **commit hash**, `git init` is a hard prerequisite for Phase 11 and should happen in Phase 1, not later.

### Available local toolchain (verified)

| Tool | Version | Relevance |
|---|---|---|
| Node.js | v24.15.0 | Viable primary runtime |
| npm | 11.12.1 | Available |
| pnpm | 10.19.0 | Available — preferred for monorepo workspaces |
| Docker | 29.2.1 | **Required** — the only available path to PostgreSQL |
| Python | 3.15.0b4 | **Beta release.** Not suitable for a stack that must pass a production-readiness gate. |
| Go / Java / yarn | absent | — |
| `psql` client | absent | Will come from the Postgres container or a client install |

No PostgreSQL server is installed locally. No model-provider API key is present in the environment.

---

## 2. Existing applications and packages

**None.** Zero applications, zero packages, zero services, zero libraries.

Nothing exists for any of the twelve modules named in `ARCHITECTURE.md` §12 (`api`, `application`, `domain`, `persistence`, `agent`, `tools`, `verification`, `workflow`, `audit`, `evaluation`, `scenario`, `observability`/`shared`). All twelve are **missing modules** in `IMPLEMENTATION_READINESS_TEMPLATE.md` terms.

---

## 3. Existing backend architecture

**None.** There is no HTTP server, no worker, no job runner, no domain layer, no repository layer, no model gateway, no verifier, no tool registry.

The architecture is therefore **greenfield against `ARCHITECTURE.md`**, which is favourable in one respect: there is no legacy shape to fight. The prescribed target — **modular monolith + separate worker process + PostgreSQL** (`ARCHITECTURE.md` §1, `DECISION_LOG.md` 005), organised as a monorepo — can be adopted directly, and `ARCHITECTURE.md` §13's dependency rules can be enforced from the first commit rather than retrofitted.

`REPOSITORY_STRUCTURE.md` says "the existing repository is authoritative for actual package/workspace conventions. Do not restructure it merely to match this conceptual layout." With no existing repository, the conceptual layout in that file becomes the default layout by absence of a competing convention.

---

## 4. Existing database setup

**None.**

| Item | Finding |
|---|---|
| Migrations | None. No migration directory or tool. |
| Schema | None. |
| ORM / query builder | None. |
| Connection config | None. No `DATABASE_URL`, no `.env`, no `docker-compose.yml`. |
| Running Postgres instance | None detected; no local `psql` client. |
| Seed data / fixtures | None. |

All 26 logical tables listed in `DATABASE_SCHEMA.md` must be created from scratch. Note that `DATABASE_SCHEMA.md`'s table list omits three things the rest of the spec requires: a **users/actors** table (needed by `Approval.actor_id` and `AUTHORIZATION_MODEL.md` roles), a **settlement_batches** table (`Settlement.settlement_batch_id` in `DATA_MODEL.md` §3 references one), and any **hidden-truth** storage (`DATASET.md` §8). These are covered in §9 and §11.

---

## 5. Existing authentication / authorization

**None.** No auth middleware, no identity provider integration, no session handling, no JWT verification, no role model, no user table, no tenant-scoping helper.

This directly collides with `AUTHORIZATION_MODEL.md`:

> "Roles are examples and must be mapped onto the existing repository's auth system **rather than creating a parallel identity system**."

There is no existing auth system to map onto, so an identity system **must** be created — which is precisely what that sentence tries to prevent. This is a security-boundary decision and is escalated as **Decision D3** in §16 rather than resolved silently.

Everything downstream depends on it: `SECURITY.md` §4 tenant isolation, §11 threats T1/T4/T5, the entire `SECURITY_TEST_MATRIX.md` authentication and authorization blocks, `ARCHITECTURE.md` §15 request-scoped security context, and `AGENT_POLICY.md`'s authorization invariant that tool calls receive request-scoped merchant authorization.

---

## 6. Existing CI / test / lint / typecheck / build configuration

**None of it exists.**

| Gate required by `CI_GATES.md` | Current state |
|---|---|
| formatting | absent |
| lint | absent |
| typecheck | absent |
| unit tests | absent |
| integration tests | absent |
| security tests | absent |
| secret scan | absent |
| dependency audit | absent |
| **code-size policy check** (`CODE_SIZE_POLICY.md`) | absent — needs a custom script; no off-the-shelf gate |
| build | absent |
| repository-structure checks | absent — needs a custom dependency-direction script for `ARCHITECTURE.md` §13 |
| fresh-database migration smoke test (`MIGRATIONS.md`) | absent |

There is no CI provider configured and no git remote. `CODING_AGENT_START_PROMPT.md` says "run the repository's actual package-manager commands. Do not invent commands when scripts already exist." No scripts exist, so the command surface is defined in Phase 1 (§14) and becomes the contract thereafter.

Two of these gates have **no standard implementation and must be hand-written**: the code-size policy check and the dependency-direction check. Both are cheap and both are load-bearing for the architecture claims in `ARCHITECTURE.md` §24, so both are scheduled into Phase 1.

---

## 7. Existing reusable code

**None. Zero lines of reusable application code exist.**

The only reusable assets in the repository are the specification documents themselves. Several are directly machine-actionable and should be treated as source-of-truth inputs rather than prose:

| Spec asset | Reuse as |
|---|---|
| `DISPOSITION_SCHEMA.md` §2 JSON contract | Canonical model-output schema (Zod/JSON-Schema) — Phase 7 |
| `CAUSE_TAXONOMY.md` §2, §5 | Closed cause enum + cause→disposition policy table — Phase 1 (enum), Phase 8 (policy) |
| `STATE_MACHINE.md` §2, §4 | Transition table, driven from data not `if` chains — Phase 1 (table), Phase 9 (enforcement) |
| `ERROR_CONTRACT.md` | Error-code enum + envelope type — Phase 1 |
| `EVENT_MODEL.md` §2 | Audit/event envelope type — Phase 1 |
| `TOOLS.md` | Tool registry manifest and result contract — Phase 6 |
| `PROMPTS.md` §2–§18 | Versioned prompt files, `v1.0.0` — Phase 7 |
| `API_SPEC.md` | Route table and DTO surface — Phase 3 onward |
| `ARCHITECTURE.md` §16 | Canonical `AmountBreakdown` structure — Phase 1 |

Nothing else. No utilities, no test helpers, no fixtures to carry forward.

---

## 8. Code that conflicts with the new specification

**No code conflicts exist, because no code exists.** No file needs to be deleted, rewritten, quarantined or migrated.

The conflicts in this project are **specification-internal and specification-versus-reality**, not code-versus-spec. They are enumerated in §9–§11. Per your instruction and `AGENTS.md` §"Stop conditions", none of the ones touching product semantics, financial correctness, AI responsibility, security, the state machine, evaluation methodology or architecture have been silently resolved.

---

## 9. Security risks

Nothing is exploitable today (there is no running code). These are the risks that will materialise the moment Phase 2+ begins, ranked by the severity they would carry at the `PRODUCTION_READINESS.md` gate.

### CRITICAL

**S-C1 — No identity system exists, and the spec forbids building one.**
`AUTHORIZATION_MODEL.md` says to map roles onto the existing auth system; there is none. Every tenant-isolation control in `SECURITY.md` §4 and every test in `SECURITY_TEST_MATRIX.md` (authentication, authorization) is unimplementable until an authentication mechanism is chosen. `PRODUCTION_READINESS.md` lists "cross-tenant data access" as an outright readiness blocker. **Escalated as Decision D3. Blocks Phase 2 exit.**

**S-C2 — Hidden benchmark truth has no defined storage boundary.**
`DATASET.md` §8 requires hidden truth to "live outside the visible application/evaluation input path"; `SECURITY.md` §11 T8 makes hidden-truth leakage a named threat; `PRODUCTION_READINESS.md` makes "hidden truth accessible to the system under test" a blocker. But `DATABASE_SCHEMA.md` names PostgreSQL as the canonical store and lists **no hidden-truth table**, and no document states whether isolation means a separate database, a separate schema with a separate role, or files outside the DB entirely. Choosing wrongly invalidates the entire benchmark and cannot be fixed after the fact. **Escalated as Decision D5.**

### HIGH

**S-H1 — `Outcome.actual_cause` is a leakage channel into the production data path.**
`DATA_MODEL.md` §3 gives `Outcome` an `actual_cause` field. If the evaluation harness ever writes the generator's hidden cause into this column, the hidden label lands in a table the application, its tools and (transitively) the agent can read — defeating `LEAKAGE_AUDIT.md` §7 ("hidden labels in API payloads"). The field must be constrained to *human-supplied* cause only, with a test asserting the evaluation harness never writes it. Deserves a permanent regression test under `TESTING.md` §14.

**S-H2 — Audit append-only is specified as an application-level promise only.**
`AUDIT_TRAIL.md` §2 says audit events cannot be updated or deleted "through application APIs"; `PRODUCTION_READINESS.md` lists "audit tampering" as a blocker. Application-level discipline does not survive a compromised service account or a careless migration. Enforcement should be at the database: `REVOKE UPDATE, DELETE ON audit_events` from the application role, plus a rule/trigger. This requires a **two-role database setup** (migrator role vs. runtime role), which is a deployment decision, not a code detail — noted in §16 as part of Decision D5.

**S-H3 — Demo/scenario endpoints share the production API surface.**
`AUTHORIZATION_MODEL.md` requires scenario creation to be "permitted only in demo/sandbox contexts... must not provide a path into production data", yet `API_SPEC.md` §7 places `/v1/demo/scenarios/*` on the same versioned API, and `DEPLOYMENT.md`'s checklist forbids "hidden evaluation endpoints exposed publicly". Mitigation (config flag + role check + startup assertion that the flag is off in production) is an ordinary implementation detail I will apply, but the residual risk is worth recording.

**S-H4 — `validate_candidate_resolution` exposes the verifier to the agent.**
`TOOLS.md` offers the agent a tool returning "deterministic check results required by the disposition policy". This lets the model iterate against the verifier until it passes. It is a safety risk (verifier-shaped adversarial search) *and* an evaluation-validity risk. **Escalated as Decision D6** — it is simultaneously an AI-responsibility and an evaluation-methodology question.

### MEDIUM

- **S-M1 — Tenant scoping strategy undecided.** Application-level `merchant_id` filtering (spec's explicit requirement) vs. additionally enabling PostgreSQL RLS as defence-in-depth. Recommendation: repository-enforced scope with a mandatory `AuthContext` parameter that cannot be omitted at the type level, plus a CI grep gate for raw unscoped queries. RLS optional, deferred.
- **S-M2 — CSV/import formula injection.** `SECURITY.md` §11 T6 and §14 require it; no import format is specified anywhere. Handled when Phase 3 defines the import format.
- **S-M3 — Secret handling has no baseline.** No `.env.example`, no `.gitignore` — so the very first accidental `.env` commit is unguarded. Fixed in Phase 1 by creating `.gitignore` and the secret-scan gate *before* any credential exists.
- **S-M4 — No `users`/`actors` table in `DATABASE_SCHEMA.md`** despite `Approval.actor_id` and three roles. Follows from D3.

---

## 10. Architecture risks

**A-1 — HIGH — The build's foundational stack is unspecified.**
No document names a language, runtime, web framework, test runner or migration tool. `CI_GATES.md` requires a "typecheck" gate and `AGENTS.md` requires "typed" everything, which implies a statically typed stack; the repeated use of "package/workspace manager" implies Node/pnpm; but nothing states it. This is an architecture-boundary decision under `AGENTS.md` §"Stop conditions". **Escalated as Decision D1.**

**A-2 — HIGH — `RESOLVE` with `recommended_action.type = "NONE"` has no path through the state machine.**
`DISPOSITION_SCHEMA.md` permits `recommended_action.type = NONE`. `PRD.md` §6.6 requires human approval only "for dispositions that would stage a financial action". But `STATE_MACHINE.md` §2 offers exactly one route out of `APPROVED` — `APPROVED -> STAGED` — and no `ACTION_PROPOSED -> CLOSED` transition at all. So a verified `RESOLVE` that stages nothing is stranded: either it must stage an empty action (semantically wrong, and `STAGED -> CLOSED` "requires an outcome record"), or it needs a transition the state machine does not define. This is simultaneously a state-machine and financial-semantics question. **Escalated as Decision D4.**

**A-3 — HIGH — Post-verification routing for `REQUEST_EVIDENCE` is ambiguous.**
`STATE_MACHINE.md` allows `INVESTIGATING -> REQUESTING_EVIDENCE` directly, but `API_SPEC.md` §5 exposes `POST /v1/cases/{id}/request-evidence` which "creates a staged evidence request from a verified/request-evidence disposition" — a *human* action, implying the case first sits in `ACTION_PROPOSED`/`APPROVAL_PENDING`. Both readings are defensible and they produce different queues, different audit trails and different `EVALUATION.md` §3 "correct request-evidence rate" denominators. Part of **Decision D4**.

**A-4 — MEDIUM/HIGH — The state machine has no exits for several reachable states.**
Concretely: (a) `EXCEPTION` has only one outbound transition (`-> INVESTIGATING`), so when the `SAFETY.md` §7 AI kill switch is off there is no legal state for a residual to reach — yet `SAFETY.md` requires it to "route to safe deterministic handling"; (b) `REQUESTING_EVIDENCE` can only go back to `INVESTIGATING`, with no path for evidence that never arrives; (c) `PRD.md` §20 requires late-arriving evidence to be able to "invalidate the current proposal", but no transition exists from `ACTION_PROPOSED`/`APPROVAL_PENDING` back to `INVESTIGATING`; (d) `API_SPEC.md` exposes a general `POST /cases/{id}/escalate` with no stated legal source states. Part of **Decision D4**.

**A-5 — MEDIUM — `API_SPEC.md` does not cover surfaces that `FRONTEND_BACKEND_CONTRACT.md` mandates.**
Missing: an operations-overview/metrics endpoint (PRD surface 1 and 8), an outcome-recording endpoint (required for `STAGED -> CLOSED`), a staged-action history list (surface 6), and a merchant-level audit query (only case-scoped audit exists). Since `FRONTEND_BACKEND_CONTRACT.md` obliges the backend to supply this data, adding these endpoints is additive and within engineering judgment — but because the UI is yours, the exact shapes are listed in §16 as an FYI, not resolved unilaterally in the contract's absence.

**A-6 — RESOLVED — Repository shape.** Monorepo confirmed by the product owner. The remaining sub-question — whether the frontend will eventually live inside this monorepo — is folded into **Decision D2** and affects only whether `apps/web/` is reserved as a read-only boundary in Phase 1.

**A-7 — LOW — `PRD.md` §18 product states differ from `STATE_MACHINE.md` §1.**
`NEW`/`MATCHED`/`AWAITING_APPROVAL` vs. `RECEIVED`/`NORMALIZED`/`MATCHING`/`APPROVAL_PENDING`, and PRD omits `APPROVED`, `REJECTED`, `REOPENED`. `START_HERE.md` §5 ranks PRD above STATE_MACHINE — but PRD §18 explicitly self-subordinates ("product representations of the canonical backend state machine; the backend remains authoritative"). Resolved by the documents themselves. I will implement `STATE_MACHINE.md` verbatim and add an explicit presentation-layer mapping table. No decision needed; recorded for traceability.

**A-8 — LOW — Minor data-model gaps.** `settlement_batch_id` has no `settlement_batches` table; `Invoice.line_items` has no line table; `Capture` is a lifecycle stage in `CONTEXT.md`/`FRONTEND_BACKEND_CONTRACT.md` but only a `captured_at` column in `DATA_MODEL.md`. All three are ordinary modelling calls I will make and document in Phase 2 (batches → real table; invoice lines → child table for queryability; capture → attribute, surfaced as a timeline event).

---

## 11. Data / evaluation risks

**E-1 — CRITICAL — No preregistered thresholds, and no dataset size.**
`EVALUATION.md` §12 requires safety thresholds to be "chosen before the primary test results are inspected" and recorded in the manifest. `VALIDATION_EXPERIMENT.md` defines kill criteria in terms of "the preregistered ceiling" for unsupported-resolution rate — **no number is given anywhere in the package**. Likewise no document specifies dataset size, split sizes, or case counts, yet `EVALUATION.md` §6/§10 require bootstrap confidence intervals at merchant/settlement-batch level, which are meaningless without an N. `EVALUATION.md` §19 forbids fixing this after results are seen. **These numbers must be set before Phase 11 runs, and ideally before Phase 4 freezes the baseline. Escalated as Decision D7.**

**E-2 — CRITICAL — No financial rule parameters are specified.**
`CAUSE_TAXONOMY.md` requires the verifier to prove `ROUNDING_DRIFT` lies "within the configured bounded tolerance", that `REFUND_NETTING` timing "permits netting in the modeled synthetic settlement window", and that `TIMING_LAG` has a "permitted timing relationship". `BASELINES.md` requires "bounded date/timestamp tolerance" and "amount tolerance only where explicitly modeled". **No document supplies a single one of these values**, nor the fee-schedule structure or tax rate. `CONFIGURATION.md` explicitly forbids turning them into environment variables ("business invariants should not become arbitrary environment variables... policy logic belongs in versioned code"), so they must be committed as versioned constants — which means committing numbers nobody has chosen. These values simultaneously define the baseline's strength, the verifier's authority and the benchmark's difficulty. **Escalated as Decision D7.**

**E-3 — HIGH — Baseline strength is an unfalsifiable claim without a spec.**
`BASELINES.md` insists "the baseline must not be intentionally weak" and `VALIDATION_EXPERIMENT.md` kill criterion 5 discards the AI if "equivalent performance is achievable with a modest deterministic rule expansion". Since the same agent builds both baseline and treatment, there is a structural incentive to under-build the baseline. Mitigation I will apply: build and freeze the baseline in Phase 4 **before** any agent code exists (which is already the `BUILD_PLAN.md` ordering), record the frozen rule set and tolerances in a manifest, and treat any post-hoc baseline weakening as a `CHANGE_CONTROL.md` event.

**E-4 — HIGH — Leakage audit has no pass/fail threshold.**
`LEAKAGE_AUDIT.md` §5 says to pause generation if a low-complexity probe predicts a defect class with "suspiciously high performance". "Suspicious" is undefined. Without a preregistered number this becomes a judgment call made after seeing the result — exactly the pattern `EVALUATION.md` §19 prohibits. Part of **Decision D7**.

**E-5 — MEDIUM/HIGH — `certainty_measure` risks an unearned calibration claim.**
`DISPOSITION_SCHEMA.md` §2 permits `type: "CALIBRATED_PROBABILITY"`. An LLM's self-reported number is not a calibrated probability, and `EVALUATION.md` §8 evaluates calibration as its own metric. Emitting a raw model number under that label would be a false claim in an AI-responsibility-sensitive system. Recommendation: constrain v1 to `ORDINAL_BAND` and only permit `CALIBRATED_PROBABILITY` once a calibration curve has actually been fitted and reported. Because it touches AI responsibility and evaluation, it is not resolved silently — **Decision D6b**.

**E-6 — MEDIUM — Scenario parity is asserted but not yet testable.**
`SCENARIO_ENGINE.md` and `VALIDATION_EXPERIMENT.md` both require interactive scenarios to traverse the identical pipeline as batch evaluation. `TESTING.md` requires a parity test. The only durable guarantee is structural: one code path, with the scenario engine as a thin input adapter and *no* branch on "is demo". I will implement it that way and add the parity test in Phase 5. No decision required — flagged because it is the single easiest place for the demo to quietly diverge from the benchmark.

**E-7 — MEDIUM — Reproducibility needs git.** `EVALUATION.md` §18 requires a commit hash in every benchmark report. Not currently possible. Resolved by `git init` in Phase 1.

---

## 12. What should be reused

**From the repository: nothing — it is empty.**

**From the environment:** Node 24 + pnpm 10 (both present, no install needed) and Docker 29 for PostgreSQL. Python 3.15.0b4 is present but is a **beta** and should not be used for anything that must pass a production-readiness gate.

**From the specification package:** the nine machine-actionable assets listed in §7. These should be transcribed into code as single canonical definitions — one cause enum, one transition table, one disposition schema, one error-code enum — satisfying `AGENTS.md` constraint 6 ("one canonical implementation for financial rules") and constraint 5 (no god files).

**Reuse discipline to carry forward:** `ARCHITECTURE.md` §16's `AmountBreakdown` shape is the one money-calculation contract; every fee/tax/refund/adjustment computation in reconciliation, tools, verifier and evaluation must call the same domain service and return that shape. This is the highest-value anti-duplication rule in the whole build, and the monorepo makes it enforceable — the calculation lives in exactly one package that every other package imports.

---

## 13. What should be replaced

**Nothing is replaced. There is no prior art in this repository to supersede.**

The only "replacement" in scope is conceptual: the specification's brownfield operating assumptions (§0) are superseded by observed reality. Specifically —

| Spec instruction | Status | Handling |
|---|---|---|
| "preserve existing monorepo conventions" | no conventions exist | Establish the monorepo in Phase 1, then treat as binding |
| "map roles onto the existing auth system" | no auth system exists | **Decision D3** — cannot be resolved silently |
| "run the repository's actual package-manager commands" | no scripts exist | Define the command surface in Phase 1 (§14) |
| "do not create a parallel application" | no application exists | Create exactly one; never a second |
| "the existing repository is authoritative for layout" | nothing to be authoritative | `REPOSITORY_STRUCTURE.md` conceptual layout becomes the default |

No specification document is being replaced, weakened or reinterpreted. No conflict in §9–§11 has been resolved by fiat.

---

## 14. Exact Phase 1 implementation plan

### Scope boundary

`BUILD_PLAN.md` Phase 1 is "Domain foundation" and assumes a repository already exists to put it in. Since none does, Phase 1 is split into **1A — Monorepo scaffolding** (work `BUILD_PLAN.md` never assigned, because it assumed a brownfield repo) and **1B — Domain foundation** (Phase 1 as written).

**Phase 1 touches no database, no HTTP framework, no model provider, no UI.** Pure TypeScript, pure unit tests. The domain layer must compile and pass tests with zero infrastructure, which is `ARCHITECTURE.md` §13's forbidden-dependency rule enforced by construction.

**Phase 1 is gated on Decisions D1 and D3** (§16); D2 affects only whether `apps/web/` is reserved. D4–D7 are not needed until Phases 8, 4 and 11 respectively, but D7 should be settled before the Phase 4 baseline freeze.

### Phase 1A — Monorepo scaffolding

Assumes Decision D1 resolves to **TypeScript + Node + pnpm workspaces** (the recommendation). Stated as an assumption, not decided.

1. `git init`; initial commit containing only `specs/` and this report, so the pre-code baseline is recoverable. Add `.gitignore` (node_modules, dist, `.env*`, coverage, `*.log`) **before** any credential can exist (mitigates S-M3).
2. `pnpm-workspace.yaml` + root `package.json` (private, no deps beyond dev tooling).
3. **Monorepo layout**, matching `ARCHITECTURE.md` §12 / `REPOSITORY_STRUCTURE.md`:
   ```
   apps/api/              (empty placeholder, Phase 3+)
   apps/worker/           (empty placeholder, Phase 3+)
   apps/web/              (RESERVED — user-owned UI, read-only; created only if D2 = "UI in this monorepo")
   packages/shared/       (ids, clock, result types, error codes)
   packages/domain/       (Phase 1B — the only package with real code)
   packages/persistence/  packages/application/  packages/tools/
   packages/verification/ packages/workflow/     packages/agent/
   packages/audit/        packages/scenario/     packages/evaluation/
   ```
   Placeholders carry only a `package.json` and a `README.md` naming the owning spec section, so the module map is visible from commit one.
4. Strict TypeScript: `strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `erasableSyntaxOnly`; ES2023 target, NodeNext modules; **project references**, so the monorepo's package graph — not convention — makes it impossible for `domain` to import from `persistence` or `api`.
5. Tooling: ESLint (flat config) + Prettier; **Vitest** as the test runner; `tsc --noEmit` for typecheck.
6. **Custom CI gates** (`CI_GATES.md` requires both; neither exists off the shelf):
   - `scripts/check-file-size.ts` — enforces `CODE_SIZE_POLICY.md` (warn ≥250, fail >350 without a recorded exception, hard fail >500).
   - `scripts/check-dependencies.ts` — enforces `ARCHITECTURE.md` §13's allowed/forbidden import directions across the monorepo (domain must not import a web framework, an LLM SDK, or a Postgres driver; agent must not import persistence; nothing may import `apps/web`).
   - `scripts/check-money-safety.ts` — fails on `parseFloat`, `Number.parseFloat`, `toFixed`, or float literals inside `packages/domain/money`.
7. `.github/workflows/ci.yml` running: format check → lint → typecheck → unit tests → file-size → dependency-direction → money-safety → build. Integration/security/DB gates are added in their own phases; the workflow is structured so they slot in without rewrite.
8. Root scripts, which become the binding command surface for all later phases:
   `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:unit`, `pnpm check:size`, `pnpm check:deps`, `pnpm build`, `pnpm verify` (all of the above in order).
9. `.env.example` with names only, no values.
10. `docker-compose.yml` defining PostgreSQL 16 only — **not started or used in Phase 1**, staged for Phase 2.

### Phase 1B — Domain foundation

Per `BUILD_PLAN.md` Phase 1 and `IMPLEMENTATION_RUNBOOK.md` Phase 1: money, currency, IDs, source lineage, lifecycle records, case model, invariants. Every file targets <250 lines (`CODE_SIZE_POLICY.md`).

**`packages/shared/`**
- `ids.ts` — branded UUID types (`MerchantId`, `CaseId`, `PaymentId`, …) so a `PaymentId` cannot be passed where a `CaseId` is expected at compile time; `IdGenerator` port (`ARCHITECTURE.md` §14).
- `clock.ts` — `Clock` port; no direct `Date.now()` anywhere in domain code (needed for deterministic scenario replay, `SCENARIO_ENGINE.md`).
- `result.ts` — typed `Result<T, DomainError>`; domain rules return errors, they do not throw.
- `error-codes.ts` — the twelve codes from `ERROR_CONTRACT.md`, verbatim, as the single source.
- `correlation.ts` — correlation/causation ID types (`EVENT_MODEL.md` §2, `OBSERVABILITY.md` §1).

**`packages/domain/money/`** — the most safety-critical code in the build.
- `currency.ts` — ISO-4217 code type + minor-unit exponent table.
- `money.ts` — `Money { amountMinor: bigint; currency: Currency }`. **`bigint`, never `number`, never float** (`AGENTS.md` constraint 7, `PRODUCTION_READINESS.md` blocker "floating-point authoritative money math"). Operations: `add`, `subtract`, `negate`, `isZero`, `compare`, `abs`, `sum`. **Every binary operation rejects a currency mismatch** rather than coercing (`TESTING.md` §8). No `multiply` by a float; percentage-style fee computation is a domain service with an explicit, tested rounding rule — not a `Money` primitive.
- `money-codec.ts` — the only place `bigint` crosses a serialization boundary. Encodes to a JSON number **only after** asserting `Number.MAX_SAFE_INTEGER`; decodes with the same guard. Keeps `bigint` safety internally without inflicting it on the API contract.
- `amount-breakdown.ts` — the canonical structure from `ARCHITECTURE.md` §16 (`gross_minor`, `fee_minor`, `tax_minor`, `refund_minor`, `adjustment_minor`, `expected_net_minor`, `currency`), with a self-check that the components actually reconcile to `expected_net_minor`. **This is the one shape every financial calculation in the system returns** (`AGENTS.md` constraint 6).

**`packages/domain/lineage/`**
- `source-record.ts` — the identity fields required of every source record by `DATA_MODEL.md` §2: internal ID, source system, source record ID, merchant ID, observed-at, ingested-at, schema version.
- `merchant-scope.ts` — `MerchantScope` value type. Every entity constructor requires one. This makes "a record belongs to exactly one merchant scope" (`DATA_MODEL.md` §5) a **type-level** invariant, not a runtime check that can be forgotten — and it is the foundation the Phase 2 repositories build tenant isolation on.

**`packages/domain/entities/`** — one file per aggregate, pure data + invariants, no persistence concerns: `order.ts`, `payment.ts`, `fee-line.ts`, `tax-line.ts`, `refund.ts`, `adjustment.ts`, `settlement.ts`, `settlement-line.ts`, `bank-credit.ts`, `ledger-entry.ts`, `invoice.ts`. Fields exactly as `DATA_MODEL.md` §3 specifies. Every amount-bearing field is a `Money`, never a bare number (`DATA_MODEL.md` §5: "currency is explicit on every amount-bearing record").

**`packages/domain/case/`**
- `case-state.ts` — the fourteen states of `STATE_MACHINE.md` §1, verbatim.
- `case-transitions.ts` — the transition table from §2 **as data**, plus the explicitly illegal transitions from §4 as negative test fixtures. A pure `canTransition(from, to)` function. (Transitions are *enforced* with authorization and versioning in Phase 9; Phase 1 only establishes the legal graph.)
- `reconciliation-case.ts` — the `ReconciliationCase` aggregate with `case_version`, and a `withTransition()` that increments the version (`DATA_MODEL.md` §5: "case version increments on mutable state changes").
- `presentation-state-map.ts` — the `PRD.md` §18 → `STATE_MACHINE.md` §1 mapping from risk A-7, isolated in one file so the backend's canonical states are never diluted.

**`packages/domain/cause/`**
- `cause-code.ts` — the closed seven-value enum from `CAUSE_TAXONOMY.md` §2.
- `disposition.ts` — the closed three-value enum from `DISPOSITION_SCHEMA.md` §1.
- `cause-disposition-policy.ts` — the cause→permitted-disposition table from `CAUSE_TAXONOMY.md` §5, **including the hard rule that `AMBIGUOUS` can never map to `RESOLVE`**.

**`packages/domain/events/`**
- `event-envelope.ts` — the envelope from `EVENT_MODEL.md` §2.
- `event-types.ts` — the past-tense event-name constants from §1.

### Phase 1 tests (all unit, no infrastructure)

| Area | Coverage |
|---|---|
| Money | add/subtract/negate/compare; currency-mismatch rejection on every binary op; zero and negative handling; large-value handling well past 2^53 (proving the `bigint` choice); **property test: sum is associative and commutative, and `a - b + b === a` over randomised amounts** (`TESTING.md` §11) |
| Money codec | round-trip fidelity; refusal to encode above `MAX_SAFE_INTEGER`; refusal to decode a non-integer or a float |
| Breakdown | `gross − fee − tax − refund + adjustment === expected_net` as a **property test** over randomised compositions (`TESTING.md` §8); rejection of mixed currencies |
| Lineage | required identity fields enforced; merchant scope cannot be omitted (compile-time + runtime) |
| Entities | invariant rejection: negative where forbidden, missing currency, cross-merchant references |
| State machine | one positive test per legal transition in §2; one **explicit negative test per illegal transition** in §4 (`TESTING.md` §9) |
| Case | version increments on every state change; version never decreases |
| Cause policy | `AMBIGUOUS -> RESOLVE` is rejected; every taxonomy entry has a policy row; policy table matches `CAUSE_TAXONOMY.md` §5 exactly |
| Codebase-level | no float arithmetic in domain; no forbidden imports; no file over policy size |

### Phase 1 exit gate

Phase 1 is complete only when **all** of the following hold (`START_HERE.md` §7):

- `pnpm verify` passes end to end — format, lint, typecheck, unit tests, file-size, dependency-direction, money-safety, build;
- every domain test above is green, including the property tests and every illegal-transition negative test;
- `packages/domain` has **zero** runtime dependencies (verified by the dependency gate, not by inspection);
- no source file exceeds 250 lines without a recorded justification;
- `git log` shows a clean pre-code baseline commit;
- `PHASE_REVIEW.md` is written using `PHASE_REVIEW_TEMPLATE.md` with a PASS/WARN/FAIL decision and reproducible commands;
- **no file under a frontend/UI path has been created or modified** — trivially true in Phase 1, and asserted explicitly.

### Phase 1 explicitly excludes

PostgreSQL, migrations, repositories, HTTP routes, the worker, the model gateway, prompts, tools, the verifier, the scenario engine, the evaluation harness, auth middleware — and any frontend file of any kind.

---

## 15. Confirmation that UI files will not be touched

**Confirmed, on three independent grounds.**

1. **Instruction.** You stated "Do NOT touch the UI/frontend." `AGENTS.md` constraint 1, `DECISION_LOG.md` 006, `PRD.md` §7, `BUILD_PLAN.md` §UI, `START_HERE.md` §6 ("Do not build the UI"), and `CODING_AGENT_START_PROMPT.md` Step 2 all say the same. This is treated as an absolute constraint, not a preference.
2. **Fact.** There are currently **zero** frontend files in this repository — no `apps/web`, no `src/components`, no HTML, CSS, JSX/TSX, no styling system, no frontend framework, no frontend dependency. Nothing exists that *could* be touched.
3. **Enforcement.** Going forward: no frontend file will be created, edited, renamed, moved or deleted; **no frontend dependency will be added to any manifest**; no UI framework will be introduced; no visual design, styling, component structure or layout decision will be made. Because the repository is a monorepo, this boundary is **machine-enforced rather than merely promised**: if Decision D2 places the UI inside this monorepo, `apps/web/` is created as a reserved, empty, read-only workspace and `scripts/check-dependencies.ts` fails CI on any backend import of it.

The only UI-adjacent work in scope is what `FRONTEND_BACKEND_CONTRACT.md` explicitly authorises: **backend API contracts that supply data to a separately owned UI.** That document is scoped as "does not prescribe visual design, framework, component structure, CSS, animation or layout," and that boundary will be respected exactly.

---

## 16. Decisions required before implementation continues

Per `AGENTS.md` §"Stop conditions" and your instruction, these are **not** being resolved silently. Each names the affected category. Recommendations are given, but none is adopted without your confirmation.

**Already decided:** repository structure = **monorepo** (product owner, Phase 0). Recorded here as the binding convention.

| # | Decision | Category | Blocks | Recommendation |
|---|---|---|---|---|
| **D1** | Language / runtime / framework / test runner / migration tool. The spec names none. | Architecture | **Phase 1** | **TypeScript + Node 24 + pnpm workspaces**, Fastify (API), Vitest (tests), node-pg-migrate or Drizzle (migrations), `pg` driver, Zod (schema validation). Rationale: satisfies the mandatory "typecheck" gate, matches the spec's workspace vocabulary, is the natural fit for a monorepo, and is the only stack fully installed locally (Python 3.15.0b4 is a beta and unsuitable). |
| **D2** | Will the user-owned frontend eventually live inside this monorepo, or in a separate repository? | UI boundary | Phase 1 (layout only) | If inside: `apps/web/` is reserved now, empty, and CI-enforced read-only. If separate: no `apps/web` is created and only the API contract matters. Low-cost either way — but better decided before the layout is committed. |
| **D3** | Authentication mechanism. `AUTHORIZATION_MODEL.md` forbids "creating a parallel identity system" but there is no existing system to map onto. | **Security** | Phase 2 exit; all of `SECURITY_TEST_MATRIX.md` | Build a **minimal first-party auth**: `users` table, argon2id password hashes, short-lived signed JWT bearer tokens, the three spec roles (`OPERATOR`/`APPROVER`/`ADMIN`), request-scoped `AuthContext` required by every use case. Designed as a thin, swappable adapter so a real IdP can replace it without touching domain code. |
| **D4** | State-machine completion: (a) route for verified `RESOLVE` with `recommended_action = NONE`; (b) whether `REQUEST_EVIDENCE` routes via `ACTION_PROPOSED` or directly; (c) exits from `EXCEPTION` when the AI kill switch is off; (d) exit from `REQUESTING_EVIDENCE` when evidence never arrives; (e) transition back from `ACTION_PROPOSED`/`APPROVAL_PENDING` when late evidence invalidates a proposal (`PRD.md` §20); (f) legal source states for `POST /escalate`. | **State machine + financial semantics** | Phase 9 | Add explicit transitions rather than overloading `STAGED`; record each as a `CHANGE_CONTROL.md` entry. Concrete proposals available on request. |
| **D5** | Hidden-truth isolation boundary, and the database role split for append-only audit. | **Security + evaluation** | Phase 11 (truth); Phase 2 (roles) | **Separate PostgreSQL database** for hidden truth, reachable only by the evaluation harness with its own credential the app never loads. Plus a two-role runtime: a migrator role that owns the schema, and an app role with `UPDATE`/`DELETE` revoked on `audit_events`. |
| **D6** | (a) Should `validate_candidate_resolution` remain in the agent's tool catalog, given it lets the model iterate against the verifier? (b) Should `certainty_measure` be restricted to `ORDINAL_BAND` in v1? | **AI responsibility + evaluation** | Phase 6 / Phase 7 | (a) Keep it, but make it **single-use per investigation** and record its use as an evaluation covariate — or drop it. Either is defensible; unbounded use is not. (b) Yes, restrict to `ORDINAL_BAND` until a calibration curve is actually fitted. |
| **D7** | The missing numbers: rounding tolerance, settlement-window and refund-netting windows, timing-lag bounds, fee schedule and tax rate, dataset size and split sizes, preregistered URR ceiling, and the leakage-audit pass/fail threshold. | **Financial correctness + evaluation methodology** | Phase 4 baseline freeze; Phase 11 | Must be chosen and committed as versioned constants **before** results are observed (`EVALUATION.md` §12, §19). I can propose a defensible starting set for your approval — but they cannot be picked after the fact without invalidating the preregistered comparison. |

---

## Readiness

```
STATUS: BLOCKED
```

Blocked on **D1** (and **D3** before Phase 2 exit) for implementation to begin; **D2** should be settled before the monorepo layout is committed. D4–D7 are not needed to start, but D7 must be settled before the Phase 4 baseline freeze and D5 before any hidden truth is generated.

Nothing else stands in the way: the specification package is complete, internally coherent apart from the conflicts recorded in §9–§11, the monorepo structure is confirmed, and the local toolchain is sufficient.

**No application code has been written. No UI file exists or has been touched.**
