# Safety

## 1. Safety objective

Prevent the AI from creating an incorrect or unauthorized financial outcome while still allowing it to investigate difficult exceptions.

## 2. Safety layers

1. input validation;
2. merchant authorization;
3. deterministic domain invariants;
4. typed read-only tools;
5. structured model output;
6. deterministic verifier;
7. human approval;
8. durable audit.

## 3. Unsafe output handling

If any material model field is invalid, missing, contradictory, or unsupported, the application must use a safe non-resolve path.

## 4. Financial safety

The agent cannot directly:

- move funds;
- refund;
- pay out;
- transfer;
- post accounting truth;
- alter bank records.

## 5. Evidence safety

A model claim is not an observation. Every material claim must have evidence IDs. Evidence IDs must refer to records actually retrieved in the investigation trace.

## 6. Human safety

Human approval screens must display the verified effective disposition rather than trusting the model proposal. The original proposal remains visible in the audit trace for transparency.

## 7. Kill switch

If the implementation has a runtime feature flag for AI investigation, disabling the flag must route residuals to safe deterministic handling. The kill switch itself must be authorized and auditable.
