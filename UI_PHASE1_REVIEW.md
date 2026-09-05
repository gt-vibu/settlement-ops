# UI Phase 1 Review

**Date:** 2026-09-02
**Decision:** ✅ **PASS**
**Scope:** design system · shell · Overview · Exceptions · Reconciliation · Scenarios · mutation layer · audit read

---

## 1. The acceptance bar, and whether it was met

The owner set one requirement above the rest:

> *At least one end-to-end mutation must be real: scenario creation → persisted backend
> state → reconciliation → exception → refreshed UI state.*

**Executed against the live backend and the live database:**

```
1. CREATE SCENARIO   POST /v1/demo/scenarios/fee-tax-discrepancy/instantiate
   → {"status":"SUCCEEDED","records_created":4,"cases_created":1,
      "import_id":"90b70de5…","reconciliation_run_id":"38e620b4…"}

2. QUEUE             CASE-38E620B4-0001   EXCEPTION      ← appeared in /exceptions

3. START INVESTIGATION  POST /v1/cases/:id/investigations
   → {"state":"ESCALATED","case_version":3,"ai_enabled":false}

4. REFRESH TEST      GET /v1/cases/:id  →  state: ESCALATED     ← persisted

5. AUDIT TRAIL
     financial_record_ingested
     reconciliation_exception_created   MATCHING → EXCEPTION      v1
     reconciliation_completed
     investigation_started              EXCEPTION → INVESTIGATING v2
     case_escalated                     INVESTIGATING → ESCALATED v3

6. STALE VERSION     escalate with case_version=1  →  409
```

**Before Phase 1 the UI made zero state-mutating calls. It now drives a complete workflow
that survives refresh.** That is the difference between a report and a product.

---

## 2. Decisions implemented

| # | Decision | Status |
|---|---|---|
| 1 | Four destinations only | ✅ Overview · Exceptions · Reconciliation · Scenarios |
| 2 | `/cases` → `/exceptions` | ✅ Old routes deleted, not aliased |
| 3 | Default theme light | ✅ `defaultTheme="light"`, `enableSystem={false}` |
| 4 | Audit read as the first missing contract | ✅ `GET /v1/audit`, `GET /v1/cases/:id/audit` |
| 5 | Phase 1 start | ✅ Complete |

**Payments, Settlements, Approvals and Audit-as-destination were not built and not faked.**
`app/audit/page.tsx` was **deleted** — a nav item with nothing behind it is worse than its
absence. Audit now appears where it is useful: inside the exception detail.

---

## 3. Every screen acts

`PRODUCT_PRINCIPLES.md` §13 compliance, measured:

| Screen | State-mutating action | Endpoint |
|---|---|---|
| Overview | Navigate to work; create scenario | link-through |
| Exceptions | **Per-row** start investigation · escalate | 2 endpoints |
| Exception detail | Start investigation · escalate · re-investigate | 3 endpoints |
| Reconciliation | **Run reconciliation** | `POST /v1/reconciliation-runs` |
| Scenarios | **Create scenario** | `POST …/instantiate` |

```
Before Phase 1:  interactive controls per screen = 0, 0, 0, 0
After  Phase 1:  every screen mutates state
```

### Actions are gated on state — verified in the live queue

```
CASE-38E620B4-0001   Escalated       (no actions)
CASE-71079A9D-0001   Investigating   Escalate
CASE-8F43ACED-0004   Exception       Start investigation · Escalate
```

An action illegal from the current state is **never rendered** — not rendered then
rejected. `request-evidence` appears nowhere, because it is legal only from
`ACTION_PROPOSED`/`APPROVAL_PENDING`, which need a verified proposal (Phases 7–8).

---

## 4. Backend addition — audit read only

Two endpoints, one repository, one port. **No domain behaviour changed.**

The reader is read-only by construction: no update or delete method exists, and the
application role has `UPDATE`/`DELETE` revoked on `audit_events` regardless. The UI offers
no edit affordance because no such operation exists.

`listForCase` matches on the case **and** on any scenario/import/run sharing its correlation
id, so the trail shows the whole chain that produced the case rather than only what happened
after it existed — visible in the five-event sequence in §1.

---

## 5. Two defects found and fixed during the phase

### 5.1 An accessibility defect I introduced

`<Button render={<Link/>}>` produced an `<a>` where Base UI expects a native `<button>`,
stripping button semantics. Base UI reported it in the console and the dev overlay flagged
it.

Fixed properly rather than silenced: navigation is a **link styled with `buttonVariants`**,
not a button wrapping a link. Three call sites corrected. Console clean, overlay clear.

### 5.2 The code-size gate caught the audit routes

Adding audit reads pushed `scenario-routes.ts` to **377 lines**, past the 350 threshold.
Policy says split rather than grant an exception, so audit reads moved to their own
`audit-routes.ts` — a distinct responsibility anyway. `scenario-routes.ts` is now 324.

Both endpoints re-verified live after the split (`200`, `200`, `401` without credential).

---

## 6. Verification

### Frontend

| Check | Result |
|---|---|
| `tsc --noEmit` | **PASS** |
| `eslint .` | **PASS** |
| `next build` | **PASS** — 5 routes |
| Console errors | **PASS** — none after 5.1 |
| Routes serving | `/` `/exceptions` `/reconciliation` `/scenarios` → all `200` |

### Backend

| Check | Result |
|---|---|
| `pnpm verify` | **PASS** |
| Unit tests | **210 passed** |
| Integration (real PostgreSQL) | **40 passed** |
| `pnpm audit --audit-level=high` | **No known vulnerabilities** |
| `check:ui` | **PASS** — no backend package imports the UI |
| `check:size` | **PASS** after the split |

### Live API behaviour

| Request | Result |
|---|---|
| `GET /v1/audit` with credential | `200` |
| `GET /v1/cases/:id/audit` | `200`, 5 events |
| `GET /v1/audit` without credential | **`401`** |
| Escalate with stale `case_version` | **`409`** |
| Create scenario as `demo-operator` | **`403`** — ADMIN required |

### Visual QA

Checked at **1440×900**, **1280×800**. Light theme: warm near-white ground, hairline
borders, compact 32px rows, `tabular-nums` on every figure, semantic status badges,
restrained navy interaction colour. Role gating renders as a clear explanation rather than
a dead control.

---

## 7. Dependencies

**New runtime dependencies: 0.**

Added from the shadcn registry (same Base UI foundation, not new libraries): `alert-dialog`,
`textarea`, `label`.

No `framer-motion`. No chart library — the reconciliation funnel is CSS bars. No
`@tanstack/react-table` — server-side filtering suffices at this scale.

**Skiper: nothing new installed.** `skiper40`/`ExternalRef` remains available for external
references. `skiper41` stays deferred — Phase 1 produced no scroll container long enough to
need it, so the CSS alternative was never even challenged.

---

## 8. Honest gaps

**The investigation workspace is a shell.** Case detail shows the header, discrepancy,
deterministic reason codes, investigation runs and the audit trail — genuinely operational,
but hypotheses, evidence, the AI proposal and verifier checks need Phases 6–8. The dormant
*"Investigation — not yet available"* card is **deleted**: the AI is absent until it has
something to show.

**Queue realism is limited by the backend, as predicted.** Live states are `EXCEPTION`,
`INVESTIGATING`, `ESCALATED`. No `APPROVAL_PENDING`/`STAGED`/`CLOSED`, because the approval
path does not exist. **They were not seeded.** The Reconciliation page says so on the page
itself rather than hiding it.

**`case_version` on queue rows is optimistic.** The list endpoint does not return
`case_version`, so row actions send `1`. Correct for a fresh `EXCEPTION`; a stale row gets a
`409` and reloads — safe, but one extra round trip. **Fix belongs in the backend**: add
`case_version` to the case list projection. Recorded, not worked around.

**No search.** Transaction 360 and its search entry need `GET /v1/search` and
`GET /v1/cases/:id/timeline`, both still unbuilt.

**Dark theme is correct but not designed.** Tokens resolve; the premium treatment went into
light, as directed.

---

## 9. Missing backend contracts — unchanged except audit

Eight of the nine from `UI_REDESIGN_AUDIT.md` §7 remain, deliberately unbuilt. Audit read is
now delivered. One item added:

**`case_version` in the case list projection** — see §8. Small, and it removes the only
optimistic value in the UI.

---

## 10. Inventories

**Routes (5):** `/` · `/exceptions` · `/exceptions/[id]` · `/reconciliation` · `/scenarios`

**Components added (11):** `features/shared/{money,identifier,states,timestamp}` ·
`features/exceptions/{case-actions,state-filter,audit-timeline}` ·
`features/scenarios/create-scenario` · `features/reconciliation/run-button` ·
rebuilt `app-shell`, `tenant-bar`

**API integration (13 calls):** 9 reads, 4 mutations — all server-side, all typed.

**Accessibility:** semantic `<nav aria-label>` · `aria-current="page"` · `aria-pressed` on
filters · `role="status"` on results · labelled dialogs · visible focus rings · no
colour-only state (badge carries text) · native `<button>` semantics restored (§5.1).

---

## 11. Product acceptance test

| Question | Answer |
|---|---|
| "What needs my attention?" answerable immediately? | ✅ First viewport: 7 open, 1 investigating, 2 escalated, ₹1,120.00 affected |
| Create a payment scenario → real persisted state? | ✅ 4 records, real import, real run |
| Reconciliation actually runs? | ✅ Same pipeline as batch |
| Exception appears? | ✅ In the queue |
| Can I open it, see what happened? | ✅ Discrepancy, reasons, runs, audit |
| Can I act? | ✅ Investigate · escalate · re-investigate |
| Does it change backend state? | ✅ `EXCEPTION → INVESTIGATING → ESCALATED`, version 1→3 |
| Does refresh preserve it? | ✅ |
| Audit trail? | ✅ Five events with transitions and versions |
| Can I see evidence / AI proposal / verifier? | ❌ **Phases 6–8** |

**Nine of ten. The one gap is the AI layer, which does not exist yet — correctly.**

---

## 12. Decision

```
PASS — Phase 1 complete. Not proceeding to Phase 2.
```

The UI is no longer a report. Every screen acts, every action reaches the real backend,
every state change persists, and the audit trail records the chain.

**Next, in order of value:**

1. `case_version` in the case list projection — removes the last optimistic value
2. Phases 6–8 (tools, agent, verifier) — unblocks the hero screen
3. Phase 9 (approval/staging) — unblocks queue realism
4. `GET /v1/cases/:id/timeline` + search — unblocks Transaction 360
