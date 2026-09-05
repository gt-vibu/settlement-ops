# AGENTS.md — Engineering Contract

Read `START_HERE.md` first.

## Absolute constraints

1. UI/frontend is untouched unless the user explicitly changes that instruction.
2. Preserve monorepo/workspace conventions.
3. Architecture is modular monolith + worker + PostgreSQL unless repository evidence requires another shape.
4. No file above 500 lines without explicit architecture review; target below 250.
5. No god controller/service/agent file.
6. One canonical implementation for financial rules.
7. Integer minor-unit money representation.
8. AI output is untrusted.
9. Typed, allowlisted, request-scoped read-only tools only.
10. Deterministic verifier is authoritative.
11. Human approval before staging.
12. No autonomous money movement.
13. Tenant isolation is server-side.
14. Hidden benchmark truth is isolated.
15. All important state is durable.
16. Audit events are append-only.
17. All meaningful commands are idempotent where retries are possible.
18. CI gates are mandatory.

## Change control

If a change affects product semantics, evaluation validity, security, financial safety or architecture, stop and record it in `CHANGE_CONTROL.md` before implementation continues.

## Completion

Do not say “done” until the phase acceptance criteria, tests, lint, typecheck, build and applicable security checks pass.

## Repository operating procedure

Before any write operation:

1. inspect root files;
2. identify package/workspace manager;
3. identify applications/packages;
4. inspect existing scripts;
5. inspect test/lint/typecheck/build commands;
6. inspect database/configuration;
7. locate UI directories and mark them read-only;
8. read all canonical specification files;
9. generate `IMPLEMENTATION_READINESS.md`.

## Implementation order

Never start from the UI.

The backend/system sequence is:

`domain -> persistence -> ingestion -> reconciliation -> cases -> tools -> verifier -> agent -> approval/staging -> audit -> evaluation -> hardening`.

## Product truth

The product is a persistent finance operations workflow, not a report generator. A scenario must create durable domain records and a durable case. A refresh must not erase the case state.

## AI truth

Model output is an external/untrusted suggestion. Never use model text as an authorization source, money source, or state-transition authority.

## Financial truth

All authoritative calculations must be reproducible without the model. If a model says an amount is correct, recompute it.

## Evaluation truth

Do not change the test set, metrics, or success criteria after results are observed. A changed benchmark is a new experiment version.

## Security truth

A convenience feature is not acceptable if it weakens tenant isolation, authorization, prompt-injection defenses, state integrity or auditability.

## Code review behavior

When you detect an anti-pattern, fix the architecture rather than suppressing the symptom. Examples:

- oversized controller -> move business logic to application/domain modules;
- repository containing business rules -> move rules into domain service;
- model calling DB -> insert typed tool/application boundary;
- repeated state checks -> centralize transition policy;
- repeated financial calculation -> one canonical calculation service.

## No speculative complexity

Do not introduce Kafka, Redis, Kubernetes, microservices, event buses, vector databases, graph databases, or orchestration frameworks unless a requirement and measured need exists. A simple implementation that satisfies the specification is preferred.

## Stop conditions

Stop and ask for a decision when a proposed shortcut would change:

- financial semantics;
- AI responsibility;
- safety policy;
- state machine;
- evaluation methodology;
- tenant/security boundary;
- architecture boundary.

Do not stop for ordinary implementation details that the documents already make unambiguous.

## Final handoff

The coding agent must leave:

- tests;
- commands to reproduce the build;
- migration instructions;
- environment example;
- known limitations;
- phase review;
- production readiness status;
- a clear list of any remaining warnings.

---

## Readiness resolutions — additional absolute constraints (2026-08-31)

Extending the numbered list above:

19. **Stack is locked** (D1): TypeScript · Node 24 · pnpm · Fastify · PostgreSQL · Drizzle · Zod · Vitest · OpenAPI · Pino · OTel · Docker. No second language, framework, ORM, validator or test runner.
20. **`apps/web` is user-owned and read-only.** Never create, modify, rename, move or delete a file under it. Never add a frontend dependency to any manifest (D2).
21. **Tenant scope comes from stored membership via `RequestContext`.** A tenant ID from a client or from model output is data, never a grant (D3).
22. **Only the seventeen states and the transitions in `STATE_MACHINE.md` v2.0.0 exist.** Do not invent a transition to make a flow work (D4).
23. **The application runtime never loads the evaluation credential.** Hidden truth is unreachable, not merely unread (D5).
24. **The verifier is terminal and single-pass; its output never reaches the model.** No tool may adjudicate a proposal (D6).
25. **No dataset generation or scoring until `EXPERIMENT_CONSTANTS.md` is `APPROVED`.** Never choose a threshold after seeing a result (D7).

## Document versions in force

`STATE_MACHINE.md` 2.0.0 · `AUTHORIZATION_MODEL.md` 2.0.0 · `REPOSITORY_STRUCTURE.md` 2.0.0 · `TOOLS.md` 2.0.0 · `ARCHITECTURE.md` Part II · `SECURITY.md` Part II · `DATASET.md` Part II · `EVALUATION.md` Part II · `EXPERIMENT_CONSTANTS.md` (PROPOSED).
