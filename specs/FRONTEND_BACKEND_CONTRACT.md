# Frontend/Backend Contract

## Scope

This file describes what the backend must make available to the separately owned UI. It does not prescribe visual design, framework, component structure, CSS, animation or layout.

## Product surfaces

### Operations overview
Required backend data:
- current case counts by state;
- amount affected;
- pending approvals;
- recent scenario/activity events;
- health indicators.

### Transaction 360
Required backend data:
- order;
- payment;
- capture;
- fees;
- taxes;
- refunds;
- settlement;
- bank credit;
- ledger record;
- lifecycle timestamps;
- lineage.

### Exception queue
Required data:
- case ID;
- display reference;
- state;
- priority;
- discrepancy amount;
- currency;
- age;
- cause hint if known;
- investigation status.

### Investigation workspace
Required data:
- current case state;
- known facts;
- candidate causes;
- evidence records;
- claims/evidence mapping;
- tool trace summary;
- model proposal;
- verified effective disposition;
- verifier checks;
- missing/conflicting evidence;
- timestamps.

### Approval
Required data:
- proposal ID;
- effective disposition;
- staging action summary;
- eligibility;
- case version;
- actor authorization state.

### Audit
Required data:
- chronological immutable events;
- actor;
- state transitions;
- model/prompt/policy versions where relevant;
- proposal vs verifier outcome;
- approval/outcome.

### Scenario control
Required data:
- scenario catalog;
- allowed parameters;
- instantiated case ID;
- scenario lifecycle state.

## UI safety contract

The UI must not infer that a proposal is verified merely because the model returned a high certainty value. Only the backend's `verified_disposition` and verifier checks are authoritative.

The UI must not send financial truth supplied by the model back as authoritative values.

## Error contract

Every error has a machine code and request ID. The backend must not require the UI to parse arbitrary exception messages.

---

# Part II — Readiness Resolutions (v2.0.0, locked 2026-08-31)

## Ownership (D2)

The frontend lives at **`apps/web` inside this monorepo and is owned by the user.** The coding agent may define and publish backend contracts it consumes; it may not create, modify, rename, move or delete any file under `apps/web`, and may not add frontend dependencies to any manifest. CI enforces this (`REPOSITORY_STRUCTURE.md` §3).

## Contract surface

The API publishes **OpenAPI** generated from the same Zod schemas that validate requests at runtime, so the published contract cannot drift from the enforced one. `apps/web` consumes that contract and **never reaches the database**.

## Endpoints added for the required surfaces

`GET /v1/operations/summary` · `GET /v1/metrics/evaluation` · `POST /v1/cases/{id}/outcome` · `GET /v1/staged-actions` · `GET /v1/audit` · `POST /v1/cases/{id}/reopen` (see `API_SPEC.md` §11).

## Amended UI safety contract

- Only `verified_disposition` and the verifier checks are authoritative — never `certainty_measure`, which is diagnostic only.
- The UI must display the **seventeen**-state model through the presentation mapping in `STATE_MACHINE.md` §7; it must not invent states or maintain its own state machine.
- The UI is never a source of tenant authorization, financial truth, or state transitions.
- `X-Demo-Tenant-ID` is a **selector**, not a grant: the backend rejects a tenant the user does not belong to.


---

# Part III — The action requirement (v2.0.0, locked 2026-09-01)

Recorded as `CHANGE_CONTROL.md` CC-013. Implements `PRODUCT_PRINCIPLES.md` section 13.

## Every operational surface must offer at least one state-mutating action

A surface that only renders data is a report. The backend already exposes the actions; a UI
that does not call them leaves the product read-only.

| Surface | Required action(s) | Backend endpoint | Resulting transition |
|---|---|---|---|
| Exception queue | Open a case; act from the row | — | — |
| Case / investigation | Start investigation | `POST /v1/cases/:id/investigations` | `EXCEPTION -> INVESTIGATING` |
| | Request evidence | `POST /v1/cases/:id/request-evidence` | `-> REQUESTING_EVIDENCE` |
| | Escalate | `POST /v1/cases/:id/escalate` | `-> ESCALATED` |
| | Re-investigate | `POST /v1/cases/:id/reinvestigate` | `-> INVESTIGATING` |
| Approval | Approve / reject | Phase 9 | `APPROVAL_PENDING -> APPROVED / REJECTED` |
| Scenario control | Instantiate | `POST /v1/demo/scenarios/:id/instantiate` | creates real records + case |
| Audit | **Read-only by design** | — | append-only; **no edit affordance may exist** |

Audit is the single deliberate exception: it holds durable state and offers no action
because no action exists. Every other operational surface must act.

## Mandatory client behaviour for actions

1. Send the client's `case_version`. A `409` means the case changed — **reload, never retry
   blind.**
2. Render the resulting state from the response; do not optimistically assume success.
3. Escalation requires a reason; evidence requests require a specific named record. The
   backend rejects empty ones with `400`.
4. Never present an action the current state does not permit. Legal source states are in
   `API_SPEC.md` section 12.
