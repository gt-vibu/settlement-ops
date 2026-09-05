# Specification Consistency Checklist

## Product
- [ ] PRD matches PRODUCT_SCOPE.
- [ ] PRD matches state machine.

## Architecture
- [ ] Architecture components match repository structure.
- [ ] System design does not contradict architecture.

## Data
- [ ] Data model supports every API contract.
- [ ] Every financial amount has currency.
- [ ] Audit fields are sufficient.

## AI
- [ ] Agent spec matches tool catalog.
- [ ] Prompts do not contain hidden truth.
- [ ] Disposition schema matches verifier.

## Evaluation
- [ ] Dataset can produce every required cause.
- [ ] Leakage audit runs before freeze.
- [ ] Baseline/treatment definitions are stable.

## Security
- [ ] Tool authorization is explicit.
- [ ] Tenant scope exists on every merchant-owned operation.
- [ ] State transitions are server-enforced.

## UI boundary
- [ ] API supports required product surfaces.
- [ ] UI is not implemented by the coding agent.
