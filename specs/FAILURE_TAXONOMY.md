# Failure Taxonomy

## Data failures

- malformed record;
- missing required field;
- invalid currency;
- impossible timestamp;
- duplicate source record;
- inconsistent lineage.

## Reconciliation failures

- no candidate match;
- multiple candidate matches;
- amount mismatch;
- lifecycle mismatch;
- timing outside configured window.

## Agent failures

- model timeout;
- invalid structured output;
- unsupported tool request;
- loop/repetition;
- evidence hallucination;
- policy violation.

## Tool failures

- timeout;
- dependency error;
- authorization failure;
- empty result where a result is expected;
- schema mismatch.

## Workflow failures

- stale case version;
- invalid state transition;
- duplicate approval;
- duplicate staging.

## Security failures

- cross-tenant access;
- prompt injection acceptance;
- secret exposure;
- authorization bypass;
- unsafe file handling.

## Response principle

A safety/financial-integrity failure always takes precedence over throughput. Fail closed for resolution and preserve an auditable explanation.
