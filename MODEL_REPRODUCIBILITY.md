# Model Reproducibility — freezing the Ollama treatment environment

**Date:** 2026-09-01
**Status:** `SPECIFICATION COMPLETE — MODEL NOT YET PINNED`. Blocks treatment runs.
**Applies to:** System C (AI investigation agent) only. Systems A and B call no model.

---

## 1. Why this document exists

`EVALUATION.md` §18 requires every benchmark run to be reproducible from a recorded
manifest. For a hosted provider that mostly means recording a model ID. For **Ollama it is
not sufficient**, because of one property that quietly breaks reproducibility:

> **Ollama tags are mutable.** `llama3.1:8b` today and `llama3.1:8b` after a later
> `ollama pull` can be different weights. The tag is a pointer, not a version.

A benchmark run identified only by tag is **not reproducible** and must not be reported as
a preregistered result. The digest is the version.

---

## 2. The frozen treatment environment

Every field below is recorded in the run manifest. A run missing any of them, or
mismatching any of them, is rejected.

### 2.1 Model identity — the reproducibility-critical block

| Field | Example | Notes |
|---|---|---|
| `model_name` | `llama3.1:8b` | Human-readable. **Not authoritative** |
| **`model_digest`** | `sha256:a1b2c3…` | **AUTHORITATIVE VERSION.** From `ollama show --modelfile` / the local manifest |
| `model_parameter_count` | `8B` | Recorded for interpretation |
| `quantization` | `Q4_K_M` | **Materially affects output.** Same weights at different quantization are a different system |
| `ollama_version` | `0.x.y` | Runtime behaviour changes between versions |

> Quantization is easy to forget and it matters: a Q4 and a Q8 build of identical weights
> can differ on exactly the structured-output and tool-selection behaviour this experiment
> measures.

### 2.2 Agent configuration

| Field | Frozen value | Source |
|---|---|---|
| `temperature` | `0` | `EXPERIMENT_CONSTANTS.md` A4 |
| `seed` | fixed integer | Ollama honours it; required for X8 reproducibility |
| `max_output_tokens` | `4096` | A7 |
| `request_timeout_seconds` | `60` | A5 |
| `max_retries` | `2` | A6 |
| `max_tool_calls` | `8` | A1 |
| `max_investigation_steps` | `8` | A2 |
| `structured_output_mode` | **enabled** | §3 below |

### 2.3 Contract versions

| Field | Notes |
|---|---|
| `prompt_version` | Semantic version from `PROMPTS.md`. Any change altering disposition behaviour requires a new experiment version |
| `tool_policy_version` | Tool allowlist + budget + result contract |
| `disposition_schema_version` | The `DISPOSITION_SCHEMA.md` contract enforced at the boundary |
| `policy_version` | `packages/domain/src/policy` — the frozen financial constants |
| `metric_schema_version` | Shape of the emitted metrics |

### 2.4 Code and data

| Field | Notes |
|---|---|
| `git_commit` | `EVALUATION.md` §18 |
| `dataset_version` + `dataset_manifest_hash` | |
| `novelty_registry_hash` | The frozen combination registry (`NOVELTY_ALLOCATION_REVIEW.md` §4) |
| `config_hash` | SHA-256 over the approved `EXPERIMENT_CONSTANTS.md` state |

---

## 3. Structured output is mandatory, and does not replace validation

Ollama's JSON-schema / structured-output mode **must** be enabled, with the schema derived
from `DISPOSITION_SCHEMA.md`. Constraining generation is materially more reliable than
prompting for JSON and hoping — which is exactly where smaller local models fail most often.

**It does not remove the validation requirement.** `DISPOSITION_SCHEMA.md` §6 requires a
real validator at the application boundary regardless. Constrained generation can still
produce a schema-valid object that is semantically invalid — an unknown cause code, a claim
citing an evidence ID never fetched, a disposition the cause policy forbids.

```
constrained generation   reduces malformed output
schema validation        rejects what still gets through      ← mandatory
semantic validation      cause policy, evidence provenance    ← mandatory
deterministic verifier   authoritative, terminal, single-pass ← mandatory
```

A schema-invalid response is a **model failure** and takes the safe non-resolve path. It is
never an opportunity to coerce text into a financial action.

---

## 4. Rejection rules

A run is **rejected as non-reproducible** — not merely flagged — if:

1. `model_digest` is absent, or differs from the frozen digest;
2. `ollama_version` or `quantization` differs from the frozen environment;
3. any contract version in §2.3 differs;
4. `config_hash` does not match the approved constants;
5. `temperature ≠ 0` or the seed is absent;
6. `structured_output_mode` was disabled.

A rejected run may be reported as an exploratory observation, **clearly labelled**, and
never as the preregistered result.

---

## 5. The stronger-model diagnostic

`EVALUATION.md` §33 requires a capability-ceiling reference run, because a null result
would otherwise be uninterpretable — *did the approach fail, or did this model fail to
execute it?*

| | Preregistered result | Capability diagnostic |
|---|---|---|
| Model | Frozen local Ollama model | Stronger reference model |
| Role | **The reported outcome** | Diagnostic only |
| Appears in the headline | Yes | **Never** |
| Same dataset / prompts / tools / verifier | Yes | Yes — only the model differs |

**Interpretation rules, fixed in advance:**

- Local ≈ reference → model capability is not the limiting factor; the result speaks to the
  **approach**.
- Local ≪ reference → the approach may be sound while this model cannot execute it. The
  report must state: *"the evaluation does not distinguish an insufficient approach from
  insufficient model capability."*
- Both poor → evidence against the approach itself, which is a legitimate finding.

**The reference run may not be promoted to the primary result under any circumstance.**
Doing so would substitute a system nobody could run for the system actually built.

---

## 6. Capture procedure

```bash
# 1. Pull once, then never re-pull inside an experiment version
ollama pull <model>:<tag>

# 2. Capture the authoritative version
ollama show <model>:<tag> --modelfile     # digest + quantization
ollama --version                          # runtime

# 3. Record all §2 fields in the run manifest
# 4. Verify the digest at the START of every scored run; abort on mismatch
```

**Re-pulling a tag inside an experiment version invalidates that version.** If a model must
be updated, that is a new experiment version with a new dataset freeze — not a patch.

---

## 7. Not yet decided — blocks treatment runs

| # | Decision |
|---|---|
| 1 | Which Ollama model — name, tag, **and quantization** |
| 2 | Its digest, captured and pinned |
| 3 | The fixed seed |
| 4 | Which stronger reference model, and how it is accessed |
| 5 | Whether the chosen model supports structured-output mode adequately — **verify before freezing**, since §3 depends on it |

> Item 5 deserves a trial before committing. If the chosen model cannot hold to the
> disposition schema under constrained generation, that is better discovered now than after
> the dataset is frozen.

**None of these blocks dataset generation** — Systems A and B call no model. They block
System C runs only.
