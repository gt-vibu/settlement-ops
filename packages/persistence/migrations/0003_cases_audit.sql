-- 0003_cases_audit.sql
-- Reconciliation cases, audit, jobs and idempotency.
--
-- The case state CHECK constraint enumerates all seventeen canonical states
-- (specs/STATE_MACHINE.md v2.0.0). Enforcing it at the database means an invalid
-- state cannot be written even if application validation is bypassed.

CREATE TABLE reconciliation_cases (
    id                        UUID PRIMARY KEY,
    merchant_id               UUID NOT NULL REFERENCES merchants (id),
    case_number               TEXT NOT NULL,
    state                     TEXT NOT NULL CHECK (state IN (
                                  'RECEIVED', 'NORMALIZED', 'MATCHING', 'RECONCILED',
                                  'EXCEPTION', 'INVESTIGATING', 'ACTION_PROPOSED',
                                  'APPROVAL_PENDING', 'APPROVED', 'REJECTED',
                                  'REQUESTING_EVIDENCE', 'ESCALATED', 'STAGED',
                                  'APPLIED', 'OUTCOME_LOGGED', 'CLOSED', 'REOPENED')),
    priority                  INTEGER NOT NULL DEFAULT 0,
    discrepancy_amount_minor  BIGINT NOT NULL,
    currency                  CHAR(3) NOT NULL,
    deterministic_reason      TEXT NOT NULL,
    case_version              INTEGER NOT NULL DEFAULT 1 CHECK (case_version >= 1),
    opened_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at                 TIMESTAMPTZ,
    CONSTRAINT cases_number_unique UNIQUE (merchant_id, case_number)
);

CREATE INDEX cases_merchant_state_idx ON reconciliation_cases (merchant_id, state);
CREATE INDEX cases_merchant_opened_idx ON reconciliation_cases (merchant_id, opened_at);

-- Append-only. UPDATE and DELETE are revoked from the application role in 0004.
CREATE TABLE audit_events (
    id             UUID PRIMARY KEY,
    merchant_id    UUID NOT NULL REFERENCES merchants (id),
    entity_type    TEXT NOT NULL,
    entity_id      TEXT NOT NULL,
    event_type     TEXT NOT NULL,
    actor_type     TEXT NOT NULL,
    actor_id       TEXT,
    correlation_id UUID NOT NULL,
    causation_id   UUID,
    previous_state TEXT,
    next_state     TEXT,
    case_version   INTEGER,
    payload_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
    schema_version TEXT NOT NULL DEFAULT 'v1',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX audit_events_merchant_created_idx ON audit_events (merchant_id, created_at);
CREATE INDEX audit_events_entity_idx ON audit_events (entity_type, entity_id, created_at);

CREATE TABLE jobs (
    id             UUID PRIMARY KEY,
    merchant_id    UUID REFERENCES merchants (id),
    job_type       TEXT NOT NULL,
    status         TEXT NOT NULL CHECK (status IN (
                       'PENDING', 'CLAIMED', 'SUCCEEDED', 'FAILED', 'ABANDONED')),
    attempts       INTEGER NOT NULL DEFAULT 0,
    payload_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
    correlation_id UUID NOT NULL,
    claimed_at     TIMESTAMPTZ,
    heartbeat_at   TIMESTAMPTZ,
    completed_at   TIMESTAMPTZ,
    failure_code   TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX jobs_claimable_idx ON jobs (status, created_at);

CREATE TABLE idempotency_keys (
    id            UUID PRIMARY KEY,
    merchant_id   UUID NOT NULL REFERENCES merchants (id),
    operation     TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    result_json   JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at    TIMESTAMPTZ NOT NULL,
    CONSTRAINT idempotency_unique UNIQUE (merchant_id, operation, idempotency_key)
);
