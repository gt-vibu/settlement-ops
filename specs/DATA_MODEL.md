# Data Model — SettlementOps

## 1. Money representation

All monetary values use integer minor units plus explicit ISO-like currency code.

Example:

```json
{"amount_minor": 1000000, "currency": "INR"}
```

The system must not use binary floating point for financial comparisons.

## 2. Identity model

Every source record has:

- globally unique internal ID;
- source system;
- source record ID;
- merchant ID;
- created/observed timestamp;
- ingestion timestamp;
- schema/version metadata.

## 3. Core entities

### Merchant
Fields: `id`, `status`, `created_at`, `configuration_version`.

### Order
Fields: `id`, `merchant_id`, `customer_reference`, `amount_minor`, `currency`, `created_at`, `status`.

### Payment
Fields: `id`, `merchant_id`, `order_id`, `amount_minor`, `currency`, `payment_method`, `authorized_at`, `captured_at`, `status`.

### FeeLine
Fields: `id`, `merchant_id`, `payment_id`, `settlement_id?`, `fee_type`, `amount_minor`, `currency`, `effective_date`, `source_record_id`.

### TaxLine
Fields: `id`, `merchant_id`, `fee_line_id?`, `tax_type`, `amount_minor`, `currency`, `period`, `source_record_id`.

### Refund
Fields: `id`, `merchant_id`, `payment_id`, `amount_minor`, `currency`, `created_at`, `settled_at?`, `status`.

### Adjustment
Fields: `id`, `merchant_id`, `settlement_id?`, `reference`, `amount_minor`, `currency`, `effective_at`, `reason_code`, `source_record_id`.

### Settlement
Fields: `id`, `merchant_id`, `settlement_batch_id`, `gross_amount_minor`, `net_amount_minor`, `currency`, `settlement_at`, `status`, `utr?`.

### SettlementLine
Fields: `id`, `settlement_id`, `payment_id?`, `refund_id?`, `adjustment_id?`, `line_type`, `amount_minor`, `currency`, `source_record_id`.

### BankCredit
Fields: `id`, `merchant_id`, `utr`, `amount_minor`, `currency`, `credited_at`, `bank_reference`, `source_record_id`.

### LedgerEntry
Fields: `id`, `merchant_id`, `reference_type`, `reference_id`, `amount_minor`, `currency`, `entry_type`, `posted_at`, `status`, `source_record_id`.

### Invoice
Fields: `id`, `merchant_id`, `period_start`, `period_end`, `invoice_reference`, `currency`, `line_items`, `source_record_id`.

### ReconciliationCase
Fields: `id`, `merchant_id`, `case_number`, `state`, `priority`, `discrepancy_amount_minor`, `currency`, `deterministic_reason`, `case_version`, `opened_at`, `closed_at?`.

### CandidateExplanation
Fields: `id`, `case_id`, `cause_code`, `status`, `support_score?`, `created_at`, `updated_at`.

### EvidenceItem
Fields: `id`, `case_id`, `source_type`, `source_record_id`, `retrieved_by_tool_call_id`, `observed_at`, `content_hash`.

### AgentRun
Fields: `id`, `case_id`, `model_version`, `prompt_version`, `policy_version`, `status`, `started_at`, `finished_at`, `tool_call_count`, `failure_code?`.

### ToolCall
Fields: `id`, `agent_run_id`, `tool_name`, `request_hash`, `request_payload_redacted`, `response_status`, `response_payload_redacted`, `started_at`, `finished_at`.

### DispositionProposal
Fields: `id`, `case_id`, `agent_run_id`, `model_output`, `disposition`, `cause_code`, `claims`, `missing_evidence`, `recommended_action`, `created_at`.

### VerificationResult
Fields: `id`, `proposal_id`, `checks`, `passed`, `effective_disposition`, `override_reason`, `verified_at`.

### Approval
Fields: `id`, `case_id`, `proposal_id`, `actor_id`, `decision`, `reason`, `case_version_at_decision`, `created_at`.

### StagedAction
Fields: `id`, `case_id`, `proposal_id`, `action_type`, `payload`, `status`, `created_at`, `completed_at?`.

### Outcome
Fields: `id`, `case_id`, `human_result`, `model_accepted`, `model_corrected`, `human_assigned_cause`, `closed_at`.

### AuditEvent
Fields: `id`, `merchant_id`, `entity_type`, `entity_id`, `event_type`, `actor_type`, `actor_id`, `correlation_id`, `payload_json`, `created_at`, `schema_version`.

## 4. Relationships

```text
Merchant
  ├── Orders
  │    └── Payments
  │          ├── Refunds
  │          └── FeeLines -> TaxLines
  ├── Settlements
  │    └── SettlementLines -> Payments/Refunds/Adjustments
  ├── BankCredits
  ├── LedgerEntries
  ├── Invoices
  └── ReconciliationCases
           ├── CandidateExplanations
           ├── EvidenceItems
           ├── AgentRuns -> ToolCalls
           ├── DispositionProposals -> VerificationResults
           ├── Approvals
           ├── StagedActions
           └── Outcomes
```

## 5. Invariants

- a record belongs to exactly one merchant scope;
- currency is explicit on every amount-bearing record;
- case version increments on mutable state changes;
- audit event IDs are unique;
- audit events are immutable;
- a staged financial action belongs to exactly one case/proposal;
- a `RESOLVE` proposal cannot become effective if required verification checks fail.

## 6. Database constraints

Prefer database constraints for invariants that must hold under concurrency: unique source IDs within source/merchant scope, foreign keys for required lineage, unique idempotency keys, unique active staging per eligible proposal, and valid enum constraints.

---

# Part II — Readiness Resolutions (v2.0.0, locked 2026-08-31)

## 7. Identity entities (D3)

Added because `Approval.actor_id` and the three roles had no backing entities.

### User
Fields: `id`, `external_subject`, `display_name`, `status`, `created_at`.

### UserMerchantRole
Fields: `id`, `user_id`, `merchant_id`, `role` (`OPERATOR` | `APPROVER` | `ADMIN`), `created_at`.
Unique on `(user_id, merchant_id)`.

**Tenant membership is read only from `UserMerchantRole`.** A merchant ID from a request payload, path parameter, or model output is data — never authorization (`AUTHORIZATION_MODEL.md` §3).

## 8. `Outcome.actual_cause` → `human_assigned_cause` (D5)

Renamed to close a leakage channel. The original name invited the evaluation harness to write the generator's gold cause into a table the application — and transitively the agent — can read.

| Property | Rule |
|---|---|
| Written by | A **human** decision only |
| Never written by | The generator, the evaluation harness, the scoring oracle, the agent |
| Values | The `CAUSE_TAXONOMY.md` closed set, or `null` |
| Meaning | What the operator concluded — **not** ground truth |

A permanent regression test must assert the evaluation harness never writes this column (`TESTING.md` §14).

## 9. Settlement batches (readiness A-8)

`Settlement.settlement_batch_id` referenced a table that did not exist. Added:

### SettlementBatch
Fields: `id`, `merchant_id`, `batch_reference`, `cycle_date`, `status`, `created_at`.

`Invoice.line_items` becomes a child table `InvoiceLine` (`id`, `invoice_id`, `line_type`, `amount_minor`, `currency`, `description`, `source_record_id`) so invoice lines are queryable and can carry lineage like every other amount-bearing record. `Capture` remains an attribute (`Payment.captured_at`), surfaced as a lifecycle event in the case timeline rather than as its own entity.

## 10. Amended invariants

Adding to §5:

- every merchant-owned record is reachable only through a `MerchantScope` derived from `RequestContext`;
- `human_assigned_cause` is never written by an automated process;
- audit events are `INSERT`-only for the application role (`UPDATE`/`DELETE` revoked at the database);
- `CLOSED` requires an `Outcome`, except when reached via `RECONCILED`;
- hidden truth has **no** representation in the application database.
