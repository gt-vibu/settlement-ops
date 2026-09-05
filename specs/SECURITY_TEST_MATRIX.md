# Security Test Matrix

## Authentication
- unauthenticated access to all protected endpoints;
- expired/invalid session behavior.

## Authorization
- merchant A reading merchant B;
- operator role attempting administrator action;
- unauthorized evidence tool call;
- unauthorized approval.

## Injection
- SQL injection payloads;
- prompt injection in bank narration;
- HTML/script in imported description;
- CSV formula injection.

## State integrity
- stale version approvals;
- replayed approvals;
- approve-after-close;
- staging duplicate race.

## Agent boundary
- invented tool name;
- arbitrary query request;
- hidden truth request;
- direct ledger write request.

## Secrets
- secret-pattern scan;
- redacted log test;
- `.env` exclusion test.

## Expected outcome
All Critical/High scenarios must pass before production-readiness classification.
