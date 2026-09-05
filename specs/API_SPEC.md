# API Specification

## 1. Conventions

- JSON over HTTPS in deployment;
- `/v1` API versioning;
- explicit request/response schemas;
- authenticated requests;
- server-side authorization;
- idempotency for retriable state-changing commands;
- stable error envelope;
- correlation/request ID.

## 2. Import APIs

### `POST /v1/imports`
Creates a validated import job.

Request includes source type, merchant scope, input reference and idempotency key.

Response includes import ID and status.

### `GET /v1/imports/{id}`
Returns import state, counts, validation errors and timestamps.

## 3. Reconciliation APIs

### `POST /v1/reconciliation-runs`
Starts a deterministic reconciliation run for a batch.

### `GET /v1/reconciliation-runs/{id}`
Returns status, match count, residual count, error state and metrics.

## 4. Case APIs

### `GET /v1/cases`
Paginated queue. Filters may include merchant scope, state, priority, cause, date range and discrepancy band.

### `GET /v1/cases/{id}`
Returns canonical case details and current version.

### `GET /v1/cases/{id}/timeline`
Returns payment-to-settlement lifecycle events for Transaction/Settlement 360.

### `GET /v1/cases/{id}/evidence`
Returns evidence currently attached to the case.

### `GET /v1/cases/{id}/investigations`
Lists investigation runs.

### `POST /v1/cases/{id}/investigations`
Creates an investigation job. Must validate case state and version.

### `GET /v1/cases/{id}/investigations/{run_id}`
Returns investigation status, model proposal, tool trace summary and verification result.

## 5. Approval/staging APIs

### `POST /v1/cases/{id}/approve`
Approves a verified action proposal. Requires current case version and actor authorization.

### `POST /v1/cases/{id}/reject`
Rejects a proposal. Requires reason.

### `POST /v1/cases/{id}/request-evidence`
Creates a staged evidence request from a verified/request-evidence disposition.

### `POST /v1/cases/{id}/escalate`
Escalates a case with reason.

### `GET /v1/cases/{id}/staging`
Returns staged action status.

## 6. Audit APIs

### `GET /v1/cases/{id}/audit`
Returns immutable case audit history.

## 7. Scenario APIs

### `GET /v1/demo/scenarios`
Lists enabled demo scenarios.

### `POST /v1/demo/scenarios/{scenario_id}/instantiate`
Creates a persistent scenario instance.

## 8. Health/readiness

### `GET /health`
Process liveness only.

### `GET /ready`
Dependency readiness without leaking sensitive details.

## 9. Error envelope

```json
{
  "error": {
    "code": "CASE_VERSION_CONFLICT",
    "message": "The case changed before this request was applied.",
    "request_id": "uuid"
  }
}
```

Do not expose stack traces, SQL messages, internal paths or secrets.

---

# Part II — Readiness Resolutions (v2.0.0, locked 2026-08-31)

## 10. Authentication (D3)

Every `/v1` route requires authentication. The demo adapter accepts:

```text
X-Demo-User-ID:   <user-id>     identity assertion, resolved server-side
X-Demo-Tenant-ID: <merchant-id> SELECTOR ONLY — honoured only if the user
                                is already a member of that merchant
```

Tenant scope is resolved from stored membership, never from the header value alone. A resource in another tenant returns **`404`**, not `403`, so the API is not a cross-tenant existence oracle.

`/health` and `/ready` remain unauthenticated and expose no sensitive detail.

## 11. Added endpoints (readiness A-5)

`FRONTEND_BACKEND_CONTRACT.md` requires data these routes did not cover.

### `GET /v1/operations/summary`
Case counts by state, amount affected, pending approvals, average case age, recent activity, health indicators. (Operations overview.)

### `GET /v1/metrics/evaluation`
Verifier override rate, investigation success/failure, AI resolution coverage, human correction rate. **Aggregates only — never hidden truth, never per-case labels** (D5). `ADMIN` role.

### `POST /v1/cases/{id}/outcome`
Records the `Outcome` required for `STAGED → OUTCOME_LOGGED → CLOSED` and for `ESCALATED → CLOSED`. Body carries `human_result`, `model_accepted`, `model_corrected`, optional `human_assigned_cause`, correction reason. **`human_assigned_cause` accepts human input only.**

### `GET /v1/staged-actions`
Tenant-scoped staged-action history with status. (Staged-action history surface.)

### `GET /v1/audit`
Tenant-scoped audit query with bounded pagination, complementing case-scoped audit.

### `POST /v1/cases/{id}/reopen`
`ADMIN` only, reason required. `CLOSED`/`ESCALATED` → `REOPENED`.

## 12. State preconditions (D4)

| Endpoint | Legal source states |
|---|---|
| `POST /cases/{id}/investigations` | `EXCEPTION`, `REQUESTING_EVIDENCE`, `REJECTED`, `REOPENED` |
| `POST /cases/{id}/approve` | `APPROVAL_PENDING` |
| `POST /cases/{id}/reject` | `APPROVAL_PENDING` |
| `POST /cases/{id}/request-evidence` | `ACTION_PROPOSED`, `APPROVAL_PENDING` |
| `POST /cases/{id}/escalate` | `EXCEPTION`, `INVESTIGATING`, `ACTION_PROPOSED`, `APPROVAL_PENDING`, `REQUESTING_EVIDENCE`, `REJECTED` |
| `POST /cases/{id}/outcome` | `APPLIED`, `ESCALATED` |
| `POST /cases/{id}/reopen` | `CLOSED`, `ESCALATED` |

Any other source state returns `INVALID_STATE`. A stale `case_version` returns `CONFLICT` and changes nothing.

## 13. Demo routes (D3)

`/v1/demo/*` requires `ADMIN` **and** a demo/sandbox environment. Routes are **not registered at all** in production — absent from the route table rather than merely guarded (`DEPLOYMENT.md`).

## 14. Contract publication (D1/D2)

The API publishes an **OpenAPI** document generated from the Zod schemas that validate requests at runtime, so the published contract and the enforced contract cannot drift. This document is the sole interface `apps/web` consumes; the web app never reaches the database.
