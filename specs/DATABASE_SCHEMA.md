# Database Schema Design

## Principles

- PostgreSQL is the canonical persistent store.
- Money uses integer minor units.
- Foreign keys protect lineage.
- Unique constraints protect idempotency and duplicate prevention.
- Audit tables are append-only.

## Core tables

Recommended logical tables:

- merchants
- orders
- payments
- fee_lines
- tax_lines
- refunds
- adjustments
- settlements
- settlement_lines
- bank_credits
- ledger_entries
- invoices
- reconciliation_cases
- candidate_explanations
- evidence_items
- agent_runs
- tool_calls
- disposition_proposals
- verification_results
- approvals
- staged_actions
- outcomes
- audit_events
- jobs
- idempotency_keys

## Keys

Use UUIDs/internal identifiers for application entities and preserve source IDs in dedicated fields. Do not use human-readable case numbers as database primary keys.

## Indexes

Index based on known access patterns such as:

- `(merchant_id, state)` on cases;
- `(merchant_id, created_at)` on events;
- `(merchant_id, source_system, source_record_id)` unique where appropriate;
- `(case_id, created_at)` on audit/investigation tables.

Avoid indexing every column without evidence.

## Migrations

Use versioned migrations. Application startup must not silently mutate production schema.

---

# Part II — Readiness Resolutions (v2.0.0, locked 2026-08-31)

## Two databases (D5)

| Database | Loaded by | Contents |
|---|---|---|
| `settlementops_app` | `apps/api`, `apps/worker` | All application tables below |
| `settlementops_eval` | evaluation harness **only** | `hidden_case_truth`, `generator_runs`, `split_manifest`, `scoring_oracle_results` |

The application never loads the evaluation credential. Hidden truth is **unreachable**, not merely unread.

## Two roles (D5)

| Role | Grants |
|---|---|
| `settlementops_migrator` | Owns the schema; runs migrations; not used at runtime |
| `settlementops_app` | CRUD on application tables; on `audit_events` **`SELECT`/`INSERT` only — `UPDATE`/`DELETE` revoked** |

A test must assert that `UPDATE audit_events` under the application role **fails at the database**.

## Added tables

- `users`, `user_merchant_roles` (D3 — identity and membership)
- `settlement_batches` (A-8)
- `invoice_lines` (A-8)
- `fee_schedules`, `fee_schedule_rates` (`EXPERIMENT_CONSTANTS.md` §2 — two effective-dated versions)
- `evidence_requests` (`REQUESTING_EVIDENCE` lifecycle and its 7-day expiry)

## Query layer

Drizzle (D1). Parameterized queries only; no string-built SQL; **no model-generated SQL ever** (`SECURITY.md` T3).

## Tenant scope

Every merchant-owned table carries `merchant_id`, indexed as `(merchant_id, …)` per `ARCHITECTURE.md`. Every merchant-owned query filters on it, sourced from `RequestContext`. A CI check fails the build on a merchant-owned query lacking a tenant predicate.

## Case state column

`reconciliation_cases.state` is constrained to the **seventeen** states of `STATE_MACHINE.md` v2.0.0 (adds `RECONCILED`, `APPLIED`, `OUTCOME_LOGGED`). Enum constraint at the database, not application-only validation.
