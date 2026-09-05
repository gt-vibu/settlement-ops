# Repository Structure

**Version:** 2.0.0 (Readiness Decisions D1 + D2 — locked 2026-08-31)
**Supersedes:** 1.0.0. Changes recorded in `CHANGE_CONTROL.md` as CC-001 and CC-002.

## 1. Locked technology stack (D1)

One consistent TypeScript stack across the entire monorepo. No second language, no second runtime.

| Concern | Locked choice |
|---|---|
| Language | TypeScript (strict) |
| Runtime | Node.js 24 LTS |
| Package manager | pnpm (workspaces) |
| API framework | Fastify |
| Worker | Node.js worker process, shares packages with the API |
| Database | PostgreSQL |
| Query layer | Drizzle |
| Validation | Zod |
| Testing | Vitest |
| API contracts | OpenAPI |
| Logging | Pino (structured JSON) |
| Observability | OpenTelemetry-compatible instrumentation |
| Containers | Docker / Docker Compose |

**The stack is not negotiable per-package.** A package may not introduce a second HTTP framework, ORM, validator or test runner. Additions still require a `DEPENDENCY_POLICY.md` justification.

## 2. Monorepo layout (D2)

```text
settlementops/
│
├── apps/
│   ├── api/                  Fastify HTTP process
│   ├── worker/               job runner (reconciliation, investigation, evaluation)
│   └── web/                  ← USER-OWNED. Read-only to the coding agent.
│
├── packages/
│   ├── shared/               ids, clock, result, error codes, correlation
│   ├── domain/               money, lineage, entities, case, cause, events
│   ├── application/          use cases, ports, transaction boundaries
│   ├── persistence/          Drizzle schema, migrations, repositories
│   ├── tools/                typed read-only agent tools
│   ├── verification/         deterministic verifier (terminal gate)
│   ├── workflow/             state transitions, approval, staging
│   ├── agent/                model gateway, prompts, investigation loop
│   ├── audit/                append-only audit writer/reader
│   ├── evaluation/           dataset generation, baseline/treatment, scoring
│   └── scenario/             demo scenario catalog + instantiation
│
├── specs/                    this specification package
├── tests/                    cross-package integration, security, parity suites
├── scripts/                  CI gate scripts (size, deps, money-safety, secrets)
│
├── EXPERIMENT_CONSTANTS.md
├── IMPLEMENTATION_READINESS.md
├── READINESS_RESOLUTION_REPORT.md
├── docker-compose.yml
├── pnpm-workspace.yaml
└── package.json
```

## 3. `apps/web` — the UI boundary

`apps/web` **exists in this monorepo and is owned by the user.**

The coding agent:

- **may** define and publish backend contracts the web app consumes (OpenAPI schemas, DTO types, error codes);
- **must not** create, modify, rename, move or delete any file inside `apps/web`;
- **must not** add frontend dependencies to any manifest;
- **must not** make visual design, styling, component, layout or frontend-architecture decisions.

This is enforced mechanically, not by convention:

1. `scripts/check-dependencies.ts` fails CI if any package under `packages/` or `apps/api` / `apps/worker` imports from `apps/web`.
2. The same script fails CI if `apps/web` appears as a dependency in any backend `package.json`.
3. CI fails if a commit touching `apps/web` is authored by the implementation pipeline.

The dependency direction is one-way: `apps/web` consumes the published API contract; **no backend package may ever depend on `apps/web`.**

## 4. Dependency rules

Allowed:

```text
apps/api      → application → domain
apps/worker   → application → domain
packages/agent    → tool ports → application/domain interfaces
packages/tools    → application/domain interfaces
packages/persistence → domain interfaces
packages/scenario    → application
packages/evaluation  → domain + application interfaces
apps/web      → published API contract only
```

Forbidden — each fails CI:

```text
domain      → Fastify / any HTTP framework
domain      → any LLM SDK
domain      → pg / Drizzle / any database driver
domain      → any package outside domain + shared
agent       → persistence implementations
agent       → hidden-truth / evaluation credentials
evaluation  → production runtime credentials
anything    → apps/web
apps/web    → any database
```

`packages/domain` must have **zero runtime dependencies**. This is verified by CI, not asserted by review.

## 5. Enforcement

| Rule | Mechanism |
|---|---|
| Dependency direction | `scripts/check-dependencies.ts` + TypeScript project references |
| File size (`CODE_SIZE_POLICY.md`) | `scripts/check-file-size.ts` |
| No float money math | `scripts/check-money-safety.ts` |
| No secrets committed | `scripts/check-secrets.ts` + `.gitignore` |
| UI boundary | dependency script + commit-path check |

TypeScript **project references** make the package graph a compile-time constraint: `packages/domain` cannot import from `packages/persistence` even if someone writes the import, because the reference does not exist.

## 6. Command surface

Defined once, binding for every later phase:

```text
pnpm format:check     pnpm lint            pnpm typecheck
pnpm test             pnpm test:unit       pnpm test:integration
pnpm check:size       pnpm check:deps      pnpm check:money
pnpm check:secrets    pnpm build           pnpm verify   ← all of the above
pnpm db:up            pnpm db:migrate      pnpm db:reset
```

`CODING_AGENT_START_PROMPT.md` requires running the repository's actual commands rather than inventing them. From Phase 1 onward, **these are those commands.**

## 7. Two databases (D5)

```text
settlementops_app    ← application + agent. Cannot reach hidden truth.
settlementops_eval   ← evaluation harness only. Holds hidden ground truth.
```

Separate databases, separate credentials, separate connection configuration. `apps/api` and `apps/worker` load only the application credential. See `SECURITY.md` and `DATASET.md`.
