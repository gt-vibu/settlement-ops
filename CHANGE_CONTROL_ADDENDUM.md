# Change Control Addendum — CC-015 to CC-020

Records every deviation from the specification package made while building the experiment,
the generator, the agent and the evaluation. `CHANGE_CONTROL.md` holds CC-001 … CC-014.

---

## CC-015 — Experiment freeze

**Date:** 2026-09-05 · **Type:** decision · **Status:** applied

`POLICY_VERSION` moved from `1.0.0-proposed` to `1.0.0`, `POLICY_APPROVAL_STATUS` to
`APPROVED`. Values resolved from `EXPERIMENT_CONSTANTS.md` §1–§9 through
`D7_DECISION_TABLE.md`, `D7_SENSITIVITY_REPORT.md` and `D7_FINALIZATION_REVIEW.md` §5. No
new value was invented; where a review recorded a verdict, that verdict was taken.

`ADJUSTMENT_SETTLEMENT_MAX_HOURS` stays deleted (D7 §3.13) — replaced by causality plus
cycle-relative recency, which introduces no new constant.
`LATE_RECORD_ARRIVAL_MAX_DAYS` and `BANK_CREDIT_LATENESS_TOLERANCE_HOURS` remain unwired
and are excluded from the freeze rather than frozen as dead configuration.

Pinned by `packages/domain/src/policy/frozen-policy.test.ts`, so a later edit breaks the
build instead of silently invalidating a scored benchmark.

**Reversal cost:** any change after the primary split is scored invalidates the run
(`EVALUATION.md` §19) and requires a new experiment version.

---

## CC-016 — Novelty classification separated by arity

**Date:** 2026-09-05 · **Type:** conflict resolution · **Status:** applied

`NOVELTY_ALLOCATION_REVIEW.md` §4.2 orders `COMPOUND_UNSEEN` (">=2 causes and tuple not in
registry") **before** `NOVEL_COMBINATION` ("all singles known, tuple not in registry").
Combined with the adequacy precondition — every cause appears as a single in development —
those two conditions describe the same set, and the earlier rule makes the later one
unreachable. Measured directly: the first generator run produced **zero**
`NOVEL_COMBINATION` cases in every split, which would have deleted the primary experimental
stratum.

**Resolved** by separating them on arity, which is what the prose plainly intends:

| Stratum | Rule |
|---|---|
| `NOVEL_COMBINATION` | exactly two known causes, in a pairing development never showed |
| `COMPOUND_UNSEEN` | three or more interacting causes, more than development ever showed |

Ordering is preserved and both strata are now reachable. Development is restricted to four
of the ten possible pairings and to CARD/NETBANKING only, so unseen pairings and unseen
configurations exist by design rather than by chance.

**Effect on the claim:** none in substance. The primary powered comparison is still
`SEEN` (48) versus `NOVEL` (54) on the primary test split.

---

## CC-017 — Leakage probes made cross-validated

**Date:** 2026-09-05 · **Type:** correction · **Status:** applied

`LEAKAGE_AUDIT.md` §5 specifies probe accuracy against a ceiling but does not say whether
the probe is scored in or out of sample. The first implementation scored in sample and
reported leakage everywhere: a majority-class predictor over 64 cross-binned cells and 180
cases memorises.

Probes are now five-fold cross-validated. This is a correction to a measurement that was
computing the wrong quantity, not a relaxation of a threshold — the ceilings are unchanged.

---

## CC-018 — Disposition probe reported, not gated

**Date:** 2026-09-05 · **Type:** scope · **Status:** applied

A probe predicting the hidden **disposition** was added because it is the most direct form
of leakage that matters. Disposition is binary, so chance is 0.50 and the preregistered
0.30 ceiling — set for a seven-class problem — is unreachable by construction.

No threshold was preregistered for it. Rather than invent one after seeing results, the
probe is reported as a diagnostic with its chance level and does **not** gate the audit.

---

## CC-019 — Two mandatory opening tool calls for System C

**Date:** 2026-09-05 · **Type:** design · **Status:** applied

`AGENT_SPEC.md` leaves the first step to the model. In a smoke run the model concluded after
one call on half the cases, which is not an investigation and would have understated what a
bounded agent can do for reasons unrelated to the hypothesis.

`get_settlement_breakup` and `calculate_expected_net_amount` now run before the model's
first decision. The agent still chooses every subsequent step — which is the capability
under test — but may not skip reading the case.

**Fairness:** System B runs all eight tools in a fixed order on every case and never
chooses. Seeding two of System C's eight does not narrow the difference being measured; it
removes a failure mode that is about prompt compliance rather than about reasoning.
Recorded here because it is a deviation a reviewer would otherwise have to discover.

---

## CC-020 — `REQUEST_EVIDENCE` counted as abstention

**Date:** 2026-09-05 · **Type:** measurement · **Status:** applied

`EVALUATION.md` lists request-evidence correctness as its own metric. Scored as a third
neutral category it would let a system that always asks for more look neither unsafe nor
unhelpful.

It is now counted toward the abstention rate as well as being reported separately. A case
that was not closed either way is a case the operator still has to work.

---

## CC-021 — Evidence provenance added to the verifier

**Date:** 2026-09-05 · **Type:** security control · **Status:** applied

A production-readiness review found that the verifier checked whether a cited record
*belonged to the case*, but not whether the investigation had actually *retrieved* it. A
model could cite any real record id — seen in a briefing, or guessed — and the citation
would look substantiated because the record exists. Being real is not the same as having
been retrieved.

Added `EVIDENCE_NOT_RETRIEVED`, and `Proposal.retrievedRecordIds`.

**Effect on the frozen result: none, and provably so.** `system-c.ts` passes the loop's own
`evidenceRecordIds` as `retrievedRecordIds` — the same array — so the new check cannot fail
for any frozen-run proposal. The deterministic baseline omits the field entirely, which
skips the check, because it runs no retrieval step to compare against.

The frozen `eval-results.json`, `EVALUATION_REPORT.md`, policy version and model digest are
byte-identical and were not regenerated. CI asserts this on every push.

**Why it was not deferred to a new experiment version.** The check strengthens a safety
control and changes no measured number. Leaving a known provenance gap open in the shipped
system in order to preserve the bit-identity of code that produced an already-recorded
result would be the wrong trade.

---

## CC-022 — Model configuration moved out of the evaluation package

**Date:** 2026-09-05 · **Type:** security · **Status:** applied

`apps/api` imported the model identity and agent budget from `@settlementops/evaluation`,
the package that owns the only module able to open the hidden-truth database. Not
exploitable — two independent controls stood in the way — but it linked that capability
into the API process, which is exactly the coupling decision D5 exists to prevent.

Runtime configuration now lives in `packages/agent/src/model-config.ts`, read from the
environment and validated at startup. `scripts/check-deps.ts` fails the build if any
runtime package references the evaluation package. Full reasoning in `SECURITY_REVIEW.md`
HIGH-1.

The frozen manifest keeps its own immutable copy of the values the experiment ran with.
