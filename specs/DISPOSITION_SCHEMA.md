# Disposition Schema

## 1. Closed disposition set

Only these disposition values are permitted:

- `RESOLVE`
- `REQUEST_EVIDENCE`
- `ESCALATE`

No fourth free-form disposition exists.

## 2. Model proposal contract

```json
{
  "trace_id": "uuid",
  "case_id": "case_id",
  "policy_version": "semver",
  "prompt_version": "semver",
  "model_version": "string",
  "disposition": "RESOLVE | REQUEST_EVIDENCE | ESCALATE",
  "cause": "MDR_FEE | UTR_SPLIT | REFUND_NETTING | TIMING_LAG | ROUNDING_DRIFT | AMBIGUOUS | COMPOUND",
  "compound_components": [],
  "claims": [
    {
      "claim_id": "string",
      "statement": "string",
      "evidence_ids": ["string"]
    }
  ],
  "missing_evidence": [],
  "recommended_action": {
    "type": "STAGE_LEDGER_ADJUSTMENT | DRAFT_EVIDENCE_REQUEST | NONE",
    "target_party": null,
    "payload_summary": "string"
  },
  "certainty_measure": {
    "type": "CALIBRATED_PROBABILITY | ORDINAL_BAND",
    "value": 0.0
  },
  "abstain_reason": null
}
```

## 3. Authority rule

**The model proposes. The verifier determines the effective disposition.**

`certainty_measure` is diagnostic only. It is never a sufficient condition for `RESOLVE`.

## 4. Verifier rules

1. A `RESOLVE` is valid only if every required deterministic check passes.
2. If any required check fails or is unavailable, the effective disposition is not `RESOLVE`.
3. The model's original output must be preserved unchanged in the audit record.
4. Every material claim must cite at least one evidence ID.
5. Every evidence ID must come from the same investigation trace.
6. `AMBIGUOUS` cannot resolve.
7. Compound causes require all component checks.
8. Financial deltas are recomputed from source records, not trusted from the model.
9. `REQUEST_EVIDENCE` must identify a specific missing record, source or confirmation where possible.
10. `ESCALATE` must state why safe automation is currently inappropriate.

## 5. Effective response

The backend must expose both:

- `model_proposal`;
- `verified_disposition`.

The UI must display the verified result as authoritative.

## 6. Schema validation

Use a real schema validator at the API/application boundary. Invalid model output is a model failure, not an opportunity to coerce arbitrary text into a valid financial action.

---

# Part II — Readiness Resolutions (v2.0.0, locked 2026-08-31)

## 7. Terminal verifier gate (D6)

§3's authority rule is strengthened. The verifier is **single-pass and terminal**:

1. It runs **exactly once** per proposal.
2. Its result is **never** returned to the model — not in a prompt, tool result, or agent context.
3. A downgrade routes the case to `ESCALATED`; it does not re-enter `INVESTIGATING`.
4. Re-investigation requires a **human** action, and the new run does not receive the prior verifier result.
5. No tool adjudicates a proposal (`TOOLS.md` v2.0.0 removes `validate_candidate_resolution`).

§5 still stands: the API exposes both `model_proposal` and `verified_disposition`, and the verified result is authoritative. The change is that this information flows **only** to storage and to humans.

## 8. `certainty_measure` in v1 (D6b) — PROPOSED, pending owner approval

§2 permits `type: "CALIBRATED_PROBABILITY"`. **Proposed restriction: v1 accepts only `ORDINAL_BAND`.**

An LLM's self-reported number is not a calibrated probability. `EVALUATION.md` §8 evaluates calibration as its own metric, so emitting a raw model number under a label asserting calibration would be an unearned claim in an AI-responsibility-sensitive system.

```json
"certainty_measure": { "type": "ORDINAL_BAND", "value": "LOW | MEDIUM | HIGH" }
```

`CALIBRATED_PROBABILITY` becomes permissible once a calibration curve has actually been fitted and reported. Either way §3 is unchanged: **certainty is diagnostic only and is never a sufficient condition for `RESOLVE`.**

> Status: `PROPOSED`. Tracked as open item Q3 in `EXPERIMENT_CONSTANTS.md` §10.

## 9. `recommended_action.type = "NONE"` (D4)

Previously stranded — `STATE_MACHINE.md` v1.0.0 had no route out of `APPROVED` except `STAGED`. Now explicit:

```text
verified RESOLVE + action NONE  →  APPROVAL_PENDING → APPROVED → CLOSED
                                   (Outcome written in the same transaction)
```

No empty staged action is fabricated, and the audit guarantee holds on both branches.
