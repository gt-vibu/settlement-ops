# UI Redesign Review — Visual Density Pass

Scope: `next-app/` only. No backend, `apps/*`, `packages/*`, database, spec, test or
infrastructure file was modified. No UI library was added. No new API contract was
introduced.

## 1. What changed

### New shared vocabulary — `features/shared/page.tsx`
`PageBody`, `PageHeader`, `Panel`, `MetricStrip`, `Metric`, `Field`. Every page now composes
from one set of layout primitives instead of inventing its own spacing. `Panel` replaces the
oversized `Card` treatment: a header rule plus a hairline border gives the same grouping at a
fraction of the vertical cost.

### Shell — `components/app-shell.tsx`
- Header `h-13` → `h-11`; content width `max-w-6xl` → `max-w-[1400px]`.
- Nav pills → an underline rail (`after:` pseudo-element), which reads as a console tab
  rather than a button.
- Nav items carry live pending counts, so the header communicates work, not only location.

### Pages
| Page | Before | After |
| --- | --- | --- |
| Overview | Four large stat cards stacked above a queue, then activity below | Compact metric strip + two-column `queue │ activity rail` |
| Exceptions | Card list | Dense table: case, state, reason, discrepancy, priority, age; row action revealed on hover/focus |
| Exception detail | Single column | Financial facts strip across the top, then `reasons + action + investigations │ audit trail` |
| Reconciliation | Two stat cards | Metric strip + state-proportion bars + an explanation panel |
| Scenarios | Card grid | Metric strip + dense catalogue list with inline run controls │ recent runs rail |

`space-y-7` → `space-y-4`, `py-5` → `py-2.5`, `gap-6` → `gap-4`, table rows to `h-8`,
metadata to 11px. Status colour is still never load-bearing on its own — every badge carries
a dot plus text.

## 2. Defects found and fixed during the pass

1. **Identity switcher crashed the page.** `DropdownMenuLabel` (Base UI `Menu.GroupLabel`)
   was used without a `Menu.Group` ancestor. Opening the menu threw Base UI error #31 and
   took down the React tree — the page rendered "This page couldn't load". Fixed by
   wrapping the menu contents in `DropdownMenuGroup`.
2. **Guessed `case_version` in queue rows.** The first draft put row-level state actions in
   the exception table with `caseVersion={1}`. `GET /v1/cases` does not return
   `case_version`, so that was invented data driving optimistic concurrency. Removed; state
   changes happen on the detail page where the version is derived from the audit trail.
3. **Conflict message was swallowed.** On a 409 the action refreshes, the case moves to a
   state with no legal action, and the early-return branch dropped the explanation. The
   operator saw their click do nothing. The message now renders in both branches.
4. **Reconciliation page implied an automation rate the backend cannot support.** The first
   draft showed "closed automatically" and "automation rate" derived from case counts. A
   record that matches cleanly never becomes a case, so those figures read 0 / 0% while the
   run itself reported 3 of 11 reconciled — a false picture of the deterministic baseline.
   Replaced with case-state metrics only, plus an explicit note that clean matches do not
   appear in the counts.
5. **`Open exceptions` mislabelled.** `open_case_count` includes cases already being worked;
   "Awaiting triage" was wrong. Renamed to `Open cases` / "Not yet closed".
6. Duplicate `.tabular` rule in `app/globals.css` removed.
7. Duplicate action controls on the detail header removed (they duplicated the escalate
   dialog's `reason-${caseId}` field id).

## 3. Checks

| Check | Result |
| --- | --- |
| `tsc --noEmit` | PASS |
| `eslint .` | PASS |
| `next build` | PASS — 6 routes, 4 dynamic + not-found |

## 4. End-to-end validation against the real backend

API on :3000, PostgreSQL on :5434, production build served on :3002.

| # | Behaviour | Result |
| --- | --- | --- |
| 1 | Overview loads | PASS |
| 2 | Exceptions loads | PASS |
| 3 | Reconciliation loads | PASS |
| 4 | Scenarios loads | PASS |
| 5 | Create scenario | PASS — `split-settlement` SUCCEEDED, 9 records, 1 case; runs 3→4 |
| 6 | Real import / reconciliation | PASS — "11 evaluated, 3 reconciled, 8 residual"; `scenario_instances` 236→237, `payments` 351→352 |
| 7 | Exception appears in queue | PASS — queue 7→8, nav badge followed |
| 8 | Start investigation / transition | PASS — `POST /v1/cases/:id/investigations` 200; audit: `investigation_started` EXCEPTION→INVESTIGATING (USER, v2), then `case_escalated` INVESTIGATING→ESCALATED (SYSTEM, v3), investigation `FAILED / MODEL_DISABLED` because `AI_INVESTIGATION_ENABLED=false` |
| 9 | Refresh preserves state | PASS — reload shows Escalated, version 3, both audit entries, no action offered |
| 10 | Stale-version handling | PASS — case advanced out-of-band, stale click returned 409, UI showed "This exception changed in another session. Showing the latest state." and refreshed to the truth |

Identity switching (OPERATOR → ADMIN via the httpOnly cookie server action) was also
exercised, and correctly gated scenario creation.

## 5. Limitation

Interaction testing ran against the production build. The dev server (`next dev`, :3001)
does not hydrate inside the in-app browser, which blocks the Turbopack HMR websocket;
repeated `ws://…/_next/webpack-hmr` failures are the only console output, no React error is
raised, and every client chunk loads 200. Production hydrates normally. This was not
reproduced in an ordinary browser, so it is reported as unverified rather than as either a
defect or a non-issue.

## 6. Follow-up from owner review (2026-09-02)

**Audit trail repetition — investigated and fixed in the backend.** The four identical
`reconciliation exception created` rows were four *different* cases opened by one
reconciliation run under a single correlation id; only one belonged to the case on screen.
`AuditReader.listForCase` was matching on correlation id without excluding sibling cases.
Fixed in `packages/persistence/src/repositories/audit-reader.ts` with a regression test that
fails against the old query. Full record in `PHASE_REVIEW.md`. No frontend change: the defect
was in the read path, and masking it in the UI would have left the API still attributing
another case's history to this case.

**Two visual refinements: noted, not implemented — `next-app/` is frozen.**
1. The `CASE ID` field on the detail strip shows the UUID while the human-readable
   `CASE-…` identifier is already in the header.
2. The audit list could use a tighter event-row treatment.

Neither is a defect. The second half of (1) — showing the underlying record id as secondary
metadata — additionally needs a backend change: `GET /v1/cases/:id` returns no record
reference today.

**Outstanding before the demo:** one ordinary-browser smoke test of the production build, to
close the dev-server hydration question in section 5.
