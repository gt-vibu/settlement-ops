# EXPERIMENT_CONSTANTS.md — SettlementOps

**Status:** `PROPOSED — AWAITING OWNER APPROVAL`
**Created:** 2026-08-31 (Readiness resolution, Decision D7)
**Authority:** No value in this file is frozen until the owner approves it. Nothing may be changed after the primary test set is scored (`EVALUATION.md` §19).

---

## 0. How to read this file

Every numerical or enumerated assumption that the specification package left unspecified is listed here. The specification requires these to exist (`CAUSE_TAXONOMY.md` "configured bounded tolerance", `BASELINES.md` "bounded date/timestamp tolerance", `EVALUATION.md` §12 "thresholds must be chosen before the primary test results are inspected") but supplies none of the values.

**Every value below is marked `PROPOSED`.** None has been adopted. No dataset has been generated. No evaluation has been run.

### Column definitions

| Column | Meaning |
|---|---|
| **Class** | `INVARIANT` = product/financial rule, lives in versioned code, not an environment variable (`CONFIGURATION.md`). `EXPERIMENT` = benchmark parameter, recorded in the dataset/run manifest. `OPERATIONAL` = deployment/runtime limit, may be an environment variable. |
| **Freeze** | `BEFORE-GEN` = must be final before the dataset generator runs, because changing it changes the data. `BEFORE-SCORE` = must be final before the primary test set is scored. `TUNABLE` = may change later without invalidating the experiment. |

### Approval procedure

1. Owner reviews and edits values.
2. Owner marks the file `APPROVED` with a date.
3. `INVARIANT` values are transcribed into `packages/domain` as versioned constants; `EXPERIMENT` values into the dataset manifest.
4. Only then may the generator run.
5. Any later change requires a `CHANGE_CONTROL.md` record and a new experiment version.

---

## 1. Money and currency

| # | Parameter | Where used | Proposed value | Class | Freeze |
|---|---|---|---|---|---|
| M1 | `SUPPORTED_CURRENCIES` | domain/money, all entities | `["INR"]` — single currency in MVP | INVARIANT | BEFORE-GEN |
| M2 | `MINOR_UNIT_EXPONENT.INR` | domain/money | `2` (paise) | INVARIANT | BEFORE-GEN |
| M3 | `MONEY_REPRESENTATION` | domain/money | `bigint` minor units; never float | INVARIANT | BEFORE-GEN |
| M4 | `MAX_TRANSACTABLE_AMOUNT_MINOR` | validation | `100_000_000_00` (₹100 crore) — rejects absurd input | INVARIANT | TUNABLE |

**Rationale.** `DATA_MODEL.md` §1 mandates integer minor units. A single currency removes FX from the MVP entirely, which `PRODUCT_SCOPE.md` never asks for and which would add a whole class of rounding causes the taxonomy does not cover. M4 is an input-validation bound, not a business rule.

**Sign convention (INVARIANT, BEFORE-GEN):**

```
expected_net = gross − fee − tax − refund + adjustment
```

`adjustment_minor` is **signed** (may be negative). All others are non-negative magnitudes. This matches `ARCHITECTURE.md` §16's worked example exactly.

---

## 2. Fee and tax schedule

These are the highest-leverage numbers in the package: they define what "correct" means for `MDR_FEE`, and therefore what the verifier can prove.

**Derivation.** The specification supplies exactly one worked example, and it appears twice and agrees with itself:

- `DEMO_SCENARIOS.md` Scenario 1: ₹10,000 payment → ₹250 fee, ₹45 tax.
- `ARCHITECTURE.md` §16: `gross_minor: 1000000`, `fee_minor: 25000`, `tax_minor: 4500`, `expected_net_minor: 970500`.

₹250 / ₹10,000 = **2.50%**. ₹45 / ₹250 = **18.00%**. The proposed schedule is reverse-engineered from the spec's own numbers rather than invented, so Scenario 1 remains reproducible bit-for-bit.

| # | Parameter | Where used | Proposed value | Class | Freeze |
|---|---|---|---|---|---|
| F1 | `FEE_RATE.CARD` | fee calculation, `get_fee_schedule` | `250 bps` (2.50%) | INVARIANT | BEFORE-GEN |
| F2 | `FEE_RATE.NETBANKING` | same | `190 bps` (1.90%) | INVARIANT | BEFORE-GEN |
| F3 | `FEE_RATE.UPI` | same | `0 bps` (0.00%) | INVARIANT | BEFORE-GEN |
| F4 | `FEE_RATE.WALLET` | same | `200 bps` (2.00%) | INVARIANT | BEFORE-GEN |
| F5 | `TAX_RATE_ON_FEE` | tax calculation | `1800 bps` (18.00% GST on the fee amount, not on gross) | INVARIANT | BEFORE-GEN |
| F6 | `FEE_ROUNDING_MODE` | fee calculation | `HALF_UP` to nearest minor unit | INVARIANT | BEFORE-GEN |
| F7 | `TAX_ROUNDING_MODE` | tax calculation | `HALF_UP` to nearest minor unit, applied to the **already-rounded** fee | INVARIANT | BEFORE-GEN |
| F8 | `FEE_SCHEDULE_VERSIONS` | `get_fee_schedule` | Two versions (see below) | EXPERIMENT | BEFORE-GEN |

### Fee schedule versions

`TOOLS.md` gives `get_fee_schedule` an **effective date** parameter, which is meaningless with a single permanent schedule. Two versions make the tool load-bearing and create genuine, realistic ambiguity for `TIMING_LAG` and `MDR_FEE` cases:

| Version | Effective from | CARD | NETBANKING | UPI | WALLET |
|---|---|---|---|---|---|
| `fee-schedule-v1` | 2026-01-01 | 250 bps | 190 bps | 0 bps | 200 bps |
| `fee-schedule-v2` | 2026-04-01 | **230 bps** | 190 bps | 0 bps | 200 bps |

A payment captured near the 2026-04-01 boundary can be legitimately explained by either rate, which the agent must resolve with `get_fee_schedule` rather than guess. **This is deliberate difficulty, not leakage** — the effective date is observable to a real operator (`LEAKAGE_AUDIT.md` §4).

> **Owner decision needed:** confirm the second schedule version is wanted. Dropping it makes `get_fee_schedule` near-trivial and weakens the benchmark; keeping it makes several cases genuinely harder.

---

## 3. Tolerances

| # | Parameter | Where used | Proposed value | Class | Freeze |
|---|---|---|---|---|---|
| T1 | `ROUNDING_TOLERANCE_PER_RECORD_MINOR` | verifier `ROUNDING_DRIFT`, baseline | `2` paise | INVARIANT | BEFORE-GEN |
| T2 | `ROUNDING_TOLERANCE_AGGREGATE_MINOR` | verifier, multi-line settlements | `2 × contributing_line_count` | INVARIANT | BEFORE-GEN |
| T3 | `ROUNDING_TOLERANCE_ABSOLUTE_CAP_MINOR` | verifier hard ceiling | `100` paise (₹1.00) | INVARIANT | BEFORE-GEN |
| T4 | `AMOUNT_MATCH_TOLERANCE_MINOR` | deterministic matcher (non-rounding) | `0` — exact match required | INVARIANT | BEFORE-GEN |
| T5 | `SETTLEMENT_DATE_MATCH_TOLERANCE_DAYS` | deterministic matcher | `±1` calendar day | INVARIANT | BEFORE-GEN |
| T6 | `NEAR_DUPLICATE_WINDOW_SECONDS` | duplicate detection | `60` s on identical (payment_id, amount, type) | INVARIANT | BEFORE-GEN |

**Rationale for T1–T3.** Each percentage computation rounds once, so the maximum honest drift is 0.5 minor unit per rounding operation. Fee + tax = two operations → ≤ 1 paisa in theory; T1 allows 2 for safety. T2 scales it to multi-line settlements. **T3 is the safety-critical one**: it caps the total variance `ROUNDING_DRIFT` may ever explain at ₹1.00, so this cause can never be stretched to explain a material discrepancy. Without T3, a large multi-line settlement could accumulate an arbitrarily large "rounding" allowance — which is precisely how a rounding tolerance becomes a laundering channel for real errors.

**T4 is deliberately zero.** `BASELINES.md` permits "amount tolerance only where explicitly modeled". Rounding drift is the only modeled amount tolerance; everything else must match exactly or become an exception.

---

## 4. Timing windows

| # | Parameter | Where used | Proposed value | Class | Freeze |
|---|---|---|---|---|---|
| W1 | `SETTLEMENT_CYCLE` | settlement generation, verifier | `T+2` business days from capture | INVARIANT | BEFORE-GEN |
| W2 | `SETTLEMENT_CUTOFF_LOCAL_TIME` | cycle assignment | `18:00` IST | INVARIANT | BEFORE-GEN |
| W3 | `SETTLEMENT_TIMEZONE` | cycle assignment | `Asia/Kolkata` | INVARIANT | BEFORE-GEN |
| W4 | `BUSINESS_DAYS` | cycle assignment | Mon–Fri; no holiday calendar in MVP | INVARIANT | BEFORE-GEN |
| W5 | `REFUND_NETTING_MAX_CYCLES` | verifier `REFUND_NETTING` | `2` cycles after refund creation | INVARIANT | BEFORE-GEN |
| W6 | `BANK_CREDIT_EXPECTED_LAG_HOURS` | verifier, baseline | `0–24` h after `settlement_at` | INVARIANT | BEFORE-GEN |
| W7 | `TIMING_LAG_TOLERANCE_HOURS` | verifier `TIMING_LAG` | `72` h maximum explainable lag | INVARIANT | BEFORE-GEN |
| W8 | `LATE_RECORD_ARRIVAL_MAX_DAYS` | ingestion, `PRD.md` §20 | `7` days | INVARIANT | TUNABLE |

**Rationale.** T+2 with an evening cutoff is the publicly documented shape of Indian gateway settlement (`RAZORPAY_BUILDATHON_CONTEXT.md` cites the public settlements documentation) and is labelled a **synthetic assumption**, not a claim about Razorpay's internal engine (`START_HERE.md` §8). W5 is what makes `REFUND_NETTING` a bounded, provable cause rather than an unbounded excuse. W7 bounds `TIMING_LAG` the same way: beyond 72 h, lateness stops being an explanation and becomes an exception.

**No holiday calendar (W4)** keeps the generator deterministic and reviewable. Recorded as a stated limitation for `LIMITATIONS.md`.

---

## 5. Agent execution budget

| # | Parameter | Where used | Proposed value | Class | Freeze |
|---|---|---|---|---|---|
| A1 | `MAX_TOOL_CALLS_PER_INVESTIGATION` | agent orchestrator | `8` | EXPERIMENT | BEFORE-SCORE |
| A2 | `MAX_INVESTIGATION_STEPS` | agent orchestrator | `8` | EXPERIMENT | BEFORE-SCORE |
| A3 | `MAX_INVESTIGATION_WALLCLOCK_SECONDS` | agent orchestrator | `120` | OPERATIONAL | TUNABLE |
| A4 | `MODEL_TEMPERATURE` | model gateway | `0` | EXPERIMENT | BEFORE-SCORE |
| A5 | `MODEL_REQUEST_TIMEOUT_SECONDS` | model gateway | `60` | OPERATIONAL | TUNABLE |
| A6 | `MODEL_MAX_RETRIES` | model gateway | `2`, exponential backoff | OPERATIONAL | TUNABLE |
| A7 | `MODEL_MAX_OUTPUT_TOKENS` | model gateway | `4096` | OPERATIONAL | TUNABLE |
| A8 | `IDENTICAL_TOOL_CALL_LIMIT` | loop detection | `1` — a repeat counts against budget and trips loop detection at 2 | INVARIANT | BEFORE-SCORE |
| A9 | `MAX_HYPOTHESES` | hypothesis prompt | `4` | EXPERIMENT | BEFORE-SCORE |

A1 and A2 are the values named in `SYSTEM_DESIGN.md` §12 and `AGENT_SPEC.md` §5 and by the owner. A4 = 0 is required for the reproducibility target in §8. A9 matches `PROMPTS.md` §11 ("at most four candidate causes").

---

## 6. Operational limits

| # | Parameter | Proposed value | Class | Freeze |
|---|---|---|---|---|
| O1 | `MAX_API_PAGE_SIZE` / default | `100` / `25` | OPERATIONAL | TUNABLE |
| O2 | `MAX_EVIDENCE_RECORDS_PER_TOOL_RESULT` | `50` | INVARIANT | BEFORE-SCORE |
| O3 | `MAX_IMPORT_RECORDS_PER_JOB` | `10_000` | OPERATIONAL | TUNABLE |
| O4 | `MAX_REQUEST_BODY_BYTES` (standard / import) | `1 MiB` / `10 MiB` | OPERATIONAL | TUNABLE |
| O5 | `IDEMPOTENCY_RETENTION_HOURS` (standard / approval) | `24` / `720` (30 d) | OPERATIONAL | TUNABLE |
| O6 | `JOB_MAX_ATTEMPTS` | `3` | OPERATIONAL | TUNABLE |
| O7 | `JOB_HEARTBEAT_TIMEOUT_SECONDS` | `300` — after this a job is reclaimable | OPERATIONAL | TUNABLE |
| O8 | `RATE_LIMIT_INVESTIGATION_PER_MERCHANT_PER_MINUTE` | `10` | OPERATIONAL | TUNABLE |

O2 is classified INVARIANT because evidence volume changes what the model can see and therefore affects the benchmark. O5's longer approval retention reflects that approvals are financial actions where a duplicate is materially worse than a stale key.

---

## 7. Dataset composition

**Revised 2026-08-31 at owner direction.** The first draft proposed 1,000 cases; the owner specified a scaled-down 410-case structure with a dedicated showcase split. Adopted below.

| # | Parameter | Value | Class | Freeze |
|---|---|---|---|---|
| D1 | `SPLIT_SIZES` (residual cases) | showcase `50` / development `120` / validation `60` / **primary test `120`** / challenge `60` = **410** | EXPERIMENT | BEFORE-GEN |
| D2 | `MERCHANT_COUNT` | `41`, **disjoint across splits**: 5 / 12 / 6 / 12 / 6 | EXPERIMENT | BEFORE-GEN |
| D3 | `SETTLEMENT_BATCHES_PER_MERCHANT` | `8` | EXPERIMENT | BEFORE-GEN |
| D4 | `TARGET_RESIDUAL_RATE` | `12%` of payments become residual cases | EXPERIMENT | BEFORE-GEN |
| D5 | `TOTAL_PAYMENTS` | approx `3_400` (derived from D1/D4) | EXPERIMENT | BEFORE-GEN |
| D6 | `RECORDS_PER_CASE` | `8-15` across all record types | EXPERIMENT | BEFORE-GEN |
| D7 | `GENERATOR_SEED` | `20260831` (root seed; per-split seeds derived) | EXPERIMENT | BEFORE-GEN |
| D8 | `SIMULATED_PERIOD` | `2026-01-01` to `2026-06-30` (spans the fee-schedule change at 2026-04-01) | EXPERIMENT | BEFORE-GEN |

### Split purposes

| Split | Cases | Merchants | Purpose | Scored? |
|---|---|---|---|---|
| showcase | 50 | 5 | Demo scenarios, screenshots, the five-minute pitch | **Never** |
| development | 120 | 12 | Building and debugging the baseline and agent | No |
| validation | 60 | 6 | Prompt/policy iteration before freeze | No |
| **primary test** | **120** | **12** | The preregistered comparison | **Yes** |
| challenge | 60 | 6 | Unseen combinations, adversarial cases | **Yes, reported separately** |

**The showcase split is never scored and never reported as evidence.** It exists so the demo cannot be accused of running on test data, and so a memorable demo case can be reused without touching the benchmark.

**Merchant-disjoint splitting (D2) is the load-bearing property.** A merchant appearing in two splits silently invalidates every confidence interval.

### Statistical consequence of the smaller dataset - read before approving

120 primary-test cases is enough for a credible **aggregate** comparison and **not** enough for per-cause point estimates. At the distribution below, the smallest cause classes carry 12-16 cases, whose 95% CIs will span roughly 20 percentage points either side.

This is a real limitation of the chosen size, not a flaw in the analysis. Three consequences, which must be honoured in reporting:

1. **The primary metric is aggregate** ESRR/URR on the primary test split.
2. **Per-cause numbers are descriptive only** and must be published *with* their CIs. `EVALUATION.md` section 7 forbids hiding poor performance inside an aggregate - it does not license reporting a 14-case cell as a precise rate.
3. **The powered subgroup split is two-way**, not seven-way: `simple` (MDR_FEE, ROUNDING_DRIFT, TIMING_LAG, approx 54 cases) versus `hard` (UTR_SPLIT, REFUND_NETTING, AMBIGUOUS, COMPOUND, approx 66 cases). That comparison has enough cases to support a claim.

> If per-cause precision matters more than dataset size, the primary test split would need roughly 280-350 cases. Flagged as owner question **Q6**; the 120-case structure is adopted as directed.

### Cause distribution

| Cause | Primary test | approx cases | Challenge | approx cases |
|---|---|---|---|---|
| `MDR_FEE` | 20% | 24 | 10% | 6 |
| `UTR_SPLIT` | 15% | 18 | 15% | 9 |
| `REFUND_NETTING` | 15% | 18 | 15% | 9 |
| `TIMING_LAG` | 15% | 18 | 10% | 6 |
| `ROUNDING_DRIFT` | 10% | 12 | 5% | 3 |
| `AMBIGUOUS` | 12% | 14 | 20% | 12 |
| `COMPOUND` | 13% | 16 | 25% | 15 |

The challenge set overweights `AMBIGUOUS` and `COMPOUND` because `VALIDATION_EXPERIMENT.md` kills the AI claim if its advantage disappears there. A challenge set that is merely *more of the same* would not test that.

---

## 8. Evaluation thresholds - preregistered

**These are the numbers `EVALUATION.md` section 12 and `VALIDATION_EXPERIMENT.md` require to exist before results are seen. Once approved they cannot change without invalidating the experiment (`EVALUATION.md` section 19).**

| # | Parameter | Proposed value | Class | Freeze |
|---|---|---|---|---|
| X1 | **`URR_CEILING`** (unsupported resolution rate) | **APPROVED 2026-09-01. Target ceiling `2.0%` on the primary test set; 95% CI upper-bound guardrail `5.0%`** | EXPERIMENT | BEFORE-SCORE |
| X2 | **`ESRR_MIN_IMPROVEMENT`** over baseline on the same residual | **`+10` percentage points, with 95% CI lower bound above `0`** | EXPERIMENT | BEFORE-SCORE |
| X3 | `CHALLENGE_SET_RETENTION` | at least `60%` of the primary improvement must survive on the challenge set | EXPERIMENT | BEFORE-SCORE |
| X4 | `AMBIGUOUS_FALSE_RESOLVE_CEILING` | **`0`** - any `AMBIGUOUS` case reaching effective `RESOLVE` is a hard failure | INVARIANT | BEFORE-SCORE |
| X5 | `CONFIDENCE_LEVEL` | `95%` | EXPERIMENT | BEFORE-SCORE |
| X6 | `BOOTSTRAP_ITERATIONS` | `10_000` | EXPERIMENT | BEFORE-SCORE |
| X7 | **`BOOTSTRAP_UNIT`** | **primary: `settlement_batch` (approx 96 units); sensitivity: `merchant` (12 units)** | EXPERIMENT | BEFORE-SCORE |
| X8 | `REPRODUCIBILITY_TARGET` | identical effective disposition on at least `95%` of cases across 3 re-runs at temperature 0 | EXPERIMENT | BEFORE-SCORE |
| X9 | `HUMAN_REVIEW_SAMPLE` | `30` cases, `3` independent reviewers, Krippendorff alpha reported | EXPERIMENT | TUNABLE |

### X1 - APPROVED SAFETY THRESHOLD (owner decision, 2026-09-01)

```
Unsupported-resolution rate
  target ceiling                : 2.0%  on the primary test set
  95% CI upper-bound guardrail  : 5.0%
```

Both conditions must hold. A run whose point estimate is at or below 2.0% but whose
95% confidence interval reaches above 5.0% has **not** met the threshold - the guardrail
exists so that a small sample cannot buy an apparently safe number.

**This is a synthetic-benchmark safety threshold. It is NOT a production safety
guarantee.**

That distinction is load-bearing and must be repeated wherever this number is reported:

- it is measured on **synthetic data** generated by our own generator, against an
  oracle built from our own hidden truth;
- it says how the system behaved on **410 constructed cases**, not how it would behave
  on real merchant settlement data, at real volume, with real adversarial inputs or
  real distribution shift;
- it does not license any claim about production accuracy, financial risk, merchant
  impact or ROI (`EVALUATION.md` section 21);
- clearing it means the system met a **preregistered bar we set for ourselves**, and
  nothing more.

Reports must state the threshold and this boundary together. A number quoted without
its scope becomes a production claim the evidence does not support.

**Rationale for the level.** In a financial system an unsupported resolution is worse
than an unnecessary escalation, so the ceiling sits well below the `+10 pp` improvement
threshold: the system may not buy coverage with unsafe closures. At 120 primary-test
cases a single unsupported resolution is 0.83%, so 2.0% permits at most two before the
target is missed.

**X4 has no tolerance by design.** `CAUSE_TAXONOMY.md` states `AMBIGUOUS` can never resolve. That is a deterministic property of the verifier, so the correct target is exactly zero; any non-zero value indicates a verifier defect, not a model quality issue.

**X7 changed with the dataset size.** Merchant-level bootstrap over 12 units is unstable and produces intervals so wide they cannot support or refute anything. `EVALUATION.md` section 10 permits "merchant and/or settlement batch"; at 410 cases the settlement batch (approx 96 units in the primary test split) is the defensible primary unit, with merchant-level reported as a sensitivity check. Evaluation stays paired at case level throughout, as `EVALUATION.md` section 11 requires.

### Kill criteria (restating `VALIDATION_EXPERIMENT.md` numerically)

The AI resolution claim is **killed** if any of:

1. ESRR improvement below X2, or its 95% CI includes zero;
2. URR exceeds X1;
3. challenge-set retention below X3;
4. any `AMBIGUOUS` case reaches effective `RESOLVE` (X4);
5. the leakage audit fails section 9;
6. **the deterministic-parity criterion below is met.**

### Kill criterion 6 - functional, not line-counted

**Revised 2026-08-31 at owner direction.** The first draft defined "modest deterministic rule expansion" as at most 200 lines of code. That was arbitrary and gameable in both directions: 200 lines written badly, or 800 written cleanly, say nothing about whether the rules are a genuine alternative. Replaced with a functional test:

> **The AI contribution is killed if a deterministic/fuzzy rule system of materially comparable complexity and maintainability achieves equivalent performance on the frozen primary test *and* challenge splits.**

Operationalised as:

| Element | Definition |
|---|---|
| **Equivalent performance** | Rule-system ESRR within `2` pp of the AI treatment **and** URR no higher, on **both** the primary test and challenge splits |
| **Materially comparable complexity** | Judged against the AI path's own footprint: prompt + orchestrator + tool layer + verifier extensions. The rule system is not exempted from the cost the AI path pays |
| **Maintainability** | Assessed on the same axes for both systems: cyclomatic complexity, test count, number of hand-tuned constants, and estimated effort to add one new cause class |
| **When judged** | The judgment is made on the frozen splits and recorded before the AI result is inspected; it cannot be revisited afterwards |

**Implementation complexity is tracked separately as an engineering metric** - lines of code, file count, constant count, cyclomatic complexity for both systems - and reported. It informs the maintainability judgment; it is not itself the criterion.

This is materially harder to game than a line count, and it is the honest form of the question `VALIDATION_EXPERIMENT.md` and `REVIEWER_ATTACKS.md` are both asking: *would more rules have done just as well?*

> **Superseded in operational form by CC-011.** The "deterministic/fuzzy rule system" named
> here is now built as a formal third arm - **System B** - rather than left as a thought
> experiment (`EXPERIMENTS.md` Part II). The criterion is unchanged in substance; it is now
> measured rather than argued. The comparison is made specifically on the **unseen** novelty
> strata, per `VALIDATION_EXPERIMENT.md` Part II section 14.

---

## 7b. Novelty allocation - REQUIRED BEFORE GENERATION, NOT YET DECIDED

CC-011 introduced six novelty strata (`DATASET.md` Part III). Section 7 above allocates
cases by **cause**; it does not allocate them by **novelty**. Both allocations are needed
before the generator runs, and the novelty one is now the primary experimental variable.

| Split | Cases | `SEEN` | `NOVEL_COMBINATION` | `NOVEL_CONFIGURATION` | `COMPOUND_UNSEEN` | `AMBIGUOUS` | `ADVERSARIAL` |
|---|---|---|---|---|---|---|---|
| development | 120 | 100% | - | - | - | - | - |
| validation | 60 | 70% | 20% | 10% | - | - | - |
| **primary test** | **120** | **40%** | **25%** | **10%** | **10%** | **10%** | **5%** |
| **challenge** | **60** | **0%** | **35%** | **10%** | **35%** | **15%** | **5%** |
| showcase | 50 | mixed - never scored | | | | | |

**PROPOSED, not approved.** The reasoning:

- `development` is 100% `SEEN` **by definition** - it is what defines the term.
- The primary test keeps a substantial `SEEN` stratum (40%) deliberately, as the stratum
  where rules are *expected* to win. Removing it would make the comparison look rigged.
- The challenge split contains **no** `SEEN` cases at all: that is its purpose.
- At 120 primary-test cases, `NOVEL_COMBINATION` is ~30 cases and `COMPOUND_UNSEEN` ~12.
  **The 12-case cell will carry a very wide confidence interval** and must be reported with
  it rather than as a point estimate - the same caveat already recorded in section 7.

> **This is the decision that most directly determines what the experiment can conclude.**
> Too few unseen cases and the primary hypothesis is untestable; too few seen cases and the
> baseline never gets to demonstrate its strength.

---

## 9. Leakage audit thresholds

`LEAKAGE_AUDIT.md` §5 says to pause if a probe predicts a cause with "suspiciously high performance" but never defines suspicious — which would leave the call to be made *after* seeing the result, exactly the pattern `EVALUATION.md` §19 forbids.

Chance performance for 7 balanced classes is ≈ `0.143` balanced accuracy.

| # | Parameter | Proposed value | Class | Freeze |
|---|---|---|---|---|
| L1 | `MAX_SINGLE_FEATURE_BALANCED_ACCURACY` | `0.30` (≈ 2.1× chance) | EXPERIMENT | BEFORE-GEN |
| L2 | `MAX_DEPTH2_TREE_BALANCED_ACCURACY` | `0.35` (≈ 2.4× chance) | EXPERIMENT | BEFORE-GEN |
| L3 | `MAX_PER_CAUSE_SINGLE_FEATURE_AUC` | `0.70` | EXPERIMENT | BEFORE-GEN |
| L4 | `MAX_PAIRWISE_COMBINATION_BALANCED_ACCURACY` | `0.35` | EXPERIMENT | BEFORE-GEN |
| L5 | `LEAKAGE_AUDIT_ACTION` | Any breach → **stop, revise generator, regenerate, re-audit**. Never proceed with a documented breach. | INVARIANT | BEFORE-GEN |

**Why not a threshold at chance level.** Some signal is legitimate and expected: a case with a fee record present genuinely is more likely to be `MDR_FEE`, and a real operator would see that too (`LEAKAGE_AUDIT.md` §4). The thresholds allow legitimate correlation while catching a field that effectively *encodes* the injected label.

**Software-level leakage (`LEAKAGE_AUDIT.md` §7) is pass/fail with no threshold:** any hidden label reachable from an application API payload, log, filename or record ID is an automatic fail. Enforced structurally by D5's credential separation.

---

## 10. Open items the owner must decide

| # | Question | Why it matters | Recommendation | Status |
|---|---|---|---|---|
| Q1 | Keep the second fee-schedule version (section 2)? | Adds real difficulty and makes `get_fee_schedule` load-bearing | **Keep** | OPEN |
| Q2 | Bar for "modest deterministic rule expansion" (kill criterion 6) | Most likely criterion a reviewer disputes | **RESOLVED 2026-08-31** - line count replaced with a functional parity criterion at owner direction | CLOSED |
| Q3 | Restrict `certainty_measure` to `ORDINAL_BAND` in v1? | Labelling a raw LLM number `CALIBRATED_PROBABILITY` is a false claim | **Restrict to `ORDINAL_BAND`** until a calibration curve is fitted | OPEN |
| Q4 | Simulated period spanning the fee-schedule change? | Affects benchmark difficulty and demo clarity | **Keep**; date the showcase split away from the boundary | OPEN |
| Q5 | Model provider and version for the frozen run | Must be in the manifest; changing it after scoring invalidates the run | **CLOSED 2026-09-01: Ollama (local inference), project is not hosted. Pin by DIGEST not tag — Ollama tags are mutable. See `MODEL_POLICY.md` Part II** | **CLOSED** |
| Q6 | Primary test split of 120 cases - accept wide per-cause CIs? | 120 cases supports an aggregate claim, not per-cause point estimates | **Accept**, and report per-cause descriptively with CIs; use the two-way simple/hard subgroup split for powered comparison. Raising to 280-350 would enable per-cause claims | OPEN |
| **Q7** | **`URR_CEILING`** | The one pure safety decision in this file | **APPROVED 2026-09-01: target ceiling `2.0%`, 95% CI upper-bound guardrail `5.0%`. Documented explicitly as a synthetic-benchmark threshold, not a production safety guarantee (section 8)** | **CLOSED** |

### Note on Q7 - closed

The owner approved the proposed level on 2026-09-01 with the exact definition recorded
in section 8, together with the explicit instruction to document that it is a
synthetic-benchmark threshold and not a production safety guarantee.

No other constant in this file changed as part of that approval. Everything except X1
remains `PROPOSED`.

---

## 11. Manifest binding

At dataset freeze, every `EXPERIMENT`-class value here is copied verbatim into the dataset manifest together with:

- generator version and root seed;
- schema version;
- configuration hash (SHA-256 over the approved values in this file);
- split manifest hash;
- realised cause distribution;
- git commit hash (`EVALUATION.md` §18);
- model ID and prompt/policy versions;
- UTC freeze timestamp.

Every benchmark report cites that configuration hash. If the hash in a report does not match the hash of this file's approved state, **the run is not a preregistered result.**

---

## 12. Status

```
STATUS: PARTIALLY APPROVED
  X1 (URR_CEILING) .................. APPROVED 2026-09-01
  Q2 (kill criterion 6) ............. RESOLVED 2026-08-31 (functional, not line-counted)
  all other values .................. PROPOSED

DATASET GENERATED : NO
EVALUATION RUN    : NO
```

**Constants transcribed to code:** the `INVARIANT`-class values of sections 1-4 are
implemented in `packages/domain/src/policy/` for the Phase 2 deterministic baseline,
under `POLICY_VERSION` and clearly marked `PROPOSED`. That is safe because no dataset
has been generated and nothing has been scored - the numbers shape code that can be
re-run, not a frozen benchmark result. **Dataset generation remains blocked** until the
remaining values are approved.

No evaluation has been run. No result has been observed.
