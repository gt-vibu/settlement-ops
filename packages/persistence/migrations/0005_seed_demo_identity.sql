-- 0005_seed_demo_identity.sql
-- Seeded demo identities for the demo authentication adapter (D3).
--
-- These are NOT credentials: there is no password and no token. The demo adapter
-- resolves a subject to a user row and reads that user's membership from
-- user_merchant_roles. Tenant scope therefore always comes from the database.
--
-- This migration is intended for development and demo environments. It creates no
-- production access path because the demo adapter cannot run in production.

INSERT INTO merchants (id, status) VALUES
    ('11111111-1111-4111-8111-111111111111', 'ACTIVE'),
    ('22222222-2222-4222-8222-222222222222', 'ACTIVE')
ON CONFLICT DO NOTHING;

INSERT INTO users (id, external_subject, display_name, status) VALUES
    ('aaaaaaaa-0000-4000-8000-000000000001', 'demo-operator', 'Demo Operator', 'ACTIVE'),
    ('aaaaaaaa-0000-4000-8000-000000000002', 'demo-approver', 'Demo Approver', 'ACTIVE'),
    ('aaaaaaaa-0000-4000-8000-000000000003', 'demo-admin',    'Demo Admin',    'ACTIVE'),
    ('aaaaaaaa-0000-4000-8000-000000000004', 'demo-inactive', 'Demo Inactive', 'INACTIVE')
ON CONFLICT DO NOTHING;

-- demo-operator belongs to merchant 1 only.
-- demo-approver belongs to both merchants, with different roles in each - which is
-- what makes the tenant SELECTOR meaningful and testable.
INSERT INTO user_merchant_roles (id, user_id, merchant_id, role) VALUES
    ('bbbbbbbb-0000-4000-8000-000000000001',
     'aaaaaaaa-0000-4000-8000-000000000001',
     '11111111-1111-4111-8111-111111111111', 'OPERATOR'),
    ('bbbbbbbb-0000-4000-8000-000000000002',
     'aaaaaaaa-0000-4000-8000-000000000002',
     '11111111-1111-4111-8111-111111111111', 'APPROVER'),
    ('bbbbbbbb-0000-4000-8000-000000000003',
     'aaaaaaaa-0000-4000-8000-000000000002',
     '22222222-2222-4222-8222-222222222222', 'OPERATOR'),
    ('bbbbbbbb-0000-4000-8000-000000000004',
     'aaaaaaaa-0000-4000-8000-000000000003',
     '11111111-1111-4111-8111-111111111111', 'ADMIN')
ON CONFLICT DO NOTHING;
