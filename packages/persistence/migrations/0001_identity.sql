-- 0001_identity.sql
-- Identity and tenancy. Decision D3 (specs/AUTHORIZATION_MODEL.md v2.0.0).
--
-- users and user_merchant_roles exist because Approval.actor_id and the three roles
-- had no backing entities in the original schema. Tenant membership is read from
-- user_merchant_roles and never from a request header.

CREATE TABLE merchants (
    id                    UUID PRIMARY KEY,
    status                TEXT NOT NULL CHECK (status IN ('ACTIVE', 'SUSPENDED')),
    configuration_version TEXT NOT NULL DEFAULT 'v1',
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
    id               UUID PRIMARY KEY,
    external_subject TEXT NOT NULL UNIQUE,
    display_name     TEXT NOT NULL,
    status           TEXT NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE')),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_merchant_roles (
    id          UUID PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    merchant_id UUID NOT NULL REFERENCES merchants (id) ON DELETE CASCADE,
    role        TEXT NOT NULL CHECK (role IN ('OPERATOR', 'APPROVER', 'ADMIN')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT user_merchant_roles_unique UNIQUE (user_id, merchant_id)
);

CREATE INDEX user_merchant_roles_user_idx ON user_merchant_roles (user_id);
