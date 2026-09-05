# Event Model

## 1. Event naming

Use past-tense domain events for facts that have occurred and command/job records for work to be performed.

Examples:

- `financial_record_ingested`
- `record_normalized`
- `reconciliation_completed`
- `reconciliation_exception_created`
- `investigation_started`
- `tool_call_completed`
- `disposition_proposed`
- `verification_completed`
- `approval_recorded`
- `staging_created`
- `outcome_logged`

## 2. Event envelope

```json
{
  "event_id": "uuid",
  "event_type": "string",
  "event_version": 1,
  "occurred_at": "ISO-8601",
  "ingested_at": "ISO-8601",
  "merchant_id": "merchant_x",
  "entity_type": "reconciliation_case",
  "entity_id": "case_123",
  "correlation_id": "uuid",
  "causation_id": "uuid|null",
  "payload": {}
}
```

## 3. Ordering

Ordering is guaranteed only where required within an entity's state transition stream. Global event ordering is not assumed.

## 4. Duplicate events

Consumers must be idempotent. `event_id` is the primary deduplication key.

## 5. Late events

Late-arriving financial records can reopen an investigation or create a new reconciliation state. The domain determines whether the event is a harmless informational update or a state-changing conflict.

## 6. Replay

Evaluation and scenario replay may regenerate events from a frozen seed. Production-like audit events must never be mutated to simulate a replay.

## 7. Event ownership

The module that owns the domain fact emits the event. Transport mechanisms may deliver it asynchronously but must not reinterpret its business meaning.
