# Error Contract

## Stable envelope

```json
{
  "error": {
    "code": "STRING_CODE",
    "message": "Safe human-readable message",
    "request_id": "uuid",
    "details": {}
  }
}
```

## Categories

- `VALIDATION_ERROR`
- `UNAUTHENTICATED`
- `FORBIDDEN`
- `NOT_FOUND`
- `CONFLICT`
- `INVALID_STATE`
- `IDEMPOTENCY_CONFLICT`
- `DEPENDENCY_UNAVAILABLE`
- `MODEL_FAILURE`
- `TOOL_FAILURE`
- `VERIFICATION_FAILURE`
- `INTERNAL_ERROR`

## Rules

Messages must not reveal stack traces, SQL, filesystem paths or secrets.

Error codes are stable contracts; messages may evolve.
