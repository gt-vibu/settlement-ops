# D7 Sensitivity Report — deterministic baseline only

**Date:** 2026-09-01
**Status:** `EVIDENCE GATHERED — NO VALUE FROZEN`
**Ran:** deterministic baseline only. **No AI treatment. No dataset generated. Nothing scored. No UI touched.**

---

## Method — and why it does not mock constants

The policy constants are module-level values. Mocking them would let the probe drift from
the code that actually runs, and I would end up measuring the mock.

Instead the probe **holds every constant at its proposed value and sweeps the underlying
data across each decision boundary**, driving the real `reconcileUnit`. Where the verdict
flips *is* the effective constant, measured rather than asserted. Residual counts at
alternative values are then read directly off the sweep.

Probe: `scripts/sensitivity/probe.ts` + `population.ts`. Reproduce with:

```bash
npx tsx scripts/sensitivity/probe.ts
```

The probe population is in-memory, never persisted, and unrelated to the frozen benchmark.

---

## ⚠ Correction to my own prior

`D7_DECISION_TABLE.md` §2.5 called the rounding **cap** "the most important sensitivity in
this document" and asked for it to be the highest-priority analysis.

**The measurement says I was wrong.** For any settlement with fewer than 50 contributing
lines, the cap has **literally no effect** — tolerance is `min(2 × lines, cap)`, so at 1–2
lines the tolerance is 2–4 paise and the cap never binds. Changing it 50 → 100 → 200
produced an *identical* residual for single-line cases (12/15 in all three).

The cap only becomes live at ≥50 lines, a shape the current scenarios never produce. I had
reasoned about the mechanism correctly and the prevalence wrongly.

---

## S1 — Rounding tolerance

### Measured boundary (single line, tolerance = 2 paise)

| Variance (paise) | 0 | 1 | 2 | **3** | 4 | 10 | 100 | 200 |
|---|---|---|---|---|---|---|---|---|
| Outcome | ✅ | ✅ | ✅ | **EXC** | EXC | EXC | EXC | EXC |

Flip at exactly 3 paise — precisely where the analytic derivation predicts (two rounding
operations, ≤0.5 minor unit each, allowance of 2).

### Cap behaviour by line count

| Lines | 1 | 5 | 10 | **50** | 60 | 100 | 1000 |
|---|---|---|---|---|---|---|---|
| Effective tolerance | 2 | 10 | 20 | **100** | 100 | 100 | 100 |
| At tolerance / +1 | ✅/EXC | ✅/EXC | ✅/EXC | ✅/EXC | ✅/EXC | ✅/EXC | ✅/EXC |

The cap engages at exactly 50 lines and holds flat thereafter — the intended safety
property, confirmed: a 1,000-line settlement gets the same ₹1.00 allowance as a 50-line one,
not ₹20.

### Residual at alternative caps

| Cap | Single-line residual | 60-line residual |
|---|---|---|
| 50 | 12/15 | 7/15 |
| **100 (proposed)** | **12/15** | **5/15** |
| 200 | 12/15 | 5/15 |

| Parameter | Verdict |
|---|---|
| `ROUNDING_TOLERANCE_PER_RECORD_MINOR = 2` | **ROBUST** — analytically derived; measured flip is exactly at the predicted point |
| `ROUNDING_TOLERANCE_ABSOLUTE_CAP_MINOR = 100` | **ROBUST** for realistic shapes (<50 lines: zero effect). Retain as a **safety ceiling**, not a tuning knob |

> **Carry-forward for Phase 4:** if the generator ever emits ≥50-line settlements, the cap
> becomes live and this analysis must be re-run. It is currently inert by shape, not by design.

---

## S2 — `ADJUSTMENT_SETTLEMENT_MAX_HOURS` (proposed 72h)

Tested at 48h / 72h / 96h as requested, on the adversarial shape: an adjustment whose
amount matches the shortfall exactly, swept away from the settlement date.

| Offset | 0–72h | **73h** | 84h | 96h | 120h | 168h | 720h |
|---|---|---|---|---|---|---|---|
| Outcome | RECONCILED | **EXCEPTION** | EXC | EXC | EXC | EXC | EXC |

Reason on flip: `LIFECYCLE_INCONSISTENT`. Clean flip at 72→73h, exactly as configured.

### Residual across candidate windows (18 swept offsets)

| Window | Offsets becoming EXCEPTION |
|---|---|
| 48h | 12/18 |
| **72h (proposed)** | **8/18** |
| 96h | 4/18 |

**A 3× swing across a defensible range.** But the designed adversarial case sits at ~720h
(one month) and is an exception at *every* candidate — so the case the check exists for is
robust; the sensitivity lives entirely in the 49–96h mid-range, which no current scenario
occupies.

| Parameter | Verdict |
|---|---|
| `ADJUSTMENT_SETTLEMENT_MAX_HOURS = 72` | **UNJUSTIFIED** |

**Why UNJUSTIFIED rather than SENSITIVE.** The measurement is clean and the current impact
is nil — but the *value has no derivation whatsoever*. It is inherited from the 72h that
was chosen for bank-credit lateness, an unrelated quantity, and split out in item 3. No
analysis supports 72 over 48 or 96 for this purpose.

**Recommendation:** replace the absolute-hours bound with a **cycle-relative** one —
"within the settlement window ± one cycle" — which has an actual rationale in the domain
model instead of an inherited number. If a fixed bound is preferred, 72h is acceptable
*provided the generator does not place adjustments in the 49–96h band*, where the choice
would silently drive results.

---

## S3 — `fee-schedule-v2` boundary

### Is the gap safely above the rounding cap?

```
v1 CARD fee = 25,000 paise      v2 CARD fee = 23,000 paise
gap = 2,000 paise (₹20.00)      rounding cap = 100 paise (₹1.00)
→ gap is 20× the cap. ABOVE. Boundary cases are decidable, not degenerate.
```

The coupling risk I flagged in the decision table is **measured and clear.**

### Does the baseline resolve the boundary correctly?

| Capture date | Schedule selected | Fee | Outcome |
|---|---|---|---|
| 2026-03-25 | v1 | 25,000 | RECONCILED |
| 2026-03-31 | v1 | 25,000 | RECONCILED |
| 2026-04-01 | **v2** | 23,000 | RECONCILED |
| 2026-04-06 | v2 | 23,000 | RECONCILED |

Boundary selection is exact at the 2026-04-01 instant.

### Does misapplying the schedule get caught?

| Case | Outcome |
|---|---|
| 2026-03-30 recorded with **v2** fee | `UNEXPECTED_FEE_AMOUNT` |
| 2026-04-02 recorded with **v1** fee | `UNEXPECTED_FEE_AMOUNT` |

The baseline catches schedule misapplication in both directions.

### Is the correct schedule trivially exposed by a field?

Scanned every generated record across all six scenarios for key-level markers matching
`schedule|rate|bps|version|expected|cause|defect`:

```
only match: "schema_version"  (lineage schema v1 — unrelated to fee schedules)
emitted keys: amount, authorized_at, bank_reference, captured_at, credited_at,
              gross_amount, kind, line_type, lineage, net_amount, order_id,
              payment_id, payment_method, refund_id, settlement_at,
              settlement_batch_reference, settlement_id, status, utr
```

**No schedule label.** The applicable schedule is derivable only from `captured_at` /
`effective_date` — a legitimate temporal relationship a real operator would also use, which
is exactly what `LEAKAGE_AUDIT.md` §4 permits.

| Parameter | Verdict |
|---|---|
| `fee-schedule-v2` (existence, 230 bps, 2026-04-01) | **ROBUST** |

> **One honest downgrade of my earlier claim.** I described the boundary as creating
> "genuine ambiguity". It does not. Because `captured_at` is visible, the schedule is
> *determined* — the agent must **retrieve** it, not disambiguate it. That still makes
> `get_fee_schedule` load-bearing and is a real reasoning step, but it tests **tool use**,
> not ambiguity resolution. The decision-table wording overstated it.

### Incidental finding — a generator hazard for Phase 4

While sweeping dates, a capture on **Thursday 2026-04-02** produced
`SETTLEMENT_TIMING_OUTSIDE_WINDOW` even with the correct schedule.

Cause: my probe settled at **calendar** T+2 (Saturday 2026-04-04), while the system
computes **business** T+2 (Monday 2026-04-06). The 2-day divergence exceeds the ±1-day
tolerance. The system is right; the probe was naive.

**But this is a live hazard for dataset generation:** a generator that uses calendar T+2
would emit spurious timing exceptions for every Wednesday–Friday capture, contaminating the
residual with an artefact rather than an injected defect. The current
`generateScenarioBatch` hardcodes dates and avoids this, but Phase 4's generator must use
`expectedSettlementDate()` rather than adding two days.

---

## S4 — `REFUND_NETTING_MAX_CYCLES` (proposed 2) and the evidence/late-record assumptions

| Settle delay | 0d | 2d | 4d (2.0 cyc) | **5d (2.5 cyc)** | 7d | 17d |
|---|---|---|---|---|---|---|
| Outcome | ✅ | ✅ | ✅ | **EXCEPTION** | EXC | EXC |

Reason on flip: `REFUND_OUTSIDE_NETTING_WINDOW`. Boundary at 4→5 days, matching 2 cycles.

| Max cycles | Exceptions (of 10 swept delays) |
|---|---|
| 1 | 7/10 |
| **2 (proposed)** | **5/10** |
| 3 | 3/10 |

| Parameter | Verdict |
|---|---|
| `REFUND_NETTING_MAX_CYCLES = 2` | **SENSITIVE** |

Moving 1 → 3 more than doubles how many refunds the baseline accepts as netted. Since
`REFUND_NETTING` is 15% of the planned primary test split, this directly sizes a cause
class — and therefore directly sizes part of the residual the AI is measured on.

**Recommendation:** keep 2, and **record this as a preregistered choice with its measured
effect**, so a later reader can see the residual was not sized after the fact. 1 leaves no
room for the cross-cycle case the taxonomy exists to describe; 3 makes the explanation too
easy to assert.

### Evidence expiry and late-record assumptions

| Parameter | Verdict |
|---|---|
| `EVIDENCE_REQUEST_EXPIRY_DAYS = 7` | **ROBUST (no effect on residual)** |
| `LATE_RECORD_ARRIVAL_MAX_DAYS = 7` | **Excluded — unused** |

Neither is referenced by `reconcileUnit` or any of its nine checks. Both govern *workflow
after* a case exists, not whether one is created. Residual composition is independent of
them **by construction, not by measurement** — verified by grep and by an unchanged clean
verdict.

---

## Verdict summary

| Parameter | Proposed | Verdict | Sensitivity analysis |
|---|---|---|---|
| `ROUNDING_TOLERANCE_PER_RECORD_MINOR` | 2 paise | **ROBUST** | Done |
| `ROUNDING_TOLERANCE_ABSOLUTE_CAP_MINOR` | 100 paise | **ROBUST** (inert <50 lines) | Done — my prior was wrong |
| `ADJUSTMENT_SETTLEMENT_MAX_HOURS` | 72 h | **UNJUSTIFIED** | Done |
| `fee-schedule-v2` + CARD 230 bps | — | **ROBUST** | Done |
| `REFUND_NETTING_MAX_CYCLES` | 2 cycles | **SENSITIVE** | Done |
| `EVIDENCE_REQUEST_EXPIRY_DAYS` | 7 d | **ROBUST** (no effect) | n/a |
| `LATE_RECORD_ARRIVAL_MAX_DAYS` | 7 d | **Excluded — unused** | n/a |

---

## Confirmations requested

**1. `LATE_RECORD_ARRIVAL_MAX_DAYS` remains excluded from frozen constants.**
✅ Confirmed — **0 references** outside its declaration. It governs nothing. It sits in the
canonical module so the value is not reinvented at a call site, but it must **not** be
frozen as though active. Freeze it only when `PRD.md` §20 late-evidence handling is built.

**2. Exactly one canonical source for every active policy value.**
✅ Confirmed. All 17 policy constants are declared in exactly one module —
`packages/domain/src/policy/{tolerances,settlement-cycle,fee-schedule,policy-version}.ts`.
No value is declared twice.

**3. No API-layer policy constants remain duplicated.**
✅ Confirmed for policy. `EVIDENCE_EXPIRY_DAYS` is gone from `apps/api`.

Three constants **do** remain in the app layers, and I judge all three to be
`OPERATIONAL`, not policy — they bound request handling, not financial correctness:

| Constant | Location | Assessment |
|---|---|---|
| `MAX_PAYMENTS_PER_RUN = 5_000` | `apps/api/http/v1-routes.ts` | Operational bound on one run's size |
| `MAX_PAGE_SIZE = 100` | same | Pagination bound (`EXPERIMENT_CONSTANTS.md` §6, `OPERATIONAL`) |
| `POLL_INTERVAL_MS = 5_000` | `apps/worker/index.ts` | Worker loop timing |

None affects a reconciliation verdict. Flagging them so the judgement is yours, not mine
by omission — if you consider `MAX_PAYMENTS_PER_RUN` a policy value, it should move.

---

## What I recommend before freezing

| # | Item | Basis |
|---|---|---|
| 1 | Accept the rounding constants as **safety ceilings**, not tuning knobs | ROBUST, measured |
| 2 | **Re-derive `ADJUSTMENT_SETTLEMENT_MAX_HOURS`**, ideally as cycle-relative | UNJUSTIFIED — the only value with no rationale at all |
| 3 | Keep `REFUND_NETTING_MAX_CYCLES = 2` and preregister its measured effect | SENSITIVE — it sizes a cause class |
| 4 | Keep `fee-schedule-v2`; correct the "ambiguity" wording to "retrieval" | ROBUST, no label leak |
| 5 | **Phase 4 generator must use `expectedSettlementDate()`**, never calendar T+2 | Would otherwise inject artefact timing exceptions |
| 6 | Re-run S1 if the generator ever emits ≥50-line settlements | The cap is currently inert by shape |

**No value has been frozen. No value was changed by this analysis.**

**Stopping here.**
