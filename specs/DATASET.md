# Dataset Specification

## 1. Objective

Create a synthetic but structurally realistic payment-to-settlement environment that allows the product to be evaluated without private Razorpay data.

## 2. Hidden-truth-first generation

Generation order is mandatory:

1. choose merchant/time configuration;
2. generate clean underlying payment world;
3. compute correct fees/taxes/refunds/settlement/bank/ledger relationships;
4. persist hidden truth separately;
5. inject one or more controlled defects;
6. render visible records with realistic noise;
7. run leakage audit;
8. freeze benchmark manifest.

The system under test never receives the hidden truth or generator metadata.

## 3. Core cause distribution

Initial benchmark cause classes:

- MDR fee deduction;
- UTR split;
- refund netting across cycles;
- asynchronous timing lag;
- rounding drift;
- ambiguity/conflicting evidence;
- compound combinations.

Cause proportions must be recorded in the manifest and labeled as synthetic assumptions.

## 4. Visible-record noise

Noise may include:

- benign identifier formatting variation;
- timestamp drift inside allowed windows;
- varied narration wording;
- record ordering differences;
- realistic missing optional fields;
- duplicated delivery events that should be deduplicated;
- delayed source arrival.

Noise must not encode the ground-truth cause deterministically.

## 5. Splits

Use independent splits for development, validation, primary test and challenge set.

Avoid row-level leakage by separating where appropriate by:

- merchant;
- transaction family;
- settlement batch;
- time period;
- parameter ranges.

## 6. Challenge set

Include unseen combinations and adversarial cases:

- two plausible causes;
- near-duplicate references;
- conflicting amount interpretations;
- timing ambiguity;
- misleading but legitimate-looking adjustment records;
- missing key evidence;
- compound causes.

## 7. Reproducibility

Every dataset build records:

- generator version;
- schema version;
- seed;
- parameter configuration hash;
- split manifest hash;
- cause distribution;
- timestamp.

## 8. Hidden truth isolation

Hidden truth must live outside the visible application/evaluation input path. Tests should assert that serialized visible cases contain no cause label, injection rule, generator seed, or gold disposition.

## 9. Data quality checks

Before freeze:

- all amounts conserve within intended rules;
- all references are unique where required;
- all foreign keys are valid;
- currencies are explicit;
- timestamps form plausible lifecycles;
- defect injection changed only intended aspects;
- ambiguous cases really remain ambiguous under deterministic checks.

---

# Part II — Readiness Resolutions (v2.0.0, locked 2026-08-31)

## 10. Hidden-truth storage boundary (D5)

§8 required hidden truth to live "outside the visible application/evaluation input path" without saying where. It is now specified:

```text
settlementops_eval          (separate database, separate credential)
├── hidden_case_truth       gold cause, injected defect spec, gold disposition
├── generator_runs          seed, parameters, generator version
├── split_manifest          merchant→split assignment
└── scoring_oracle_results
```

Rules:

1. Hidden truth lives in `settlementops_eval`, **never** in `settlementops_app`.
2. The application runtime does not load the evaluation credential; the boundary is enforced by database grants, not by code discipline.
3. The scoring oracle reads both sides **inside the evaluation boundary** and emits aggregate metrics only. Per-case labels never flow back.
4. `Outcome.human_assigned_cause` (renamed from `actual_cause`, D5) is human-written only. **The generator and the harness may never write it.**
5. Visible record IDs are random UUIDs — they never encode cause, split or defect (`LEAKAGE_AUDIT.md` §7).

## 11. Frozen generation parameters (D7)

Every generation parameter — split sizes, merchant counts, cause distribution, seed, simulated period, residual rate, fee schedule, tolerances, timing windows — is enumerated in **`EXPERIMENT_CONSTANTS.md`**, currently `PROPOSED`.

**Generation is blocked until that file is approved.** Splitting is by **merchant** (disjoint across dev/validation/test/challenge), which is what makes the bootstrap in `EVALUATION.md` §10 valid; row-level splitting would silently invalidate every confidence interval.

## 12. Generation preconditions

The generator may not run until **all** hold:

- [ ] `EXPERIMENT_CONSTANTS.md` is `APPROVED` (not `PROPOSED`);
- [ ] `settlementops_eval` exists with its own credential, and the app role has no grant on it;
- [ ] `Outcome.human_assigned_cause` rename is implemented and its regression test passes;
- [ ] leakage-audit thresholds (§9 of the constants file) are approved;
- [ ] the deterministic baseline is implemented and frozen (`BASELINES.md`), so the residual is defined by real behavior rather than by assumption.

The last precondition matters most: the residual **is** the AI's problem domain. Generating data before the baseline exists means guessing at the very thing the experiment measures.


---

# Part III — Novelty design (v2.0.0, locked 2026-09-01)

Recorded as `CHANGE_CONTROL.md` CC-011. **These definitions are frozen BEFORE generation.**
Assigning novelty after seeing results would let the strata be drawn around whatever the
systems happened to do.

## 13. Novelty taxonomy

Every generated case carries exactly one novelty label, assigned by the generator from its
own cause-combination registry and stored as **hidden truth**.

| Label | Definition | Purpose |
|---|---|---|
| `SEEN` | The exact cause combination appears in the development split | Establishes that rules are strong where enumerated |
| `NOVEL_COMBINATION` | Every individual cause appears in dev; this combination does not | **The primary test of the hypothesis** |
| `NOVEL_CONFIGURATION` | Combination seen; parameter range never seen (amount band, timing offset, line count) | Tests brittleness to configuration rather than structure |
| `COMPOUND_UNSEEN` | Two or more interacting causes in a configuration never shown in dev | The hardest stratum |
| `AMBIGUOUS` | Two or more explanations remain materially plausible on the available evidence | Tests abstention, not resolution |
| `ADVERSARIAL` | A tempting explanation that deterministic checks must reject on lifecycle grounds | Tests resistance to a plausible-looking match |

## 14. Novelty is hidden truth

The label is stored in `settlementops_eval` alongside the gold cause and **never** appears
in a visible record, an API payload, an audit event, a case projection, or a tool result.

This is not a formality. The novelty label *is* the experimental variable — exposing it
would let a system detect that it is being tested on an unfamiliar case, which is precisely
the capability under measurement. Add it to the `LEAKAGE_AUDIT.md` §7 software-level checks.

## 15. Split construction

```text
development  →  defines what SEEN means. All three systems may be built against it.
validation   →  prompt/policy and rule-expansion iteration. Systems B and C may use it.
primary test →  scored. Contains SEEN and NOVEL_* strata.
challenge    →  scored separately. Predominantly NOVEL_* and COMPOUND_UNSEEN.
```

Construction rules:

1. Splits remain **merchant-disjoint** (Part I §5, `EXPERIMENT_CONSTANTS.md` D2).
2. The **challenge split must contain cause combinations that appear in no other split.**
   The registry enforces this at generation, not by inspection afterwards.
3. `SEEN` cases in the primary test use combinations present in dev — deliberately, so the
   comparison has a stratum where rules are expected to be excellent.
4. Combination coverage per stratum is recorded in the manifest before scoring.

## 16. Generation order (amended)

```
1. choose merchant/time configuration
2. generate the clean payment world
3. compute correct relationships
4. persist hidden truth  ← now includes the NOVELTY LABEL and the combination registry
5. inject controlled defects
6. render visible records with realistic noise
7. leakage audit — INCLUDING a probe for novelty-label leakage
8. freeze the benchmark manifest
```

## 17. Settlement dates come from the domain

The generator **must** obtain expected settlement dates from `expectedSettlementDate()` in
`packages/domain`, never by adding calendar days.

Measured during the D7 sensitivity work: calendar T+2 from a Thursday capture lands on a
Saturday, while the system expects business T+2 on the Monday. The 2-day divergence exceeds
the ±1-day tolerance and manufactures timing exceptions that are **generator artefacts, not
injected defects** — contaminating the residual with noise that no system can resolve
because there is nothing to resolve.

One source of truth for the settlement calendar. The generator is a consumer of it.
