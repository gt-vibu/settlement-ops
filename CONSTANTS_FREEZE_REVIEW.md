# Constants Freeze Review — `EXPERIMENT_CONSTANTS.md` §1–§4

**Date:** 2026-09-01
**Purpose:** present the exact values for approval **before** any dataset is generated.
**Status:** `AWAITING OWNER APPROVAL` — nothing frozen, no dataset generated, nothing scored.
**Source of truth for this document:** the **implementation** (`packages/domain/src/policy/`,
`packages/domain/src/money/`), not the spec prose. Where the two disagree, that is reported.

---

## 0. Read this first — provenance is not uniform

The honest summary before the tables: **these constants do not all have the same quality
of justification.** Three tiers:

| Tier | Meaning | Count |
|---|---|---|
| **A — Derived** | Reverse-engineered from the specification's own worked example, or analytically necessary. I did not choose the number. | 6 |
| **B — Domain-informed** | Matches a publicly documented industry norm, labelled a synthetic assumption. | 2 |
| **C — Invented** | **I chose it. There is no source.** Plausible, internally consistent, but arbitrary. | 11 |

Tier C is the majority. That is not a defect — the specification simply never supplied
these numbers, which is exactly what `IMPLEMENTATION_READINESS.md` E-2 flagged. But it
means **approving this file is a real decision, not a rubber stamp.** The tier-C values
shape what "correct" means for the baseline and therefore how hard the residual is.

### Two defects found while preparing this document

**D-1 — `AMOUNT_MATCH_TOLERANCE_MINOR` is dead.** Declared as `0n`, referenced **zero
times** anywhere in the codebase. Exact matching is currently an emergent property of not
applying a tolerance, not an enforced one. Freezing it would create false confidence: you
could change the value and nothing would happen.

**D-2 — `LATE_RECORD_ARRIVAL_MAX_DAYS` is dead, and its value is duplicated.** Declared as
`7`, referenced zero times. Meanwhile `apps/api/src/http/scenario-routes.ts:48` hardcodes
`const EVIDENCE_EXPIRY_DAYS = 7`. Two sources of truth for one policy number, and the live
one sits in the **API layer**, where `CONFIGURATION.md` says policy must never live.

**Neither is fixed yet** — you asked for values before changes. Recommendation: wire both
as step 1 of Phase 4, *before* the freeze, since a constant nothing reads cannot
meaningfully be frozen.

---

## §1 — Money and currency

| Parameter | Value | Unit | Tier | Rationale | Where used | Post-hoc? | Tests |
|---|---|---|---|---|---|---|---|
| `SUPPORTED_CURRENCIES` | `['INR']` | — | A | Single currency removes FX and a class of rounding causes the taxonomy does not model | `money/currency.ts`, every entity | No — structural, set Phase 1 | `money.test.ts` (13), `money-codec.test.ts` (5) |
| `MINOR_UNIT_EXPONENT.INR` | `2` | decimal places | A | Paise. Definitional | `currency.ts`, `format` | No | codec round-trip tests |
| `MONEY_REPRESENTATION` | `bigint` minor units | — | A | `AGENTS.md` c.7; `PRODUCTION_READINESS.md` blocks float money | all money code | No | 2^53+1 precision test |
| Sign convention | `gross − fee − tax − refund + adjustment` | — | A | Matches `ARCHITECTURE.md` §16 worked example exactly | `amount-breakdown.ts` | No | property test, 500 randomised cases |
| `MAX_TRANSACTABLE_AMOUNT_MINOR` | **NOT IMPLEMENTED** | — | — | Documented in the spec; no code exists | — | — | none |

**§1 is the strongest section.** Every value is structural or definitional. Nothing here
was chosen to make a result come out a particular way.

---

## §2 — Fee and tax schedule

### The derivation that anchors this section

The specification supplies exactly one worked example, and it appears twice and agrees
with itself:

```
DEMO_SCENARIOS.md scenario 1 : ₹10,000.00 payment → ₹250.00 fee, ₹45.00 tax
ARCHITECTURE.md  §16         : 1_000_000 → fee 25_000 → tax 4_500 → net 970_500

250 / 10,000 = 2.50%      45 / 250 = 18.00%
```

| Parameter | Value | Unit | Tier | Rationale | Where used | Post-hoc? | Tests |
|---|---|---|---|---|---|---|---|
| `FEE_RATE.CARD` (v1) | `250` | basis points | **A** | **Reverse-engineered from the spec's own example.** I did not choose it | `fee-schedule.ts` → `scheduledFeeFor` | No — fixed by the spec | `policy.test.ts` exact-value test |
| `TAX_RATE_ON_FEE` | `1800` | bps, on the **fee** not gross | **A** | Same derivation; 18% GST | same | No | exact-value test |
| `FEE_RATE.NETBANKING` | `190` | bps | **C** | **Invented.** No spec source | same | No | schedule-selection test |
| `FEE_RATE.UPI` | `0` | bps | **C** | **Invented** (zero-MDR is the real-world norm) | same | No | schedule-selection test |
| `FEE_RATE.WALLET` | `200` | bps | **C** | **Invented** | same | No | schedule-selection test |
| `FEE_ROUNDING_MODE` | `HALF_UP` (away from zero) | — | A | Integer-only; exactly reproducible by the verifier | `rounding.ts` | No | 5 rounding tests incl. negatives |
| `TAX_ROUNDING_MODE` | `HALF_UP` on the **already-rounded** fee | — | A | Order matters and is fixed | `rounding.ts` | No | exact-value test |
| **`fee-schedule-v2` exists** | effective `2026-04-01` | date | **C** | **Invented.** Makes `get_fee_schedule`'s effective-date parameter load-bearing and creates genuine boundary ambiguity | `scheduleAt()` | No | boundary + ordering tests |
| `FEE_RATE.CARD` (v2) | `230` | bps | **C** | **Invented** | same | No | matcher test proves v2 applies after the boundary |

> **Decision you are actually making here.** Keeping `fee-schedule-v2` makes several cases
> genuinely harder and gives the fee-schedule tool real work. Dropping it makes the tool
> near-trivial. Either is defensible; it is a difficulty knob, and it is **invented**.

---

## §3 — Tolerances

| Parameter | Value | Unit | Tier | Rationale | Where used | Post-hoc? | Tests |
|---|---|---|---|---|---|---|---|
| `ROUNDING_TOLERANCE_PER_RECORD_MINOR` | `2n` | paise | **A** | Analytic: each rate application rounds once, max 0.5 minor unit each; fee+tax = 2 ops → ≤1 paisa. 2 allows headroom | `roundingToleranceFor()` → matcher | No — derived before any run | tolerance scaling test |
| `ROUNDING_TOLERANCE_ABSOLUTE_CAP_MINOR` | `100n` | paise (₹1.00) | **C** (level) / **A** (existence) | **The cap must exist** — without it a large multi-line settlement accrues an unbounded "rounding" allowance, which is how a tolerance becomes a laundering channel. **The level ₹1.00 is invented** | `roundingToleranceFor()` | No | cap test at 10,000 lines; "never accepts a material variance" test |
| `AMOUNT_MATCH_TOLERANCE_MINOR` | `0n` | paise | — | **DEAD — see D-1.** Zero references | **nowhere** | n/a | none |
| `SETTLEMENT_DATE_MATCH_TOLERANCE_DAYS` | `1` | calendar days | **C** | **Invented** | `checks.ts` → `checkSettlementTiming` | No | matcher timing-outside-window test |
| `NEAR_DUPLICATE_WINDOW_SECONDS` | `60` | seconds | **C** | **Invented** — approximates a redelivered webhook | `duplicate-detection.ts` | No | duplicate-detection matcher test |

---

## §4 — Timing windows

| Parameter | Value | Unit | Tier | Rationale | Where used | Post-hoc? | Tests |
|---|---|---|---|---|---|---|---|
| `SETTLEMENT_CYCLE_BUSINESS_DAYS` | `2` | business days | **B** | T+2 is the publicly documented Indian gateway norm. Labelled a **synthetic assumption**, not a claim about any provider's internals (`START_HERE.md` §8) | `expectedSettlementDate()` | No | 3 tests: pre-cutoff, post-cutoff, weekend skip |
| `SETTLEMENT_CUTOFF_HOUR_IST` | `18` | hour, IST | **C** | **Invented** | `expectedSettlementDate()` | No | post-cutoff roll test |
| `IST_OFFSET_MINUTES` | `330` | minutes | **A** | UTC+05:30, definitional | same | No | covered by cutoff tests |
| `BUSINESS_DAYS` | Mon–Fri, **no holiday calendar** | — | **B** | Keeps the generator deterministic and reviewable. Recorded in `LIMITATIONS.md` | `isBusinessDay()` | No | weekend tests |
| `REFUND_NETTING_MAX_CYCLES` | `2` | cycles | **C** | **Invented.** Bounds what `REFUND_NETTING` may explain | `checks.ts` → `checkRefundNettingWindow` | No | refund-netting matcher tests |
| `BANK_CREDIT_EXPECTED_LAG_HOURS` | `24` | hours | **C** | **Invented** | `bankCreditWithinExpectedLag()` | No | 3 tests incl. credit-before-settlement rejection |
| `TIMING_LAG_TOLERANCE_HOURS` | `72` | hours | **C** | **Invented.** ⚠ See the note below | `checkAdjustmentTiming`, `withinTimingLagTolerance` | No — but **reused for a second purpose**, see below | timing-tolerance test; `misleading-adjustment` scenario |
| `LATE_RECORD_ARRIVAL_MAX_DAYS` | `7` | days | — | **DEAD — see D-2**, and duplicated as `EVIDENCE_EXPIRY_DAYS = 7` in the API layer | **nowhere** (the API hardcodes its own 7) | n/a | none |

> ### ⚠ `TIMING_LAG_TOLERANCE_HOURS` carries two jobs on one justification
>
> It was chosen in Phase 2 to bound **bank-credit lateness**. In Phase 3 I reused the same
> 72h to bound **adjustment-to-settlement proximity** in the new `checkAdjustmentTiming`.
>
> Those are different physical quantities. The reuse was convenient, not justified — a
> late bank credit and an implausibly-dated adjustment have no reason to share a bound.
> **Recommendation: split it** into `TIMING_LAG_TOLERANCE_HOURS` and
> `ADJUSTMENT_SETTLEMENT_MAX_HOURS` before freezing, even if both start at 72, so they can
> diverge later without silently coupling two rules.

---

## Post-hoc tuning: the honest timeline

**No constant has been tuned against an evaluation result, because no evaluation has run.**
No dataset has been generated, nothing has been scored, and the treatment does not exist.

One sequence deserves explicit disclosure, because it is the closest thing to post-hoc
adjustment in this project's history:

```
Phase 3: misleading-adjustment scenario produced 0 cases (expected ≥1)
   ↓
diagnosis: the matcher had NO adjustment-timing check at all
   ↓
added checkAdjustmentTiming, reusing the existing TIMING_LAG_TOLERANCE_HOURS
   ↓
scenario now produces an exception
```

What changed was a **missing check**, not a constant value — and it **strengthened** the
baseline, the only direction permitted by `BASELINES.md` and kill criterion 6. But it was
prompted by an observed outcome, so you should see it stated plainly rather than discover
it later.

**After approval this becomes forbidden.** Once frozen, a change to any value or to the
baseline's rule set requires a `CHANGE_CONTROL.md` record and **invalidates the affected
experiment**. In particular: if the AI later underperforms, loosening a tolerance to help
it is out of bounds. I will refuse that and say so.

---

## Test coverage summary

| Suite | Assertions | Covers |
|---|---|---|
| `policy.test.ts` | 38 | rounding arithmetic, schedule selection and boundary, tolerance scaling and cap, business days, T+2 with cutoff and weekend, bank-credit lag, timing tolerance |
| `matcher.test.ts` + `matcher-safety.test.ts` | 39 | every constant *in situ* through the matcher: clean case, split, refund netting, rounding absorption, fee-vs-schedule, timing windows, bank credit, duplicates, adjustment timing, v2 schedule |
| `amount-breakdown.test.ts` | property, 500 cases | sign convention conserves |
| `money.test.ts` | 13 | currency, bigint precision |

Every **live** constant is exercised. The two dead ones (D-1, D-2) have no coverage
because there is nothing to cover.

---

## What I recommend before you approve

| # | Action | Why |
|---|---|---|
| 1 | Wire or delete `AMOUNT_MATCH_TOLERANCE_MINOR` | Freezing an unread constant creates false confidence |
| 2 | Wire `LATE_RECORD_ARRIVAL_MAX_DAYS` and remove `EVIDENCE_EXPIRY_DAYS` from the API layer | One policy number, one source of truth, in the domain |
| 3 | Split `TIMING_LAG_TOLERANCE_HOURS` into two named constants | Two rules should not silently share a bound |
| 4 | Decide on `fee-schedule-v2` | It is a difficulty knob, and it is invented |
| 5 | Accept or revise the 11 tier-C values | These are the real decision |
| 6 | Add `MAX_TRANSACTABLE_AMOUNT_MINOR`, or delete it from the spec | Spec and code currently disagree |

Items 1–3 are correctness fixes with no value change. Items 4–6 are yours.

**On approval I will:** set `POLICY_VERSION` to `1.0.0` and `POLICY_APPROVAL_STATUS` to
`APPROVED`, add a test asserting the approved values so any later drift breaks the build,
and record the freeze in `CHANGE_CONTROL.md`.

**Until then:** no dataset generated, no leakage audit run, nothing scored.
