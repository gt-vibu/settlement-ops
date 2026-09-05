# Product Requirements Document — SettlementOps

**Status:** Draft-to-build; product direction locked, implementation gated by validation/evidence.

## 1. Product statement

SettlementOps is a finance-operations control center that represents a merchant's payment-to-settlement lifecycle, deterministically reconciles the straightforward majority of financial records, and turns the unresolved residual into actionable, evidence-backed exception cases that can be safely resolved, routed for evidence, or escalated for human review.

The product must behave like a persistent operational application rather than a report reader. Cases, investigations, approvals, staged actions, and outcomes are durable system state.

## 2. Primary user

A finance or payment-operations operator who is accountable for settlement close, reconciliation exceptions, discrepancy investigation, and approval of financial adjustments.

## 3. User goals

The operator needs to:

- understand what happened to a payment through settlement;
- identify the exact point where expected and observed records diverge;
- distinguish known explainable causes from unsupported explanations;
- inspect the minimum evidence needed to decide safely;
- reduce repetitive manual investigation;
- avoid incorrect automatic resolution;
- approve, reject, request evidence, or escalate from one case workspace;
- maintain an auditable history of what the system proposed and what the human accepted or changed.

## 4. Problem

A settlement batch can be numerically correct in aggregate while individual records remain difficult to close. The mismatch may be caused by fee/tax deductions, split settlement, refund netting across windows, event timing, rounding, duplicate records, or conflicting source evidence. A first-pass matcher can identify that the case is not cleanly closed, but a useful finance operations product must also make the residual understandable and actionable.

## 5. Product outcome

For each exception, the product should produce one of three durable operational states of intent:

- `RESOLVE` — the evidence and deterministic verification support closure;
- `REQUEST_EVIDENCE` — a specific missing record or confirmation is required;
- `ESCALATE` — the system cannot safely establish a unique, supported explanation.

These are system-level dispositions. They are not free-form AI prose.

## 6. End-to-end workflow

### 6.1 Ingestion
Validated synthetic or demo financial records enter the system. Records are typed, normalized, versioned, and tagged with source lineage.

### 6.2 Deterministic reconciliation
The baseline matcher joins records using exact and bounded fuzzy logic and recomputes expected amounts using deterministic financial rules.

### 6.3 Residual creation
Records that cannot be safely closed become persistent `reconciliation_case` records. Cases include their known observations, discrepancy, source lineage, current state, and reason for escalation.

### 6.4 AI investigation
The agent receives only visible case state and typed read-only tools. It generates hypotheses from the approved cause taxonomy, retrieves evidence, records claims and evidence IDs, and proposes one constrained disposition.

### 6.5 Verification
A deterministic verifier independently checks the proposal. Model-supplied calculations are informational only. Failed required checks override the model proposal.

### 6.6 Human approval
For dispositions that would stage a financial action, an authenticated human must approve. Approval checks current case version and policy eligibility.

### 6.7 Staging
The backend creates a durable staging record representing the bounded action. The MVP does not execute live money movement or mutate a real external ledger.

### 6.8 Outcome
The operator can accept or correct a recommendation. Outcome data records whether the model and verifier were accepted, rejected, or corrected.

## 7. Core product surfaces supported by backend

UI is separately owned, but backend behavior must support:

1. operations overview;
2. transaction/settlement 360;
3. exception command center;
4. investigation workspace;
5. approval queue;
6. staged-action history;
7. audit trail;
8. evaluation/health metrics;
9. scenario creation/replay.

## 8. Interactive scenario requirement

A user can instantiate a controlled synthetic scenario. The scenario must create real persistent domain records and use the same reconciliation, exception, investigation, verification, approval, and audit services as batch evaluation. It must not be a frontend-only animation or hard-coded outcome.

## 9. AI requirements

The AI may:

- generate bounded hypotheses;
- interpret semantic context in payment/settlement records;
- choose among allowlisted read-only evidence tools;
- connect observations to candidate causes;
- propose a constrained disposition with evidence-linked claims;
- articulate uncertainty.

The AI may not:

- invent records or amounts;
- calculate authoritative financial truth;
- call unrestricted tools;
- modify source records;
- change policy;
- bypass verification;
- move money.

## 10. Deterministic requirements

Deterministic code is responsible for:

- money representation;
- currency validation;
- arithmetic;
- known fee/tax checks;
- lifecycle consistency;
- duplicate detection;
- evidence existence;
- state transitions;
- authorization;
- verifier logic;
- idempotency;
- staging semantics.

## 11. Non-functional requirements

- persistent workflow state;
- clear module boundaries;
- reproducible evaluation;
- append-only audit events;
- tenant isolation;
- strict input validation;
- bounded agent execution;
- clean failure modes;
- typed APIs and tool contracts;
- no secrets in source control;
- no critical/high security issues at production-readiness gate.

## 12. Out of scope

- live payment-network integration;
- real merchant money;
- live bank mutations;
- tax filing/advice;
- generic ERP replacement;
- inventory/payroll/employee systems;
- cross-case anomaly product as a separate MVP capability;
- autonomous ledger mutation without human approval;
- multi-region production deployment;
- provider-specific claims beyond documented public APIs/semantics.

## 13. Acceptance criteria

A build is acceptable only if:

1. the financial lifecycle is persistent;
2. cases survive page refresh and process restart;
3. deterministic reconciliation is independently testable;
4. only residual cases enter AI investigation;
5. every model claim links to fetched evidence IDs;
6. every `RESOLVE` path passes required deterministic checks;
7. verifier overrides are explicit and auditable;
8. human approval is required before staging a financial action;
9. no AI path can directly mutate financial truth;
10. scenario replay uses the same backend pipeline as batch evaluation;
11. evaluation is reproducible and leakage-audited;
12. security/quality CI gates pass.

## 14. Product-quality bar

The product is not complete if it merely produces correct reports. The product must have meaningful state, user actions, state transitions, durable history, and operational consequence.

## 15. Primary user journey — investigate an exception

### Entry condition
A deterministic reconciliation run has produced a case that cannot be safely closed.

### Journey
1. Operator sees the case in the persistent queue.
2. Operator opens the case and sees the discrepancy summary.
3. Product displays the payment-to-settlement lifecycle.
4. Product identifies what deterministic checks have already run.
5. Operator starts an AI investigation when permitted.
6. Agent produces bounded hypotheses.
7. Agent retrieves relevant evidence through typed tools.
8. Product displays the investigation trace in a human-readable form.
9. Agent proposes one bounded disposition.
10. Deterministic verifier checks the proposal.
11. Product displays the verified effective disposition.
12. Operator approves, rejects, requests evidence, or escalates.
13. Backend persists the transition and staged action if applicable.
14. Outcome is recorded.
15. Audit history remains available.

## 16. Primary user journey — scenario simulation

1. Operator selects a predefined scenario.
2. Backend creates a scenario instance with a new correlation ID.
3. Financial records are persisted.
4. The same normalization/reconciliation pipeline processes them.
5. If the selected scenario creates an exception, the exception appears in the queue.
6. Operator investigates it using the normal workflow.
7. Operator can approve or reject the proposal.
8. The resulting state remains after refresh.
9. The scenario can be replayed independently without altering the original history.

## 17. Primary user journey — approval

Approval is a domain action, not a UI event.

Before approval the backend verifies:

- actor identity;
- actor authorization;
- current case version;
- proposal ID;
- effective disposition;
- required deterministic checks;
- action eligibility;
- absence of a prior terminal approval/rejection.

The approval and creation of the corresponding staging record must be atomic when the operation is eligible for staging.

## 18. Product states visible to the user

The product should expose operational states such as:

- `NEW`
- `MATCHED`
- `EXCEPTION`
- `INVESTIGATING`
- `ACTION_PROPOSED`
- `AWAITING_APPROVAL`
- `REQUESTING_EVIDENCE`
- `STAGED`
- `ESCALATED`
- `CLOSED`

These labels are product representations of the canonical backend state machine; the backend remains authoritative.

## 19. Priority behavior

Cases may be prioritized using deterministic policy based on:

- amount affected;
- age;
- operational severity;
- number of related records;
- repeated occurrence count when this signal is explicitly available;
- blocked financial-close status.

Priority is a queue-management aid. It must not alter financial truth or bypass verification.

## 20. Product behavior when evidence changes

When a new record arrives after a case was created, the backend must determine whether the new evidence:

- closes the evidence gap;
- changes the candidate explanation;
- invalidates the current proposal;
- requires re-investigation;
- changes only informational context.

A stale proposal must never be approved against a newer case version.

## 21. Human correction behavior

A human correction should not overwrite the model's original proposal. The system records:

- original proposal;
- verifier result;
- human decision;
- correction reason;
- final outcome.

This preserves an honest audit trail and creates an evaluation signal without turning the production benchmark into an unbounded online-learning system.

## 22. Product metrics

The operational UI may show:

- open case count;
- amount affected;
- average case age;
- investigation completion count;
- approval queue count;
- verifier override count;
- AI resolution coverage;
- human correction rate.

These are operational metrics, not claims of real-world business impact.

## 23. Product acceptance scenarios

### Scenario A — clean payment
A normal scenario should reconcile automatically and never invoke the AI resolver.

### Scenario B — explainable fee discrepancy
The residual should enter investigation, retrieve fee evidence, pass deterministic checks, and become eligible for approval.

### Scenario C — ambiguous discrepancy
The agent should not invent a unique cause and should escalate.

### Scenario D — malicious narration
Embedded text instructions must not alter agent behavior.

### Scenario E — verifier disagreement
If the model says `RESOLVE` but a required check fails, the effective result must become a non-resolve path and the override must be auditable.

### Scenario F — stale approval
An approval created against an old case version must fail safely.

## 24. Definition of product completion

The product is complete only when:

- a user can execute the primary workflow end-to-end;
- case state is durable;
- the AI is bounded;
- verification is independent;
- approval is enforced;
- staged action is durable;
- outcome and audit are queryable;
- scenario replay uses the real pipeline;
- evaluation is reproducible;
- security and quality gates pass.
