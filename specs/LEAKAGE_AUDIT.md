# Dataset Leakage Audit

## 1. Purpose

Ensure the benchmark measures reasoning rather than a hidden label embedded in visible data.

## 2. Required audit before freeze

For every cause class, attempt to predict the cause using only visible features.

Audit:

- each scalar field alone;
- each categorical field alone;
- record counts;
- amount magnitudes;
- exact deltas;
- timestamp distances;
- presence/absence of record types;
- simple pairwise combinations;
- low-complexity decision trees;
- duplicate/reference patterns.

## 3. Suspicious leakage examples

Examples of bad generator design:

- defect A always has adjustment amount exactly equal to a fee;
- defect B always has a unique narration token;
- defect C always occurs on day 1 of a synthetic month;
- compound cases always contain exactly two additional records;
- one cause always has a missing field that no other cause misses.

## 4. Legitimate signal versus leakage

A visible feature is legitimate only when a real operator could plausibly observe it and it does not directly encode the hidden injection procedure.

## 5. Decision rule

If a low-complexity probe predicts a defect class with suspiciously high performance, pause dataset generation and revise the generator. Do not proceed to the final benchmark simply because the model would otherwise score well.

## 6. Required report

The audit produces:

- per-cause probe performance;
- suspicious features;
- mitigation applied;
- before/after results;
- final pass/fail;
- dataset version hash.

## 7. Leakage from evaluation pipeline

Also inspect software-level leakage:

- hidden labels in API payloads;
- generator metadata in logs accessible to the agent;
- test-only endpoints exposed in production paths;
- filenames containing defect names;
- deterministic record IDs that encode causes.

## 8. Preregistered thresholds (D7)

§5's "suspiciously high performance" is now defined, against a 7-class chance baseline of ≈ 0.143 balanced accuracy:

| Probe | Maximum |
|---|---|
| Single feature | balanced accuracy `0.30` |
| Depth-2 decision tree | balanced accuracy `0.35` |
| Pairwise combination | balanced accuracy `0.35` |
| Per-cause single feature | AUC `0.70` |

Values in `EXPERIMENT_CONSTANTS.md` §9, currently `PROPOSED`. **Thresholds are fixed before generation**, so the pass/fail call cannot be made after seeing the result.

Any breach ⇒ **stop, revise the generator, regenerate, re-audit.** Never proceed with a documented breach.

## 9. Software-level leakage (D5)

Pass/fail, no threshold. Hidden truth lives in `settlementops_eval`, which the application runtime cannot reach. Audit additionally confirms: no hidden label in any API payload; no generator metadata in logs the agent can see; no evaluation route in the production route table; no filename or record ID encoding a cause (record IDs are random UUIDs); **the evaluation harness never writes `Outcome.human_assigned_cause`.**


## 10. Novelty-label leakage (added by CC-011)

The novelty stratum (`SEEN`, `NOVEL_COMBINATION`, `NOVEL_CONFIGURATION`,
`COMPOUND_UNSEEN`, `AMBIGUOUS`, `ADVERSARIAL`) is **experimental hidden truth**, on the
same footing as the gold cause.

It is the experimental variable itself. A system that could detect it would know it was
being tested on an unfamiliar case — the exact capability under measurement.

Required checks before freeze, in addition to §2 and §7:

- no novelty label in any visible record, case projection, evidence item, tool result,
  audit payload, log line, filename or record ID;
- no proxy: probe whether novelty is predictable from visible features at above the §8
  thresholds, exactly as for the cause label;
- record-ID and correlation-ID structure must not correlate with stratum;
- split membership must not be inferable from any visible field.

A novelty-label leak invalidates the primary comparison, not merely a subgroup.
