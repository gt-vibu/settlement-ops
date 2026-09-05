-- 0002_financial.sql
-- Financial lifecycle records (specs/DATA_MODEL.md section 3).
--
-- Money is BIGINT minor units with an explicit currency on every amount-bearing
-- record. No NUMERIC, no floating point anywhere in this schema.

CREATE TABLE orders (
    id                 UUID PRIMARY KEY,
    merchant_id        UUID NOT NULL REFERENCES merchants (id),
    customer_reference TEXT,
    amount_minor       BIGINT NOT NULL,
    currency           CHAR(3) NOT NULL,
    status             TEXT NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL,
    source_system      TEXT NOT NULL,
    source_record_id   TEXT NOT NULL,
    CONSTRAINT orders_source_unique UNIQUE (merchant_id, source_system, source_record_id)
);

CREATE TABLE payments (
    id               UUID PRIMARY KEY,
    merchant_id      UUID NOT NULL REFERENCES merchants (id),
    order_id         UUID REFERENCES orders (id),
    amount_minor     BIGINT NOT NULL,
    currency         CHAR(3) NOT NULL,
    payment_method   TEXT NOT NULL,
    status           TEXT NOT NULL,
    authorized_at    TIMESTAMPTZ,
    captured_at      TIMESTAMPTZ,
    source_system    TEXT NOT NULL,
    source_record_id TEXT NOT NULL,
    CONSTRAINT payments_source_unique UNIQUE (merchant_id, source_system, source_record_id)
);

CREATE INDEX payments_merchant_idx ON payments (merchant_id, captured_at);

CREATE TABLE settlement_batches (
    id              UUID PRIMARY KEY,
    merchant_id     UUID NOT NULL REFERENCES merchants (id),
    batch_reference TEXT NOT NULL,
    cycle_date      DATE NOT NULL,
    status          TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT settlement_batches_ref_unique UNIQUE (merchant_id, batch_reference)
);

CREATE TABLE settlements (
    id                  UUID PRIMARY KEY,
    merchant_id         UUID NOT NULL REFERENCES merchants (id),
    settlement_batch_id UUID REFERENCES settlement_batches (id),
    gross_amount_minor  BIGINT NOT NULL,
    net_amount_minor    BIGINT NOT NULL,
    currency            CHAR(3) NOT NULL,
    settlement_at       TIMESTAMPTZ NOT NULL,
    status              TEXT NOT NULL,
    utr                 TEXT,
    source_system       TEXT NOT NULL,
    source_record_id    TEXT NOT NULL,
    CONSTRAINT settlements_source_unique UNIQUE (merchant_id, source_system, source_record_id)
);

CREATE INDEX settlements_merchant_idx ON settlements (merchant_id, settlement_at);

CREATE TABLE settlement_lines (
    id               UUID PRIMARY KEY,
    settlement_id    UUID NOT NULL REFERENCES settlements (id) ON DELETE CASCADE,
    merchant_id      UUID NOT NULL REFERENCES merchants (id),
    payment_id       UUID REFERENCES payments (id),
    line_type        TEXT NOT NULL,
    amount_minor     BIGINT NOT NULL,
    currency         CHAR(3) NOT NULL,
    source_record_id TEXT NOT NULL
);

CREATE INDEX settlement_lines_settlement_idx ON settlement_lines (settlement_id);

CREATE TABLE fee_lines (
    id               UUID PRIMARY KEY,
    merchant_id      UUID NOT NULL REFERENCES merchants (id),
    payment_id       UUID REFERENCES payments (id),
    settlement_id    UUID REFERENCES settlements (id),
    fee_type         TEXT NOT NULL,
    amount_minor     BIGINT NOT NULL,
    currency         CHAR(3) NOT NULL,
    effective_date   DATE NOT NULL,
    source_record_id TEXT NOT NULL
);

CREATE TABLE tax_lines (
    id               UUID PRIMARY KEY,
    merchant_id      UUID NOT NULL REFERENCES merchants (id),
    fee_line_id      UUID REFERENCES fee_lines (id),
    tax_type         TEXT NOT NULL,
    amount_minor     BIGINT NOT NULL,
    currency         CHAR(3) NOT NULL,
    period           TEXT NOT NULL,
    source_record_id TEXT NOT NULL
);

CREATE TABLE refunds (
    id               UUID PRIMARY KEY,
    merchant_id      UUID NOT NULL REFERENCES merchants (id),
    payment_id       UUID NOT NULL REFERENCES payments (id),
    amount_minor     BIGINT NOT NULL,
    currency         CHAR(3) NOT NULL,
    status           TEXT NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL,
    settled_at       TIMESTAMPTZ,
    source_system    TEXT NOT NULL,
    source_record_id TEXT NOT NULL,
    CONSTRAINT refunds_source_unique UNIQUE (merchant_id, source_system, source_record_id)
);

CREATE TABLE adjustments (
    id               UUID PRIMARY KEY,
    merchant_id      UUID NOT NULL REFERENCES merchants (id),
    settlement_id    UUID REFERENCES settlements (id),
    reference        TEXT NOT NULL,
    amount_minor     BIGINT NOT NULL,
    currency         CHAR(3) NOT NULL,
    effective_at     TIMESTAMPTZ NOT NULL,
    reason_code      TEXT NOT NULL,
    source_record_id TEXT NOT NULL
);

CREATE TABLE bank_credits (
    id               UUID PRIMARY KEY,
    merchant_id      UUID NOT NULL REFERENCES merchants (id),
    utr              TEXT NOT NULL,
    amount_minor     BIGINT NOT NULL,
    currency         CHAR(3) NOT NULL,
    credited_at      TIMESTAMPTZ NOT NULL,
    bank_reference   TEXT NOT NULL,
    source_system    TEXT NOT NULL,
    source_record_id TEXT NOT NULL,
    CONSTRAINT bank_credits_source_unique UNIQUE (merchant_id, source_system, source_record_id)
);

CREATE INDEX bank_credits_utr_idx ON bank_credits (merchant_id, utr);

CREATE TABLE ledger_entries (
    id               UUID PRIMARY KEY,
    merchant_id      UUID NOT NULL REFERENCES merchants (id),
    reference_type   TEXT NOT NULL,
    reference_id     TEXT NOT NULL,
    amount_minor     BIGINT NOT NULL,
    currency         CHAR(3) NOT NULL,
    entry_type       TEXT NOT NULL,
    posted_at        TIMESTAMPTZ NOT NULL,
    status           TEXT NOT NULL,
    source_record_id TEXT NOT NULL
);
