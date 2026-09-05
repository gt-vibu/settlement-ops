# Skiper Component Selection — Phase 0

**Date:** 2026-09-01
**Status:** `SELECTION COMPLETE — NOTHING INSTALLED`
**Catalog inspected:** all **37** components from `https://skiper-ui.com/registry/registry.json`
**Selected:** **2** · **Conditional:** 1 · **Rejected:** 34

---

## 0. The finding that drives this document

I fetched and read the full registry rather than sampling it. The honest conclusion:

> **Skiper UI is a creative/marketing animation library. It is not an enterprise
> application component library.**

Of 37 components: **6 carousels**, 6 scroll/parallax effects, 4 3D/perspective effects,
plus gooey effects, canvas crowds, mouse-follow, card stacks. These are portfolio-site
components. They are well made — and almost none of them belongs in a finance operations
console.

Directive §3 asks the question that settles each case:

> *"Does this improve the user's ability to understand, investigate, decide, or act?"*

For 34 of 37, the answer is no. Directive §5 forbids designing the product around the
library, and §42 says *"if a standard local component is better, use the local component."*

**Forcing more Skiper in would directly violate §0** — it would produce a showcase, which
is the specific failure mode the whole directive exists to prevent.

---

## 1. Two blocking technical findings

### 1.1 `skiper101` would introduce a second, conflicting primitive library

```
skiper101 (Custom tooltip)  →  dependencies: ["@radix-ui/react-tooltip"]
this project               →  @base-ui/react 1.7.0   (shadcn "base-nova" style)
```

Installing it would put **Radix and Base UI side by side** in a project that deliberately
standardised on Base UI — two focus managers, two portal implementations, two dismiss
behaviours, doubled bundle for one tooltip. The project already has an accessible Base UI
tooltip installed.

**This is exactly the design-system conflict directive §3 asks me to catch.** Rejected on
architecture, not taste.

### 1.2 Almost everything else pulls `framer-motion`

| Component | New dependencies |
|---|---|
| `skiper37` | `@number-flow/react`, `framer-motion`, `react-intersection-observer` |
| `skiper99` | `framer-motion`, `lucide-react` |
| `skiper4` | `framer-motion`, `lucide-react` |
| `skiper106` | `dialkit`, `framer-motion` |

Directive §43 requires justifying every dependency and explicitly says *"do not install
animation libraries for effects that CSS can handle."* The motion this product needs —
120–200ms state feedback, one explanatory lifecycle draw — is CSS transitions and
`tw-animate-css`, both already present.

**`framer-motion` is not justified by anything in the required screens.**

---

## 2. Selected

### 2.1 `skiper40` → `ExternalRef` — **already installed and adapted**

| Field | Value |
|---|---|
| **Where** | Evidence panel, audit trail, any external/bank/docs reference |
| **Problem solved** | Signalling *"this leaves the application"* on a reference an operator may follow mid-investigation |
| **Why it fits** | The underline-draw is a genuine affordance, not decoration. In an investigation context, knowing a link exits the app before clicking it is real information |
| **Why primitives were insufficient** | A plain `<a>` gives no affordance; a permanent underline adds visual noise to dense tables |
| **Accessibility** | Real `<a>`; focus-visible ring preserved; `rel="noopener noreferrer"` **added by me — the original omits it** |
| **Responsive** | Inline, em-relative, inherits type scale |
| **Theme** | Uses `bg-current`, so it inherits both themes correctly |
| **Performance** | CSS-only pseudo-element transform. No JS, no dependency |
| **Modified?** | **Yes — wrapped as `components/external-link.tsx`.** Only `Link001/002/003` are viable |
| **Not to be used** | Anywhere else. It is not a general link style |

> **`Link004` and `Link005` are rejected outright:** they hardcode `before:bg-white` with
> `mix-blend-difference`, which breaks in dark mode. This app ships `next-themes` with
> `defaultTheme="system"`.
>
> **`Skiper40` itself must never render** — it is a demo section wrapping five sample links
> pointing at `hi@skiper-ui.com`.

### 2.2 `skiper41` (Progressive Blur) — **selected, conditional on visual QA**

| Field | Value |
|---|---|
| **Where** | Bottom edge of the scrollable evidence panel and the investigation activity feed |
| **Problem solved** | Communicating *"there is more content below"* in a dense scrollable region without a scrollbar or a hard cut |
| **Why it fits** | Ambient affordance in a panel where an operator must know whether they have seen all the evidence. That is a comprehension aid, not decoration |
| **Why primitives were insufficient** | A CSS `mask-image` gradient is the honest alternative and may well win — see the condition below |
| **Dependencies** | **none** — the only zero-dependency candidate in the catalog |
| **Accessibility** | Purely visual overlay; must be `aria-hidden` and `pointer-events-none` |
| **Theme** | **Must be verified in both themes** — a blur tuned for light can smear on dark |
| **Performance** | Uses canvas. **Must not be attached to a scroll handler**; static overlay only |
| **CONDITION** | Prototype against a plain `mask-image: linear-gradient(...)` fade. **If the CSS version is visually adequate, use CSS and drop this.** Zero dependencies still beats one component |
| **Not to be used** | On tables, cards, or the page body. Scroll containers only |

---

## 3. Conditional — deferred, not selected

### `skiper65` (Breakpoint indicator) — development only

Useful during the §53 visual QA pass at 1440/1280/1024/768. **Must not ship to production**
and must never appear in a demo build. Listed for transparency; adopt only behind a dev-only
guard, if at all.

---

## 4. Rejected — the ones genuinely considered

Only components I actually evaluated are listed. The remaining carousels, parallax and 3D
effects are omitted as self-evidently out of scope for a finance console.

| Component | Considered for | Rejected because |
|---|---|---|
| **`skiper37`** Animated number | Overview stat tiles | **Three reasons, any one sufficient.** (1) An animating balance reads as *instability* in a finance product — I rejected count-up on my own design grounds before seeing this library. (2) Three new dependencies for one effect (§43). (3) Directive §36 requires restrained motion; animating every metric on every render is the opposite |
| **`skiper101`** Custom tooltip | Evidence hover, lineage detail | **Pulls `@radix-ui/react-tooltip` into a Base UI project** (§1.1). The installed Base UI tooltip is accessible and already themed |
| **`skiper99`** Animated icons | State-transition feedback | Pulls `framer-motion` for icon flourishes. State changes are communicated by the badge and the row updating — an animated icon adds nothing an operator needs |
| **`skiper4` / `skiper26`** Theme toggles | App shell | 429 lines and `framer-motion` to replace a working `next-themes` toggle that already has a `d` hotkey. No user problem solved |
| **`skiper106`** Smooth caret input | Search field | Pulls `framer-motion` **and `dialkit`**, an unvetted package. A search input needs to be fast and predictable, not decorative |
| **`skiper58`** Text roll navigation | Sidebar nav | Hover flourish. Directive §10 says navigation must communicate location and pending work; a text-roll communicates neither |
| **`skiper89`** Scroll progress | Long case pages | Case pages should not be long enough to need it. If one is, that is a layout defect to fix, not decorate |
| **`skiper102`** Debug panel | Development | Overlaps existing tooling; risks shipping |
| **`skiper16/17`** Card stacks | Evidence presentation | Evidence must be scannable and comparable. Stacking hides items behind each other — actively worse for the task |
| **`skiper47–54`** Carousels (6) | — | A finance queue is a table. Carousels hide items and destroy scannability |
| **`skiper19/30/31/34/87`** Scroll effects | — | Marketing-site language. Directive §6 explicitly forbids the landing-page aesthetic |
| **`skiper28/63/64/66`** 3D, gooey, clip-path | — | Pure decoration (§7) |
| **`skiper39`** Canvas crowd, **`skiper61`** Mouse follow | — | Decorative; §36 forbids constant animation |
| **`skiper67`** Video player, **`skiper25`** Music toggle, **`skiper3`** Play button | — | No media in this product |

---

## 5. What replaces Skiper for the real UI problems

The screens need components Skiper does not provide. These are built locally on the Base UI
primitives already installed:

| Product need | Approach | Existing primitive |
|---|---|---|
| Lifecycle timeline (Transaction 360) | **Custom** — no library provides a financial lifecycle with per-stage amounts and a break marker | `separator`, `tooltip` |
| Evidence drawer | Base UI `sheet` *(to install from shadcn, not Skiper)* | — |
| Action confirmation | Base UI `alert-dialog` *(to install from shadcn)* | — |
| Command palette / search | Base UI `command` *(to install from shadcn)* | — |
| Hypothesis comparison | **Custom** — evidence counts must dominate, not a confidence bar (§18) | `card`, `badge` |
| Verifier check list | **Custom** — pass/fail with expected vs observed (§20) | `table`, `badge` |
| Status treatment | Existing `StatusBadge` | `badge` + tokens |

**All of these come from the shadcn registry the project already uses, on the same Base UI
foundation — not from Skiper.**

---

## 6. Summary

| | Count |
|---|---|
| Catalog inspected | 37 |
| **Selected** | **2** (`skiper40` installed; `skiper41` conditional) |
| Deferred (dev-only) | 1 |
| Rejected after evaluation | 13 |
| Out of scope without individual evaluation | 21 |
| **New dependencies introduced** | **0** |

The final interface will use a **small, coherent subset** as directive §4 requires — and the
subset is small because the catalog does not fit the product, not because I did not look.

**If Skiper presence is itself a goal, say so and I will reconsider.** But I would be
choosing decoration over the §0 principle, and I would want that recorded as your decision
rather than my judgement.
