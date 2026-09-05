# Release Checklist

## Product
- [ ] Primary workflow works end-to-end.
- [ ] Scenario path persists state.
- [ ] Exception queue is durable.
- [ ] Approval path is protected.

## Engineering
- [ ] Architecture check complete.
- [ ] No oversized files beyond approved exceptions.
- [ ] No duplicated business logic.
- [ ] Migrations tested.

## Security
- [ ] Auth tests pass.
- [ ] Tenant isolation tests pass.
- [ ] Prompt injection tests pass.
- [ ] Secret scan passes.
- [ ] Dependency audit passes.

## Financial safety
- [ ] Money arithmetic uses safe representation.
- [ ] Verifier gates RESOLVE.
- [ ] AI cannot mutate financial truth.
- [ ] Human approval is enforced.

## Evaluation
- [ ] Dataset leakage audit passes.
- [ ] Benchmark manifest frozen.
- [ ] Results reproducible.
- [ ] Limitations documented.

## Deployment
- [ ] Clean build.
- [ ] Clean startup.
- [ ] Health/ready checks.
- [ ] Production configuration documented.
