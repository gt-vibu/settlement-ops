# Configuration

## Configuration categories

### Environment
- runtime environment;
- DB URL;
- server bind settings;
- auth provider configuration;
- model provider credentials.

### Domain
- tolerance rules;
- permitted time windows;
- tool budgets;
- batch limits.

### AI
- model ID;
- temperature;
- maximum tokens;
- timeout;
- prompt/policy versions.

## Rules

Secrets come from environment/secret management.

Business invariants should not become arbitrary environment variables. Configuration is for deployment/runtime variation; policy logic belongs in versioned code.

All configuration is schema-validated at startup.

---

# Part II — Readiness Resolutions (v2.0.0, locked 2026-08-31)

## Environment variables

| Variable | Loaded by | Notes |
|---|---|---|
| `NODE_ENV` | all | `development` \| `test` \| `demo` \| `production` |
| `DATABASE_URL` | api, worker | `settlementops_app` (application role) |
| `MIGRATION_DATABASE_URL` | migration command only | `settlementops_migrator` |
| **`EVAL_DATABASE_URL`** | **evaluation harness only** | `settlementops_eval`. **Must be absent from api/worker config schemas — startup fails if present** (D5) |
| `AUTH_ADAPTER` | api | `demo` \| `oidc`. Startup fails if `demo` + `production` (D3) |
| `MODEL_PROVIDER`, `MODEL_ID`, `MODEL_API_KEY` | worker | Behind `ModelGateway` only |
| `AI_INVESTIGATION_ENABLED` | api, worker | Kill switch (`SAFETY.md` §7); `ADMIN`-only, audited |
| `DEMO_SCENARIOS_ENABLED` | api | Must be `false` in production |
| `LOG_LEVEL` | all | Pino |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | all | Optional |

All configuration is Zod-validated at startup. The process **fails fast** rather than starting in a misconfigured state.

## Configuration versus policy

`EXPERIMENT_CONSTANTS.md` classifies every value. Only `OPERATIONAL`-class values may be environment variables. **`INVARIANT`-class values — tolerances, timing windows, fee/tax rates — are versioned constants in `packages/domain` and must never become environment variables**, because a deployment-time change to a financial rule would silently alter what "correct" means and invalidate the benchmark.

## Startup assertions

1. `AUTH_ADAPTER=demo` **and** `NODE_ENV=production` ⇒ fail.
2. `EVAL_DATABASE_URL` present in the api/worker environment ⇒ fail.
3. `DEMO_SCENARIOS_ENABLED=true` **and** `NODE_ENV=production` ⇒ fail.
4. Any required variable missing or malformed ⇒ fail.
