# Baselines

## System A — Deterministic Reconciliation Baseline

The baseline is intentionally strong. It must include:

- exact source/reference matching;
- merchant-scoped identity checks;
- bounded date/timestamp tolerance;
- amount tolerance only where explicitly modeled;
- known fee/tax arithmetic;
- duplicate/reference detection;
- refund timing rules;
- deterministic split-settlement checks;
- explicit escalation for unsupported cases.

The baseline cannot call the LLM.

## Baseline output

For every candidate, the baseline returns:

- resolved or unresolved;
- reason code;
- evidence/source references;
- deterministic checks run;
- residual discrepancy;
- processing time / operation count.

## Treatment — AI Residual Resolver

The AI treatment is executed only on cases that the deterministic baseline leaves unresolved.

The treatment can retrieve additional evidence and propose a bounded disposition. The deterministic verifier then checks the proposal.

## Baseline integrity

The baseline must not be intentionally weak. It must use all deterministic information available from the domain model and public semantics represented in the synthetic environment.

## Comparison principle

The key comparison is not “AI versus nothing.” It is:

```text
strong deterministic residual handling
              vs
strong deterministic residual handling + bounded AI reasoning
```

## Baseline freeze

Freeze baseline rules, tolerances, cause mappings and stop conditions before the primary test set is scored. Any change afterward requires a new experiment version.

## Frozen parameters (D7)

Baseline tolerances, matching rules and windows come from `EXPERIMENT_CONSTANTS.md` (§3, §4) — currently `PROPOSED`. Exact amount matching (`T4 = 0`) with rounding drift as the **only** modeled amount tolerance, capped at ₹1.00 absolute (`T3`) so it can never explain a material variance.

## Freeze order (D7)

The baseline is implemented and **frozen before the dataset is generated**. This ordering matters: the residual is defined by real baseline behavior, not assumed in advance, and the AI's problem domain is therefore observed rather than stipulated. Any post-hoc baseline weakening is a `CHANGE_CONTROL.md` event and invalidates the comparison.

Kill criterion 6 ("modest deterministic rule expansion") is defined **functionally, not by line count** (`EXPERIMENT_CONSTANTS.md` section 8): the AI contribution is killed if a deterministic/fuzzy rule system of materially comparable complexity and maintainability reaches equivalent performance on **both** the frozen primary test and challenge splits. Implementation complexity is tracked separately as an engineering metric and informs the maintainability judgment, but is not itself the criterion.

---

# Part III — Implementation status (2026-09-05)

Two deterministic arms, both using the same tools, the same arithmetic and the same terminal
verifier as the agent.

## System A — the enumerated baseline

`packages/evaluation/src/systems/system-a.ts`. Runs the shipped `reconcileUnit`, then maps a
residual reason onto a cause **only when exactly one reason fired and it maps to exactly one
cause**. Anything else escalates with `MULTIPLE_REASONS_NO_SINGLE_RULE` or
`NO_ENUMERATED_RULE`.

It resolves through the same verifier the agent must pass. A baseline forbidden to answer
would be a straw man.

## System B — the strong fixed workflow

`packages/evaluation/src/systems/system-b.ts`. Runs **all eight** tools in a fixed documented
order on every case, then applies hand-written rules ordered most-specific first: impossible
adjustment, unallocated adjustment matching the variance, late refund, refund netting,
bounded rounding, missing or unexpected fee, split settlement, settlement timing.

This is the arm that answers the question a reviewer should ask — *would more rules have done
just as well?* It is written to win. Nothing was held back to flatter the agent, and if it
matches System C on the unseen strata within 2 pp ESRR with no higher URR, the AI
contribution is killed (`EXPERIMENT_CONSTANTS.md` kill criterion 6).

What it cannot do is choose what to look at, or compose an explanation the rules do not
already enumerate. That, and only that, is the difference being measured.

## Baseline integrity

`reconcileUnit` was written before any agent existed and has not been weakened since. Its
constants are pinned by `frozen-policy.test.ts`, so a change to make the AI look better would
break the build.
