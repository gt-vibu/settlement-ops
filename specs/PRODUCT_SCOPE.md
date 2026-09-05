# Product Scope

## In scope

### Financial lifecycle
- synthetic order/payment/capture records;
- fee/tax records;
- refunds and adjustments;
- settlement batches and settlement lines;
- bank-credit records;
- ledger expectations/records;
- source lineage and event timestamps.

### Core workflow
- ingestion;
- normalization;
- deterministic reconciliation;
- residual exception creation;
- bounded AI investigation;
- evidence retrieval;
- deterministic verification;
- bounded disposition;
- human approval;
- staged action;
- outcome logging;
- audit trail.

### Product capabilities
- persistent exception queue backend;
- transaction/settlement 360 backend data;
- investigation trace;
- approval workflow;
- scenario engine;
- evaluation metrics;
- operational health endpoints.

## Out of scope

- live payment network calls;
- real funds movement;
- real banking integrations;
- live ERP posting;
- autonomous payout/refund;
- tax filing or tax advice;
- generic accounting suite;
- inventory/payroll/HR;
- broad forecasting;
- generic RAG assistant;
- cross-case anomaly management as a separate major module;
- multi-cloud or multi-region deployment.

## Scope-change policy

Any proposed feature must answer:

1. What user workflow does it improve?
2. Does it create a new source of truth?
3. Does it alter the evaluation problem?
4. Does it create a new security boundary?
5. Does it introduce a new external integration?
6. Can it be built without compromising the 7–10 day MVP?

A feature that only makes the product sound broader but does not materially improve the workflow is rejected.
