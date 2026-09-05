-- 0007_scenarios_and_workflow.sql
-- Phase 3: scenario instantiation, investigation lifecycle, evidence requests.
--
-- Scenario instances record WHICH controlled scenario produced a case, and the seed that
-- makes it reproducible. The expected cause is stored here and is deliberately NOT
-- reachable from any case-facing query or API projection: a scenario is allowed to
-- control defect injection deterministically, but it must never hand the answer to the
-- system under test (specs/SCENARIO_ENGINE.md, specs/LEAKAGE_AUDIT.md section 7).

CREATE TABLE scenario_instances (
    id                    UUID PRIMARY KEY,
    merchant_id           UUID NOT NULL REFERENCES merchants (id),
    scenario_id           TEXT NOT NULL,
    seed                  BIGINT NOT NULL,
    idempotency_key       TEXT NOT NULL,
    status                TEXT NOT NULL CHECK (status IN ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED')),
    import_id             UUID REFERENCES imports (id),
    reconciliation_run_id UUID REFERENCES reconciliation_runs (id),
    -- Demonstration checkpoint only. Never exposed through a case or evidence endpoint.
    expected_cause        TEXT,
    records_created       INTEGER NOT NULL DEFAULT 0,
    cases_created         INTEGER NOT NULL DEFAULT 0,
    failure_code          TEXT,
    correlation_id        UUID NOT NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at          TIMESTAMPTZ,
    CONSTRAINT scenario_instances_idempotency_unique UNIQUE (merchant_id, idempotency_key)
);

CREATE INDEX scenario_instances_merchant_idx
    ON scenario_instances (merchant_id, created_at DESC);

-- Investigation runs. The AI agent is NOT implemented in this phase; a run records the
-- durable lifecycle, and with AI investigation disabled it terminates in a safe
-- non-resolve path rather than fabricating a result (specs/SAFETY.md section 7).
CREATE TABLE investigations (
    id              UUID PRIMARY KEY,
    case_id         UUID NOT NULL REFERENCES reconciliation_cases (id) ON DELETE CASCADE,
    merchant_id     UUID NOT NULL REFERENCES merchants (id),
    status          TEXT NOT NULL CHECK (status IN ('RUNNING', 'SUCCEEDED', 'FAILED')),
    failure_code    TEXT,
    case_version_at_start INTEGER NOT NULL,
    tool_call_count INTEGER NOT NULL DEFAULT 0,
    model_version   TEXT,
    prompt_version  TEXT,
    policy_version  TEXT NOT NULL,
    correlation_id  UUID NOT NULL,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at     TIMESTAMPTZ
);

CREATE INDEX investigations_case_idx ON investigations (case_id, started_at DESC);

-- At most one active investigation per case.
CREATE UNIQUE INDEX investigations_one_active
    ON investigations (case_id)
    WHERE status = 'RUNNING';

CREATE TABLE evidence_requests (
    id           UUID PRIMARY KEY,
    case_id      UUID NOT NULL REFERENCES reconciliation_cases (id) ON DELETE CASCADE,
    merchant_id  UUID NOT NULL REFERENCES merchants (id),
    requested_by UUID REFERENCES users (id),
    detail       TEXT NOT NULL,
    status       TEXT NOT NULL CHECK (status IN ('OPEN', 'RESOLVED', 'EXPIRED')),
    expires_at   TIMESTAMPTZ NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at  TIMESTAMPTZ
);

-- At most one open evidence request per case.
CREATE UNIQUE INDEX evidence_requests_one_open
    ON evidence_requests (case_id)
    WHERE status = 'OPEN';

-- Link a case back to the scenario that produced it, for replay and demo inspection.
ALTER TABLE reconciliation_cases
    ADD COLUMN scenario_instance_id UUID REFERENCES scenario_instances (id);

CREATE INDEX cases_scenario_idx ON reconciliation_cases (scenario_instance_id);

GRANT SELECT, INSERT, UPDATE, DELETE
    ON scenario_instances, investigations, evidence_requests
    TO settlementops_app;
