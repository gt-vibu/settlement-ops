-- 0006_ingestion_and_runs.sql
-- Phase 2: ingestion, deterministic reconciliation runs, and residual case linkage.
--
-- Two idempotency guarantees are enforced here at the database rather than in
-- application code, because both must hold under concurrency:
--   1. an import replayed with the same idempotency key cannot create a second import;
--   2. a reconciliation run cannot create two cases for the same payment.

CREATE TABLE imports (
    id               UUID PRIMARY KEY,
    merchant_id      UUID NOT NULL REFERENCES merchants (id),
    source_type      TEXT NOT NULL,
    status           TEXT NOT NULL CHECK (status IN ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED')),
    idempotency_key  TEXT NOT NULL,
    submitted_count  INTEGER NOT NULL DEFAULT 0,
    accepted_count   INTEGER NOT NULL DEFAULT 0,
    rejected_count   INTEGER NOT NULL DEFAULT 0,
    duplicate_count  INTEGER NOT NULL DEFAULT 0,
    validation_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
    correlation_id   UUID NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at     TIMESTAMPTZ,
    CONSTRAINT imports_idempotency_unique UNIQUE (merchant_id, idempotency_key)
);

CREATE INDEX imports_merchant_created_idx ON imports (merchant_id, created_at DESC);

CREATE TABLE reconciliation_runs (
    id              UUID PRIMARY KEY,
    merchant_id     UUID NOT NULL REFERENCES merchants (id),
    import_id       UUID REFERENCES imports (id),
    status          TEXT NOT NULL CHECK (status IN ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED')),
    policy_version  TEXT NOT NULL,
    evaluated_count INTEGER NOT NULL DEFAULT 0,
    reconciled_count INTEGER NOT NULL DEFAULT 0,
    residual_count  INTEGER NOT NULL DEFAULT 0,
    failure_code    TEXT,
    correlation_id  UUID NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ
);

CREATE INDEX reconciliation_runs_merchant_idx ON reconciliation_runs (merchant_id, created_at DESC);

-- Link a case back to the run and payment that produced it, and record the
-- deterministic evidence the baseline used to decide.
ALTER TABLE reconciliation_cases
    ADD COLUMN reconciliation_run_id UUID REFERENCES reconciliation_runs (id),
    ADD COLUMN payment_id            UUID REFERENCES payments (id),
    ADD COLUMN reasons               TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN checks_json           JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN policy_version        TEXT;

-- One case per payment per run. This is what makes a retried reconciliation job safe:
-- a re-run cannot double-create a case for the same payment.
CREATE UNIQUE INDEX cases_run_payment_unique
    ON reconciliation_cases (reconciliation_run_id, payment_id)
    WHERE reconciliation_run_id IS NOT NULL AND payment_id IS NOT NULL;

-- Evidence lineage: which source records the deterministic baseline consulted.
CREATE TABLE case_source_records (
    id          UUID PRIMARY KEY,
    case_id     UUID NOT NULL REFERENCES reconciliation_cases (id) ON DELETE CASCADE,
    merchant_id UUID NOT NULL REFERENCES merchants (id),
    record_type TEXT NOT NULL,
    record_id   UUID NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT case_source_records_unique UNIQUE (case_id, record_type, record_id)
);

CREATE INDEX case_source_records_case_idx ON case_source_records (case_id);

-- Ingested records carry the import that delivered them, for lineage and replay.
ALTER TABLE orders           ADD COLUMN import_id UUID REFERENCES imports (id);
ALTER TABLE payments         ADD COLUMN import_id UUID REFERENCES imports (id);
ALTER TABLE fee_lines        ADD COLUMN import_id UUID REFERENCES imports (id);
ALTER TABLE tax_lines        ADD COLUMN import_id UUID REFERENCES imports (id);
ALTER TABLE refunds          ADD COLUMN import_id UUID REFERENCES imports (id);
ALTER TABLE adjustments      ADD COLUMN import_id UUID REFERENCES imports (id);
ALTER TABLE settlements      ADD COLUMN import_id UUID REFERENCES imports (id);
ALTER TABLE settlement_lines ADD COLUMN import_id UUID REFERENCES imports (id);
ALTER TABLE bank_credits     ADD COLUMN import_id UUID REFERENCES imports (id);
ALTER TABLE ledger_entries   ADD COLUMN import_id UUID REFERENCES imports (id);

-- Source-uniqueness for the remaining record types, so a redelivered batch cannot
-- double-count. Partial where the source id is present.
ALTER TABLE fee_lines
    ADD CONSTRAINT fee_lines_source_unique UNIQUE (merchant_id, source_record_id);
ALTER TABLE tax_lines
    ADD CONSTRAINT tax_lines_source_unique UNIQUE (merchant_id, source_record_id);
ALTER TABLE adjustments
    ADD CONSTRAINT adjustments_source_unique UNIQUE (merchant_id, source_record_id);
ALTER TABLE settlement_lines
    ADD CONSTRAINT settlement_lines_source_unique UNIQUE (merchant_id, source_record_id);
ALTER TABLE ledger_entries
    ADD CONSTRAINT ledger_entries_source_unique UNIQUE (merchant_id, source_record_id);

-- settlement_lines needs merchant scope on its own index path for tenant-scoped queries.
CREATE INDEX settlement_lines_merchant_payment_idx
    ON settlement_lines (merchant_id, payment_id);

-- Grants for the new tables (0004 granted only what existed then).
GRANT SELECT, INSERT, UPDATE, DELETE ON imports, reconciliation_runs, case_source_records
    TO settlementops_app;
