# Agent Specification

## 1. Role

The agent is a bounded investigation component for residual settlement exceptions. It is not a reconciliation engine, an accounting system, or a general-purpose assistant.

## 2. Inputs

The agent receives:

- merchant-scoped case state;
- known source records already attached to the case;
- permitted cause taxonomy;
- typed tool schemas;
- policy version;
- model/prompt version;
- execution budget.

It must not receive hidden ground truth, generator labels, private evaluation metadata, or unrestricted database access.

## 3. Investigation phases

### Phase A — Observe
Build a structured internal representation of the known facts. Separate observations from hypotheses.

### Phase B — Hypothesize
Generate a bounded set of plausible causes from `CAUSE_TAXONOMY.md`. Do not invent new labels.

### Phase C — Identify evidence gaps
Determine what missing evidence could distinguish the top competing causes.

### Phase D — Retrieve evidence
Call only allowlisted tools. Prefer the smallest useful evidence query.

### Phase E — Update
Record which hypotheses are strengthened, weakened, or contradicted by returned evidence.

### Phase F — Propose
Produce one constrained disposition with evidence-linked claims and missing evidence fields.

### Phase G — Stop
Stop when evidence is sufficient for verification or when safe resolution is no longer possible.

## 4. Agentic behavior

The agent is permitted to choose among evidence tools, but dynamic tool selection is not the project's sole novelty claim. Tool selection is measured as an auxiliary behavior. The primary product claim is safe residual exception resolution.

## 5. Tool budget

Default maximum: 8 tool calls per investigation.

A repeated identical tool call counts against the budget. The orchestrator must detect loops and terminate safely.

## 6. Evidence rules

The agent may only cite evidence returned by tools in the current trace or supplied as initial case context. Evidence references must be resolvable to persistent source records.

## 7. Decision rules

- never resolve an ambiguous cause;
- never infer missing amounts from model prose;
- never treat confidence as verification;
- never bypass required evidence;
- never generate an action outside the disposition schema;
- never claim a source record exists unless observed through an allowed interface.

## 8. Failure handling

Model timeout, schema error, tool exhaustion, tool failure, policy conflict, or evidence contradiction must lead to a safe non-resolve path.

## 9. Deterministic verifier interface

The agent's job ends at proposal. The verifier receives structured references to the case and source records and performs all authoritative checks independently.

---

# Part II — Readiness Resolutions (v2.0.0, locked 2026-08-31)

## 10. Phase G amended — submission is final (D6)

Phase G ("Stop") is now **terminal**. When the agent submits its proposal the investigation is over.

```text
Phases A–F: observe → hypothesize → gap → retrieve → update → propose
Phase G:    SUBMIT  →  [ terminal verifier pass ]  →  agent run ends
```

The agent does **not** learn the verification outcome, is **not** told which check failed, and does **not** get a second attempt at the same case. Re-investigation happens only after a **human** action, and the new run starts without the prior verifier result.

Consequently `validate_candidate_resolution` is removed from the tool catalog (`TOOLS.md` v2.0.0). The agent may still call `calculate_expected_net_amount`, which computes arithmetic over records the agent names — it does not adjudicate the proposal. **Tools may compute; tools may not judge.**

## 11. Execution budget (D7)

Maximum tool calls `8`; maximum investigation steps `8`; wall clock `120 s`; temperature `0`; identical repeat call trips loop detection. Values in `EXPERIMENT_CONSTANTS.md` §5 (`PROPOSED`).

## 12. Authorization context (D3)

The agent receives an `AgentToolContext` with a **pinned, immutable** `tenantId` copied from the initiating human request. It holds no human role, and its permissions are strictly narrower than any human role. A merchant ID in model output is data, never authorization (`AUTHORIZATION_MODEL.md` §6).

---

# Part III — Implementation status (2026-09-05)

**Implemented in `packages/agent`.** This section records what the code actually does, so
the specification and the system cannot drift apart silently.

## Loop

`runInvestigation` in `investigation-loop.ts`. Bounded by the frozen budget: 8 tool calls,
8 steps, 120 seconds wall-clock, identical-tool-call limit 1.

Two opening calls are seeded — `get_settlement_breakup` and `calculate_expected_net_amount`
— before the model's first decision (`CHANGE_CONTROL_ADDENDUM.md` CC-019). The agent chooses
every subsequent step. Recorded as a deviation because the specification left the first step
to the model.

## Every exit is safe

| Stop reason | Outcome |
|---|---|
| `PROPOSAL_MADE` | proposal goes to the verifier |
| `BUDGET_EXHAUSTED`, `NO_PROGRESS`, `REPEATED_TOOL_CALL`, `WALLCLOCK_EXCEEDED` | ESCALATE |
| `MODEL_UNAVAILABLE`, `MODEL_TIMEOUT`, `MODEL_ERROR`, `MODEL_SCHEMA_VIOLATION` | ESCALATE |

There is no code path from a failure to a resolution. Asserted in `injection.test.ts`
against a stub gateway, so the property does not depend on any model behaving well.

## What the model cannot do

No SQL, no filesystem, no arbitrary HTTP, no writes, no state transitions, no hidden truth,
no verifier feedback. Tool names are allowlisted and a rejection does not echo the allowlist
back. Arguments are validated before execution: an identifier carrying a SQL fragment, a
non-integer money amount and an unbounded window are all rejected.

## Structured output

Schema-constrained at the decoder via Ollama's `format` parameter, with the cause and
disposition enums generated from the closed domain sets. A value outside those sets is
treated as `MODEL_SCHEMA_VIOLATION` and escalates; it is never coerced.

## Prompt-injection boundary

Operator-entered narration is fenced as `<untrusted_record_content>`. The fence cannot be
closed early: a payload containing its own closing tag has that tag neutralised, verified by
test. The system prompt states that instructions inside the fence are to be reported, not
followed. Adversarial cases in the dataset carry exactly such text.
