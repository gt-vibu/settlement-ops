# Coding Agent Start Prompt

Paste this into the coding agent after placing the specification package in the repository.

```text
You are implementing SettlementOps.

FIRST: read START_HERE.md and every canonical specification document. Do not begin coding until you understand document authority.

MISSION
Build the backend/system described by the specification. The UI is explicitly owned by the user. Do not modify frontend files, styling, visual design, or frontend architecture.

NON-NEGOTIABLES
- preserve the existing monorepo/workspace structure;
- do not create a parallel application;
- default to modular monolith + worker + PostgreSQL;
- keep source files under the size policy;
- use integer minor units for money;
- enforce tenant isolation;
- treat model output as untrusted;
- provide only typed read-only tools to the agent;
- deterministic verifier is authoritative;
- human approval gates staging;
- no money movement;
- no hidden truth access;
- no arbitrary SQL/shell/filesystem/HTTP/code-execution tools;
- all important state is durable and auditable.

BEFORE CODING
Inspect the repository, workspace files, existing packages, tests, CI and database setup.
Create IMPLEMENTATION_READINESS.md using the template in the spec.
Identify reusable code and contradictions.
Do not silently resolve product/security/evaluation contradictions.

THEN
Implement BUILD_PLAN.md phase by phase.
After each phase, run its tests and create/update PHASE_REVIEW.md.

IMPORTANT
Do not modify UI.
Do not invent product behavior not defined by the specs.
Do not change evaluation metrics or kill criteria after seeing results.
Do not optimize for AI accuracy by weakening the baseline or leaking hidden truth.

If a security or financial-safety boundary is violated, stop the affected path and report it.
```


## Detailed execution contract

### Step 0 — Observe before changing

Do not assume the repository is empty, even if the task description sounds greenfield. Inspect actual files and scripts. Do not create a parallel app simply because the current app is unfamiliar.

### Step 1 — Build an implementation map

Create a table mapping every major requirement to:

- specification source;
- planned module;
- data dependency;
- test;
- phase.

### Step 2 — Protect the UI boundary

Identify frontend files. Do not edit them. Do not rename them. Do not move them. Do not add frontend dependencies. Backend API contracts may be created to support them.

### Step 3 — Establish a safe domain core

Implement money, currency, IDs, source lineage and domain invariants before the AI layer.

### Step 4 — Establish persistence

Create migrations and repositories. Add tenant-scoped access. Test fresh database setup.

### Step 5 — Implement reconciliation

Build the strong deterministic baseline. It must be capable of closing easy cases without AI.

### Step 6 — Implement the residual case model

Cases must persist the reason deterministic reconciliation stopped, relevant source records, discrepancy amount, state and version.

### Step 7 — Implement scenario parity

Interactive scenario creation calls the same application/domain pipeline as batch evaluation. Do not hard-code final statuses.

### Step 8 — Implement read-only tools

Each tool validates merchant scope, typed input and bounded output. The model sees tool schemas, never repository internals.

### Step 9 — Implement verifier first

Before trusting the agent, implement the independent verification contract. The verifier must be executable without an LLM.

### Step 10 — Implement agent

Only after the deterministic foundation exists, implement model invocation, hypothesis generation, tool calls, evidence mapping and structured disposition.

### Step 11 — Implement approval/staging

Use server-side state checks, optimistic versions and durable transactions.

### Step 12 — Implement audit/observability

Every important action must become reconstructable.

### Step 13 — Run evaluation

Freeze the benchmark and run leakage audit before primary scoring.

### Step 14 — Hardening

Run the full security matrix, code-size policy, dependency scan, typecheck, lint, tests and build.

## Exact agent behavior for ambiguous cases

When the model cannot uniquely distinguish causes:

- do not force a resolution;
- request specific missing evidence if useful;
- otherwise escalate;
- preserve hypotheses and evidence links.

## Exact agent behavior for verifier disagreement

If model output says `RESOLVE` and verifier fails:

1. keep the original model proposal;
2. record failed verifier checks;
3. compute safe effective disposition;
4. prevent staging of the unsafe resolution;
5. audit the override;
6. surface the verified result to the API.

## Exact behavior for provider outage

If the model provider is unavailable:

- investigation run becomes retryable/failed according to policy;
- source records remain intact;
- no resolution is fabricated;
- case remains visible;
- safe escalation remains possible.

## Exact behavior for tool outage

A tool error is not an empty result. Record an explicit tool failure category. Do not let the agent infer absence from a failed query.

## Exact behavior for stale approval

If the case version changed since proposal creation:

- reject approval with conflict;
- do not stage;
- preserve both histories;
- require a new proposal or re-investigation according to state policy.

## Required repository checks before completion

Run the repository's actual package-manager commands. Do not invent commands when scripts already exist.

At minimum determine and run:

- formatting;
- lint;
- typecheck;
- unit tests;
- integration tests;
- build;
- security/dependency scan if available.

## Required report files

At implementation handoff produce:

- `IMPLEMENTATION_READINESS.md`
- `PHASE_REVIEW.md`
- `FINAL_ENGINEERING_AUDIT.md`
- `PRODUCTION_READINESS.md`

## Never do this

Never:

- rewrite the repository to fit a preferred framework;
- delete tests because they are inconvenient;
- disable type checking to unblock compilation;
- weaken auth for a demo;
- bypass verification to make a scenario succeed;
- change the evaluation generator after seeing results;
- add fake API responses that bypass the domain layer;
- use a frontend-only state machine as the source of truth;
- expose hidden benchmark data through a convenience endpoint.

## Handoff standard

A coding agent is considered successful only when another engineer can clone the repository, install dependencies, run migrations, start API/worker, execute the test suite, and understand the system from the specification without asking the original agent what hidden assumptions it made.
