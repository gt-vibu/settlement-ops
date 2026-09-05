# UI / Component Plan — SettlementOps Operator Console

**Date:** 2026-09-01
**Status:** PLAN ONLY — nothing implemented, no UI file modified
**Scope change:** this is the first authorized UI work. See `CHANGE_CONTROL.md` CC-008.

---

## 1. What I found

I inspected `next-app/` in full: 23 files, structure, config, design tokens, the
installed Skiper source, dependencies, and how it connects to the backend.

### 1.1 There are no screens to redesign

`next-app/` is the **unmodified Next.js + shadcn starter template**. The only page is
the placeholder that ships with `create-next-app` ("Project ready! You may now add
components and start building.").

Your brief says "for each screen you redesign… preserve all existing functionality and
business logic… reuse existing components." There is no existing functionality, no
business logic, and no components to reuse. **This is greenfield UI construction, not a
redesign.** I'd rather say that now than quietly reinterpret the instruction.

Everything else in the brief still applies and I've kept it: Skiper as an accent layer,
enterprise-grade, subtle motion, no decorative noise.

### 1.2 The app does not currently compile

```
app/page.tsx(1,24): error TS2307: Cannot find module '@/components/ui/button'
```

`app/page.tsx` imports `Button`, but `components/ui/button.tsx` was never installed —
`components/ui/` contains only `skiper-ui/`. This is blocking and is step 0 of any work.

### 1.3 Exactly one Skiper component is installed, and it is not an app primitive

`components/ui/skiper-ui/skiper40.tsx` (266 lines) exports `Skiper40` plus six link
variants `Link000`–`Link005`. It is an **animated link-underline treatment** adapted
from cursor.com — a marketing/portfolio interaction.

Reading the source turned up three things that matter:

| Finding | Consequence |
|---|---|
| `Skiper40` itself is a **demo showcase** (`h-full snap-y overflow-y-scroll` wrapping five sample links pointing at `hi@skiper-ui.com`) | Must never be rendered in the product. Only the individual `LinkNNN` exports are usable |
| `Link004` and `Link005` hardcode `before:bg-white` with `mix-blend-difference` | **Breaks in dark mode and on any non-white surface.** The app ships `next-themes` with `defaultTheme="system"`, so this is a real defect, not theoretical. Both variants are rejected below |
| `Link001` opens with `target="_blank"` and no `rel="noopener noreferrer"` | Needs fixing if used for external links |

In an enterprise finance console this component has roughly **one** honest use: external
reference links. It is not a foundation.

### 1.4 No shadcn base components exist

Zero. No button, card, table, badge, dialog, tabs, form — nothing. The foundation has to
be installed before any screen can be built.

### 1.5 The stack is newer than it looks

| Thing | Version / note |
|---|---|
| Next.js | **16.2.6** — `next-app/AGENTS.md` explicitly warns APIs differ from training data and to read `node_modules/next/dist/docs/` first. I did |
| React | 19.2.4 |
| shadcn style | **`base-nova`** — built on **Base UI (`@base-ui/react` 1.7.0)**, *not* Radix |
| Tailwind | v4 (CSS-first `@theme inline`, no `tailwind.config`) |

The Base UI point is the one most likely to cause trouble: component APIs differ from
Radix-era shadcn, so patterns from memory will be wrong. Every primitive gets checked
against the installed source before use.

Also noted for later: Next 16 exposes `unstable_instant` for instant navigation. Queue →
detail navigation is exactly its use case, but I'll read the guide before adopting it
rather than cargo-culting it.

### 1.6 The chart palette is unusable as shipped

`--chart-1` through `--chart-5` are **all achromatic greys** (`oklch(0.87 0 0)`,
`oklch(0.556 0 0)`, `oklch(0.439 0 0)`, `oklch(0.371 0 0)`, `oklch(0.269 0 0)`).

For a reconciliation console that needs cases-by-state and cause-class breakdowns, five
greys cannot carry categorical meaning. This needs a decision (§4).

### 1.7 There is no backend wiring

No API client, no fetch layer, no auth header plumbing, no `.env`. And the backend
contract has a security-relevant subtlety the UI must respect — see §5.1.

---

## 2. Backend reality check (sequencing constraint)

The UI can only show what exists. Today the API serves:

| Endpoint | Status |
|---|---|
| `GET /health`, `GET /ready` | ✅ live |
| `GET /v1/whoami` | ✅ live |
| imports, reconciliation runs, cases, timeline, evidence, investigations, approvals, staging, audit, scenarios | ❌ **not built** — Phase 2/3 |

**Phase 2 is paused mid-flight** (policy constants, financial records, expected-net and
duplicate detection are in; the matcher is drafted but not applied). Most screens below
have no data source yet.

That is workable — the contract is specified in `FRONTEND_BACKEND_CONTRACT.md` and
`API_SPEC.md`, so I can build against a typed client with a mock transport and swap in
the real one when endpoints land. But it is a real dependency and §8 asks you to choose
the order.

---

## 3. Foundation to install first

Base primitives, from the shadcn registry (`base-nova` / Base UI):

**Tier 1 — unblocks everything:**
`button` · `card` · `badge` · `table` · `separator` · `skeleton` · `input` · `label` ·
`tooltip` · `dropdown-menu` · `dialog` · `alert-dialog` · `sonner` (toasts)

**Tier 2 — workspace screens:**
`tabs` · `accordion` · `scroll-area` · `select` · `checkbox` · `popover` · `sheet` ·
`collapsible` · `alert` · `avatar` · `breadcrumb` · `sidebar` · `command`

**Tier 3 — data & charts:**
`chart` · `pagination` · `calendar` + `date-picker` (case date filters)

**Non-shadcn, justified additions** (each needs your approval under `DEPENDENCY_POLICY.md`):

| Package | Why | Alternative considered |
|---|---|---|
| `@tanstack/react-table` | The exception queue needs sorting, filtering, column visibility and stable selection across pagination. Hand-rolling this is the classic mistake | Hand-rolled — rejected, this is the app's primary surface |
| `recharts` | shadcn's `chart` is a wrapper over it | Required by shadcn `chart` |

Nothing else. No animation library — Tailwind + `tw-animate-css` (already present) covers
the motion described in §6.

---

## 4. Design-system decisions I need from you

These four are judgment calls with product consequences. I'm not deciding them silently.

### D-UI-1 — Chart / categorical palette
Five greys can't encode cause classes or case states. Proposal: keep greyscale for
*quantitative* series (amount over time) and introduce a restrained 5-hue categorical
ramp for *cause class* only, tuned for the neutral base and checked for contrast in both
themes. **Alternative:** stay fully achromatic and encode category by position + label
only. That is more austere and genuinely defensible for finance.

### D-UI-2 — Status colour semantics
17 case states and 3 dispositions need a fixed colour vocabulary. This is **product
semantics**, so I'll propose but not impose:

```
neutral   RECEIVED NORMALIZED MATCHING RECONCILED CLOSED
amber     EXCEPTION REQUESTING_EVIDENCE
blue      INVESTIGATING ACTION_PROPOSED APPROVAL_PENDING
green     APPROVED STAGED APPLIED OUTCOME_LOGGED
red       ESCALATED REJECTED
violet    REOPENED
```
Deliberate choice inside it: **`ESCALATED` is red, not amber.** Escalation is the safe
outcome, not a failure — but it is the state that needs a human, so it should be the
loudest thing in the queue.

### D-UI-3 — Radius
`--radius: 0.625rem` (10px) is generous for dense financial tables. Proposal: **0.375rem
for data surfaces**, keeping the larger radius for dialogs/cards. Matches the Linear /
Stripe register you named. Purely visual; easy to revert.

### D-UI-4 — Density
Default row height for the exception queue: **compact (36px)** vs comfortable (44px).
Operators scanning a queue want compact; I'd ship compact with a toggle.

---

## 5. Screen-by-screen component plan

Nine surfaces from `FRONTEND_BACKEND_CONTRACT.md`. For each: the workflow, the
primitives, and where motion is warranted.

### 5.0 App shell (prerequisite)

**Workflow:** persistent navigation; operator knows which tenant they're acting in at all
times.

| Element | Component |
|---|---|
| Nav | `sidebar` + `separator`, collapsible |
| Tenant switcher | `dropdown-menu` |
| Command palette | `command` (⌘K) — jump to case by number |
| Theme | existing `theme-provider` (already has a `d` hotkey) |
| Toasts | `sonner` |

> **5.1 — Security rule the UI must not get wrong.** The tenant switcher must list
> **only** the memberships returned by `/v1/whoami`, and send the chosen tenant as
> `X-Demo-Tenant-ID`. That header is a **selector, not a grant** — the backend refuses a
> tenant the user doesn't belong to (`403`), and returns `404` for another tenant's
> resources so the API isn't an existence oracle. The UI must never present tenant choice
> as though it confers access, and must never cache one tenant's data into another's view.
> A tenant switch clears all client cache.

### 5.1 Operations overview

**Workflow:** first screen each morning — how bad is it, and what needs me?

| Element | Component |
|---|---|
| Stat tiles (open cases, amount affected, pending approvals, avg age) | `card` + `tabular-nums` |
| Cases by state | `chart` (bar) — pending D-UI-1 |
| Pending approvals | compact `table` → deep link |
| Recent activity | list + `badge` |
| Health | `badge` fed by `/ready` |

**Motion:** none on numbers. No count-up animation — in a finance console an animating
balance reads as instability. Values render final. Only `skeleton` → content.

### 5.2 Exception queue — *the primary surface*

**Workflow:** triage. Sort by amount/age/priority, filter by state and cause hint, open a
case. This screen gets the most design attention because it's where operators live.

| Element | Component |
|---|---|
| Table | `table` + `@tanstack/react-table` |
| Filters | `select`, `input`, `date-picker`, `popover` |
| State / cause | `badge` (D-UI-2 vocabulary) |
| Amount | right-aligned, `tabular-nums`, minor units formatted once in a shared helper |
| Row actions | `dropdown-menu` |
| Empty / loading | empty state + `skeleton` |

**Motion:** hover and selection only (~120ms). **No row entrance animation** — staggered
rows on a queue that refreshes is noise, and it delays the operator's read.

### 5.3 Transaction 360

**Workflow:** "what actually happened to this payment?" Order → Payment → Capture →
Fee/Tax → Refund/Adjustment → Settlement → Bank Credit → Ledger.

| Element | Component |
|---|---|
| Lifecycle timeline | **custom** — no shadcn primitive fits |
| Node detail | `hover-card` / `collapsible` |
| Amount breakdown | `table` showing gross − fee − tax − refund + adjustment = expected net |
| Lineage | `tooltip` with source system + record id |

**This is the strongest candidate for purposeful motion.** A one-time left-to-right
connector draw (~400ms, `prefers-reduced-motion` respected) communicates *direction of
value flow* — that is explanatory, not decorative. It runs once on mount, never on
re-render.

The breakdown row must use the **same** arithmetic the backend returns
(`AmountBreakdown`), never recomputed client-side. The UI displays financial truth; it
never derives it.

### 5.4 Investigation workspace

**Workflow:** review what the agent proposed, what the verifier concluded, and decide.

| Element | Component |
|---|---|
| Layout | two-pane; `tabs` for Evidence / Trace / Proposal |
| Known facts, candidate causes | `card` + `badge` |
| Claims ↔ evidence | `table` with evidence-id chips linking to records |
| Tool trace | `accordion` |
| Verifier checks | `table`: name, status, expected, observed, source ids |

> **Hard design rules — these are safety requirements, not preferences**
> (`FRONTEND_BACKEND_CONTRACT.md` UI safety contract, `SAFETY.md` §6):
>
> 1. **`verified_disposition` is visually dominant.** The model proposal is secondary,
>    explicitly labelled "model proposal — not authoritative."
> 2. **`certainty_measure` must never be styled as confidence-in-correctness.** No
>    progress bar, no green-to-red gradient. Plain text, muted, labelled diagnostic.
> 3. **A verifier downgrade is shown explicitly** — proposal, failed check, and effective
>    disposition together. Never silently replaced.
> 4. A claim without evidence ids renders as unsupported, never as established.

**Motion:** tool-trace steps may reveal as they complete during a live investigation —
that reflects real progress. Nothing else moves.

### 5.5 Approval

**Workflow:** an authorized approver commits a bounded action.

| Element | Component |
|---|---|
| Confirmation | `alert-dialog` — deliberate, never a bare button |
| Summary | effective disposition, staging action, **case version** |
| Reason | `textarea` (required on reject) |
| Result | `sonner` |

Rules: the button is **disabled** unless the client's `case_version` matches; a `409`
conflict surfaces as "this case changed — reload," never a retry loop; approve and reject
are visually distinct, never adjacent identical buttons.

### 5.6 Staged actions · 5.7 Audit trail

Both are read-only chronologies. `table` + `badge` + `scroll-area`; audit rows expand to
show actor, correlation id, prev→next state, and model/prompt/policy versions. Audit is
append-only server-side — the UI offers **no** edit or delete affordance anywhere.

### 5.8 Evaluation / health

`card` + `chart` + `table`. Every metric renders with its confidence interval where one
exists.

> Non-negotiable copy rule: any surfaced benchmark number carries its scope. The
> unsupported-resolution ceiling (2.0% target / 5.0% CI guardrail) is a **synthetic-benchmark
> threshold, not a production safety guarantee**, and the UI must say so adjacent to the
> number — not in a footnote.

### 5.9 Scenario control

`card` grid of scenarios + `dialog` to instantiate. **ADMIN only**, and hidden entirely
when the environment flag is off.

---

## 6. Motion principles

Adopted, and deliberately narrow:

- **Purpose or nothing.** Motion shows causality, state change, or spatial relationship.
- 120–200ms for feedback; ~400ms for the one explanatory lifecycle draw.
- `ease-out` for entrances, `ease-in-out` for state changes.
- **Transform and opacity only** — never animate layout, width, or height on data.
- `prefers-reduced-motion` honoured everywhere; the lifecycle draw becomes an instant render.
- Motion runs **once**, never on every re-render or poll.

**Explicitly not doing** (your list, plus my own): gradients, glassmorphism, oversized
rounded cards, decorative float/pulse, animated numbers, staggered table rows, parallax,
skeleton shimmer that outlasts the actual fetch.

---

## 7. Where Skiper earns its place — honestly

You asked for Skiper as an enhancement layer. Applied strictly, here is what survives:

| Use | Component | Verdict |
|---|---|---|
| External reference links (docs, bank/UTR references) | `Link001` / `Link002` / `Link003` | ✅ **Use** — the underline-draw is a genuine affordance for "leaves the app". Needs `rel="noopener noreferrer"` added |
| Anything on a dark surface | `Link004` / `Link005` | ❌ **Reject** — hardcoded `before:bg-white` + `mix-blend-difference` breaks in dark mode |
| Showcase wrapper | `Skiper40` | ❌ **Never render** — it's a demo page with sample links |

That is the entire honest surface of what's installed: **three link variants, used
sparingly.**

Which is the correct outcome for your brief. An enterprise finance console should not be
carrying much decorative interaction, and forcing more Skiper in would be exactly the
"Skiper showcase" you said you don't want.

**If you want more Skiper in the product**, the registry is configured
(`@skiper-ui` → `https://skiper-ui.com/registry/{name}.json`). Three places where a
Skiper component could plausibly beat a plain one, if a suitable one exists:

1. **Lifecycle connector animation** (§5.3) — the one place motion genuinely explains.
2. **Command palette** open/close transition.
3. **Tab / pane transitions** in the investigation workspace.

I'd want to read the source of any candidate before committing — as with `skiper40`, the
dark-mode and blend-mode problems only showed up on reading. Name the components, or let
me pull two or three candidates for each slot and review them against this plan.

---

## 8. Sequencing — and what I need from you

**Step 0 (blocking):** fix the build — install `button`, or correct `page.tsx`.

**Then:**
1. Install Tier 1 primitives; verify each against Base UI (not Radix) APIs.
2. Apply D-UI-1…D-UI-4 once decided.
3. App shell + typed API client + tenant plumbing (§5.1) against `/v1/whoami`.
4. Exception queue (§5.2) — highest value per unit of work.
5. Transaction 360 (§5.3) — highest design value.
6. Investigation + approval (§5.4, §5.5) — needs Phase 2/3 endpoints.
7. Remaining read-only surfaces.

### Decisions I need

| # | Decision |
|---|---|
| 1 | **D-UI-1** chart palette — restrained colour, or stay achromatic? |
| 2 | **D-UI-2** status colour vocabulary — accept the proposal above, or amend? |
| 3 | **D-UI-3 / D-UI-4** radius 0.375rem and compact density — accept? |
| 4 | Approve `@tanstack/react-table` + `recharts` under `DEPENDENCY_POLICY.md` |
| 5 | Additional Skiper components — name them, or shall I propose candidates? |
| 6 | **Order of work: finish Phase 2 backend first, or build UI against a mock client now?** Building UI first is fine and keeps you unblocked, but screens 5.4–5.8 will show mock data until Phase 2/3 land |

Nothing in `next-app/` has been modified. No component installed, no file written there.
