# Experiment Manifest — FROZEN

**Frozen:** 2026-09-05 · **Experiment version:** 1.0.0 · **Policy version:** 1.0.0
**Authority:** `CHANGE_CONTROL_ADDENDUM.md` CC-015

Nothing in this file may change after the primary test split is scored
(`EVALUATION.md` §19). `packages/domain/src/policy/frozen-policy.test.ts` pins every policy
value, so a later edit breaks the build rather than silently invalidating a result.

The machine-readable source of truth is `packages/evaluation/src/manifest/`. This document
is the human-readable copy.

---

## 1. Identity

| Field | Value |
|---|---|
| Generator version | `1.0.0` |
| Oracle version | `1.0.0` |
| Schema version | `v1` |
| Generator root seed | `20260831` |
| Simulated period | 2026-01-01 → 2026-06-30 (spans the 2026-04-01 fee schedule change) |

Per-split seeds are **derived** from the root, so the entire 410-case dataset is
reproducible from one number, and regenerating one split cannot perturb another.
Reproducibility was verified: a fresh `generateDataset()` reproduces the stored hidden
truth exactly (primary test 81 resolvable of 120; challenge 34 of 60).

## 2. Model

| Field | Value |
|---|---|
| Provider | Ollama (local inference) |
| Model | `qwen2.5:3b-instruct-q4_K_M` |
| **Digest** | `357c53fb659c5076de1d65ccb0b397446227b71a42be9d1603d46168015c9e4b` |
| Parameters | 3.1B · Q4_K_M |
| Temperature | 0 |

**Pinned by digest, not tag.** Ollama tags are mutable. `pnpm eval:run` asserts the
installed digest before running System C and refuses to proceed on a mismatch.

**Why this model.** The evaluation host is CPU-only (AMD integrated graphics, 15.4 GB RAM).
Measured warm throughput is ~14 tokens/s for this build; a 7B q4 build runs at roughly a
third of that, which would put a 180-case scored run beyond the time available. This is a
ceiling on the RESULT, not on the architecture — a stronger model would very likely score
better, and the benchmark says nothing about how one would behave.

## 3. Policy constants

Provenance is stated for each. **Only the CARD fee rate and the GST rate have real
provenance**; everything else is a synthetic assumption invented for this project and is
not a Razorpay fact.

| Constant | Value | Provenance |
|---|---|---|
| `FEE_RATE.CARD` | 250 bps | Derived from `DEMO_SCENARIOS.md` §1 and `ARCHITECTURE.md` §16 |
| `TAX_RATE_ON_FEE` | 1800 bps | Same worked example |
| `FEE_RATE.NETBANKING` / `UPI` / `WALLET` | 190 / 0 / 200 bps | **Synthetic** |
| `fee-schedule-v2` | CARD 230 bps from 2026-04-01 | **Synthetic** |
| `ROUNDING_TOLERANCE_PER_RECORD_MINOR` | 2 paise | Analytic: two rate applications |
| `ROUNDING_TOLERANCE_ABSOLUTE_CAP_MINOR` | 100 paise | **Synthetic**; non-binding below 50 lines |
| `AMOUNT_MATCH_TOLERANCE_MINOR` | 0 | `BASELINES.md` — tolerance only where modelled |
| `SETTLEMENT_DATE_MATCH_TOLERANCE_DAYS` | 1 | **Synthetic** |
| `NEAR_DUPLICATE_WINDOW_SECONDS` | 60 | **Synthetic**; currently unexercised |
| `SETTLEMENT_CYCLE_BUSINESS_DAYS` | 2 | **Synthetic** |
| `SETTLEMENT_CUTOFF_HOUR_IST` | 18 | **Synthetic** |
| `REFUND_NETTING_MAX_CYCLES` | 2 | **Synthetic** — measured SENSITIVE, must be reported with 1/2/3 |
| `BANK_CREDIT_EXPECTED_LAG_HOURS` | 24 | **Synthetic** |
| `ADJUSTMENT_ACCRUAL_WINDOW_BUSINESS_DAYS` | = settlement cycle | Derived; no new constant |
| `EVIDENCE_REQUEST_EXPIRY_DAYS` | 7 | `STATE_MACHINE.md`; value synthetic |

Excluded from the freeze because they are unwired: `LATE_RECORD_ARRIVAL_MAX_DAYS`,
`BANK_CREDIT_LATENESS_TOLERANCE_HOURS`. Dead configuration is how two sources of truth
start.

## 4. Agent budget

| Field | Value |
|---|---|
| Max tool calls | 8 |
| Max steps | 8 |
| Max wall-clock | 120 s |
| Identical tool call limit | 1 |
| Max hypotheses | 4 |
| Max evidence records per tool result | 50 |
| Model request timeout | 60 s |

Two of the eight tool calls are seeded (`CC-019`).

## 5. Splits

410 residual cases over **41 merchant-disjoint** merchants.

| Split | Cases | Merchants | Scored |
|---|---:|---:|---|
| development | 120 | 12 | no — defines `SEEN` |
| validation | 60 | 6 | no |
| showcase | 50 | 5 | **never** |
| primary test | 120 | 12 | **yes** |
| challenge | 60 | 6 | yes, separately |

## 6. Novelty allocation

| Stratum | Primary test | Challenge |
|---|---:|---:|
| `SEEN` | 48 | 0 |
| `NOVEL_COMBINATION` | 30 | 21 |
| `NOVEL_CONFIGURATION` | 12 | 6 |
| `COMPOUND_UNSEEN` | 12 | 21 |
| `AMBIGUOUS` | 12 | 9 |
| `ADVERSARIAL` | 6 | 3 |

**Realised exactly**, verified by `allocationReport`. Compound cases inside `SEEN`: **18**,
against a floor of 8 — the within-class comparison that separates novelty from difficulty
is possible.

Novelty is assigned by **lookup against a frozen registry**, never by hand. Arity
separation per `CC-016`.

**Powered comparison:** `SEEN` (48) vs `NOVEL` (54) on the primary test split, paired.
At n≈54 per arm the minimum reliably detectable difference is roughly **12–18 percentage
points**; a 5-point difference is not distinguishable from noise, and the report must say
so rather than presenting it as a finding.

**Descriptive only:** `COMPOUND_UNSEEN` (12), `AMBIGUOUS` (12), `ADVERSARIAL` (6). Six
cases support an observation, not a rate.

## 7. Preregistered thresholds

| # | Threshold | Value |
|---|---|---|
| X1 | `URR_CEILING` | 2.0% target, 95% CI upper-bound guardrail 5.0% |
| X2 | `ESRR_MIN_IMPROVEMENT` | +10 pp over the strongest baseline, CI lower bound above 0 |
| X3 | `CHALLENGE_SET_RETENTION` | ≥60% of the primary improvement survives on challenge |
| X4 | `AMBIGUOUS_FALSE_RESOLVE_CEILING` | **0** — any `AMBIGUOUS` reaching `RESOLVE` is a hard failure |
| X5 | Confidence level | 95% |
| X7 | Bootstrap unit | settlement batch (primary), merchant (sensitivity) |
| X8 | Reproducibility | ≥95% identical effective disposition across three temperature-0 re-runs |

**X1 is a synthetic-benchmark threshold, not a production safety guarantee.** It says how
the system behaved on 410 constructed cases against an oracle built from our own hidden
truth. It licenses no claim about production accuracy, financial risk or merchant impact.

## 8. Kill criteria

The AI resolution claim is killed if **any** of:

1. ESRR improvement below X2, or its 95% CI includes zero;
2. URR exceeds X1;
3. challenge-set retention below X3;
4. any `AMBIGUOUS` case reaches effective `RESOLVE`;
5. the leakage audit fails;
6. **System B** — the strong fixed workflow — matches System C within 2 pp ESRR with no
   higher URR on **both** scored splits.

Criterion 6 is measured, not argued: System B is a real arm with the same tools, the same
arithmetic and the same verifier.

## 9. Leakage audit

`PASS` — see `LEAKAGE_AUDIT_REPORT.md`. Three generator defects were found and fixed before
the dataset was accepted, and one methodological error in the audit itself was corrected.

## 10. Isolation

Hidden truth lives in `settlementops_eval` with its own role. The application credential
has no `CONNECT` privilege on it and the evaluation credential has none on the application
database. Both directions are asserted in `tests/integration/eval-isolation.test.ts`.
`scripts/check-deps.ts` fails the build if `packages/agent` references `EVAL_DATABASE_URL`.
