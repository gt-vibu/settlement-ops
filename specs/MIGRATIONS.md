# Database Migrations

## Requirements

Migrations are the only supported mechanism for schema evolution in production-like environments.

## Rules

- migrations are ordered;
- each migration has a unique identifier;
- migrations are reviewed;
- destructive changes require an explicit migration note;
- application code supports the schema version it expects.

## Fresh-database test

CI must create a fresh database, apply all migrations, and run a smoke test.

## Rollback

Where practical, provide a safe rollback or a forward-only remediation plan. Never rely on editing migration history after it has been applied.

## Tooling and roles (D1/D5)

Drizzle migrations, run explicitly with the **`settlementops_migrator`** credential — never the application credential, and never at application startup.

Migration `0001` must establish the audit grant: `REVOKE UPDATE, DELETE ON audit_events FROM settlementops_app`. CI's fresh-database test verifies the revocation actually holds, not merely that the statement ran.

`settlementops_eval` migrates separately, under its own credential, in the evaluation harness.
