# Reliability

## Goals

- no acknowledged state change before durable commit;
- duplicate requests do not produce duplicate financial stages;
- transient external failures are bounded and observable;
- model failure leaves a durable safe state;
- long-running jobs survive worker restart.

## Idempotency

State-changing APIs accept or derive idempotency keys appropriate to the operation.

## Concurrency

Use optimistic versioning on cases and unique database constraints for single-active staging.

## Recovery

Workers detect abandoned jobs and retry only policies marked retryable.
