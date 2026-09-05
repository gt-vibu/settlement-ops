# D7 Finalization Review

**Date:** 2026-09-01
**Status:** `PROPOSED FINAL — AWAITING OWNER FREEZE`
**Ran:** deterministic baseline only. **No AI. No dataset generated. Nothing scored. No UI touched.**
**Verification:** `pnpm verify` PASS — **210 unit** + **40 integration** tests.

---

## 1. The headline change: the adjustment rule was wrong in *kind*, not just in value

You asked whether a fixed hour threshold is even the right abstraction. It is not, and the
value was the smaller of two problems.

### What the investigation found

`hoursBetween()` takes an **absolute value**, so `ADJUSTMENT_SETTLEMENT_MAX_HOURS` was a
**symmetric** window. An adjustment effective 24 hours *before* a settlement and one
effective 24 hours *after* were treated as equally plausible explanations.

In the domain they are not remotely equivalent. A settlement's net is struck at
`settlement_at`. An adjustment that becomes effective **after** that instant **cannot have
been inside it** — it belongs to a later settlement. That is a lifecycle impossibility, not
a tolerance.

So the old rule was accepting, as valid explanations, adjustments that could not physically
have affected the settlement they were being credited with explaining.

### The replacement — and it removes a parameter rather than re-tuning one

```
adjustmentCanExplainSettlement(adjustmentAt, settlementAt):

  CAUSALITY   adjustmentAt <= settlementAt
              Hard. Zero parameters. Not tunable. A settlement's net is struck at
              settlementAt; anything effective later is in a different settlement.

  RECENCY     adjustmentAt >= businessDaysBefore(settlementAt, SETTLEMENT_CYCLE_BUSINESS_DAYS)
              Cycle-relative. Derived from a quantity the model already defines, not a
              fresh invented number. An adjustment older than one cycle should already
              have been carried by an earlier settlement.
```

**`ADJUSTMENT_SETTLEMENT_MAX_HOURS` is deleted.** There is no replacement hour value. The
new rule introduces **no new invented constant** — `ADJUSTMENT_ACCRUAL_WINDOW_BUSINESS_DAYS`
is defined as `= SETTLEMENT_CYCLE_BUSINESS_DAYS`, so it cannot drift independently.

Critically, **causality alone catches the adversarial case** with no tunable value at all.
The recency bound exists only to stop an adjustment from *any* past date being claimed —
the unfalsifiable-explanation failure `CAUSE_TAXONOMY.md` guards against.

### Measured effect (settlement Wed 2026-02-04; accrual window opens Mon 2026-02-02)

| Offset | Old (symmetric 72h) | New (causal + cycle) | |
|---|---|---|---|
| −720h, −168h, −96h | EXCEPTION | EXCEPTION | same |
| **−72h** | RECONCILED | **EXCEPTION** | **changed** — Sun 2026-02-01, before the window opens |
| −48h, −24h, −1h, 0h | RECONCILED | RECONCILED | same |
| **+1h** | RECONCILED | **EXCEPTION** | **changed** — effective after settlement |
| **+24h, +72h** | RECONCILED | **EXCEPTION** | **changed** — same reason |
| +73h and beyond | EXCEPTION | EXCEPTION | same |

The new rule is **strictly more correct**: every change closes a case the old rule wrongly
accepted. It was not selected to produce a particular residual size — it was derived from
the lifecycle, and the residual moved as a consequence.

Tests added: causality, accrual-window acceptance, recency rejection, an explicit
**asymmetry** test (24h before vs 24h after), and weekend-skipping in the backward walk.

---

## 2. Generator: one source of truth for the settlement calendar

The Thursday/Saturday finding is fixed at the root.

```ts
// before — a second, silently divergent settlement calendar
const SETTLED_AT = '2026-02-04T00:00:00.000Z';

// after — the generator is a CONSUMER of the domain calendar
const SETTLED_AT = expectedSettlementDate(new Date(CAPTURED_AT)).toISOString();
```

Also derived rather than hardcoded: `CREDITED_AT` (settlement + 6h), `LATE_CREDIT_AT`
(settlement + 3d), and `IMPLAUSIBLE_ADJUSTMENT_AT` (settlement + 30d, so the adversarial
case stays adversarial even if the base dates move).

Verified: the computed date equals the previously hardcoded `2026-02-04`, so no scenario
behaviour changed — the duplication is removed without a silent shift.

---

## 3. Parameter-by-parameter finalization

### 3.1 `ROUNDING_TOLERANCE_PER_RECORD_MINOR = 2` paise

| Field | Value |
|---|---|
| **Final proposed** | `2` paise |
| **Provenance** | Analytic. Two rate applications, ≤0.5 minor unit rounding each |
| **Sensitivity** | **ROBUST.** Measured flip at exactly 3 paise, as derived |
| **Domain justification** | Directly forced by `HALF_UP` on two operations |
| **Effect on residual** | Sets the floor of what counts as a discrepancy at all |
| **Affects comparability?** | Yes if changed — it redefines the residual. Freeze before scoring |
| **Remaining risk** | None identified |

### 3.2 `ROUNDING_TOLERANCE_ABSOLUTE_CAP_MINOR = 100` paise (₹1.00)

| Field | Value |
|---|---|
| **Final proposed** | `100` paise |
| **Provenance** | Existence principled; **level is a synthetic assumption** |
| **Sensitivity** | **ROBUST — and currently NON-BINDING.** Tolerance is `min(2 × lines, cap)`; at 1–2 lines the cap never engages. 50/100/200 gave an identical residual |
| **Domain justification** | Safety ceiling: without it, tolerance grows unbounded with line count and becomes a laundering channel |
| **Effect on residual** | **None in the current scenario space.** Engages only at ≥50 lines |
| **Affects comparability?** | Not today |
| **Remaining risk** | If the generator ever emits ≥50-line settlements this becomes live and S1 must be re-run. **Documented as non-binding, not as an AI-relevant feature** |

### 3.3 `AMOUNT_MATCH_TOLERANCE_MINOR = 0`

| Field | Value |
|---|---|
| **Final proposed** | `0` |
| **Provenance** | `BASELINES.md` — tolerance only where explicitly modeled |
| **Sensitivity** | Not applicable — zero is the floor |
| **Domain justification** | Outside the rounding path, amounts must agree exactly |
| **Effect on residual** | Enforces exactness in the bank-credit check |
| **Affects comparability?** | No |
| **Remaining risk** | None. Newly **wired** (item 1); previously an unread declaration |

### 3.4 Fee schedule: `CARD 250` / `TAX 1800` bps

| Field | Value |
|---|---|
| **Final proposed** | `250` / `1800` bps |
| **Provenance** | **Genuine** — reverse-engineered from `DEMO_SCENARIOS.md` §1 and `ARCHITECTURE.md` §16, which agree |
| **Sensitivity** | Not applicable — fixed by the specification |
| **Domain justification** | The only two values in this project with real provenance |
| **Effect on residual** | Defines expected net for every CARD case |
| **Affects comparability?** | Yes if changed — would contradict the spec |
| **Remaining risk** | None |

### 3.5 Fee schedule: `NETBANKING 190` / `UPI 0` / `WALLET 200` bps

| Field | Value |
|---|---|
| **Final proposed** | Keep all three |
| **Provenance** | **Synthetic assumptions.** Invented by me. Not Razorpay facts, no source |
| **Sensitivity** | Not measured — magnitude does not shift any decision boundary |
| **Domain justification** | UPI `0` earns its place as a **negative control**: a legitimately absent fee record, so an agent that always blames a missing fee is penalised |
| **Effect on residual** | Minimal. **WALLET is currently unexercised** — no scenario emits it |
| **Affects comparability?** | No |
| **Remaining risk** | WALLET should either be exercised by the Phase 4 generator or dropped. Do not mistake its presence for coverage |

### 3.6 `fee-schedule-v2` (CARD 230 bps from 2026-04-01)

| Field | Value |
|---|---|
| **Final proposed** | **Keep** |
| **Provenance** | **Synthetic assumption.** Both the mid-period change and 230 are invented |
| **Sensitivity** | **ROBUST.** Gap is ₹20 — **20× the ₹1.00 rounding cap**, so boundary cases are decidable, not degenerate. Boundary selection exact at the 2026-04-01 instant. Misapplication caught in both directions as `UNEXPECTED_FEE_AMOUNT` |
| **Leakage** | **Clean.** Key-level scan across all six scenarios for `schedule\|rate\|bps\|version\|expected\|cause\|defect` matched only `schema_version` (lineage, unrelated). No schedule label |
| **Domain justification** | Makes `get_fee_schedule`'s effective-date parameter load-bearing |
| **Effect on residual** | None when the correct schedule is applied |
| **Affects comparability?** | No |
| **Remaining risk** | **Describe it accurately.** It is a *retrieval* step, not an ambiguity: `captured_at` determines the schedule. The chain is `inspect capture date → determine effective schedule → retrieve it → compute expected fee → compare`. **Do not report it as "AI resolves an ambiguity"** |

### 3.7 `SETTLEMENT_DATE_MATCH_TOLERANCE_DAYS = 1`

| Field | Value |
|---|---|
| **Final proposed** | `1` calendar day |
| **Provenance** | **Synthetic assumption.** Invented |
| **Sensitivity** | Not separately swept; subsumed by the generator fix, which removes the artefact that made this look marginal |
| **Domain justification** | Absorbs benign timestamp drift |
| **Effect on residual** | Governs `TIMING_LAG` prevalence |
| **Affects comparability?** | Yes if changed |
| **Remaining risk** | Low, now that the generator uses the canonical calendar. A ±1 day tolerance cannot absorb a 2-day calendar/business divergence — which is exactly why the generator fix mattered |

### 3.8 `NEAR_DUPLICATE_WINDOW_SECONDS = 60`

| Field | Value |
|---|---|
| **Final proposed** | `60` seconds |
| **Provenance** | **Synthetic assumption.** Invented; approximates a redelivered webhook |
| **Sensitivity** | **Not measurable today — no scenario emits near-duplicates** |
| **Domain justification** | Exact source-id matching misses a redelivery with a fresh id |
| **Effect on residual** | None currently |
| **Affects comparability?** | Not yet |
| **Remaining risk** | `DATASET.md` §4 lists duplicated delivery as **required** noise. If Phase 4 adds it, this rule becomes live and must be swept. Too strict double-counts money; too permissive flags legitimate same-amount payments |

### 3.9 `SETTLEMENT_CYCLE_BUSINESS_DAYS = 2`, `SETTLEMENT_CUTOFF_HOUR_IST = 18`

| Field | Value |
|---|---|
| **Final proposed** | `2` business days, `18:00` IST |
| **Provenance** | **Synthetic assumptions.** T+2 with an evening cutoff resembles industry practice; **I am citing no source and neither is a Razorpay fact** |
| **Sensitivity** | Structural rather than tunable — now load-bearing for **three** rules (settlement timing, the adjustment accrual window, and generator dates) |
| **Domain justification** | The cycle is the backbone of the temporal model |
| **Effect on residual** | High — it defines the expected settlement date for every case |
| **Affects comparability?** | **Yes, strongly.** Changing the cycle changes nearly every temporal relationship |
| **Remaining risk** | Its blast radius **increased** in this review, because the adjustment window is now derived from it. That is a deliberate trade: one well-defined assumption rather than two loosely-related ones |

### 3.10 `REFUND_NETTING_MAX_CYCLES = 2`

| Field | Value |
|---|---|
| **Final proposed** | `2` cycles |
| **Provenance** | **Synthetic assumption.** Invented |
| **Sensitivity** | **SENSITIVE — recorded.** Measured flip at 4→5 days. Across the swept distribution: **1 → 7/10, 2 → 5/10, 3 → 3/10 exceptions** |
| **Domain justification** | Bounds what `REFUND_NETTING` may explain. Unbounded, any refund could be claimed against any settlement |
| **Effect on residual** | **Direct.** Sizes a cause class planned at 15% of the primary test split |
| **Affects comparability?** | **Yes.** Two runs at different values are not comparable |
| **Remaining risk** | Accepted and **must be reported**. The eventual evaluation report must state: *primary result at 2 cycles*, with the 1/2/3 sensitivity alongside — so "what if you had chosen 3?" has a measured answer rather than a shrug |

### 3.11 `BANK_CREDIT_EXPECTED_LAG_HOURS = 24`

| Field | Value |
|---|---|
| **Final proposed** | `24` hours |
| **Provenance** | **Synthetic assumption.** Invented |
| **Sensitivity** | Low priority; not separately swept |
| **Domain justification** | Distinguishes a normal credit from an anomaly. Also rejects credits that **predate** their settlement — a lifecycle impossibility, not earliness |
| **Effect on residual** | Moderate; one of nine checks |
| **Affects comparability?** | Yes if changed |
| **Remaining risk** | Low |

### 3.12 `BANK_CREDIT_LATENESS_TOLERANCE_HOURS = 72`

| Field | Value |
|---|---|
| **Final proposed** | `72` hours — **but do not freeze as active** |
| **Provenance** | **Synthetic assumption.** Invented |
| **Sensitivity** | Not applicable — **exported but never called by any check** |
| **Domain justification** | Intended outer bound past which lateness stops explaining |
| **Effect on residual** | **None.** Currently governs nothing |
| **Affects comparability?** | No |
| **Remaining risk** | Same class of latent-duplication risk as `LATE_RECORD_ARRIVAL_MAX_DAYS`. Either wire it in Phase 4 or mark it reserved |

### 3.13 `ADJUSTMENT_SETTLEMENT_MAX_HOURS`

| Field | Value |
|---|---|
| **Final proposed** | **NOT APPLICABLE — deleted** |
| **Provenance** | Was inherited from bank-credit lateness with no derivation |
| **Sensitivity** | Was **UNJUSTIFIED**; superseded by §1 |
| **Domain justification** | Replaced by causality + cycle-relative recency, introducing **no new constant** |
| **Effect on residual** | Post-settlement adjustments (+1h to +72h) now correctly become exceptions |
| **Affects comparability?** | The change happened **pre-freeze and pre-dataset**, so no comparison is invalidated |
| **Remaining risk** | The recency half rests on `SETTLEMENT_CYCLE_BUSINESS_DAYS`, which is itself a synthetic assumption — but one, not two |

### 3.14 `EVIDENCE_REQUEST_EXPIRY_DAYS = 7`

| Field | Value |
|---|---|
| **Final proposed** | `7` days |
| **Provenance** | `STATE_MACHINE.md` REQUESTING_EVIDENCE expiry; **value is a synthetic assumption** |
| **Sensitivity** | **ROBUST — no effect on the residual.** Not referenced by `reconcileUnit` or any of its checks |
| **Domain justification** | Workflow after a case exists, not case creation |
| **Effect on residual** | None, by construction |
| **Affects comparability?** | No |
| **Remaining risk** | None. Now canonical in the domain (item 2) |

### 3.15 `LATE_RECORD_ARRIVAL_MAX_DAYS = 7`

| Field | Value |
|---|---|
| **Final proposed** | **NOT APPLICABLE — excluded from the freeze** |
| **Provenance** | `PRD.md` §20 concept; **value is a synthetic assumption** |
| **Sensitivity** | Not applicable — **0 references** |
| **Domain justification** | Late-evidence handling, a later phase |
| **Effect on residual** | None |
| **Affects comparability?** | No |
| **Remaining risk** | ✅ **Confirmed excluded.** Freeze only when `PRD.md` §20 is built. Dead configuration is how two sources of truth start |

---

## 4. Operational constants — classified separately, not frozen as policy

Per your instruction, kept distinct from domain policy. None affects a reconciliation
verdict.

| Constant | Value | Location | Class |
|---|---|---|---|
| `MAX_PAYMENTS_PER_RUN` | 5,000 | `apps/api/http/v1-routes.ts` | OPERATIONAL |
| `MAX_PAGE_SIZE` | 100 | same | OPERATIONAL |
| `POLL_INTERVAL_MS` | 5,000 | `apps/worker/index.ts` | OPERATIONAL |

They bound request handling, not financial correctness, and may be tuned without affecting
evaluation comparability.

---

## 5. Final status

| Parameter | Final value | Status |
|---|---|---|
| Rounding per-record | 2 paise | ✅ ROBUST |
| Rounding cap | 100 paise | ✅ ROBUST — documented **non-binding** |
| Exact amount match | 0 | ✅ Wired |
| CARD 250 / TAX 1800 bps | — | ✅ Genuine provenance |
| NETBANKING / UPI / WALLET | 190 / 0 / 200 | ✅ Synthetic; WALLET unexercised |
| fee-schedule-v2 | 230 bps @ 2026-04-01 | ✅ ROBUST, no leakage |
| Settlement date tolerance | 1 day | ✅ Synthetic |
| Near-duplicate window | 60 s | ⚪ Synthetic, **unexercised** |
| Cycle / cutoff | 2 biz days / 18:00 IST | ✅ Synthetic, **blast radius increased** |
| Refund netting cycles | 2 | 🟡 **SENSITIVE — must be reported with 1/2/3** |
| Bank credit expected lag | 24 h | ✅ Synthetic |
| Bank credit lateness | 72 h | ⚪ **Unwired** — do not freeze as active |
| Adjustment/settlement rule | **causal + cycle-relative** | ✅ **RESOLVED — parameter deleted** |
| Evidence expiry | 7 d | ✅ No residual effect |
| Late-record arrival | — | ⚪ **Excluded — unused** |

**Nothing is frozen.** `POLICY_VERSION` remains `1.0.0-proposed`,
`POLICY_APPROVAL_STATUS` remains `PROPOSED`.

### On approval I will
Set `POLICY_VERSION = 1.0.0` and status `APPROVED`; add a test pinning every approved value
so later drift breaks the build; record the freeze in `CHANGE_CONTROL.md`.

### Two things I will refuse afterwards
Loosening any tolerance to improve an AI result, and re-deriving the adjustment rule
because the residual looks inconvenient. Both are post-hoc baseline changes
(`EVALUATION.md` §19, `VALIDATION_EXPERIMENT.md`).

**Stopping here.** No dataset generated, no AI implemented, no UI modified.
