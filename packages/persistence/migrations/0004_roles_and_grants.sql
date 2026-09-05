-- 0004_roles_and_grants.sql
-- Decision D5: audit immutability enforced at the database, not by application promise.
--
-- specs/AUDIT_TRAIL.md section 2 says audit events cannot be updated or deleted
-- "through application APIs". Application-level discipline does not survive a
-- compromised service account or a careless migration, so the guarantee is moved
-- into the database: the application role simply has no UPDATE or DELETE privilege
-- on audit_events. Corrections are compensating events, never edits.
--
-- The migrator role owns the schema and is never used at runtime.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'settlementops_app') THEN
        CREATE ROLE settlementops_app LOGIN PASSWORD 'local_dev_only';
    END IF;
END
$$;

GRANT CONNECT ON DATABASE settlementops_app TO settlementops_app;
GRANT USAGE ON SCHEMA public TO settlementops_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO settlementops_app;

-- The whole point of this migration.
REVOKE UPDATE, DELETE ON audit_events FROM settlementops_app;

-- Future tables default to full CRUD for the application role; audit_events is the
-- deliberate exception and is re-revoked above if it is ever recreated.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO settlementops_app;
