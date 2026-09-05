# UI Phase 1 Decisions — information architecture

**Date:** 2026-09-01
**Status:** `LOCKED — recorded before any code change`
**Authorization:** owner directive; `CHANGE_CONTROL.md` CC-014

---

## 1. Locked decisions

| # | Decision | Value |
|---|---|---|
| 1 | Navigation | **Overview · Exceptions · Reconciliation · Scenarios** — four only |
| 2 | Route language | `/cases` → **`/exceptions`**; `reconciliation_case` stays the domain/DB term |
| 3 | Default theme | **`light`**. Dark retained because it is already structurally free; not elaborated |
| 4 | First missing contract | **Audit read** only. The other eight stay recorded, unbuilt |
| 5 | Phase 1 acceptance | **A real end-to-end mutation**, not a report |

**Not built, not faked:** Payments · Settlements · Approvals · Audit-as-destination ·
Transaction 360 · hypotheses · evidence panel · AI proposal · verifier checks.

> Audit is **part of the product**, not a first-class destination yet. Phase 1 surfaces
> audit history *inside the exception detail*, where it is immediately useful, rather than
> as a nav item with nothing behind it.

---

## 2. Information architecture

```
/                      Overview        "What needs my attention?"
/exceptions            Queue           "What needs investigation?"
/exceptions/[id]       Work surface    "What happened, and what do I do?"
/reconciliation        Runs + funnel   "What did automation resolve?"
/scenarios             Scenario entry  "Create a financial event."
```

Case detail is reached **from the queue**, not from navigation — it is a work surface, not a
destination.

### Per-screen purpose and required action

| Screen | Primary question | Required action(s) | Endpoint |
|---|---|---|---|
| Overview | What needs attention now? | Jump to work · create scenario | reads + link-through |
| Exceptions | What needs investigation? | Open · **investigate** · **escalate** from the row | `POST …/investigations`, `POST …/escalate` |
| Exception detail | What happened, what next? | **Investigate · escalate · re-investigate** | 3 POST endpoints |
| Reconciliation | What did automation resolve? | **Run reconciliation** | `POST /v1/reconciliation-runs` |
| Scenarios | Create a financial event | **Instantiate scenario** | `POST /v1/demo/scenarios/:id/instantiate` |

**Every screen mutates state.** That is the acceptance bar (`PRODUCT_PRINCIPLES.md` §13).

---

## 3. The Phase 1 acceptance journey

```
Scenarios → create "fee-tax-discrepancy"
    ↓ POST /v1/demo/scenarios/:id/instantiate   (real records, real import, real run)
Exceptions → the new case appears in the queue
    ↓ POST /v1/cases/:id/investigations
Exception detail → state becomes INVESTIGATING (or ESCALATED, AI disabled)
    ↓ refresh
State persists · audit trail shows the transition
```

Proven against the live backend, not asserted.

---

## 4. Backend addition — audit read only

Two endpoints. No domain behaviour changes; audit rows are already written and append-only
at the database.

```
GET /v1/cases/:id/audit   chronological history for one case
GET /v1/audit             tenant-scoped recent activity (Overview feed)
```

Returns `event_type`, `actor_type`, `actor_id`, `previous_state`, `next_state`,
`case_version`, `correlation_id`, `occurred_at`, redacted payload.

**No write path exists and none will be added.** The application role has `UPDATE`/`DELETE`
revoked on `audit_events`, so the UI offers no edit affordance because none is possible.

---

## 5. Visual system — light-first

| Token | Light (canonical) |
|---|---|
| Ground | warm near-white, not pure `#fff` |
| Surface | white, hairline border, minimal shadow |
| Text | deep charcoal; slate secondary |
| Interaction | restrained navy — **not** a blue-washed UI |
| Status | the five existing semantic tones; `ESCALATED` red |
| Radius | `0.375rem` on data surfaces |
| Density | 32px compact / 40px comfortable, toggleable |
| Numerals | `tabular-nums` on every money and count |

Dark remains correct because tokens already exist for it. It is not being elaborated.

---

## 6. Mutation contract — the structural gap Phase 1 closes

Every mutation is a **Server Action** calling the API server-side, so the identity cookie
stays httpOnly and the API base URL never reaches the browser.

```
1. send the client's case_version
2. 409  → "This case changed. Reloading the latest state."   never blind retry
3. 403  → "You are not permitted to perform this operation."
4. 404  → "This exception is not available."                 cross-tenant answer, unchanged
5. 400  → surface the field error (reason required, etc.)
6. success → revalidatePath, render the state the API returned
```

**Actions are gated on state.** An action illegal from the current state is not rendered —
never rendered-then-rejected.

| From state | Offered |
|---|---|
| `EXCEPTION` | Investigate · Escalate |
| `INVESTIGATING` | Escalate |
| `REQUESTING_EVIDENCE` | Re-investigate · Escalate |
| `REJECTED` | Re-investigate · Escalate |
| `ESCALATED`, `CLOSED`, `RECONCILED` | none |

`request-evidence` is **not offered anywhere in Phase 1** — it is legal only from
`ACTION_PROPOSED`/`APPROVAL_PENDING`, which require a verified proposal (Phases 7–8).

---

## 7. Component architecture

```
app/                 routes + layout + actions.ts
features/
  shared/            MoneyCell · Timestamp · CopyableId · EmptyState · ErrorState · SectionHeader
  exceptions/        queue table · row actions · action bar · audit timeline
  scenarios/         catalog card · create form
  reconciliation/    funnel · run history
components/          app-shell · status-badge · tenant-bar + components/ui/* (Base UI)
lib/                 api.ts · format.ts · case-state.ts
```

Files target <250 lines; review at 350; never exceed 500 — mirroring the backend policy.

---

## 8. Dependencies

**New runtime dependencies: 0.**

shadcn Base UI primitives to add (same foundation, not new libraries): `alert-dialog`,
`sheet`, `textarea`, `label`.

Skiper: `skiper40`/`ExternalRef` retained for external references only. **`skiper41`
deferred** — it must beat a CSS `mask-image` in prototype, and Phase 1 has no scroll
container long enough to need it.

---

## 9. States the UI may show

Only what the backend can actually produce in Phase 1:

`EXCEPTION` · `INVESTIGATING` · `ESCALATED` · `REQUESTING_EVIDENCE` · `RECONCILED` · `CLOSED`

**`APPROVAL_PENDING`, `STAGED`, `APPLIED`, `OUTCOME_LOGGED` will not appear**, because the
approval path does not exist. They will not be seeded. A hand-populated queue is a
screenshot.

---

## 10. Out of scope for Phase 1

Transaction 360 · evidence panel · hypotheses · AI proposal · verifier checks · approvals ·
staging · audit as a destination · Payments · Settlements · search · dark-theme elaboration ·
`@tanstack/react-table` · chart library.

**Locked. Implementation follows.**
