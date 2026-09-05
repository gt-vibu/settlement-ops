# Observability

## 1. Correlation

Every API request, worker job, agent run, tool call, state transition and audit event carries a correlation ID.

## 2. Logs

Use structured JSON logs where supported. Include event name, severity, request/job/trace ID, merchant scope, latency and outcome code.

Never log secrets or raw authorization headers.

## 3. Metrics

### Product metrics
- open exceptions;
- exceptions by state;
- amount affected;
- resolution rate;
- human review rate;
- request-evidence rate.

### AI metrics
- investigation success/failure;
- tool calls per run;
- model latency;
- schema validation failures;
- verifier override rate;
- unsupported resolution rate.

### System metrics
- request latency;
- DB latency;
- worker failures;
- queue depth;
- job retry count;
- dependency health.

## 4. Traces

An investigation trace should connect:

```text
case -> agent run -> tool call 1 -> tool call 2 -> proposal -> verification -> approval
```

## 5. Alerting for MVP

At minimum surface:

- verifier override spike;
- repeated model failures;
- tool failure spike;
- worker backlog;
- authorization failures;
- database connectivity errors.

## 6. Stack (D1)

Pino structured JSON logs; OpenTelemetry-compatible traces and metrics. Never log secrets, authorization headers, or the `EVAL_DATABASE_URL`.

## 7. Additional required metrics (D4–D6)

- cases by each of the **seventeen** states (`STATE_MACHINE.md` v2.0.0);
- `RECONCILED` vs `CLOSED`-after-investigation, counted separately;
- evidence-request expiries;
- proposal invalidations from late evidence;
- stale-approval conflicts;
- **verifier downgrade rate** (single-pass, so this is a clean per-proposal rate);
- kill-switch state changes;
- **cross-tenant authorization failures** (a spike is a security signal, not noise).

## 8. Trace shape (D6)

```text
case → agent run → tool calls → proposal → [terminal verification] → human decision
```

The verification span **terminates** the agent run. No span may show verifier output flowing back into the model.
