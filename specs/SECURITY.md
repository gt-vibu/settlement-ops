# Security

## 1. Threat model

Threat actors include:

- malicious users;
- compromised API clients;
- malicious imported financial text;
- prompt injection content;
- unauthorized tenant access;
- replayed requests;
- manipulated IDs;
- malicious scenario input;
- dependency compromise.

## 2. Trust boundaries

Untrusted input crosses into normalized typed records only after validation. The model is always untrusted. The database is trusted only behind authorization and service boundaries.

## 3. Authentication and authorization

Authentication is performed by the existing repository/application mechanism when present. Authorization is server-side and scoped by merchant/tenant and role.

## 4. Tenant isolation

Every merchant-owned query must enforce merchant scope. Client-provided merchant IDs are data, not authorization.

Test:

- horizontal data access;
- manipulated case IDs;
- cross-tenant tool calls;
- cross-tenant searches;
- indirect joins that leak records.

## 5. Prompt injection

Imported narrations are untrusted. They must never be interpolated as system instructions. Tool results must be typed data.

## 6. Injection resistance

Use parameterized queries and schema validation. No model-generated SQL.

## 7. Secrets

Secrets must come from environment/secret management. No secrets in code, prompts, tests, fixtures or logs.

## 8. API security

Use request size limits, strict schemas, bounded pagination, auth checks, safe errors, and rate limiting for expensive operations.

## 9. Supply chain

New dependencies require justification, version review, and audit. Do not install libraries merely to shorten a trivial utility.

## 10. Security logging

Security-relevant events are logged with correlation IDs without exposing credentials or unnecessary PII.

## 11. Threat scenarios

### T1 — Cross-tenant case access
Attacker changes a case ID in the request.

**Control:** server-side merchant scope in application and repository.

### T2 — Model prompt injection
A bank narration instructs the model to approve a transaction.

**Control:** untrusted-data treatment and tool/policy separation.

### T3 — Model attempts arbitrary SQL
The model emits a query or asks to run one.

**Control:** no SQL tool exists in the agent tool registry.

### T4 — Stale approval
Operator approves yesterday's proposal after new evidence arrives.

**Control:** case version check and proposal freshness.

### T5 — Duplicate staging
Two identical approval requests arrive concurrently.

**Control:** transaction + unique constraint + idempotency key.

### T6 — Malicious CSV
An imported cell contains spreadsheet formula syntax.

**Control:** input sanitization and safe rendering.

### T7 — Secret leakage
Agent trace contains a provider key.

**Control:** provider credentials never enter agent context and structured log redaction.

### T8 — Hidden-truth leakage
Evaluation process accidentally makes the gold cause available through an endpoint.

**Control:** hidden truth isolated outside production data access and security tests that attempt forbidden access.

## 12. Security logging

Security-relevant events should include:

- actor;
- merchant;
- resource;
- request ID;
- outcome;
- reason code.

Avoid logging full sensitive payloads.

## 13. Authorization model

Authorization checks are performed before business actions. Domain methods may additionally enforce invariants, but authorization must not rely on the model or frontend.

## 14. File-upload security

Uploads are treated as hostile input. Enforce size, type, encoding and schema restrictions. Reject malformed files early.

## 15. Dependency security

Lock files are committed according to repository convention. Dependency updates are reviewed for vulnerabilities and licensing. Avoid abandoned packages for security-sensitive paths.

## 16. Security acceptance

The build is not production-ready if a Critical or High security issue remains unresolved.

---

# Part II — Readiness Resolutions (v2.0.0, locked 2026-08-31)

## 17. Authentication (D3)

Authentication is performed by a **swappable `AuthenticationAdapter`** producing a server-constructed `RequestContext { userId, tenantId, roles, requestId, correlationId }`. The MVP ships a demo adapter for development/demo environments only; startup **fails** if the demo adapter is active with `NODE_ENV=production`.

### Header trust rules

| Header | Trust |
|---|---|
| `X-Demo-User-ID` | Identity assertion, resolved against the `users` table. Unknown/inactive ⇒ `401` |
| `X-Demo-Tenant-ID` | **Selector only.** Honoured only if the user is already a member of that merchant; otherwise `403` |

> `X-Demo-Tenant-ID` is never a grant. Treating a client-supplied tenant ID as authorization would make T1 (cross-tenant access) trivially exploitable and is a `PRODUCTION_READINESS.md` hard blocker. **Tenant membership is always read from the database.**

The demo adapter is a seeded-identity resolver, not an identity provider: no passwords, sessions, tokens, MFA or recovery. Recorded in `LIMITATIONS.md`.

## 18. Hidden-truth isolation (D5)

**Threat T8 is now controlled structurally rather than procedurally.**

```text
settlementops_app     ← apps/api, apps/worker, agent tools
settlementops_eval    ← evaluation harness ONLY (hidden truth, seeds, oracle)
```

Two databases, two credentials. The application runtime **never loads the evaluation credential**, so hidden truth is unreachable rather than merely unread.

Required controls:

1. Separate database and separate role; the app role has **no grant** on the evaluation database.
2. The evaluation credential is absent from `apps/api` and `apps/worker` configuration schemas — a startup config-validation failure if present.
3. `Outcome.actual_cause` → renamed **`human_assigned_cause`**, human-written only. The evaluation harness may never write it (regression test required, `TESTING.md` §14).
4. The scoring oracle joins visible results to hidden truth **inside the evaluation boundary** and emits only aggregates. Per-case hidden labels never return to the application database.
5. No API endpoint, log, filename, record ID or error message may expose a cause label, injection rule, generator seed or gold disposition (`LEAKAGE_AUDIT.md` §7).

### Required security tests

- Application credential attempting to read the evaluation database ⇒ **denied at the database**.
- Serialized visible case payload contains no cause label, seed, or gold disposition.
- Agent tool results contain no generator metadata.
- Evaluation-only routes are absent from the production route table.

## 19. Append-only audit enforcement (D5)

Application-level discipline is insufficient — it does not survive a compromised service account or a careless migration. Enforce at the database with a **two-role split**:

| Role | Grants |
|---|---|
| `settlementops_migrator` | Owns the schema; runs migrations; not used at runtime |
| `settlementops_app` | `SELECT`/`INSERT` on `audit_events`; **`UPDATE` and `DELETE` revoked** |

Corrections are compensating events, never edits (`AUDIT_TRAIL.md` §2). A test must assert that an `UPDATE` on `audit_events` under the application role **fails at the database**, not merely that no code path attempts one.

## 20. Verifier as a terminal gate (D6)

The verifier is single-pass and its result **never reaches the model**. The agent cannot iterate against it, cannot learn which check failed, and gets no second attempt at the same case.

Security consequences:

- `validate_candidate_resolution` is **removed** from the tool catalog (`TOOLS.md` v2.0.0). No tool adjudicates a proposal.
- Verifier output flows only to the database and the human-facing API.
- A verifier downgrade routes to `ESCALATED`; re-investigation requires a human action, and the new run does not receive the prior verifier result.

New threat, now controlled:

**T9 — Verifier oracle abuse.** An agent (or a prompt-injected instruction) repeatedly probes the verifier to discover the minimal claim set that passes. **Control:** the verifier is not callable by the agent, runs once, and returns nothing to the model.

## 21. UI boundary as a security control (D2)

`apps/web` is user-owned and read-only to the coding agent. Beyond process discipline this is a security property: **no backend package may depend on `apps/web`, and the web app may never reach the database.** Both are CI-enforced (`REPOSITORY_STRUCTURE.md` §5). The frontend is never a source of tenant authorization, financial truth, or state transitions.
