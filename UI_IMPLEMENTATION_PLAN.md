# UI Implementation Plan — Phase 0 output

**Date:** 2026-09-01
**Status:** `PLAN COMPLETE — NO CODE WRITTEN. AWAITING APPROVAL TO BEGIN PHASE 1.`
**Inputs:** `UI_REDESIGN_AUDIT.md`, `SKIPER_COMPONENT_SELECTION.md`, the owner directive

---

## 1. The governing constraint

The directive names eight navigation destinations. **The backend supports four.** Directive
§10 forbids navigation added for appearance, §51 forbids fake data, §56 forbids inventing
frontend behaviour for a missing API.

So the plan is shaped by what is real:

```
BUILD NOW (backend complete)          BLOCKED (recorded in audit §7)
  Overview                              Payments        — no endpoint
  Exceptions queue                      Settlements     — no endpoint
  Case / investigation shell            Transaction 360 — no timeline endpoint
  Scenario control                      Approvals       — Phase 9
                                        Audit           — no read endpoint
                                        Evidence / hypotheses / proposal / verifier
                                                        — Phases 6–8
```

**This is not a reduced ambition.** Every action in audit §6 is buildable today, which means
the product becomes genuinely operational in Phase 2 — the thing that currently does not
exist at all.

---

## 2. Navigation — four destinations, not eight

| Destination | Route | Why it earns a slot |
|---|---|---|
| **Overview** | `/` | Work surface: what needs attention now |
| **Exceptions** | `/exceptions` | The primary operations queue |
| **Reconciliation** | `/reconciliation` | Run history + funnel; the "automation handled the normal flow" story |
| **Scenarios** | `/scenarios` | ADMIN only, demo environments only |

Case detail lives at `/exceptions/[id]` — a work surface reached from the queue, not a
top-level destination.

`Payments`, `Settlements`, `Approvals` and `Audit` are **added when their endpoints land**,
each as a small increment. No placeholder nav items.

> Migration note: `/cases` → `/exceptions` matches the domain language used throughout the
> specs and the directive.

---

## 3. Phased plan

### Phase 1 — Design system and shell · *no backend dependency*

**Deliverables**

- Premium **light-first** treatment: warm neutral ground, deep charcoal text, restrained
  navy interaction colour, hairline borders, minimal shadow. Dark stays supported and
  correct, but light is the designed default.
- Density tokens for financial tables — 32px compact / 40px comfortable, and a real toggle.
- Data typography: `tabular-nums` everywhere money appears; right-aligned amounts;
  monospace for identifiers.
- App shell: sidebar with **pending-work counts on nav items**, merchant + role indicator,
  environment badge, theme toggle.
- Shared data components: `DataTable` (sortable, filterable, keyboard-navigable),
  `StatusBadge` (exists), `MoneyCell`, `Timestamp`, `CopyableId`, `EmptyState`,
  `ErrorState`, `LoadingState`.
- **Mutation layer** — the structural gap: `POST` helpers, `case_version` round-trip,
  `409` → reload-not-retry, `revalidatePath` after mutation, typed error → actionable copy.

**Exit test:** shell renders at 1440/1280/1024/768; keyboard reaches every control; both
themes correct; a deliberate `409` produces the reload path.

---

### Phase 2 — Operational screens · **this is where it stops being a report**

#### 2.1 Overview — answers *"what needs my attention?"*

Order on the page, deliberately:

```
1. ATTENTION      open exceptions · amount affected · awaiting approval · investigations running
2. PRIORITY QUEUE the actual work — top cases by priority and amount, each a link
3. RECONCILIATION HEALTH   records received → reconciled → exceptions
4. RECENT ACTIVITY         state transitions from the audit stream (when 7.3 lands)
5. SCENARIO ENTRY          "Create payment scenario" (ADMIN, demo only)
```

Metrics are context. **The queue is the content.** No count-up animation — values render
final, because an animating balance reads as instability.

#### 2.2 Exceptions queue — the primary work surface

Columns: case · settlement ref · amount · discrepancy · reasons · priority · state · age
Interactions: search · filter by state · sort by amount/age/priority · **row actions** ·
keyboard row navigation · density toggle.

**Row actions are the point.** Every row offers at least one state-mutating action, gated on
the case's current state so no illegal transition is ever offered.

#### 2.3 Reconciliation

Run history plus the funnel. The message the directive asks for: *automation handled the
normal flow; these are the cases needing judgement.* Not a chart page.

#### 2.4 Scenarios

Catalog from `GET /v1/demo/scenarios`, instantiate with a seed and an `Idempotency-Key`.
After creation, show what **actually** happened — records created, run id, cases created —
read back from the API, never assumed. A scenario that produces zero cases says so.

**Exit test — the persistence test (directive §28):** create scenario → refresh → still
there. Start investigation → refresh → still `INVESTIGATING`. Escalate → refresh → still
`ESCALATED`.

---

### Phase 3 — Investigation workspace · *blocked on Phases 6–8*

Buildable now: case header, discrepancy summary, deterministic reason codes, investigation
run history, the four actions.

**Delete immediately:** the dormant *"Investigation — not yet available"* card. Per
`PRODUCT_PRINCIPLES.md` §15, the AI must be **absent** until it has something to show — not
advertised as pending.

Blocked until the agent, tools and verifier exist: hypotheses, evidence panel, tool trace,
model proposal, verifier checks.

**The layout rule when they do land** (directive §20, §46):

```
FINANCIAL FACTS      ← visually dominant
EVIDENCE
VERIFICATION         ← authoritative
AI PROPOSAL          ← secondary, explicitly labelled "not authoritative"
ACTION
```

Never a confidence percentage as the primary visual element. Evidence counts beat numbers.

---

### Phase 4 — Approvals, staging, audit · *blocked on Phase 9 and audit §7.3*

Approve/reject with mandatory reason, case-version pinning, `alert-dialog` confirmation;
staging states shown with precise language (`STAGED` / `APPLIED` — never "payment
complete"); forensic audit timeline with the **verifier override rendered prominently**,
which is among the strongest trust surfaces in the product.

---

### Phase 5 — Transaction 360 · *blocked on audit §7.1, §7.4*

Search entry → lifecycle from real backend data → per-stage amounts → the stage where the
chain breaks marked explicitly. Custom component; no library provides this.

One-time left-to-right connector draw (~400ms, `prefers-reduced-motion` respected) because
it communicates direction of value flow. Runs on mount only, never on re-render.

---

### Phase 6 — Polish

Responsive QA at 1440/1280/1024/768 · accessibility pass · loading/empty/error states on
every surface · motion audit · `UI_FINAL_REVIEW.md`.

---

## 4. Architecture

```
next-app/
  app/
    (dashboard)/          shell layout
      page.tsx            Overview
      exceptions/         page.tsx · [id]/page.tsx
      reconciliation/     page.tsx
      scenarios/          page.tsx
    actions.ts            server actions
  features/
    exceptions/           components · queries · actions · types
    investigations/
    reconciliation/
    scenarios/
    shared/               DataTable, MoneyCell, StatusBadge, Timestamp, CopyableId
  components/ui/          shadcn Base UI primitives
  lib/                    api.ts · format.ts · case-state.ts · utils.ts
```

**File-size discipline mirrors the backend:** target under 250 lines, review at 350, never
exceed 500.

---

## 5. Dependencies

**New runtime dependencies: 0.**

| Need | Decision |
|---|---|
| Table sorting/filtering | **Server-side + local state.** `@tanstack/react-table` deferred until the queue genuinely needs client-side column management |
| Charts | **None.** The reconciliation funnel is CSS bars. No chart library for one visualisation (§43) |
| Animation | **CSS + `tw-animate-css`** (already present). No `framer-motion` |
| Sheet / alert-dialog / command | **shadcn Base UI** — same foundation, not new libraries |

Skiper: `skiper40` (installed, adapted), `skiper41` conditional on losing to a CSS mask in
prototype. See `SKIPER_COMPONENT_SELECTION.md`.

---

## 6. Rules I will hold to

| # | Rule | Source |
|---|---|---|
| 1 | Every operational screen offers ≥1 state-mutating action; audit is the sole exception | `PRODUCT_PRINCIPLES.md` §13 |
| 2 | No fabricated data — real backend or the scenario engine | §51 |
| 3 | No frontend-only state; 17 backend states only | §27 |
| 4 | No authoritative financial calculation in the browser | §29 |
| 5 | An action is never offered in a state that forbids it | `FRONTEND_BACKEND_CONTRACT.md` III |
| 6 | `409` → reload, never blind retry | III.1 |
| 7 | AI absent until it has something to show | §15 |
| 8 | Verified disposition dominates; proposal secondary and labelled | §20, §46 |
| 9 | Missing API → record it, never simulate it | §56 |
| 10 | No backend logic modified | §56 |

---

## 7. What I need from you

| # | Decision |
|---|---|
| 1 | **Four destinations now, not eight** — confirm, or tell me to build placeholder screens anyway (I would advise against; it is the report-builder failure mode) |
| 2 | **Route rename** `/cases` → `/exceptions` |
| 3 | **Light-first**: change `defaultTheme` from `system` to `light`, keeping the toggle? |
| 4 | Which missing endpoint matters most — I would build **§7.3 audit read** first: cheapest, and it makes the verifier-override trust surface possible |
| 5 | Approve Phase 1 start |

---

## 8. Honest risks

**The investigation workspace is the hero screen and it is mostly blocked.** Phases 6–8
gate hypotheses, evidence and the verifier. Until then the case screen is header + reasons +
actions — genuinely operational, but not yet the showpiece.

**Queue realism is gated on Phase 9.** `APPROVAL_PENDING`, `STAGED` and `CLOSED` cannot
appear until the approval path exists. The queue will show `EXCEPTION`, `INVESTIGATING`,
`ESCALATED` and `REQUESTING_EVIDENCE` only. **I will not seed the missing states** — a
hand-populated queue is a screenshot.

**Light-first is a real change.** The current design was built dark-forward. Retuning tokens
for a premium light treatment is Phase 1 work, not a switch flip.

---

**Phase 0 complete. Three documents delivered. No code written. Stopping.**
