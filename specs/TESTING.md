# Testing Strategy

## Unit tests

Domain arithmetic, tolerance rules, cause checks, disposition verifier, state transitions, priority calculations and idempotency key generation.

## Integration tests

Repositories, migrations, transactions, worker jobs, tool adapters, model gateway mocks and verifier.

## API contract tests

Schema validation, auth, authorization, error envelopes, idempotency and state preconditions.

## Agent tests

- prompt injection;
- invalid schema output;
- fabricated evidence;
- forbidden tool call;
- repeated tool loop;
- tool timeout;
- contradictory evidence;
- safe escalation.

## Security tests

Cross-tenant reads, SQL injection, oversized input, CSV injection, leaked secrets, stale approvals.

## Scenario parity tests

A scenario created through the interactive path and the evaluation path must reach equivalent domain semantics from equivalent scenario definitions.

## Evaluation tests

Leakage audit, frozen test split, baseline/treatment harness, challenge data, statistical reporting.

## 7. Test organization

Keep tests close to the module they protect or in a clearly structured test tree. Avoid one enormous integration-test file.

## 8. Financial invariant tests

Examples:

- gross minus fee/tax/refund/adjustment equals expected net under the modeled rules;
- currency mismatch is rejected;
- negative or overflow values are handled correctly;
- duplicate source records do not double-count.

## 9. State machine tests

For every legal transition, have a positive test. For critical illegal transitions, have explicit negative tests.

## 10. Authorization tests

Every protected application use case should have at least one positive and one negative authorization test.

## 11. Property-oriented tests

Where suitable, test conservation properties across randomized amounts and transaction compositions rather than only hand-picked examples.

## 12. Contract tests

API DTO schemas and tool schemas should be tested independently so a client/agent cannot depend on accidental fields.

## 13. Failure injection

Inject:

- database timeout;
- model timeout;
- tool timeout;
- malformed model response;
- duplicate event;
- out-of-order event;
- stale approval;
- authorization failure.

Verify the resulting durable state.

## 14. Regression gate

Every previously fixed security or financial bug gets a permanent regression test.

---

# Part II — Readiness Resolutions (v2.0.0, locked 2026-08-31)

## 15. Test stack (D1)

Vitest for unit and integration tests. Integration tests run against a real PostgreSQL from Docker Compose — never an in-memory substitute, because the invariants under test (unique constraints, revoked grants, enum constraints, `SKIP LOCKED` claiming) are database behaviors that a fake cannot reproduce.

## 16. Required tests added by D3–D6

### Authentication / authorization (D3)
- unknown or inactive `X-Demo-User-ID` ⇒ `401`;
- **`X-Demo-Tenant-ID` naming a merchant the user does not belong to ⇒ `403`** (must not silently succeed);
- resource in another tenant ⇒ **`404`**, not `403`;
- `OPERATOR` attempting approval ⇒ `403`;
- swapping in a stub `AuthenticationAdapter` requires **no change below the boundary**.

### Hidden truth (D5)
- application credential reading `settlementops_eval` ⇒ **denied at the database**;
- `UPDATE audit_events` under the application role ⇒ **denied at the database**;
- **the evaluation harness never writes `human_assigned_cause`** (permanent regression test);
- serialized visible case payloads contain no cause label, seed, or gold disposition;
- agent tool results contain no generator metadata.

### Terminal verifier (D6)
- the verifier runs **exactly once** per proposal;
- **no verifier output appears in any prompt, tool result, or agent context** (assert over the captured trace);
- a verifier downgrade routes to `ESCALATED`, never back to `INVESTIGATING`;
- `validate_candidate_resolution` is **absent** from the tool registry;
- a re-investigation after human rejection does not receive the prior verifier result.

### State machine (D4)
- one positive test per legal transition in `STATE_MACHINE.md` §2;
- one negative test per illegal transition in §6, including **payload-manipulated** attempts;
- `APPROVED → CLOSED` with `recommended_action = NONE` writes an `Outcome` atomically;
- `REQUESTING_EVIDENCE` expiry routes to `ESCALATED`;
- late evidence invalidating a proposal increments the case version and **fails an in-flight approval with `CONFLICT`**;
- `EXCEPTION → ESCALATED` when the AI kill switch is off.

## 17. Constants under test

Tests assert the `INVARIANT` values of `EXPERIMENT_CONSTANTS.md` — tolerances, windows, fee/tax rates — as domain constants, so a change to a financial rule breaks a test rather than silently changing what "correct" means.
