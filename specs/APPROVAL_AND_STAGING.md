# Approval and Staging

## 1. Separation of proposal and execution

The AI creates a proposal. The verifier establishes the effective disposition. A human approves eligible financial staging.

## 2. Staging semantics

A staged action is an internal durable representation of an intended bounded action. It is not execution against a live payment/ledger network.

## 3. Approval checks

Before approval:

- case is in approval state;
- actor is authorized;
- case version matches;
- verified disposition is eligible;
- required evidence exists;
- proposal has not already been approved/rejected.

## 4. Idempotency

Approval requests repeat safely without creating duplicate stages.

## 5. Outcome state

Approval is not closure by itself. The staged action must produce an outcome event before the case becomes `CLOSED`.
