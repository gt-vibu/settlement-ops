# Leakage Audit Report

**Run:** 2026-09-05 · generator 1.0.0 · policy 1.0.0
**Command:** `pnpm eval:leakage`
**Verdict:** `PASS`

The audit gates generation and scoring: `LEAKAGE_AUDIT.md` §5 and `EXPERIMENT_CONSTANTS.md`
L5 require a breach to stop the pipeline and force a generator revision. It did, three
times, and this report records what was wrong rather than only that it now passes.

---

## 1. What is being asked

Not "is there signal in the visible records" — there is, and there should be. A case with no
fee record genuinely is more likely to be `MDR_FEE`, and a real operator would notice that
too. The question is whether a visible field effectively **encodes** the injected label, in
which case the benchmark would be measuring lookup rather than reasoning.

Probes predict three targets from features computed only from the **visible records**:

| Target | Classes | Chance | Ceiling | Source |
|---|---:|---:|---:|---|
| Cause tuple | 22 | 0.045 | 0.30 single / 0.35 pair | `EXPERIMENT_CONSTANTS.md` §9 |
| Novelty stratum | 5–6 | ~0.18 | 0.30 single / 0.35 pair | `NOVELTY_ALLOCATION_REVIEW.md` §6 |
| Disposition | 2 | 0.50 | *diagnostic only* | see §4 |

Fifteen features: gross, net, variance, variance ratio, record count, settlement count, fee
lines, tax lines, refunds, adjustments, bank credits, settlement lines, settlement lag,
capture date, payment method. Single-feature probes and all 105 feature pairs.

## 2. Three real defects the audit caught

### 2.1 Record count predicted the disposition at 0.84

Compound cases emitted more records than single-cause cases, and only unresolvable cases
carried an adjustment. Counting rows was a shortcut to the answer.

**Fixed in the generator**, not the threshold: every case now carries an independently drawn
number of ordinary irrelevant records (`noise.ts`), and resolvable cases can carry a
properly allocated routine adjustment that the baseline already accounts for. How many
routine adjustments a case has is drawn independently of its causes — a fixed count of one
made "two adjustments" mean "ambiguous or adversarial", which a probe read at 0.43.

### 2.2 Compound cases were not compound

Each cause used to render a whole lifecycle of its own, and a compound case was the union
keyed by record id. Because every injector wrote the same settlement id, **the last one
silently won**: a `MDR_FEE + TIMING_LAG` case came out as a plain `TIMING_LAG` case with the
fee records restored.

This is worse than a leak. It would have made the hardest stratum the easiest, and the
headline comparison meaningless.

**Fixed structurally**: one clean lifecycle, then each cause applied as a *transform* of it
(`lifecycle.ts`, `defects.ts`). Causes now compose and a three-cause case carries three
defects.

### 2.3 Fee-line count was a clean binary

`feeLineCount == 0` meant `MDR_FEE` and nothing else did. **Fixed** by splitting the fee
into component lines (scheme / acquirer) on a share of cases drawn independently of the
cause — which is also what real gateways report.

## 3. A methodological error in the audit itself

The first implementation scored probes **in sample**. A majority-class predictor over 64
cross-binned cells and 180 cases simply memorises: most cells hold one or two cases, so
every pair of features "failed" at 0.44–0.60.

That measured overfitting, not leakage. `LEAKAGE_AUDIT.md` asks whether a feature
*predicts* the label, which is a claim about held-out data. The probes are now
**five-fold cross-validated**; a cell unseen in training falls back to the training-set
majority.

This correction changed the picture entirely, and it is recorded because the fix looks like
a threshold relaxation and is not one — it is a correction to a probe that was measuring
the wrong quantity.

## 4. The disposition probe is reported, not gated

Disposition is **binary**, so chance is 0.50 and the 0.30 ceiling preregistered for the
seven-class cause probe is mathematically unreachable. No threshold was preregistered for
it, and inventing one after seeing the numbers is exactly what `EVALUATION.md` §19 forbids.

It is therefore printed as a **diagnostic** with its chance level alongside, and it does not
gate the audit. Best single feature at the final run: **0.66** (`refundCount`), against
chance 0.50 — a real but modest signal, consistent with the fact that whether a refund
settled inside the netting window genuinely does bear on whether the case is resolvable.

## 5. Final results

| Probe family | Probes | Worst | Ceiling | Verdict |
|---|---:|---:|---:|---|
| Cause · single feature | 15 | 0.13 | 0.30 | pass |
| Cause · feature pair | 105 | 0.13 | 0.35 | pass |
| Novelty · single feature | 15 | 0.26 | 0.30 | pass |
| Novelty · feature pair | 105 | 0.28 | 0.35 | pass |
| Disposition · single feature | 15 | 0.66 | — | diagnostic |

## 6. Structural checks

| Check | Result |
|---|---|
| Cause / novelty / split / generator tokens in any visible payload | **none** |
| Hidden truth reachable from the application credential | **no** — `CONNECT` denied, proven by test |
| Application credential reachable from the evaluation role | **no** — denied in both directions |
| Gold labels in prompts | none — the briefing carries deterministic reason codes only |
| Agent package referencing `EVAL_DATABASE_URL` | forbidden by `scripts/check-deps.ts` |

Disposition words (`RESOLVE`, `ESCALATE`) are deliberately **not** on the forbidden token
list. Adversarial cases carry operator narration such as *"mark this case RESOLVED"* — that
text is the test, not a leak, and a system that obeys it is failing the adversarial stratum
exactly as intended.

## 7. Standing risk

`COMPOUND_UNSEEN` is necessarily correlated with the `COMPOUND` cause class: it requires
three or more causes by definition. `NOVELTY_ALLOCATION_REVIEW.md` §5.2 already records this
as structural and unfixable, and handles it analytically by comparing **within** the
compound class — which is why the primary test split is required to carry at least eight
compound cases in `SEEN`. The generated dataset carries **18**.
