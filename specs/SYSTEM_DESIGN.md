# System Design — Detailed Runtime Behavior

## 1. Design philosophy

SettlementOps is a modular monolith with explicit domain ports and adapters. The architecture favors a small number of well-defined modules over a large number of services.

## 2. Request path

```text
HTTP request
 -> authentication
 -> request validation
 -> tenant resolution
 -> idempotency check (where required)
 -> application use case
 -> domain service
 -> repository transaction
 -> audit event
 -> response DTO
```

No HTTP handler should perform financial arithmetic or directly call the model provider.

## 3. Batch path

```text
Batch submitted
 -> import job created
 -> worker claims job
 -> records validated
 -> records normalized
 -> persistence commit
 -> reconciliation run
 -> matches closed
 -> residual cases created
 -> metrics emitted
```

## 4. Investigation path

```text
Investigation requested
 -> case version checked
 -> investigation job created
 -> agent receives visible state
 -> agent proposes hypotheses
 -> agent calls typed tools
 -> tool results are persisted
 -> agent returns structured proposal
 -> verifier recomputes required checks
 -> effective disposition persisted
 -> case moves to proposal/approval state
```

## 5. Approval path

Approval must execute in one database transaction covering:

- current case version check;
- authorization check;
- proposal eligibility check;
- creation of staging record;
- state transition;
- audit event.

If any part fails, the transaction rolls back.

## 6. Concurrency

Cases use optimistic versioning. An approval carrying an old version must fail with a conflict response rather than overwrite a newer investigation.

Two concurrent approvals must not both create a staging record. A unique constraint on the eligible case/proposal combination provides database-level protection.

## 7. Idempotency

Operations that can be retried by clients or workers must accept an idempotency key. The key maps to a durable result for a bounded retention period appropriate to the operation.

## 8. Failure behavior

### Model timeout
Return a safe `ESCALATE` or application-defined safe fallback. Record provider latency, retry count and failure category.

### Tool timeout
Record the failed call. Retry only if the tool policy permits. Never pretend the missing tool result exists.

### Invalid model output
Schema validation fails. Preserve raw response only according to redaction policy; create a safe failure record.

### Verifier failure
If verification cannot complete, do not allow `RESOLVE`.

### Database failure
Do not acknowledge a state change until commit succeeds.

## 9. Read models

Operational list endpoints should use dedicated read projections/queries where useful rather than forcing the frontend to reconstruct the state from multiple write tables.

Read models must never become independent sources of truth. They may be rebuilt from canonical state.

## 10. Transaction boundaries

Use one transaction for each atomic business operation. Do not hold long-lived database transactions open across LLM calls. Investigation work is asynchronous; tool calls and model calls happen outside the transaction that persisted their initiating state.

## 11. Data lineage

Every derived conclusion must be traceable to source record IDs and transformation version. An evidence ID alone is insufficient if the source record cannot be linked to the case.

## 12. Operational limits

- maximum investigation tool calls: configurable, default 8;
- maximum agent wall-clock duration: configurable;
- maximum batch size: configurable with safe upper bound;
- maximum import size: configurable;
- maximum API page size: bounded;
- maximum evidence payload per tool: bounded.
