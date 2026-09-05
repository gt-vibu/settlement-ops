# Validation Experiment

## Decision under test

Does adding bounded AI reasoning to the deterministic reconciliation residual materially improve safe exception resolution?

## Primary hypothesis

On the deterministic baseline's escalated residual, the AI treatment will increase evidence-supported correct resolution while maintaining an equal or lower unsupported-resolution rate.

## Secondary hypotheses

- AI reduces unnecessary human escalation on genuinely explainable residuals.
- AI's evidence-linked explanations are more complete than baseline reason codes.
- AI generalizes better to compound/unseen cases than deterministic rules alone.

## Systems

### A — Deterministic baseline

Strong rules/fuzzy reconciliation and explicit escalation.

### B — AI residual resolver

Same baseline plus bounded AI investigation and deterministic verification.

## Primary metric

Evidence-supported resolution rate on the baseline residual.

A resolution counts only if:

1. disposition is correct;
2. every cited evidence record exists;
3. evidence supports the claim;
4. required deterministic verification passes;
5. the effective disposition is not a verifier downgrade.

## Safety metric

Unsupported/false resolution rate.

A resolution that is later rejected/corrected by human review or disagrees with hidden truth counts as unsafe.

## Secondary metrics

- residual coverage;
- unnecessary escalation rate;
- request-evidence correctness;
- evidence completeness;
- average tool calls;
- median investigation latency;
- human correction rate;
- challenge-set performance;
- reproducibility rate.

## Kill criteria

Kill the AI resolution claim if:

- it does not materially outperform the baseline on the defined residual at comparable safety;
- unsupported-resolution rate exceeds the preregistered ceiling;
- the apparent advantage disappears on challenge data;
- data leakage is detected;
- equivalent performance is achievable with a modest deterministic rule expansion.

## Important interpretation

A failed AI hypothesis does not automatically mean the entire Track 4 product is invalid. It means the AI claim is not supported. The project may retain the deterministic workflow only if that workflow independently satisfies the buildathon product and agent requirements and the final submission does not misrepresent AI contribution.

## Statistical method

Use paired case-level comparisons and bootstrap confidence intervals at merchant/settlement-batch units where the split design allows it.

Do not tune thresholds after viewing primary test results.

## Scenario parity

Interactive scenario runs must use the same domain/application pipeline as benchmark cases. A scenario is allowed to be smaller or visually staged, but the underlying state changes must be real and persistent.


---

# Part II — Experimental redesign (v2.0.0, locked 2026-09-01)

Recorded in `CHANGE_CONTROL.md` as CC-011. This **replaces** the primary hypothesis in
Part I. Part I is retained for history; where the two differ, Part II governs.

## 10. Why the original framing was wrong

Part I's primary metric was evidence-supported resolution rate on the baseline residual —
effectively an aggregate accuracy comparison. That framing has a defect that only became
visible once the baseline was built well:

**A strong deterministic baseline and a "the AI must win on aggregate" hypothesis pull in
opposite directions.** Phases 2 and 3 strengthened the baseline twice in response to
counterexamples, which is correct engineering. Every such improvement makes an aggregate
AI win *less* likely. The only reliable way to produce a headline win would be to stop
improving the baseline — which `BASELINES.md` forbids and a competent reviewer would
detect immediately.

The framing also invites the strongest objection to the whole project:

> "Aggregate accuracy is 1 point higher. Why not just write more rules?"

If the honest answer is "you probably could", the hypothesis was asking the wrong question.

## 11. Primary hypothesis (v2.0.0)

> **On previously unseen combinations of known financial causes, a bounded
> evidence-investigation agent generalises beyond enumerated deterministic rules while
> maintaining safe abstention when evidence is insufficient.**

Two capabilities are under test, and both are needed:

**Generalisation.** A rule system requires its cases to be *enumerated in advance*. When an
unfamiliar combination of causes appears, a rule either exists or does not. An agent that
reasons from evidence is not bound by prior enumeration.

**Evidence-gated abstention.** The agent must decide whether the evidence it has is
*sufficient*, and refuse to resolve when it is not. This is the harder half, and the one a
lookup table cannot reproduce: a rule system has no representation of "two explanations
remain plausible; one specific record would distinguish them."

Generalisation without abstention is unsafe. Abstention without generalisation is useless.
The claim is the conjunction.

## 12. Expected shape of the result

```text
        SEEN combinations                  UNSEEN combinations
               |                                   |
   rules are excellent, exhaustively        rules must be extended,
   enumerated for these cases               case by case
               |                                   |
        AI ~= rules  (expected)            AI > rules  (the hypothesis)
               |                                   |
        no claim made here                 this is the claim
```

**AI matching rules on seen cases is the predicted result, not a failure.** If the AI won
everywhere, that would be evidence the baseline is weak — a worse outcome for the project's
credibility than a narrow, well-located win.

## 13. Three systems, not two

| System | Description | Built from |
|---|---|---|
| **A — Baseline** | The frozen deterministic reconciliation of Phase 2/3 | dev split only |
| **B — Expanded rules** | A genuinely competent attempt to extend A's rules to cover more residual cases | dev + validation splits only |
| **C — AI agent** | Bounded investigation, typed evidence tools, deterministic verifier | dev + validation splits only |

**System B is the hypothesis's most serious adversary, and it is built in good faith.**

`EXPERIMENTS.md` ablation 5 already required a rule-expansion comparison. Promoting it to a
full arm makes the central objection ("isn't this just more rules?") an experimental
question with a measured answer rather than a rhetorical one.

### Rules governing System B — these make the comparison valid

1. B is developed against **dev and validation splits only**. Its author must not inspect
   the primary test or challenge splits before B is frozen.
2. B is **frozen before scoring**, exactly as A and C are.
3. B must be a **serious attempt**. Deliberately under-building B to make C look better is
   the same offence as weakening A, and is forbidden by the same rule.
4. B may use any deterministic technique: additional cause rules, fuzzy matching, wider
   tolerances, candidate-set search. It may not call a model.
5. B's complexity is measured and reported (§15), not asserted.

## 14. Falsification conditions (v2.0.0)

The AI claim is **not supported** if any holds:

1. **C does not exceed B on unseen combinations** at materially comparable complexity and
   safety. *(This is the new primary kill criterion and replaces the "modest rule
   expansion" wording, which was never operational.)*
2. C's unsupported-resolution rate exceeds the approved ceiling — 2.0% point estimate, 95%
   CI upper bound ≤ 5.0% (`EXPERIMENT_CONSTANTS.md` X1, approved 2026-09-01).
3. C's advantage on unseen combinations does not survive the challenge split.
4. Any `AMBIGUOUS` case reaches an effective `RESOLVE`.
5. C abstains indiscriminately — high correct-abstention bought with high unnecessary
   escalation (`EVALUATION.md` §30 measures both halves).
6. The leakage audit fails.

**Safety is a hard constraint, not a trade.** A system that generalises better but resolves
unsafely has failed, regardless of coverage.

## 15. Complexity comparison — beyond line count

`D7_DECISION_TABLE.md` replaced the arbitrary 200-line criterion with a functional test.
This operationalises "materially comparable complexity" across all three systems:

| Dimension | Measure |
|---|---|
| Explicit rules | Count of distinct deterministic checks or cause rules |
| Special cases | Count of conditions handling one narrow situation |
| Hand-tuned constants | Count of values with no derivation |
| Cyclomatic complexity | Per-module, aggregate |
| Test count | Tests required to protect the behaviour |
| **Maintenance burden** | **Measured effort to add one new cause class end to end** |
| Runtime cost | Median latency and operation count per case |
| Safety | URR under the same ceiling |
| Unseen behaviour | Performance on combinations absent from the build splits |

**Maintenance burden is the most informative and the most often skipped.** "Add one new
cause class to each system and record what it took" is a direct measurement of the thing
the rules-versus-reasoning argument is actually about.

## 16. Interpretation discipline

The report states which system won **where**, never a single headline number.

Permitted: *"On unseen combinations C resolved N% more of the residual than B at equal or
lower unsupported-resolution rate."*

Not permitted: *"AI is more accurate than rules."* Not permitted: a synthetic result
described as production accuracy or merchant impact (`EVALUATION.md` §21).

If B matches C, that is reported plainly as the finding, and the deterministic workflow is
retained as the product — a path Part I §"Important interpretation" already anticipated.
