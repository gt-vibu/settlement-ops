# UI Redesign Audit — Phase 0

**Date:** 2026-09-01
**Status:** `AUDIT COMPLETE — NO CODE WRITTEN`
**Authorization:** UI work re-authorized by owner directive (`CHANGE_CONTROL.md` CC-014, superseding CC-009)

---

## 0. The headline finding

The directive specifies eight navigation destinations and a full investigation workspace.
**The backend currently supports four of them, and the investigation workspace does not
exist below the UI layer.**

Directive §10 says *"do not add navigation just for appearance"*; §51 says *"do not create
fake data"*; §56 says *"if an API is missing, do NOT invent frontend-only behavior."*

Those three rules together mean the honest plan builds **four destinations now** and adds
the rest as backend phases land. Building eight would require fabricating four of them.

| Directive navigation | Backend support | Verdict |
|---|---|---|
| Overview | `GET /v1/operations/summary`, `GET /v1/cases` | ✅ **Build now** |
| Exceptions | `GET /v1/cases`, `GET /v1/cases/:id` + 4 action endpoints | ✅ **Build now** |
| Investigations | Lifecycle only — no agent, evidence, proposal or verifier | 🟡 **Partial** — lifecycle shell only |
| Reconciliation | `POST/GET /v1/reconciliation-runs` | 🟡 **Partial** — runs, no aggregate view |
| Scenario control *(not in directive nav, but §24 requires it)* | `GET /v1/demo/scenarios`, `POST …/instantiate` | ✅ **Build now** |
| Payments | **none** | 🔴 **Blocked** |
| Settlements | **none** | 🔴 **Blocked** |
| Approvals | **none** (Phase 9) | 🔴 **Blocked** |
| Audit | **no read endpoint** | 🔴 **Blocked** |

---

## 1. What already exists

### 1.1 Framework and infrastructure

| Item | State |
|---|---|
| Next.js | **16.2.6**, App Router, Turbopack. `next-app/AGENTS.md` warns APIs differ from training data |
| React | 19.2.4 |
| shadcn style | **`base-nova` on Base UI (`@base-ui/react` 1.7.0) — NOT Radix** |
| Tailwind | v4, CSS-first `@theme inline`, no `tailwind.config` |
| Theme | `next-themes`, system default, `d` hotkey. Light + dark both live |
| Server/client split | Server Components fetch; client only for interactivity |
| Auth plumbing | httpOnly cookie → Server Action → `X-Demo-User-ID` header |

### 1.2 Routes (4)

| Route | Purpose | Interactive controls |
|---|---|---|
| `/` | Operations overview | **0** |
| `/cases` | Exception queue | **0** |
| `/cases/[id]` | Case detail | **0** |
| `/audit` | Placeholder | **0** |

### 1.3 Components

**14 shadcn primitives (Base UI):** alert · badge · button · card · dropdown-menu · input ·
scroll-area · select · separator · skeleton · table · tabs · tooltip
**1 Skiper:** `skiper40.tsx` (six animated link variants)
**6 local:** app-shell · status-badge · state-filter · tenant-bar · api-unavailable · external-link
**3 lib:** `api.ts` (typed server client) · `format.ts` (money/date) · `case-state.ts` (tone mapping)

---

## 2. What is reusable — keep

| Asset | Why it survives |
|---|---|
| **`lib/format.ts`** | Money formatted from **integer minor-unit strings** by string slicing, never division. Indian digit grouping. This is correct and hard to get right — do not rewrite |
| **`lib/api.ts`** | Server-side typed client, `ApiResult<T>` discriminated union, degrades to a typed error rather than throwing. Extend, don't replace |
| **`lib/case-state.ts`** | 17-state → 5-tone mapping. `ESCALATED` deliberately red |
| **Auth via Server Action** | httpOnly cookie, allowlisted subjects, tenant never client-asserted |
| **Design tokens in `globals.css`** | Categorical + status tokens, verified to resolve in both themes |
| **`components/ui/*`** | 14 Base UI primitives, accessible, correctly themed |
| **`ExternalRef`** | Skiper `Link003` adapted with `rel="noopener noreferrer"` |

---

## 3. What is weak

| Weakness | Detail |
|---|---|
| **Overview is a KPI gallery** | Four stat tiles first, then a bar list, then a short case list. Directive §11 says answer *"what needs my attention?"* — this answers *"here are some numbers"* |
| Queue is a list, not a workbench | No row actions, no sort, no bulk selection, no priority ordering visible as a rank |
| Case detail is a read-only report | Discrepancy, priority, opened-at, reason codes. **Nothing to do** |
| **A dormant "Investigation — not yet available" card** | Advertises AI while providing none. Violates `PRODUCT_PRINCIPLES.md` §15 in its most hollow form |
| Audit page is a placeholder | Explains that audit exists elsewhere |
| No search | Directive §12 requires lookup by order/payment/settlement/UTR/reference |
| No density control | Rows are 36px but there is no compact/comfortable toggle |
| Skeletons declared, never used | `skeleton` imported nowhere |

---

## 4. What is structurally wrong

### 4.1 The product rule is violated on every screen

```
Backend state-mutating endpoints:   7
UI calls to any of them:            0
Interactive controls per screen:    0, 0, 0, 0
```

`PRODUCT_PRINCIPLES.md` §13: *the primary purpose of every screen is an operational action
or persistent state, not information display.* **All four screens are purely informational.**
This is the single structural defect; everything else is cosmetic by comparison.

### 4.2 No feature-oriented architecture

Everything sits in flat `app/` and `components/`. Directive §39 requires
`features/{exceptions,investigations,settlements,transactions,approvals,audit}`. Fine at
four pages; will not hold at fifteen.

### 4.3 No mutation/revalidation layer

`lib/api.ts` is read-only — no POST helper, no `revalidatePath` after mutation, no
`case_version` handling, no `409` conflict path. Directive §40 and
`FRONTEND_BACKEND_CONTRACT.md` Part III both require these.

### 4.4 Dark mode is a liability right now

Directive §8 makes **light theme primary**. The app currently defaults to *system*, so a
reviewer on a dark OS sees the dark variant first. Tokens exist for both, but the premium
light treatment the directive asks for has not been designed.

---

## 5. Report-like versus operational — page by page

| Page | Today | Required |
|---|---|---|
| `/` | Report | Work surface: what needs attention + priority queue + scenario entry |
| `/cases` | Report | Operations queue: search, filter, sort, open, act from the row |
| `/cases/[id]` | **Report** | **Decision surface**: evidence, hypotheses, proposal, verification, actions |
| `/audit` | Placeholder | Forensic timeline (blocked on backend) |

---

## 6. Missing interactions — all backend-supported today

These need **no new backend work**. The endpoints exist and are tested.

| Interaction | Endpoint | Transition |
|---|---|---|
| Start investigation | `POST /v1/cases/:id/investigations` | `EXCEPTION → INVESTIGATING` |
| Escalate (reason required) | `POST /v1/cases/:id/escalate` | `→ ESCALATED` |
| Request evidence (detail required) | `POST /v1/cases/:id/request-evidence` | `→ REQUESTING_EVIDENCE` |
| Re-investigate | `POST /v1/cases/:id/reinvestigate` | `→ INVESTIGATING` |
| Create scenario | `POST /v1/demo/scenarios/:id/instantiate` | creates real records + case |
| Run reconciliation | `POST /v1/reconciliation-runs` | produces cases |
| List investigations | `GET /v1/cases/:id/investigations` | — |

> **Note on `request-evidence`:** legal only from `ACTION_PROPOSED` / `APPROVAL_PENDING`,
> which require a verified proposal (Phase 7–8). From `EXCEPTION` the backend correctly
> returns `409 INVALID_STATE`. The UI must **not offer the action in states that forbid it**
> (`FRONTEND_BACKEND_CONTRACT.md` Part III rule 4).

---

## 7. MISSING BACKEND CONTRACTS

Recorded per directive §56. **No frontend-only substitute will be built for any of these.**

### 7.1 `GET /v1/cases/:id/timeline` — Transaction 360
**Why needed:** directive §12 is a primary screen. The lifecycle Order → Payment → Capture →
Fee/Tax → Refund/Adjustment → Settlement → Bank Credit → Ledger cannot be assembled
client-side without duplicating join logic the frontend must not own (§29).
**Proposed shape:** ordered lifecycle events with `stage`, `occurred_at`, `amount_minor`,
`currency`, `source_record_id`, `source_system`, and a `breaks_here` flag on the stage where
the chain diverges.
**Spec status:** already specified in `API_SPEC.md` §4; not implemented.

### 7.2 `GET /v1/cases/:id/evidence` — Evidence panel
**Why needed:** directive §19 makes evidence first-class. `case_source_records` already
holds the lineage the deterministic baseline consulted.
**Proposed shape:** `record_type`, `record_id`, `source_system`, `observed_at`,
`amount_minor`, `relevance`, `supports` / `contradicts`, link to the source record.
**Spec status:** specified in `API_SPEC.md` §4; not implemented.

### 7.3 `GET /v1/cases/:id/audit` and `GET /v1/audit` — Audit trail
**Why needed:** directive §23. Audit events are already written and are append-only at the
database; there is simply no read path.
**Proposed shape:** chronological `event_type`, `actor_type`, `actor_id`, `previous_state`,
`next_state`, `case_version`, `correlation_id`, redacted payload, and model/prompt/policy
versions where relevant.

### 7.4 Search — Transaction 360 entry point
**Why needed:** directive §12 requires lookup by order/payment/settlement/UTR/merchant ref.
**Proposed shape:** `GET /v1/search?q=…` returning typed hits (`kind`, `id`, `display_ref`,
`amount_minor`, `case_id?`). Must be tenant-scoped server-side.

### 7.5 `GET /v1/settlements` — Settlements screen
**Why needed:** directive §13. `settlements` and `settlement_batches` tables exist and are
populated; no endpoint exposes them.
**Proposed shape:** batch reference, cycle date, gross/net minor, bank-credited minor,
reconciled minor, exception count and amount, state, age.

### 7.6 `GET /v1/payments` — Payments screen
**Why needed:** directive §10 navigation. Table populated; no endpoint.
**Proposed shape:** paginated, tenant-scoped, filter by status/method/date, with
`case_id` where a payment produced an exception.

### 7.7 `GET /v1/reconciliation-runs` (list) — Reconciliation funnel
**Why needed:** directive §14 wants *records received → reconciled → exceptions*. Only
`GET /:id` exists, so there is no history and no aggregate.

### 7.8 Approval and staging — Phase 9
`POST /v1/cases/:id/approve`, `/reject`, `GET /v1/cases/:id/staging`. Directive §21–§22.
**Blocked on the agent and verifier existing first**, since approval requires a verified
proposal.

### 7.9 Investigation detail — Phases 6–8
Hypotheses, evidence-per-hypothesis, tool trace, model proposal, verifier checks. Directive
§16–§20. `packages/{agent,tools,verification}` are all placeholders.

---

## 8. Backend data available per screen — today

| Screen | Available now | Missing |
|---|---|---|
| Overview | case counts by state, open count, case list | affected-amount aggregate, settlement health, activity feed |
| Exceptions | id, case_number, state, priority, discrepancy, currency, reasons, opened_at | settlement ref, cause hint, last activity, investigation status |
| Case detail | the above + investigation runs | timeline, evidence, hypotheses, proposal, verification |
| Scenario | catalog, instances, instantiate | per-stage lifecycle progress |
| Audit | — | everything |

---

## 9. Data-shape caveats for the implementer

1. **Money is a string of integer minor units.** `discrepancy_amount_minor: "29500"`. Never
   `parseFloat` it. Format via `lib/format.ts`.
2. **`case_version` must round-trip** on every mutation. A `409` means reload, never retry.
3. **`404` is the cross-tenant response**, not `403` — the API is deliberately not an
   existence oracle. Do not soften the copy to "forbidden".
4. **17 backend states**, mapped to 10 product labels in `lib/case-state.ts`. Never invent
   a frontend-only state (directive §27).
5. **`REQUEST_EVIDENCE` is unreachable from `EXCEPTION`.** Gate the control on state.

---

## 10. Verdict

| Area | Verdict |
|---|---|
| Framework and infra | **Keep** — Next 16 / Base UI / Tailwind v4 is sound |
| `lib/format.ts`, `lib/api.ts`, `lib/case-state.ts` | **Keep and extend** |
| Design tokens | **Keep; add the premium light treatment** |
| `components/ui/*` | **Keep** — 14 accessible Base UI primitives |
| App shell | **Rebuild** — nav must reflect real destinations and pending work |
| Overview | **Rebuild** — work surface, not KPI gallery |
| Exception queue | **Rebuild** — operations queue with row actions |
| Case detail | **Rebuild** — decision surface; delete the dormant AI card |
| Audit page | **Hold** — blocked on §7.3 |
| Architecture | **Restructure** to `features/` before it grows |
| Mutation layer | **Build** — POST helpers, revalidation, `409` handling |

**Nothing about the backend needs to change to make the product operational.** Four
destinations and every action in §6 are buildable today.
