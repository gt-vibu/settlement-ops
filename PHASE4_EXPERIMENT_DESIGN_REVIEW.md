# Phase 4 Experiment Design Review

**Date:** 2026-09-01
**Status:** `DESIGN COMPLETE — AWAITING OWNER APPROVAL TO GENERATE`
**Scope:** documentation only. **No implementation changed. No dataset generated. No treatment run. No UI touched.**
**Change record:** `CHANGE_CONTROL.md` CC-011

---

## 1. What changed and why it was necessary

### The defect in the original design

The v1 primary hypothesis was an **aggregate** evidence-supported resolution rate
comparison: deterministic baseline versus AI treatment on the residual.

That framing was in direct tension with a rule the project also imposes on itself.
`BASELINES.md` requires a strong baseline and forbids weakening it. Phases 2 and 3
strengthened it **twice** in response to counterexamples — the missing adjustment-timing
check, then the causal-versus-symmetric rule. Each improvement made an aggregate AI win
*less* likely.

The only reliable route to a headline win would have been to **stop improving the
baseline**. The design was quietly rewarding the one behaviour the project forbids.

It also walked into the strongest available objection:

> "Aggregate accuracy is one point higher. Why not write more rules?"

If the honest answer is "you probably could", the hypothesis was asking the wrong question.

### The replacement

> **On previously unseen combinations of known financial causes, a bounded
> evidence-investigation agent generalises beyond enumerated deterministic rules while
> maintaining safe abstention when evidence is insufficient.**

Two capabilities, and the claim is their **conjunction**:

- **Generalisation** — rules require enumeration in advance; an unfamiliar combination
  either has a rule or does not.
- **Evidence-gated abstention** — deciding whether the evidence is *sufficient*, and
  refusing when it is not. A rule system has no representation for *"two explanations
  remain plausible; one specific record would distinguish them."*

Generalisation without abstention is unsafe. Abstention without generalisation is useless.

### Why this is harder, not easier

The redesign **raises** the bar:

| | v1 | v2 |
|---|---|---|
| Competing systems | 2 | **3** — adds one built specifically to defeat the AI claim |
| Strata where rules are expected to win | none acknowledged | **`SEEN` is expected to be a tie or a loss** |
| Abstention | counted | **two-sided** — reluctance no longer scores as safety |
| Model risk | unaddressed | capability-ceiling diagnostic required |

**Timing matters and is clean:** no dataset has been generated, no treatment run, nothing
scored. The redesign precedes all evidence and invalidates no comparison. Had any result
been observed first, `EVALUATION.md` §19 would have required a new experiment version.

---

## 2. Documents updated

| Document | Change |
|---|---|
| `VALIDATION_EXPERIMENT.md` | **Part II** — new primary hypothesis, three arms, System B good-faith rules, six falsification conditions, nine-dimension complexity comparison |
| `EVALUATION.md` | **Part III** — stratified reporting, two-sided abstention metrics, full metric set, model-capability diagnostic, prohibited claims |
| `DATASET.md` | **Part III** — novelty taxonomy frozen pre-generation, novelty as hidden truth, split construction rules, generator must use `expectedSettlementDate()` |
| `EXPERIMENTS.md` | **Part II** — three-arm design, System B build rules, five required analyses, run record incl. **model digest** |
| `DEMO_SCENARIOS.md` | **Part II** — ₹10,000 case demoted to warm-up; primary demo is competing hypotheses + evidence gap; secondary is the verifier override |
| `PITCH.md` | **Part II** — "Evidence-Gated Settlement Investigation"; explicit list of claims **not** made |
| `REVIEWER_ATTACKS.md` | **Part II** — six new attacks incl. "isn't this just a bigger rules engine?" and "you changed the design partway through" |
| `LEAKAGE_AUDIT.md` | **§10** — novelty-label leakage checks |
| `EXPERIMENT_CONSTANTS.md` | Kill criterion 6 cross-referenced to System B; **§7b novelty allocation added (PROPOSED)** |
| `CHANGE_CONTROL.md` | CC-011 |

---

## 3. The three arms

| Arm | System | May use | Frozen before |
|---|---|---|---|
| **A** | Deterministic baseline (Phase 2/3) | dev | dataset generation |
| **B** | **Expanded deterministic rules** | dev + validation | scoring |
| **C** | AI investigation agent | dev + validation | scoring |

System B was ablation 5 in v1. Promoting it to a full arm converts the project's central
objection from rhetoric into a measurement.

### What keeps System B honest

1. Built from **dev + validation only**; its author must not inspect the primary test or
   challenge splits before B is frozen.
2. Frozen and version-stamped exactly as A and C are.
3. A **serious engineering attempt** — under-building B is the same offence as weakening A.
4. Any deterministic technique permitted; **no model calls**.
5. Complexity measured across nine dimensions, not asserted.

**If B wins, that is the finding and it gets reported.**

---

## 4. Novelty strata

| Stratum | Definition |
|---|---|
| `SEEN` | Exact cause combination appeared in development |
| `NOVEL_COMBINATION` | Individual causes seen; this combination not — **the primary test** |
| `NOVEL_CONFIGURATION` | Seen combination, unseen parameter range |
| `COMPOUND_UNSEEN` | Multiple interacting causes in a configuration never shown |
| `AMBIGUOUS` | Evidence genuinely cannot distinguish the leading causes |
| `ADVERSARIAL` | A tempting explanation deterministic checks must reject |

**Frozen before generation.** Assigning strata after seeing results would let the
boundaries be drawn around whatever the systems happened to do.

**Novelty is hidden truth.** It is the experimental variable itself — a system that could
detect its stratum would know it was being tested on an unfamiliar case, which is exactly
the capability under measurement. `LEAKAGE_AUDIT.md` §10 adds probes for it, including
whether novelty is predictable from visible features.

---

## 5. Abstention measured on both sides

| Metric | Detects |
|---|---|
| **Correct abstention rate** | Over-confidence — resolving what cannot be safely resolved |
| **Unnecessary escalation rate** | Uselessness — refusing work it could have done |
| **Evidence-request precision** | Vague deferral disguised as reasoning |

Reported as a **pair**, so a system cannot buy a safety score with reluctance.

> A system that abstains on 100% of ambiguous cases and 60% of resolvable ones has not
> demonstrated judgement. It has demonstrated reluctance.

---

## 6. Consistency audit

| Check | Result |
|---|---|
| All nine updated docs carry the CC-011 marker | ✅ |
| Novelty strata named identically across `DATASET`, `EVALUATION`, `EXPERIMENTS`, `LEAKAGE_AUDIT` | ✅ |
| Three-arm naming consistent across six documents | ✅ |
| Old aggregate framing still asserted anywhere | ✅ None — the three matches are all **prohibitions** of it |
| Kill criterion 6 reconciled with System B | ✅ Cross-referenced; substance unchanged, now measured not argued |
| Part I / Part II precedence stated | ✅ `VALIDATION_EXPERIMENT.md` Part II governs where they differ |
| Approved X1 safety ceiling preserved | ✅ Falsification condition 2, unchanged (2.0% / 5.0% CI) |
| Generator settlement-date rule recorded | ✅ `DATASET.md` §17 — must call `expectedSettlementDate()` |
| Implementation untouched | ✅ `pnpm verify` PASS — 210 unit + 40 integration |

---

## 7. Open decisions — these block generation

### 7.1 Novelty allocation (new, and the most consequential)

`EXPERIMENT_CONSTANTS.md` §7 allocates cases by **cause**. It does not allocate by
**novelty** — which CC-011 just made the primary experimental variable. Proposed in a new
§7b:

| Split | Cases | `SEEN` | `NOVEL_COMB` | `NOVEL_CONFIG` | `COMPOUND_UNSEEN` | `AMBIGUOUS` | `ADVERSARIAL` |
|---|---|---|---|---|---|---|---|
| development | 120 | 100% | — | — | — | — | — |
| validation | 60 | 70% | 20% | 10% | — | — | — |
| **primary test** | **120** | **40%** | **25%** | **10%** | **10%** | **10%** | **5%** |
| **challenge** | **60** | **0%** | **35%** | **10%** | **35%** | **15%** | **5%** |

Reasoning: development is 100% `SEEN` by definition; the primary test keeps a substantial
`SEEN` stratum deliberately, as the place rules are *expected* to win — removing it would
make the comparison look rigged; the challenge split contains no `SEEN` cases at all.

**Statistical caveat, stated plainly:** at 120 primary-test cases, `COMPOUND_UNSEEN` is
about **12 cases**. That cell will carry a very wide confidence interval and must be
reported with it, never as a point estimate. If `COMPOUND_UNSEEN` is where you want a
defensible claim, the primary test split needs to be larger.

### 7.2 Still outstanding from D7

| # | Decision |
|---|---|
| a | Freeze `EXPERIMENT_CONSTANTS.md` §1–§4 (the D7 finalization review is complete and awaiting sign-off) |
| b | Approve or revise the §7b novelty allocation above |
| c | Confirm dataset sizes given 7.1's caveat |
| d | Approve §8 thresholds other than X1 (`ESRR_MIN_IMPROVEMENT`, challenge retention, bootstrap) |
| e | Approve §9 leakage thresholds — now covering **novelty** leakage as well as cause |
| f | Choose the Ollama model and its **digest**, plus the stronger reference model |

---

## 8. Honest assessment of the redesign

**What it improves.** The hypothesis is now falsifiable in a way a strong baseline does not
make unanswerable. The central objection has a measured answer. Abstention cannot be gamed.
The claim is located rather than aggregate.

**What it costs.** System B is real work — perhaps a day, and it may kill the AI claim.
That is the point. Stratified reporting also means smaller cells and wider intervals: the
project trades a precise answer to a weak question for a less precise answer to a strong one.

**What it does not fix.** Three risks survive untouched:

1. **Sample size.** 120 primary-test cases across six strata leaves some cells very small.
2. **Local model capability.** The claim depends on a local model executing bounded
   multi-step reasoning with strict schema output. The capability-ceiling diagnostic makes
   a null result *interpretable*; it does not make it *good*.
3. **Synthetic data.** Everything here measures behaviour on a world we constructed. That
   boundary is stated in `EVALUATION.md` §21 and must stay in every report.

**The result this design is most likely to produce** is: rules and agent comparable on
`SEEN`, agent ahead on `NOVEL_COMBINATION` and `COMPOUND_UNSEEN`, with abstention quality
the deciding factor on safety. That is a more interesting and more defensible finding than
a one-point aggregate win — and if it does not appear, the design says so plainly rather
than hiding it.

---

**Stopping here.** No dataset generated. No treatment run. No implementation or UI changed.
