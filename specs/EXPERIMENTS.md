# Experiments and Ablations

## Primary comparison

A strong deterministic baseline versus the AI residual resolver on the same residual cases.

## Required ablations

1. AI without evidence retrieval.
2. AI with fixed evidence set.
3. AI with unstructured/free-text disposition instead of the constrained schema.
4. AI without deterministic verifier (safety stress test only; never production path).
5. Deterministic baseline plus expanded rules for selected cause classes.
6. Model replaced by a simpler classifier or parser where relevant.

## Purpose

The ablations determine whether improvement comes from:

- semantic reasoning;
- evidence access;
- constrained disposition;
- verifier design;
- simple feature-based shortcuts.

## Experiment discipline

Every run records:

- code version;
- dataset version;
- prompt version;
- model version;
- configuration hash;
- random seed where applicable;
- metric schema version.

## Post-result changes

Changing the experiment definition after primary test results invalidates the result as a preregistered comparison. A revised hypothesis requires a new experiment version.


---

# Part II — Three-arm design (v2.0.0, locked 2026-09-01)

Recorded as `CHANGE_CONTROL.md` CC-011.

## Arms

| Arm | System | May use | Frozen before |
|---|---|---|---|
| **A** | Deterministic baseline (Phase 2/3) | dev | dataset generation |
| **B** | **Expanded deterministic rules** | dev + validation | scoring |
| **C** | AI investigation agent | dev + validation | scoring |

Ablation 5 of Part I ("baseline plus expanded rules for selected cause classes") is
**promoted from an ablation to a full arm**. It is the hypothesis's most serious adversary
and deserves the same rigour as the treatment.

## System B is built in good faith

Under-building B to flatter C is the same offence as weakening A. Explicitly:

- B is a **serious engineering attempt** to cover the residual deterministically.
- B's author works from dev + validation and **must not inspect the primary test or
  challenge splits** before B is frozen.
- B may use any deterministic technique — additional cause rules, fuzzy matching, candidate
  subset search, wider modelled tolerances. It may **not** call a model.
- B is frozen and version-stamped exactly as A and C are.

**If B wins, that is the finding and it gets reported.**

## Required analyses

### 1. Seen versus unseen
The primary analysis. A / B / C across all six novelty strata (`EVALUATION.md` §29).
The hypothesis lives in `NOVEL_COMBINATION` and `COMPOUND_UNSEEN`.

### 2. Abstention quality
Correct abstention against unnecessary escalation, per system, per stratum
(`EVALUATION.md` §30). Reported as a pair and plotted as a trade-off.

### 3. Complexity comparison
The nine dimensions in `VALIDATION_EXPERIMENT.md` §15. **Maintenance burden — measured
effort to add one new cause class to each system — is the most informative and must not be
skipped.**

### 4. Model-capability diagnostic
The frozen benchmark re-run against a stronger reference model. Diagnostic only; the local
Ollama result remains the preregistered outcome (`EVALUATION.md` §33).

### 5. Retained ablations from Part I
AI without evidence retrieval · AI with a fixed evidence set · AI with unstructured output ·
AI without the verifier (safety stress test only, never a production path).

## Run record

Every run records: system arm · code version · dataset version · novelty-registry hash ·
prompt version · model ID **and digest** · configuration hash · seed · metric schema version.

Ollama tags are mutable; **the digest is the authoritative model version**
(`MODEL_POLICY.md` Part II). A run whose digest is unknown is not reproducible and is not a
preregistered result.
