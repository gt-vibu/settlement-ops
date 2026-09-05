# Scenario Engine

## Purpose

Provide a controlled interactive path for the product demo while reusing the same financial domain pipeline as batch evaluation.

## Scenario contract

A scenario definition contains:

- scenario ID;
- human-readable name;
- base amount/configuration;
- payment method label;
- lifecycle variant;
- defect/cause configuration stored outside the visible case payload;
- expected demonstration checkpoint.

## Instantiation

`POST /v1/demo/scenarios/{scenario_id}/instantiate`

This creates:

1. a demo merchant context;
2. a payment/order bundle;
3. settlement and related records;
4. injected scenario behavior;
5. a real persistent reconciliation run/case;
6. audit events.

## Same pipeline rule

Do not create a special demo-only reconciliation implementation. Scenario execution must call the same application/domain services used by evaluation.

## Deterministic scenario control

The scenario engine may control timing and defect injection deterministically to make a demo reproducible. It must not directly write the final case outcome.

## Replay

A scenario can be replayed using the same seed/version and should create a new isolated scenario instance with a new correlation ID.

## Authorization and gating (D3)

Scenario instantiation requires `ADMIN` **and** a demo/sandbox environment. In production `/v1/demo/*` is **not registered at all**. Scenario records are created only inside the requesting tenant.

## Parity under the locked pipeline (D4/D6)

Scenarios traverse the identical services as batch evaluation: same normalization, same reconciliation, same seventeen-state machine, same terminal verifier, same approval path. **There is no `isDemo` branch anywhere in domain, application or workflow code** — the scenario engine is an input adapter only, never an alternative pipeline. A parity test asserts equivalent domain semantics from equivalent scenario definitions.

Scenario definitions may control seed, timing and defect injection deterministically. They may **never** write a final case state, a proposal, a verification result, or an outcome.
