# Audit Trail

## 1. Purpose

The audit trail allows a reviewer to reconstruct what the system knew, what the AI proposed, what the deterministic verifier found, what the human approved, and what outcome followed.

## 2. Append-only invariant

Audit events cannot be updated or deleted through application APIs. Corrections are represented as new compensating events.

## 3. Required fields

Every audit event includes:

- event ID;
- merchant scope;
- entity type and ID;
- event type/version;
- actor type and ID;
- correlation ID;
- timestamp;
- previous/next state where applicable;
- model/prompt/policy version where applicable;
- payload hash or redacted payload.

## 4. AI investigation audit

Record:

- case snapshot ID;
- model proposal;
- tools called;
- tool result IDs;
- claims/evidence mapping;
- verifier checks;
- override reason;
- effective disposition.

## 5. Privacy

Store only the data needed to reconstruct decisions. Redact secrets and unnecessary PII.
