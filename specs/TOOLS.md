# Agent Tools

**Version:** 2.0.0 (Readiness Decision D6 — locked 2026-08-31)
**Supersedes:** 1.0.0. Change recorded in `CHANGE_CONTROL.md` as CC-006.

## Tool design principles

Every tool:

- is narrowly scoped;
- accepts typed inputs (Zod-validated);
- enforces merchant authorization server-side from `AgentToolContext`, never from model-supplied IDs;
- returns typed structured output;
- includes source record IDs and lineage;
- is auditable;
- has a bounded result size (`O2` = 50 records per result);
- cannot execute arbitrary queries;
- **returns evidence, never verdicts.**

The last principle is new in v2.0.0 and is the reason one tool was removed.

## Removed in v2.0.0: `validate_candidate_resolution`

v1.0.0 offered the agent a tool returning "deterministic check results required by the disposition policy" — that is, **verifier output**. Decision D6 removes it.

### Why

With that tool present, the loop below is available to the model:

```text
propose → see which checks fail → adjust → re-check → repeat
```

That turns the verifier from an independent gate into a **feedback oracle**. Two things break:

1. **Safety.** The verifier stops being an independent check and becomes a target to be searched against. A proposal that passes after six adjustments is not evidence-grounded reasoning; it is fitting to the checker.
2. **Evaluation validity.** Evidence-Supported Resolution Rate would measure the model's ability to satisfy a checker it can query, not its ability to reason about evidence. The `EVALUATION.md` primary metric would no longer mean what it claims.

### The locked architecture

```text
          ┌──────────────────────────┐
          │  Agent investigates      │
          │  (evidence tools only)   │
          └────────────┬─────────────┘
                       │  submits final proposal
                       ▼
              ONE terminal verifier pass
                       │
           ┌───────────┴───────────┐
           │                       │
         PASS                    FAIL
           │                       │
     effective =            effective = safe
     model proposal            downgrade
           │                       │
           └───────────┬───────────┘
                       ▼
        Result is NEVER returned to the model
```

The agent may investigate freely **before** submitting. Once it submits, verification is **terminal**. The verifier never tells the model which check failed, and the model never gets a second attempt at the same case.

**Consequences to implement:**

- The verifier runs **exactly once** per proposal.
- A verifier failure does **not** re-enter `INVESTIGATING`. It routes to `ESCALATED` (`STATE_MACHINE.md` §3).
- Verifier output is written to the database and returned to the **human** API surface. It is never placed in a prompt, a tool result, or agent context.
- Re-investigation after a verifier downgrade requires a **human** action (reject → re-investigate), and the new run must not receive the prior verifier result.

## Tool catalog — ten read-only evidence tools

### `get_settlement_breakup`
Input: `settlement_id`. Returns settlement header, lines, amounts, currency, UTRs, timestamps, source references.

### `get_fee_tax_lines`
Input: `settlement_id` or `payment_id`. Returns fee/tax records and applicable source metadata.

### `get_fee_schedule`
Input: merchant context, effective date, optional fee category. Returns the fee schedule records applicable at that time. (Two schedule versions exist — `EXPERIMENT_CONSTANTS.md` §2 — so the effective date is load-bearing.)

### `get_monthly_invoice`
Input: merchant context, bounded statement period. Returns invoice/statement line items.

### `get_ledger_entries`
Input: merchant context plus a bounded reference or period. Returns ledger records relevant to the case.

### `get_bank_credit`
Input: merchant context, UTR, bounded date range. Returns bank-credit records.

### `search_related_adjustments`
Input: merchant context, settlement ID, bounded period. Returns settlement adjustments.

### `search_related_refunds`
Input: payment/order reference, bounded period. Returns refunds and their lifecycle timestamps.

### `find_candidate_split_sets`
Input: order/payment reference, bounded settlement context. Returns deterministic candidate subsets of settlement lines whose amounts can conserve value.

### `calculate_expected_net_amount`
Input: **explicit source record references only.** Returns the deterministic arithmetic breakdown (`ARCHITECTURE.md` §16 shape).

> **Why this one stays.** It returns *arithmetic over records the agent names*, not a verdict on the agent's proposal. It answers "what is 2.5% of ₹10,000 plus 18% tax?" — it does not answer "did your proposal pass?" It computes; it does not judge. The distinction is the whole of D6: **tools may compute, tools may not adjudicate.**

## Tool result contract

Every result carries:

- `tool_call_id`;
- `source_record_ids`;
- `merchant_id` scope (from the pinned context, not from model input);
- result schema version;
- timestamp observed;
- redaction metadata where relevant.

## Tool failure

A failed tool call returns a **typed error category**. A missing result is never represented as an empty successful dataset — the agent must not be able to infer "no records exist" from "the query failed" (`SYSTEM_DESIGN.md` §8, `AGENT_SPEC.md` §8).

## Prohibited tools

No tool may ever exist that provides: arbitrary SQL, shell execution, filesystem access, arbitrary HTTP, code execution, write access of any kind, payment/refund/payout/transfer operations, hidden-truth access, or **verifier adjudication**.

The tool registry is an allowlist fixed at run start. A tool name the model invents is a policy violation, recorded and refused (`SECURITY_TEST_MATRIX.md`).

---

# Part III — Implementation status (2026-09-05)

Implemented in `packages/tools`. Nine tools, all read-only, all tenant-scoped from the
server-built request context.

| Tool | Returns |
|---|---|
| `get_settlement_breakup` | settlements, lines, settled total |
| `get_fee_tax_lines` | fee and tax lines with totals |
| `get_bank_credit` | credits, optionally filtered by UTR |
| `get_refunds` | refunds with created/settled dates |
| `search_related_adjustments` | adjustments, **including whether each is allocated** |
| `get_ledger_entries` | deliberately empty — see below |
| `get_fee_schedule` | the schedule in force at a date, plus all versions |
| `calculate_expected_net_amount` | expected net, settled total, variance, and the variance if the scheduled fee were applied |
| `validate_tax_line_mapping` | whether tax lines are consistent with fee lines |

`validate_candidate_resolution` remains **absent**, as `TOOLS.md` v2.0.0 requires: it would
let the model ask the verifier whether an answer would pass, turning a terminal gate into an
oracle to optimise against.

`get_ledger_entries` returns an empty result with a note. Ledger entries are not part of the
reconciliation unit — the matcher does not consume them — so an investigation cannot claim
them as proof of anything. Returning them would invite exactly that.

**Arithmetic lives in the tool, not the model.** `calculate_expected_net_amount` does the
bigint arithmetic. A language model computing money in prose is a defect, not a feature.

Results are capped at 50 records per call, and every call plus a one-line summary of its
result is written to the audit trail as `agent_tool_called`.
