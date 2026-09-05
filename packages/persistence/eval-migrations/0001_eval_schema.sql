-- 0001_eval_schema.sql
-- The hidden-truth database (Decision D5).
--
-- This schema lives in a SEPARATE PostgreSQL database, `settlementops_eval`, reachable
-- only by the `settlementops_eval` role. The application role has no CONNECT privilege
-- on it, so no amount of application-layer carelessness can reach a gold label: the
-- isolation is a database grant, not a code convention.
--
-- Nothing in apps/api, apps/worker, packages/agent or packages/tools may load
-- EVAL_DATABASE_URL. `scripts/check-deps.ts` fails the build if it appears there.

CREATE TABLE IF NOT EXISTS generator_runs (
    id                 UUID PRIMARY KEY,
    generator_version  TEXT        NOT NULL,
    experiment_version TEXT        NOT NULL,
    root_seed          BIGINT      NOT NULL,
    configuration_hash TEXT        NOT NULL,
    model_provider     TEXT        NOT NULL,
    model_name         TEXT        NOT NULL,
    model_digest       TEXT        NOT NULL,
    policy_version     TEXT        NOT NULL,
    git_commit         TEXT,
    started_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at       TIMESTAMPTZ,
    notes              JSONB       NOT NULL DEFAULT '{}'::jsonb
);

-- The combination registry defines what SEEN means. Built from the development split,
-- frozen, then hashed into the manifest. It must be unreachable from the application:
-- the registry IS the experimental variable.
CREATE TABLE IF NOT EXISTS combination_registry (
    id                UUID PRIMARY KEY,
    generator_run_id  UUID        NOT NULL REFERENCES generator_runs (id),
    -- Sorted, comma-joined cause codes, e.g. 'MDR_FEE' or 'MDR_FEE,TIMING_LAG'.
    cause_tuple       TEXT        NOT NULL,
    -- Configuration bucket seen with this tuple in development.
    amount_band       TEXT        NOT NULL,
    timing_band       TEXT        NOT NULL,
    line_count_band   TEXT        NOT NULL,
    payment_method    TEXT        NOT NULL,
    occurrences       INTEGER     NOT NULL DEFAULT 1,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (generator_run_id, cause_tuple, amount_band, timing_band, line_count_band, payment_method)
);

CREATE INDEX IF NOT EXISTS combination_registry_tuple_idx
    ON combination_registry (generator_run_id, cause_tuple);

CREATE TABLE IF NOT EXISTS split_manifest (
    id                UUID PRIMARY KEY,
    generator_run_id  UUID        NOT NULL REFERENCES generator_runs (id),
    split             TEXT        NOT NULL,
    split_seed        BIGINT      NOT NULL,
    merchant_id       UUID        NOT NULL,
    case_count        INTEGER     NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- A merchant in two splits silently invalidates every confidence interval.
    UNIQUE (generator_run_id, merchant_id)
);

CREATE INDEX IF NOT EXISTS split_manifest_split_idx
    ON split_manifest (generator_run_id, split);

-- The gold labels. Never joined to application data at runtime; the only key is the
-- payment id, which the scorer resolves after both systems have finished.
CREATE TABLE IF NOT EXISTS hidden_case_truth (
    id                   UUID PRIMARY KEY,
    generator_run_id     UUID        NOT NULL REFERENCES generator_runs (id),
    split                TEXT        NOT NULL,
    merchant_id          UUID        NOT NULL,
    payment_id           TEXT        NOT NULL,
    -- Sorted cause codes actually injected.
    true_causes          TEXT[]      NOT NULL,
    true_cause_tuple     TEXT        NOT NULL,
    true_disposition     TEXT        NOT NULL,
    novelty_stratum      TEXT        NOT NULL,
    amount_band          TEXT        NOT NULL,
    timing_band          TEXT        NOT NULL,
    line_count_band      TEXT        NOT NULL,
    payment_method       TEXT        NOT NULL,
    expected_residual    BOOLEAN     NOT NULL,
    discrepancy_minor    BIGINT      NOT NULL,
    -- Everything the generator decided, for forensic replay. Never served anywhere.
    injection_detail     JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (generator_run_id, payment_id)
);

CREATE INDEX IF NOT EXISTS hidden_case_truth_split_idx
    ON hidden_case_truth (generator_run_id, split);
CREATE INDEX IF NOT EXISTS hidden_case_truth_stratum_idx
    ON hidden_case_truth (generator_run_id, split, novelty_stratum);

-- Scoring output, one row per (system, case). Written only by the scorer, which runs
-- after every treatment has completed and never feeds anything back to a treatment.
CREATE TABLE IF NOT EXISTS scoring_oracle_results (
    id                   UUID PRIMARY KEY,
    generator_run_id     UUID        NOT NULL REFERENCES generator_runs (id),
    evaluation_run_id    UUID        NOT NULL,
    system               TEXT        NOT NULL,   -- A | B | C
    split                TEXT        NOT NULL,
    payment_id           TEXT        NOT NULL,
    novelty_stratum      TEXT        NOT NULL,
    true_cause_tuple     TEXT        NOT NULL,
    true_disposition     TEXT        NOT NULL,
    proposed_cause       TEXT,
    effective_disposition TEXT       NOT NULL,
    outcome              TEXT        NOT NULL,   -- CORRECT_RESOLVE | UNSUPPORTED_RESOLVE | ...
    verifier_passed      BOOLEAN,
    verifier_failures    TEXT[]      NOT NULL DEFAULT '{}',
    tool_call_count      INTEGER     NOT NULL DEFAULT 0,
    step_count           INTEGER     NOT NULL DEFAULT 0,
    latency_ms           INTEGER     NOT NULL DEFAULT 0,
    stop_reason          TEXT,
    detail               JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (evaluation_run_id, system, payment_id)
);

CREATE INDEX IF NOT EXISTS scoring_results_run_idx
    ON scoring_oracle_results (evaluation_run_id, system, split);
