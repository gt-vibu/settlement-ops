# Production Readiness Gate

## Required status

`PRODUCTION READY` only when all Critical/High issues are closed and required checks pass.

## Categories

- architecture;
- financial correctness;
- authentication;
- authorization;
- tenant isolation;
- AI safety;
- prompt injection;
- tool security;
- database integrity;
- idempotency;
- state machine;
- audit;
- observability;
- configuration;
- secrets;
- dependencies;
- performance;
- testing;
- deployment.

## Evidence

Each category must link to a test, static check, code path or documented operational procedure.

## Blockers

Any of the following blocks readiness:

- cross-tenant data access;
- arbitrary financial mutation by AI;
- secret exposure;
- audit tampering;
- floating-point authoritative money math;
- invalid approval path;
- hidden truth accessible to the system under test;
- unbounded agent loop;
- critical/high dependency vulnerability without an accepted mitigation.

## Added blockers (readiness resolutions, 2026-08-31)

Any of these also blocks readiness:

- demo authentication adapter active in production;
- a client-supplied tenant ID accepted as authorization rather than as a membership-checked selector;
- `EVAL_DATABASE_URL` reachable from `apps/api` or `apps/worker`;
- `UPDATE`/`DELETE` on `audit_events` succeeding under the application role;
- verifier output reaching model context in any form;
- any tool that adjudicates a proposal present in the registry;
- a state transition implemented outside `STATE_MACHINE.md` v2.0.0;
- a case reaching `CLOSED` without an `Outcome` (except via `RECONCILED`);
- `/v1/demo/*` registered in production;
- a backend package importing `apps/web`, or the pipeline modifying a file under it;
- an evaluation result reported against unapproved or altered `EXPERIMENT_CONSTANTS.md` values.
