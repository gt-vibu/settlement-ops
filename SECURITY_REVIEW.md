# Security Review

**Date:** 2026-09-05 · **Scope:** API, database, tools, agent, verifier, audit, worker,
evaluation boundary, configuration, deployment.
**Method:** manual review of every path that touches financial state or hidden truth, plus
21 negative integration tests that assert the attack fails.

**Result: no CRITICAL or HIGH finding remains open.** One HIGH was found and fixed during
this review. Remaining items are MEDIUM and LOW and are listed with their reasoning.

---

## Findings

### HIGH-1 — The API linked code capable of reaching hidden truth · FIXED

`apps/api/src/agent-dispatch.ts` imported `AGENT_BUDGET`, `OLLAMA_DEFAULT_HOST` and
`PINNED_MODEL` from `@settlementops/evaluation`. That package also contains
`store/eval-store.ts`, the only module in the repository that can open the hidden-truth
database — so the API process linked that capability in, for the sake of three constants.
It was not even a declared dependency of `apps/api`; it resolved through a tsconfig path.

**Exploitable?** No. `loadConfig` refuses to start when the evaluation credential is
present, and the application role has no `CONNECT` privilege on `settlementops_eval`. Two
independent controls stood between the coupling and a leak.

**Why it was still HIGH.** Decision D5 is a *structural* guarantee. A capability that is
linked into a process is one careless import away from being used, and `check-deps.ts`
existed precisely to prevent this class of coupling but had no rule covering it.

**Fix.** Runtime model configuration moved to `packages/agent/src/model-config.ts`, read
from the environment and validated at startup. `check-deps.ts` now fails the build if
`apps/api`, `apps/worker`, `packages/workflow` or `packages/tools` reference
`@settlementops/evaluation`. The frozen experiment keeps its own immutable copy of the
values it ran with.

### MEDIUM-1 — A tool rejection disclosed a valid tool name · FIXED

Rejecting an unknown tool replied `get_settlement_breakup failed: unknown tool:
drop_tables` — the rejection borrowed a real tool's name to construct itself, both
misattributing the failure and handing an attacker a valid name to try. Found by a test
written for exactly that. `toolError` now accepts a neutral `'unknown'` label.

### MEDIUM-2 — Unhandled errors could serialise driver detail · FIXED

Fastify's default error handler serialises `error.message`, which for a `pg` error can
carry a table name, a constraint name or a fragment of SQL. Replaced with a handler that
returns the stable envelope and logs the detail server-side against the request id.

### MEDIUM-3 — Jobs could be stranded invisibly · FIXED

`reclaimAbandoned` only requeued stale jobs *below* the attempt ceiling. A job whose worker
died on its final attempt stayed `CLAIMED` forever: not running, not failed, and invisible
to anyone looking for problems. Such jobs are now `ABANDONED` with
`WORKER_LOST_AFTER_MAX_ATTEMPTS`. A job that disappears is worse than a job that fails.

### MEDIUM-4 — No retry backoff · FIXED

A failed job returned straight to `PENDING` and was re-claimed on the next poll, so a
poison payload burned its whole attempt budget in seconds and a transient database blip got
no time to clear. Added `available_at` with 5s/30s/120s backoff (migration `0008`).

### MEDIUM-5 — A proposal could cite evidence it never retrieved · FIXED

The verifier checked that a cited record belonged to the case, but not that the
investigation had actually retrieved it. A model could cite any real record id — from a
briefing, or a lucky guess — and the citation would look substantiated because the record
exists. Being real is not the same as having been retrieved. Added `EVIDENCE_NOT_RETRIEVED`.

### LOW-1 — Demo identity switching is a convenience, not a boundary · ACCEPTED

The UI can switch between seeded demo identities. It confers no access: tenant and roles are
resolved server-side from stored membership, and `AUTH_ADAPTER=demo` is a startup failure in
production. Verified by test: a tenant header naming a merchant the caller is not a member of
is rejected.

### LOW-2 — `/metrics` is unauthenticated · ACCEPTED for this deployment

It exposes counters only — no tenant labels, no amounts, no identifiers. In a real
deployment it would sit behind the same ingress restriction as any operational endpoint.
Documented rather than silently left open.

### LOW-3 — No rate limiting on investigation start · ACCEPTED, documented

`EXPERIMENT_CONSTANTS.md` O8 proposes 10 investigations per merchant per minute. Not
implemented: each investigation is already bounded by tool calls, steps and wall-clock, and
the model is a local single-tenant runtime. A multi-tenant deployment would need it, and
this is recorded as a known gap rather than claimed as done.

---

## Controls verified

| Control | How it is enforced | Verified by |
|---|---|---|
| Tenant isolation | `MerchantScope` is constructible only from a server-built context | `security.test.ts` — foreign case returns 404, not 403 |
| Not an existence oracle | Foreign resources 404 with no distinguishing detail | `security.test.ts` |
| Tenant header is a selector | Membership resolved server-side | `security.test.ts` |
| Separation of duties | `hasAtLeast('APPROVER')` on approve/reject/stage | `security.test.ts` |
| Hidden truth unreachable | PostgreSQL `CONNECT` denied, both directions | `eval-isolation.test.ts` |
| Audit append-only | `UPDATE`/`DELETE` revoked from the application role | CI migration job |
| No arbitrary SQL for the model | Allowlisted typed tools; no query tool exists | `tools.test.ts` |
| Tool argument validation | Rejects SQL fragments, bad dates, non-integer money, unbounded windows | `tools.test.ts` |
| Prompt injection | Untrusted text fenced; fence cannot be closed early | `injection.test.ts` |
| Evidence provenance | Cited ids must be in the case AND retrieved | `verifier.test.ts` |
| Model failure is safe | Every failure path escalates | `injection.test.ts`, acceptance journey 7 |
| Verifier is terminal | Result never returned to the model | code review; no feedback path exists |
| Optimistic concurrency | Stale version yields 409 | acceptance journey 2 |
| Idempotency | Replayed key returns the original; no duplicate record | acceptance journey 3 |
| No secrets in logs | Envelope-only responses; secret scan in CI | `check-secrets.ts` |
| No secrets in images | `.dockerignore` excludes `.env`; compose requires injected values | review |

## What this review did not cover

- **Penetration testing** of the deployed stack. This is a code and configuration review.
- **The frontend.** `next-app/` is frozen and holds no financial authority; it renders
  server-provided state and calls the same authenticated API.
- **Supply chain beyond `pnpm audit`.** CI blocks on high-severity advisories; no SBOM or
  provenance attestation is produced.
- **The OIDC adapter.** Only the demo adapter exists. Production configuration rejects it,
  so a production deployment is blocked until a real adapter is written — that is a
  deliberate failure, not an oversight, and it is recorded in `PRODUCTION_READINESS.md`.
