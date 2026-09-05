# Operations

## Core operational views

The backend must support operational summaries such as:

- active exception count;
- amount affected;
- cases by state;
- pending approvals;
- investigation failures;
- verifier overrides;
- evidence requests.

## Feature control

AI investigation can be disabled through a privileged, audited configuration flag. Disabling it must not corrupt case state.

## Data repair

Never manually edit audit events or financial source records through ad-hoc SQL in a running environment. Use versioned migrations or compensating records.

## Backup/recovery

For the MVP, document database backup/restore assumptions and test that canonical workflow state can be restored without breaking idempotency.
