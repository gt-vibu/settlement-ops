# Deployment

## MVP deployment shape

One API process, one worker process, one PostgreSQL instance/service, and one model provider connection.

## Required properties

- separate runtime configuration from code;
- migrations run explicitly;
- health and readiness checks exist;
- logs are structured;
- TLS is assumed at the deployment edge;
- production does not run debug mode;
- secrets are injected securely;
- worker and API use the same application/domain modules.

## Startup order

1. database available;
2. migrations applied;
3. API ready;
4. worker starts and claims jobs.

## Deployment checklist

- clean install;
- build passes;
- migrations pass on a fresh DB;
- health/ready checks pass;
- no hardcoded local paths;
- no test credentials;
- no debug routes;
- no hidden evaluation endpoints exposed publicly.

---

# Part II — Readiness Resolutions (v2.0.0, locked 2026-08-31)

## Runtime shape (D1)

Two Node.js 24 processes — `apps/api` (Fastify) and `apps/worker` — sharing the same packages, plus PostgreSQL. Docker Compose for local development.

## Database roles and databases (D5)

```text
settlementops_migrator  → owns schema, runs migrations, not used at runtime
settlementops_app       → api + worker runtime; UPDATE/DELETE revoked on audit_events
settlementops_eval      → evaluation harness ONLY; separate database
```

The API and worker containers **must not receive `EVAL_DATABASE_URL`**. Startup fails if it is present.

## Startup order

1. `settlementops_app` available;
2. migrations applied with the **migrator** credential;
3. grants verified (`UPDATE`/`DELETE` revoked on `audit_events`);
4. API starts with the **application** credential and passes config assertions;
5. worker starts and claims jobs.

## Amended deployment checklist

- [ ] clean install and build;
- [ ] migrations pass on a fresh database;
- [ ] health/ready checks pass;
- [ ] **`AUTH_ADAPTER != demo` in production**;
- [ ] **`EVAL_DATABASE_URL` absent from api/worker environments**;
- [ ] **`DEMO_SCENARIOS_ENABLED=false`; `/v1/demo/*` absent from the route table**;
- [ ] **`UPDATE audit_events` fails under the application role**;
- [ ] no hardcoded paths, test credentials, debug routes;
- [ ] no hidden evaluation endpoint exposed;
- [ ] `apps/web` deployed independently by its owner — the backend never builds or serves it.
