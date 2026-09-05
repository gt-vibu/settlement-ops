# D7 Decision Table — evaluation parameters awaiting owner decision

**Date:** 2026-09-01
**Status:** `AWAITING OWNER DECISION`. Nothing frozen. No dataset generated. Nothing scored.
**Scope:** items 4–6 from `CONSTANTS_FREEZE_REVIEW.md`. Items 1–3 are done (see §0).

---

## ⚠ Sourcing statement — read before using any number below

**Every value marked `SYNTHETIC ASSUMPTION` in this document was invented by me for this
project. It is not a Razorpay fact, not drawn from any Razorpay documentation, and not
derived from any public source.**

The specification package explicitly warns against this failure mode:
`START_HERE.md` §8 — public material establishes domain *relevance*, not private internals;
`EVALUATION.md` §21 — never convert synthetic output into a production claim.

Where I write "resembles industry practice", that is **my own judgement about
plausibility**, offered so you can sanity-check the shape of the model. It is not a
citation and must never be reported as one. No source is cited anywhere in this document
because there is none to cite.

Only three things in this project have real provenance:

| Value | Actual source |
|---|---|
| `FEE_RATE.CARD = 250 bps` | Reverse-engineered from `DEMO_SCENARIOS.md` §1 and `ARCHITECTURE.md` §16, which agree |
| `TAX_RATE_ON_FEE = 1800 bps` | Same two documents |
| Sign convention, money representation | `DATA_MODEL.md` §1, `ARCHITECTURE.md` §16 |

Everything else in §1–§4 is either structurally forced (currency count, rounding mode) or
invented.

---

## 0. Items 1–3 — completed, no values changed

| # | Change | Result |
|---|---|---|
| 1 | `AMOUNT_MATCH_TOLERANCE_MINOR` wired | New `withinAmountMatchTolerance()` predicate now used by the bank-credit amount check. Was 0 references; now 2. Exact matching is an enforced rule rather than an emergent accident |
| 2 | `EVIDENCE_EXPIRY_DAYS` removed from the API layer | Canonical `EVIDENCE_REQUEST_EXPIRY_DAYS = 7` now lives in `packages/domain/src/policy/settlement-cycle.ts`. `CONFIGURATION.md` forbids policy at a transport edge |
| 3 | `TIMING_LAG_TOLERANCE_HOURS` split | → `BANK_CREDIT_LATENESS_TOLERANCE_HOURS = 72` and `ADJUSTMENT_SETTLEMENT_MAX_HOURS = 72`. Same values, separate names, so two unrelated rules can no longer move together silently |

Verified: `pnpm verify` PASS, **206 unit** + **40 integration** tests green.

> **Still dead:** `LATE_RECORD_ARRIVAL_MAX_DAYS = 7` has 0 references. Late-evidence
> handling (`PRD.md` §20) is a later phase. It now sits in the canonical location so the
> value is not reinvented at a call site, but **do not freeze it as if it were active** —
> it currently governs nothing. Listed in §4 below.

---

## 1. Item 4 — `fee-schedule-v2`: necessary, or artificial complexity?

**The question you asked:** does keeping a second effective-dated fee schedule create
meaningful held-out/adversarial cases, or does it add complexity for its own sake?

### What it currently is

```
fee-schedule-v1  effective 2026-01-01   CARD 250 bps
fee-schedule-v2  effective 2026-04-01   CARD 230 bps     ← SYNTHETIC ASSUMPTION
```

Only the CARD rate differs. `SIMULATED_PERIOD` spans 2026-01-01 → 2026-06-30, so the
boundary falls inside the dataset.

### The honest answer: it is necessary, but not for the reason it looks like

**Argument for keeping it.**

`TOOLS.md` gives `get_fee_schedule` an *effective date* parameter. With a single permanent
schedule that parameter is decorative — the agent can compute the fee without ever
consulting the schedule, and a tool that is never load-bearing cannot show whether tool
selection matters. More importantly, a payment captured near 2026-04-01 has **two
arithmetically plausible fee amounts**, and only the capture date distinguishes them.
That is a genuine reasoning step, and it is one a real operator would also have to make.

It is also honest difficulty rather than a trick: the effective date is visible in the
records, so it is legitimate signal under `LEAKAGE_AUDIT.md` §4, not a hidden label.

**Argument against.**

It is entirely invented. A rate change mid-benchmark is a modelling choice I made, and it
raises baseline difficulty for *all* cases near the boundary regardless of their injected
cause — which slightly muddies per-cause attribution.

**Recommendation: KEEP, with one constraint.**

Date the **showcase split away from the boundary** so demo cases stay clean and legible,
and let the boundary difficulty live only in the scored splits. Without v2, the
`get_fee_schedule` tool becomes near-trivial and one of the few genuine reasoning steps in
the benchmark disappears.

**If you drop it:** delete the second schedule and the `scheduleAt()` selection logic
becomes a constant lookup. That is a smaller, more defensible benchmark — and a less
interesting one.

---

## 2. Item 5 — the invented values, one block each

Format per parameter, as requested. **All are `SYNTHETIC ASSUMPTION` unless stated.**

---

### 2.1 `FEE_RATE.NETBANKING = 190 bps`

| Field | Value |
|---|---|
| **Current value** | `190` basis points (1.90%) |
| **Where used** | `policy/fee-schedule.ts` → `scheduledFeeFor()` → `checkFeeAgainstSchedule` |
| **Classification** | **Synthetic experiment assumption.** Not a product invariant |
| **Provenance** | **INVENTED BY ME.** No source. Chosen only to be lower than CARD |
| **Why needed** | The `refund-netting` scenario uses NETBANKING; without a rate its expected net is undefined |
| **Alternatives** | Any value 0–300 bps; or delete the method and use CARD everywhere |
| **Risk if too permissive (high)** | Larger fee → larger deductions → more variance attributed to fees, making `MDR_FEE` cases easier to spot |
| **Risk if too strict (low/zero)** | Fee approaches zero → NETBANKING cases become near-identical to a no-fee lifecycle, reducing method diversity to decoration |
| **Effect on baseline** | Minimal. The baseline compares observed fees to the schedule; any consistent value works |
| **Effect on AI evaluation** | Minimal. Does not change the reasoning required |
| **Sensitivity analysis** | **Not required.** The value is arbitrary but its magnitude does not shift the decision boundary |
| **Recommended** | **Keep `190`** |

---

### 2.2 `FEE_RATE.UPI = 0 bps`

| Field | Value |
|---|---|
| **Current value** | `0` |
| **Where used** | As above |
| **Classification** | Synthetic experiment assumption |
| **Provenance** | **INVENTED BY ME.** Zero-MDR on UPI resembles real practice, but I am not citing a source and this must not be reported as one |
| **Why needed** | Provides a zero-fee path, which is a genuinely different reconciliation shape |
| **Alternatives** | A small non-zero rate |
| **Risk if too permissive** | n/a — zero is the floor |
| **Risk if too strict** | Non-zero UPI removes the only zero-fee lifecycle, losing a useful edge case (fee record legitimately absent) |
| **Effect on baseline** | Exercises the "no fee expected, none present" branch of `checkFeeAgainstSchedule`, which is otherwise untested by scenarios |
| **Effect on AI evaluation** | Useful negative control: a missing fee record is *correct* here, so an agent that always blames a missing fee is penalised |
| **Sensitivity analysis** | Not required |
| **Recommended** | **Keep `0`** — the negative control is worth more than the realism question |

---

### 2.3 `FEE_RATE.WALLET = 200 bps`

| Field | Value |
|---|---|
| **Current value** | `200` |
| **Where used** | As above |
| **Classification** | Synthetic experiment assumption |
| **Provenance** | **INVENTED BY ME.** No source |
| **Why needed** | Currently **nothing uses it** — no scenario emits a WALLET payment |
| **Alternatives** | Delete the method entirely |
| **Risk if too permissive / strict** | None today; it is unreachable |
| **Effect on baseline / AI** | None |
| **Sensitivity analysis** | Not required |
| **Recommended** | **Keep as a schedule row, but do not treat it as exercised.** Either the generator should emit WALLET payments in Phase 4, or the row should be deleted. Freezing an unexercised rate is harmless but should not be mistaken for coverage |

---

### 2.4 `fee-schedule-v2` existence + `FEE_RATE.CARD(v2) = 230 bps`

| Field | Value |
|---|---|
| **Current value** | Second schedule effective `2026-04-01`; CARD `230` |
| **Where used** | `scheduleAt()`; proven live by a matcher test at 2026-04-06 |
| **Classification** | Synthetic experiment assumption — **and a difficulty knob** |
| **Provenance** | **INVENTED BY ME.** No source. Both the existence of a mid-period rate change and the 230 value are mine |
| **Why needed** | See §1. Makes the effective-date parameter load-bearing and creates genuine near-boundary ambiguity |
| **Alternatives** | Single permanent schedule; or a larger gap (e.g. 250 → 200) for a more separable signal |
| **Risk if too permissive (gap too small)** | A 250→230 gap on ₹10,000 is only ₹20. If under the rounding cap, boundary cases would be *indistinguishable* — accidentally creating unsolvable cases. **₹20 > ₹1.00 cap, so this is currently safe, but the two constants are coupled and must be checked together if either moves** |
| **Risk if too strict (gap too large)** | A very large gap makes the correct schedule obvious from the amount alone, collapsing the reasoning step into arithmetic |
| **Effect on baseline** | Baseline resolves it correctly by using capture date; boundary cases are *not* automatically residual |
| **Effect on AI evaluation** | One of the few places where consulting a tool beats guessing — directly relevant to the tool-selection secondary metric |
| **Sensitivity analysis** | **REQUIRED.** Report per-cause results split by "near the 2026-04-01 boundary" vs not. If boundary cases behave very differently, the schedule change is confounding the cause attribution |
| **Recommended** | **Keep. Verify the ₹20 gap stays above the rounding cap.** Date the showcase split away from the boundary |

---

### 2.5 `ROUNDING_TOLERANCE_ABSOLUTE_CAP_MINOR = 100n` (₹1.00)

| Field | Value |
|---|---|
| **Current value** | `100` paise |
| **Where used** | `roundingToleranceFor()` → `checkAmountConservation` |
| **Classification** | **Product/domain invariant in kind; synthetic in level.** The *existence* of a cap is a safety property; the number is mine |
| **Provenance** | Existence: principled. **Level: INVENTED BY ME** |
| **Why needed** | Without it, tolerance scales as `2 × line_count` without bound. A 10,000-line settlement would accrue a ₹200 "rounding" allowance — a laundering channel for real errors |
| **Alternatives** | ₹0.50 (tighter); ₹5.00 (looser); or a percentage-of-gross cap |
| **Risk if too permissive** | **This is the dangerous direction.** A larger cap lets genuine discrepancies be absorbed as rounding — cases that *should* become exceptions silently reconcile. Directly inflates baseline coverage and shrinks the residual the AI is measured on |
| **Risk if too strict** | Legitimate multi-line rounding becomes an exception, inflating the residual with noise cases nobody can resolve |
| **Effect on baseline** | **Direct and strong.** This constant sets the floor of what counts as a discrepancy at all |
| **Effect on AI evaluation** | **Changes the denominator.** A looser cap shrinks the residual set and changes what ESRR is a percentage *of*. Comparing two runs with different caps is invalid |
| **Sensitivity analysis** | **REQUIRED, and it is the most important one in this document.** Report residual-set size at ₹0.50 / ₹1.00 / ₹2.00 **before scoring**, so the residual's sensitivity to this choice is known in advance rather than discovered afterwards |
| **Recommended** | **Keep `100n` (₹1.00).** It is ~50× the largest honest per-record drift (2 paise), which is conservative without being absurd |

---

### 2.6 `SETTLEMENT_DATE_MATCH_TOLERANCE_DAYS = 1`

| Field | Value |
|---|---|
| **Current value** | `1` calendar day |
| **Where used** | `checkSettlementTiming` |
| **Classification** | Synthetic experiment assumption |
| **Provenance** | **INVENTED BY ME.** No source |
| **Why needed** | Absorbs benign timestamp drift so ordinary settlements are not exceptions purely on timing |
| **Alternatives** | `0` (exact date); `2`; or business-days-aware |
| **Risk if too permissive** | Genuinely mis-timed settlements pass the timing check; `TIMING_LAG` cases become undetectable by the baseline and land in the residual mislabelled |
| **Risk if too strict** | Every weekend/holiday edge becomes a timing exception, flooding the residual with noise |
| **Effect on baseline** | Moderate. Governs how many cases the baseline closes on timing |
| **Effect on AI evaluation** | Changes the `TIMING_LAG` share of the residual |
| **Sensitivity analysis** | **Recommended** — report `TIMING_LAG` residual count at 0 / 1 / 2 days |
| **Recommended** | **Keep `1`** |

---

### 2.7 `NEAR_DUPLICATE_WINDOW_SECONDS = 60`

| Field | Value |
|---|---|
| **Current value** | `60` seconds |
| **Where used** | `duplicate-detection.ts` → `findNearDuplicates` |
| **Classification** | Synthetic experiment assumption |
| **Provenance** | **INVENTED BY ME.** Approximates a redelivered webhook. No source |
| **Why needed** | Exact source-id matching misses a redelivery that arrives with a fresh id |
| **Alternatives** | `30`; `300`; or exact-id matching only |
| **Risk if too permissive** | Two *legitimate* same-amount payments seconds apart are flagged as duplicates → false exceptions, and worse, real money excluded from a total |
| **Risk if too strict** | Redeliveries slip through and **double-count money** — the more dangerous financial failure of the two |
| **Effect on baseline** | Low today: no scenario emits near-duplicates. Will matter once the generator adds them (`DATASET.md` §4 lists duplicated delivery as required noise) |
| **Effect on AI evaluation** | Low until duplicates are generated |
| **Sensitivity analysis** | **Required once the generator emits duplicates**, not before |
| **Recommended** | **Keep `60`**, and ensure Phase 4 generation actually emits near-duplicates so the rule is exercised |

---

### 2.8 `SETTLEMENT_CUTOFF_HOUR_IST = 18`

| Field | Value |
|---|---|
| **Current value** | `18` (18:00 IST) |
| **Where used** | `expectedSettlementDate()` |
| **Classification** | Synthetic experiment assumption |
| **Provenance** | **INVENTED BY ME.** An evening cutoff resembles industry practice; **I am not citing a source and this is not a Razorpay fact** |
| **Why needed** | Without a cutoff, T+2 is a pure date add and captures late in the day settle implausibly early |
| **Alternatives** | Any hour; or no cutoff |
| **Risk if too permissive (later, e.g. 23:00)** | Almost nothing rolls to the next day; the cutoff stops generating interesting cases |
| **Risk if too strict (earlier, e.g. 12:00)** | Most captures roll, shifting the whole settlement distribution |
| **Effect on baseline** | Sets expected settlement dates and therefore which cases fail the timing check |
| **Effect on AI evaluation** | Indirect, via `TIMING_LAG` prevalence |
| **Sensitivity analysis** | Not required — subsumed by 2.6 |
| **Recommended** | **Keep `18`** |

---

### 2.9 `REFUND_NETTING_MAX_CYCLES = 2`

| Field | Value |
|---|---|
| **Current value** | `2` settlement cycles |
| **Where used** | `checkRefundNettingWindow` |
| **Classification** | Synthetic experiment assumption |
| **Provenance** | **INVENTED BY ME.** No source |
| **Why needed** | Bounds what `REFUND_NETTING` may explain. Without a bound, *any* refund could be claimed to net into *any* settlement |
| **Alternatives** | `1` (same cycle only); `3`; or a day-count bound |
| **Risk if too permissive** | Refund netting becomes an unfalsifiable explanation — the exact failure mode `CAUSE_TAXONOMY.md` guards against by requiring the verifier to *prove* timing permits netting |
| **Risk if too strict** | Legitimate cross-cycle refunds become exceptions; `REFUND_NETTING` stops being a resolvable cause and collapses toward `AMBIGUOUS` |
| **Effect on baseline** | **Direct.** Defines whether the `refund-netting` scenario reconciles or becomes residual |
| **Effect on AI evaluation** | **Direct.** Sets the size and difficulty of the `REFUND_NETTING` class (15% of the primary test split) |
| **Sensitivity analysis** | **REQUIRED.** Report `REFUND_NETTING` residual count at 1 / 2 / 3 cycles |
| **Recommended** | **Keep `2`** — 1 leaves no room for the cross-cycle case the taxonomy exists to describe; 3 makes the explanation too easy to assert |

---

### 2.10 `BANK_CREDIT_EXPECTED_LAG_HOURS = 24`

| Field | Value |
|---|---|
| **Current value** | `24` hours after `settlement_at` |
| **Where used** | `bankCreditWithinExpectedLag()` → `checkBankCredit` |
| **Classification** | Synthetic experiment assumption |
| **Provenance** | **INVENTED BY ME.** No source |
| **Why needed** | Defines when a bank credit is a *normal* settlement outcome versus an anomaly. Also rejects credits that **predate** their settlement, which is a lifecycle impossibility rather than earliness |
| **Alternatives** | `12`; `48`; or a business-hours model |
| **Risk if too permissive** | Late credits look normal; a real bank-side timing problem is invisible to the baseline |
| **Risk if too strict** | Ordinary same-day-plus-one credits become exceptions, adding noise |
| **Effect on baseline** | Moderate — governs one of nine checks |
| **Effect on AI evaluation** | Affects how many cases carry a bank-credit timing reason |
| **Sensitivity analysis** | Recommended, low priority |
| **Recommended** | **Keep `24`** |

---

### 2.11 `BANK_CREDIT_LATENESS_TOLERANCE_HOURS = 72`

| Field | Value |
|---|---|
| **Current value** | `72` hours |
| **Where used** | `withinBankCreditLatenessTolerance()` — **currently exported but not called by the matcher** |
| **Classification** | Synthetic experiment assumption |
| **Provenance** | **INVENTED BY ME.** No source |
| **Why needed** | Intended outer bound past which lateness stops being an explanation |
| **Alternatives** | `48`; `96` |
| **Risk if too permissive** | Very late credits stay explainable indefinitely |
| **Risk if too strict** | Overlaps 2.10 and makes the two bounds redundant |
| **Effect on baseline / AI** | **None today** — not yet wired into a check |
| **Sensitivity analysis** | Not required while unused |
| **Recommended** | **Keep `72`, but do not freeze it as active.** Either wire it in Phase 4 or record it as reserved |

---

### 2.12 `ADJUSTMENT_SETTLEMENT_MAX_HOURS = 72`

| Field | Value |
|---|---|
| **Current value** | `72` hours |
| **Where used** | `withinAdjustmentSettlementWindow()` → `checkAdjustmentTiming` — **active** |
| **Classification** | Synthetic experiment assumption |
| **Provenance** | **INVENTED BY ME**, and inherited from the shared 72h it was split out of in item 3. It has **never been independently justified for this purpose** |
| **Why needed** | Prevents an adjustment from explaining a settlement it could not plausibly relate to. This check exists because a scenario proved the baseline accepted a month-late adjustment on arithmetic alone |
| **Alternatives** | Same-cycle only; `168` (one week); or "within the settlement window ± cycle length" |
| **Risk if too permissive** | A distant adjustment can be claimed as an explanation — reopening exactly the hole this check closed |
| **Risk if too strict** | Legitimate near-boundary adjustments are rejected, pushing genuinely explainable cases into the residual as `AMBIGUOUS` |
| **Effect on baseline** | **Direct.** Determines whether `misleading-adjustment` produces an exception (it currently does) |
| **Effect on AI evaluation** | **Direct.** This is the adversarial "tempting but impossible explanation" case — a key test of whether the agent resists a plausible-looking match |
| **Sensitivity analysis** | **REQUIRED.** This is the least-justified active constant in the system. Report `misleading-adjustment` and `ambiguous-adjustment` outcomes at 24 / 72 / 168 hours |
| **Recommended** | **Keep `72` for now, flagged as the weakest justification.** 72h is inherited convenience, not analysis. Consider replacing with a cycle-relative bound in Phase 4 |

---

## 3. Item 6 — `MAX_TRANSACTABLE_AMOUNT_MINOR`: spec/code mismatch

### The mismatch

| Location | State |
|---|---|
| `EXPERIMENT_CONSTANTS.md` §1 (M4) | Documented as `100_000_000_00` (₹100 crore), class `INVARIANT`, freeze `TUNABLE` |
| Codebase | **Does not exist.** Zero references |

`CONSISTENCY_CHECKLIST.md` requires the data model to support every contract; a documented
invariant with no implementation is a silent divergence.

### What it actually is

Not a business rule — an **input-validation bound**. It answers "is this amount absurd
enough to be corrupt data?", not "is this financially correct?". That distinction settles
where it belongs.

### Recommended canonical location

**`packages/application/src/ingestion/contracts.ts`**, as a bound on `moneyDto`.

Reasoning:

- It is a **hostile-input control** (`SECURITY.md` §14), and ingestion is where untrusted
  input is validated. It belongs with the other bounds already there
  (`MAX_IMPORT_RECORDS`, string lengths).
- It is **not** a domain invariant. `packages/domain/money` deliberately has no opinion on
  magnitude — `Money` is `bigint` precisely so it has no ceiling. Adding one to the domain
  would contradict the reason that type exists.
- It must **not** be an environment variable: a deployment that quietly raised it would
  change what input the system accepts (`CONFIGURATION.md`).

### Recommendation

**Implement it in ingestion at `100_000_000_00` (₹100 crore), and reclassify it in the spec
from `INVARIANT` to an ingestion validation bound.** It will reject nothing in the current
dataset — its purpose is to fail loudly on corrupt input rather than ingest an absurd
figure into a financial total.

**Alternative:** delete M4 from the spec. Also defensible, but leaves no guard against a
malformed amount entering the ledger.

---

## 4. Still-`PROPOSED` parameters *not* part of this decision

Listed so nothing is hidden. None is frozen; none is being decided now.

| Parameter | Value | Status |
|---|---|---|
| `LATE_RECORD_ARRIVAL_MAX_DAYS` | `7` | **Dead** — 0 references. Do not freeze as active |
| §5 agent budgets (`MAX_TOOL_CALLS`, steps, temperature, etc.) | 8 / 8 / 0 | Phase 7. Not yet implemented |
| §6 operational limits (page size, import size, idempotency retention) | various | Partly implemented; `OPERATIONAL` class, tunable |
| §7 dataset composition (splits, merchants, seed, distribution) | 410 cases / 41 merchants | **Blocks generation.** Owner-revised, still `PROPOSED` |
| §8 thresholds other than X1 (`ESRR_MIN_IMPROVEMENT`, retention, bootstrap) | +10 pp / 60% / 10,000 | **Blocks scoring** |
| §9 leakage thresholds | 0.30 / 0.35 / 0.70 | **Blocks the audit's pass/fail call** |
| X1 `URR_CEILING` | 2.0% / 5.0% CI | ✅ **APPROVED 2026-09-01** |

---

## 5. Summary of recommendations

| # | Parameter | Recommendation | Sensitivity analysis |
|---|---|---|---|
| 2.1 | `FEE_RATE.NETBANKING` 190 | Keep | No |
| 2.2 | `FEE_RATE.UPI` 0 | Keep — useful negative control | No |
| 2.3 | `FEE_RATE.WALLET` 200 | Keep, but it is unexercised | No |
| 2.4 | `fee-schedule-v2` / CARD 230 | **Keep**; verify ₹20 gap > ₹1.00 cap | **Yes** |
| 2.5 | Rounding cap ₹1.00 | Keep | **Yes — highest priority** |
| 2.6 | Settlement date ±1 day | Keep | Recommended |
| 2.7 | Near-duplicate 60s | Keep; must be exercised in Phase 4 | Later |
| 2.8 | Cutoff 18:00 IST | Keep | No |
| 2.9 | Refund netting 2 cycles | Keep | **Yes** |
| 2.10 | Bank credit lag 24h | Keep | Low priority |
| 2.11 | Bank credit lateness 72h | Keep; **unwired** | No |
| 2.12 | Adjustment window 72h | Keep; **weakest justification** | **Yes** |
| Item 6 | `MAX_TRANSACTABLE_AMOUNT_MINOR` | Implement in ingestion; reclassify | No |

**Four sensitivity analyses are recommended before scoring** (2.4, 2.5, 2.9, 2.12). All are
cheap — they re-run the deterministic baseline at alternative values and report residual-set
size. Running them **before** the treatment exists means the residual's sensitivity to my
invented choices is known in advance, rather than becoming an argument after results are in.

---

## 6. Constraints I am holding to

- No dataset generated. No leakage audit run. No AI treatment. No UI modified.
- No value changed in items 1–3 — only wiring and naming.
- Once you approve, these values freeze. If the AI later underperforms and the suggestion
  is to loosen a tolerance, **that is a post-hoc baseline change and I will refuse it**,
  citing `EVALUATION.md` §19 and `VALIDATION_EXPERIMENT.md`.

**Stopping here.**
