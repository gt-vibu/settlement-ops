# Evaluation Report

**Run:** 2026-09-05 · experiment 1.0.0 · policy 1.0.0 · generator 1.0.0
**Model:** Ollama `qwen2.5:3b-instruct-q4_K_M` @ `357c53fb659c…` · temperature 0
**Data:** 180 scored cases (primary test 120, challenge 60) · `eval-results.json`

## Verdict

```
The AI resolution claim is KILLED.

System C resolved 0 of 180 scored cases. Both deterministic arms beat it decisively.
Kill criterion 1 (EXPERIMENT_CONSTANTS.md §8) is met: the ESRR improvement over the
strongest baseline is -51.7 percentage points on the primary test split.
```

This is the preregistered result and it stands. What follows explains it rather than
softening it.

---

## 1. Headline numbers

| System | Split | n | ESRR | URR | Wrong cause | Abstained | Tools | Latency |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| **A** deterministic | primary test | 120 | 15.8% | 0.0% | 0.8% | 83.3% | 0 | <1 ms |
| **A** | challenge | 60 | 6.7% | 0.0% | 0.0% | 93.3% | 0 | <1 ms |
| **B** fixed workflow | primary test | 120 | **51.7%** | 0.0% | 0.0% | 48.3% | 8.0 | <1 ms |
| **B** | challenge | 60 | **36.7%** | 0.0% | 0.0% | 63.3% | 8.0 | <1 ms |
| **C** agent | primary test | 120 | **0.0%** | 0.0% | 0.0% | 100% | 2.6 | 17.9 s |
| **C** | challenge | 60 | **0.0%** | 0.0% | 0.0% | 100% | 2.6 | 17.2 s |

ESRR = correct resolutions ÷ cases. URR = unsupported resolutions ÷ cases.

## 2. Preregistered criteria

| # | Criterion | Threshold | Result | |
|---|---|---|---|---|
| X2 | ESRR improvement over best baseline | ≥ +10 pp | **−51.7 pp** | **FAIL** |
| X1 | Unsupported resolution rate | ≤ 2.0% | 0.0% | pass |
| X3 | Challenge retention | ≥ 60% of primary gain | no gain to retain | n/a |
| X4 | `AMBIGUOUS` reaching `RESOLVE` | exactly 0 | **0** | pass |
| — | Leakage audit | must pass | PASS | pass |
| 6 | Deterministic parity | B within 2 pp of C | B exceeds C by 51.7 pp | **AI killed** |

The safety thresholds all pass, and they pass trivially: a system that never resolves cannot
resolve unsafely. Safety without coverage is not a result worth claiming.

## 3. Where System C actually failed

The failure is specific, and it is **not** in the safety machinery.

| Stop reason | n |
|---|---:|
| `PROPOSAL_MADE` | 151 |
| `REPEATED_TOOL_CALL` | 29 |

| Effective disposition | n |
|---|---:|
| `REQUEST_EVIDENCE` | 107 |
| `ESCALATE` | 73 |
| `RESOLVE` | **0** |

**The verifier was almost never the binding constraint.** It passed 174 of 180 proposals;
only 6 were rejected. The model simply did not propose resolutions: it chose
`REQUEST_EVIDENCE` on 107 cases, of which **71 were provably resolvable**.

Cause identification was better than the headline suggests. On the 151 cases where it named
a cause, it was correct **33.1%** of the time — well above the 4.5% chance rate for 22 cause
tuples, and it reached for `MDR_FEE` on 45 of the 71 resolvable cases it then declined to
resolve. It frequently knew what had happened and would not commit to it.

Two further contributors:

- **29 cases ended in `REPEATED_TOOL_CALL`** — the model asked for a tool it had already been
  given, tripping loop detection. With two of eight calls seeded, the effective exploration
  budget it used was small: mean 2.6 tool calls against a budget of 8.
- **`AMBIGUOUS` was over-proposed**: 50 of 180, against 21 genuinely ambiguous cases.

## 3b. Per-stratum breakdown (descriptive only)

Reported with the caveat `NOVELTY_ALLOCATION_REVIEW.md` §3.2 requires: cells of 6-21 cases
support an observation, not a rate. System C is uniformly 0.0% and is omitted.

| Stratum | n | A · primary | B · primary | | n | A · challenge | B · challenge |
|---|---:|---:|---:|---|---:|---:|---:|
| `SEEN` | 48 | 27.1% | 70.8% | | 0 | — | — |
| `NOVEL_COMBINATION` | 30 | 3.3% | 53.3% | | 21 | 0.0% | 52.4% |
| `NOVEL_CONFIGURATION` | 12 | 41.7% | 75.0% | | 6 | 50.0% | 83.3% |
| `COMPOUND_UNSEEN` | 12 | 0.0% | 25.0% | | 21 | 4.8% | 28.6% |
| `AMBIGUOUS` | 12 | 0.0% | 0.0% | | 9 | 0.0% | 0.0% |
| `ADVERSARIAL` | 6 | 0.0% | 0.0% | | 3 | 0.0% | 0.0% |

Two things are worth reading here, both about the baselines rather than the AI:

- **System A collapses on unseen combinations** — 27.1% on `SEEN` to 3.3% on
  `NOVEL_COMBINATION`, and 0.0% on `COMPOUND_UNSEEN`. That is the enumerated-rule
  brittleness the experiment was built to expose, and it is real.
- **System B does not collapse the same way** — 70.8% to 53.3%, holding 25-29% even on
  `COMPOUND_UNSEEN`. Its degradation is graceful. That is the finding that most damages the
  case for an agent: a *fixed workflow with good rules* already generalises considerably
  better than a naive rule table.
- Both correctly resolve **nothing** on `AMBIGUOUS` and `ADVERSARIAL`, which is the intended
  behaviour, not a failure.

## 4. What the deterministic arms show

System B is the important number. It is a fixed workflow — all eight tools, always, in the
same order, then hand-written rules — and it resolves **51.7%** of the primary split and
**36.7%** of the challenge split with **zero** unsupported resolutions.

That 15-point drop from primary to challenge is the generalisation gap the experiment was
designed to detect: rules do worse on combinations they were not written for. The
hypothesis was that a bounded agent would close part of that gap. **On this evidence it does
not close any of it**, because it does not resolve at all.

System A is the honest floor: reason-code lookup alone gets 15.8% / 6.7%.

## 5. What this does and does not license

**Supported by this evidence:**

- On this dataset, with this model, a bounded investigation agent added **no** resolution
  coverage over a deterministic fixed workflow.
- The safety architecture works as designed: no unsupported resolution, no `AMBIGUOUS`
  resolution, every failure path landing on escalation, and the verifier accepting or
  downgrading without ever feeding back to the model.
- A strong rule system is a genuinely hard baseline. Anyone claiming an LLM advantage on
  reconciliation should be asked for their System B.

**Not supported:**

- Any claim that agents cannot help here. This tested **one 3B quantised model on CPU**. The
  measured failure is a disposition-selection failure, not a reasoning-architecture failure,
  and it is exactly the kind of failure a larger model is known to reduce.
- Any production claim whatsoever. Synthetic data, our own generator, our own oracle, 410
  constructed cases.

## 6. Exploratory follow-up

The frozen result stands unchanged. Separately, and reported as **exploratory, not
preregistered**, a revised prompt (`v2`, selected by `AGENT_PROMPT_VARIANT=v2`) was
evaluated on the **validation split only** — the split that exists for exactly this purpose
and which is never scored.

`v2` does not tell the model to resolve more. It states what evidence constitutes proof for
each cause, which is what the verifier already checks deterministically. The question it
answers is narrow: *was the frozen failure a limit of the architecture, or of a prompt that
never told the model what proof looks like?*

Results in `eval-results-validation-v2.json`; see §7. Whatever they show, they do **not**
change the primary result and are not comparable to it.

## 7. Exploratory result (validation split, not preregistered)

See `EVALUATION_REPORT_ADDENDUM.md`.

## 8. Reproducing this

```bash
pnpm eval:db:migrate && pnpm eval:leakage && pnpm eval:generate
pnpm eval:run                 # writes eval-results.json
```

The dataset regenerates identically from seed `20260831`: verified against the stored hidden
truth (primary test 81 resolvable of 120, challenge 34 of 60). The model is asserted by
digest before System C runs.

## 9. Limitations that bear directly on these numbers

- **Model size.** 3B, q4, CPU-only, ~14 tokens/s. Chosen so the benchmark could run at all.
- **n = 120** on the primary split. At n≈54 per novelty arm the minimum detectable difference
  is 12–18 pp; the per-stratum breakdown is descriptive only. With System C at 0% the
  comparison is unambiguous, but that is a property of this result, not of the design.
- **`REFUND_NETTING_MAX_CYCLES = 2`** is measured SENSITIVE: 1/2/3 cycles gave 7/5/3
  exceptions per ten in the sensitivity sweep. The primary result is at 2 cycles.
- All financial constants except the CARD fee rate and GST rate are synthetic assumptions.
