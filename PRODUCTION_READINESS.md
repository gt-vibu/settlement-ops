# Production Readiness

**Assessed:** 2026-09-05 · policy 1.0.0 · commit at time of assessment on `master`

```
OVERALL: PASS with documented WARNs

No CRITICAL or HIGH finding is open. One HIGH was found and fixed during this
review (SECURITY_REVIEW.md HIGH-1). Three areas are WARN, each for a stated
reason, and none of them is a defect being deferred quietly.

This system runs entirely on SYNTHETIC data. Nothing here is a claim about
production financial accuracy.
```

---

## Verdicts

| Area | Verdict | Basis |
|---|---|---|
| Architecture | **PASS** | Modular monolith + worker + PostgreSQL. Dependency direction enforced by a build gate, not convention. No microservices, no broker, no cache layer. |
| Security | **PASS** | HIGH-1 fixed; 21 negative tests; no critical/high open. See `SECURITY_REVIEW.md`. |
| Auth / RBAC | **WARN** | Roles and separation of duties are enforced server-side and tested. **Only the demo adapter exists** — production configuration refuses to start with it, so a real deployment is blocked until an OIDC adapter is written. Deliberate, not overlooked. |
| Tenant isolation | **PASS** | `MerchantScope` is a type-level obligation constructible only from a server-built context. Foreign resources 404 rather than 403. Tested in both directions. |
| State machine | **PASS** | 17 states as a data table with actor permissions. Transitions go through `CaseTransitionRepository` with optimistic concurrency; no route mutates state directly. |
| Idempotency | **PASS** | Import and scenario replay return the original and create no second financial record — verified against the database, not just the response. Case transitions use expected-version. |
| Auditability | **PASS** | Append-only at the database (`UPDATE`/`DELETE` revoked, asserted in CI). Every tool call, verifier decision, transition and human decision is an event. Case audit scoping fixed and regression-tested. |
| AI safety | **PASS** | Read-only typed tools, tenant-scoped, allowlisted, argument-validated, bounded by tool calls / steps / wall-clock. No SQL, shell, filesystem or arbitrary HTTP. Cannot reach hidden truth, cannot transition state, cannot see the verifier's answer. |
| Verifier | **PASS** | Terminal, single-pass, pure. Decides the effective disposition; a failed resolution is downgraded to escalation. Evidence provenance enforced. `AMBIGUOUS` can never resolve. |
| Observability | **WARN** | Structured request logs with correlation ids, operational counters at `/metrics`, every investigation step audited. **In-process counters only** — no exporter, no retention. Adequate for this deployment; a fleet would need a scrape target. |
| Reliability | **PASS** | Retry backoff, attempt ceiling, heartbeat, stale-job reclaim, explicit abandonment. Model failure escalates. Graceful shutdown closes server and pool. |
| Deployment | **PASS** | `Dockerfile` + `docker-compose.prod.yml` for API, worker and PostgreSQL, with health checks, ordered startup, migration gate, persistent volume, non-root user, injected configuration. Ollama is an external dependency by design. |
| Testing | **PASS** | 247 unit, 67 integration (including 21 security and 7 worker-recovery). 20 acceptance journeys against the running system, including a failure journey. |
| Evaluation reproducibility | **PASS** | Dataset regenerates identically from one seed, verified against stored truth. Model pinned by digest. CI asserts the frozen artefacts are unchanged and never regenerates them. |
| Documentation | **PASS** | README reproducible from a fresh machine. The negative benchmark result is stated in the README, not buried. |
| Performance | **PASS** | 360 records / 60 payments imported in 0.64 s; 60 payments reconciled in 0.80 s (75/s); reads p50 21 ms, p95 87 ms at 10 concurrent. |

---

## Measured evidence

### Acceptance journeys — 20/20

Against the real API, real PostgreSQL, real Ollama.

| Journey | Result |
|---|---|
| Scenario → import → reconcile → exception → investigate → verify | PASS, tool calls and verifier decision both audited |
| Stale version | PASS — 409 |
| Duplicate import | PASS — replay returns the original; exactly one financial record exists |
| Duplicate scenario | PASS — replay returns the original instance |
| Unauthenticated / wrong role / foreign tenant | PASS — 401 / 403 / 404 |
| No hidden truth in an API payload | PASS |
| **Model unreachable** | PASS — `/ready` 503, investigation escalates, **no financial record mutated**, audit records `MODEL_UNAVAILABLE` |

### Performance smoke

```
import       360 records, 60 payments   accepted=360 rejected=0   0.64s
reconcile    evaluated=60 reconciled=60 residual=0                0.80s
throughput   75 payments/s
reads        50 requests, 10 concurrent  p50=21ms p95=87ms max=96ms
```

Single machine, CPU-only, local PostgreSQL. Not a capacity claim.

---

## The three WARNs, in full

**1. Authentication (WARN).** Only `AUTH_ADAPTER=demo` exists. `NODE_ENV=production` with
the demo adapter is a startup failure, so the system cannot be deployed to production as it
stands — an OIDC adapter must be written first. The authorization model behind it (roles,
scope construction, separation of duties) is real and tested; it is the identity source
that is missing.

**2. Observability (WARN).** Counters live in process memory and are lost on restart.
There is no exporter and no alerting. For one API and one worker this is enough to answer
"what is failing right now"; for a fleet it is not.

**3. Rate limiting (WARN, LOW-3).** Investigation start is not rate-limited per merchant.
Each investigation is bounded by tool calls, steps and wall-clock, and the model is a local
single-tenant runtime, so the exposure is bounded — but a multi-tenant deployment would
need the limit `EXPERIMENT_CONSTANTS.md` O8 proposes.

---

## Synthetic-data limitations — permanent, not resolvable by hardening

- Every record is generated by `packages/evaluation`. No real settlement data has ever
  entered this system.
- The benchmark measures behaviour against **our own generator and our own oracle** on 410
  constructed cases. It licenses no claim about production accuracy, financial risk or
  merchant impact.
- Most financial constants are **synthetic assumptions** (`D7_FINALIZATION_REVIEW.md`).
  Only the CARD fee rate and the GST rate derive from the specification's worked example.
- **The official benchmark found the AI agent lost decisively to a strong fixed workflow**
  (System C 0.0% vs System B 51.7% on the primary split). That result is frozen and is
  reported in the README. Hardening does not change it.
- Staging is where the system stops. Nothing writes to a ledger, and no code path would.
