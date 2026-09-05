# Phase 4 Freeze Readiness

**Date:** 2026-09-01
**Overall status:** 🔴 **BLOCKED — dataset generation must not begin**
**Verified against:** the repository, not the specification prose.

---

## Verdict

| # | Prerequisite | Status |
|---|---|---|
| 1 | Novelty allocation approved | 🔴 **BLOCKED** — proposed, awaiting sign-off |
| 2 | Model digest pinned | 🔴 **BLOCKED** — no model selected |
| 3 | All experiment constants frozen | 🔴 **BLOCKED** — only X1 approved |
| 4 | Baseline A frozen | 🟡 **READY TO FREEZE** — implemented, gated on #3 |
| 5 | Expanded-rules B frozen | 🔴 **BLOCKED** — not implemented |
| 6 | Leakage audit passes | 🔴 **BLOCKED** — not implemented, nothing to audit |
| 7 | Evaluation infrastructure | 🔴 **BLOCKED** — package is a placeholder |
| 8 | Hidden-truth database exists | 🔴 **BLOCKED** — `settlementops_eval` not created |
| 9 | Experiment design documented | ✅ **PASS** |
| 10 | Implementation stable | ✅ **PASS** |

**Two of ten pass. Generation cannot begin.**

Only #2 blocks *treatment* runs specifically; the rest block *generation*.

---

## 1. Novelty allocation — 🔴 BLOCKED

**Evidence:** `NOVELTY_ALLOCATION_REVIEW.md` is complete and `PROPOSED`. No approval recorded.

Awaiting decisions on: primary-test allocation (48/30/12/12/12/6), challenge allocation
(0/21/6/21/9/3), the powered/descriptive split, the ≥8 compound-in-`SEEN` floor, the
registry adequacy precondition, and the configuration buckets.

**Why this blocks generation:** novelty is assigned at generation time by lookup against a
registry frozen from the development split. Generating before the allocation is fixed would
produce a dataset whose strata cannot be corrected without regenerating.

---

## 2. Model digest — 🔴 BLOCKED (treatment runs only)

**Evidence:** no model selected; `MODEL_REPRODUCIBILITY.md` §7 lists five open decisions.

Outstanding: model name/tag **and quantization**; captured digest; fixed seed; the stronger
reference model; and confirmation that the chosen model holds to the disposition schema
under constrained generation.

**Scope note:** this blocks **System C runs only**. Systems A and B call no model, so
dataset generation and baseline evaluation can proceed without it — **provided the other
blockers clear.**

> Recommendation: trial the structured-output behaviour **before** freezing the dataset.
> Discovering that the chosen model cannot hold the schema is far cheaper now than after a
> freeze.

---

## 3. Experiment constants — 🔴 BLOCKED

**Evidence, read from code and docs:**

```
EXPERIMENT_CONSTANTS.md   STATUS: PARTIALLY APPROVED
                          X1 (URR_CEILING) ......... APPROVED 2026-09-01
                          all other values ......... PROPOSED

packages/domain/src/policy/policy-version.ts
                          POLICY_VERSION = '1.0.0-proposed'
                          POLICY_APPROVAL_STATUS = 'PROPOSED'
```

`D7_FINALIZATION_REVIEW.md` is complete and every §1–§4 value carries a verdict, but **no
freeze has been recorded.** §7b (novelty allocation) and §8 (thresholds other than X1) and
§9 (leakage thresholds) also remain proposed.

**On approval:** set `POLICY_VERSION = '1.0.0'`, status `APPROVED`, add a test pinning every
approved value so later drift breaks the build, record the freeze in `CHANGE_CONTROL.md`.

---

## 4. Baseline A — 🟡 READY TO FREEZE

**Evidence:** implemented and exercised — `reconcileUnit` with nine deterministic checks,
210 unit + 40 integration tests passing, `pnpm verify` PASS.

Strengthened twice during Phases 2–3 in response to counterexamples (adjustment-timing
check; causal rather than symmetric rule). Both improvements are pre-freeze and legitimate.

**Blocked only by #3** — A cannot be frozen while the constants it depends on are proposed.
Freezing A is otherwise a version stamp, not new work.

---

## 5. Expanded-rules System B — 🔴 BLOCKED

**Evidence:** `packages/` contains no expanded-rules module. Nothing implements CC-011's
System B.

This is **the largest piece of remaining work before scoring**, and the one most likely to
be skipped under time pressure. It is also the arm that could kill the AI claim, which is
precisely why it must exist.

Build rules from `EXPERIMENTS.md` Part II: dev + validation splits only; author must not
inspect primary test or challenge before freezing; a serious attempt, not a straw man; no
model calls; complexity measured across nine dimensions.

**Ordering constraint:** B needs the dev and validation splits to exist. So the sequence is
generate dataset → build B → freeze B → score. B does **not** block generation; it blocks
scoring.

---

## 6. Leakage audit — 🔴 BLOCKED

**Evidence:** no leakage-audit implementation in `packages/evaluation`.

Required probes: per-cause single-feature and depth-2 tree (`EXPERIMENT_CONSTANTS.md` §9);
**novelty-stratum probes** (`LEAKAGE_AUDIT.md` §10, `NOVELTY_ALLOCATION_REVIEW.md` §6);
software-level checks; registry isolation.

Nothing to audit until a dataset exists — but the audit must be **built before** generation
so a compromised dataset is caught immediately rather than after scoring.

---

## 7. Evaluation infrastructure — 🔴 BLOCKED

**Evidence:**

```ts
// packages/evaluation/src/index.ts
// Dataset generation, baseline/treatment, scoring (Phase 11).
// Placeholder - implemented in a later phase.
export {};
```

Missing: generator with hidden-truth-first ordering, combination registry, novelty
classifier, oracle (including the derived ambiguity rule, `EVALUATION.md` §37), scoring
harness for the four-way matrix, bootstrap analysis, manifest writer.

---

## 8. Hidden-truth database — 🔴 BLOCKED

**Evidence:** query for a database matching `%eval%` returned nothing. `settlementops_eval`
does not exist.

Decision D5 requires hidden truth in a **separate database with its own credential the
application never loads**. The application-side control is already enforced —
`loadConfig()` refuses to start if `EVAL_DATABASE_URL` is present, with two passing tests —
but the eval side does not exist yet.

Required: create the database and role; grant the harness only; verify the application role
has **no** grant on it; migrate `hidden_case_truth`, `generator_runs`, `split_manifest`,
`combination_registry`, `scoring_oracle_results`.

---

## 9. Experiment design documented — ✅ PASS

| Document | State |
|---|---|
| `VALIDATION_EXPERIMENT.md` Part II | Hypothesis, three arms, six falsification conditions |
| `EVALUATION.md` Parts III–IV | Stratified reporting, four-way matrix, derived ambiguity |
| `DATASET.md` Part III | Novelty taxonomy, hidden-truth rule, generator settlement-date rule |
| `EXPERIMENTS.md` Part II | Three-arm design, five required analyses |
| `NOVELTY_ALLOCATION_REVIEW.md` | Exact counts, powered vs descriptive, confound handling |
| `MODEL_REPRODUCIBILITY.md` | Digest, quantization, rejection rules, diagnostic role |
| `CHANGE_CONTROL.md` | CC-011, CC-012 |

Consistency audit clean: novelty strata named identically across four documents; three-arm
naming consistent across six; no stale aggregate-framing claims (the three matches are
prohibitions of it).

---

## 10. Implementation stable — ✅ PASS

```
pnpm verify           PASS
unit tests            210 passed
integration tests      40 passed (real PostgreSQL)
audit                 no known vulnerabilities
UI                    untouched — check:ui PASS
```

No application code was modified during the experiment redesign.

---

## Critical path

```
  1. Approve constants §1-§4, §7b, §8, §9        ← YOU
  2. Approve novelty allocation                  ← YOU
  3. Freeze baseline A (version stamp + pin test)
  4. Create settlementops_eval + role + migrations
  5. Build the generator (hidden truth first, registry, novelty classifier)
  6. Build the oracle (derived ambiguity rule)
  7. Build the leakage audit               ← BEFORE generating
  8. Generate the dataset
  9. Run the leakage audit                 ← breach ⇒ revise generator, regenerate
 10. Freeze the dataset + manifest
 11. Build System B from dev + validation, freeze it
 12. Score A and B
 ─────────────────── System C requires the model pinned (#2) ───────────────────
 13. Pin the Ollama model + digest; trial structured output
 14. Build tools, agent, verifier (Phases 6-8)
 15. Score C
 16. Analyse SEEN vs NOVEL, abstention quality, complexity
```

Steps 1–2 are yours. Steps 3–12 are implementation and do not need the model.

---

## Two risks worth naming now

**System B is the item most likely to be skipped.** It is real work, it arrives late, and it
might kill the claim. Skipping it would leave the project's central objection — *"isn't this
just more rules?"* — with no measured answer, which is worse than an unfavourable result.

**The leakage audit must be built before generation, not after.** Building it afterwards
creates pressure to find the dataset clean. The threshold values (`EXPERIMENT_CONSTANTS.md`
§9) are already proposed precisely so the pass/fail call cannot be made after seeing the
probe output.

---

**Status: 🔴 BLOCKED. No dataset generated. No treatment run. No implementation or UI changed.**

**Stopping here.**
