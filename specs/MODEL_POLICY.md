# Model Policy

## 1. Provider abstraction

The application uses a model gateway interface:

```text
AgentOrchestrator -> ModelGateway -> ProviderAdapter
```

Domain logic must not depend on vendor SDK types.

## 2. Required model configuration

- provider/model ID;
- temperature policy;
- max output tokens;
- request timeout;
- retry limit;
- prompt version;
- policy version;
- tool-call budget.

## 3. Determinism

Where benchmark reproducibility matters, configuration must minimize uncontrolled randomness and record all relevant runtime versions. Exact byte-level determinism is not required across providers unless a test explicitly requires it.

## 4. Failure fallback

Model unavailable, schema-invalid, or policy-invalid output must enter a safe failure path. The fallback cannot silently create a financial resolution.

## 5. Evaluation policy

A model is retained only if its contribution is supported by the preregistered evaluation. Model selection may consider accuracy, cost, latency and safety.

## 6. No provider lock-in in business logic

Switching the model provider must not require rewriting the domain layer, verifier, state machine or persistence.

---

# Part II — Provider decision (2026-09-01)

## 7. Provider: Ollama (local inference)

**Decision (LOCKED by owner):** the project is not hosted, so model inference runs
**locally via Ollama**. Recorded as `CHANGE_CONTROL.md` CC-010; closes `EXPERIMENT_CONSTANTS.md` Q5.

### What this does not change

Nothing in the domain, verifier, state machine or persistence. §1 already requires a
provider-neutral `ModelGateway`, and §6 forbids provider lock-in in business logic.
Ollama becomes one `ProviderAdapter` behind that interface; the agent depends on the
gateway, never on the SDK. Swapping providers later remains a configuration change.

The dependency rule stands: **no model SDK may appear outside `packages/agent`**, and
`scripts/check-deps.ts` enforces it.

### What this does change — and must be stated honestly

**1. Reproducibility requires pinning by digest, not by tag.**
`EVALUATION.md` §18 requires every benchmark run to record the model version. Ollama tags
are mutable — `llama3.1:8b` can resolve to different weights after a later `ollama pull`.
The manifest must therefore record the **model digest** (`ollama show --modelfile` /
the registry digest), not the tag alone. A run whose digest is unknown is not reproducible
and must not be reported as a preregistered result.

**2. Capability is materially lower than a frontier hosted model.**
Locally-runnable models are weaker at exactly the two things this agent needs: strict
structured output conforming to `DISPOSITION_SCHEMA.md`, and disciplined tool selection.
This is an accepted consequence of not hosting, not a defect to hide.

It has a direct evaluation consequence. If the AI treatment fails to clear
`ESRR_MIN_IMPROVEMENT`, the report **must distinguish**:

- the *approach* did not add value over the deterministic baseline; from
- *this model* could not execute the approach.

Reporting a local-model failure as evidence that bounded AI investigation does not work
would be an overclaim in the opposite direction. Where feasible, run the same frozen
benchmark against a stronger model as a **capability ceiling** reference, and report both.
That reference run is diagnostic; the preregistered comparison stays with the pinned
local model.

**3. Determinism.** Set `temperature = 0` and a fixed `seed`. Ollama honours both, which
is a genuine advantage over hosted providers for `X8` reproducibility.

**4. Schema enforcement.** Prefer Ollama's structured-output/JSON-schema mode so the
disposition schema is constrained at generation time rather than only validated after.
Validation at the boundary remains mandatory regardless (`DISPOSITION_SCHEMA.md` §6):
schema-invalid output is a model failure and takes the safe non-resolve path.

### Required configuration

| Setting | Value |
|---|---|
| `MODEL_PROVIDER` | `ollama` |
| `MODEL_BASE_URL` | `http://localhost:11434` (default) |
| `MODEL_ID` | pinned tag, e.g. `llama3.1:8b` |
| `MODEL_DIGEST` | recorded in the run manifest — the authoritative version |
| `MODEL_TEMPERATURE` | `0` |
| `MODEL_SEED` | fixed |

No API key is required, so `MODEL_API_KEY` becomes optional. The D5 rule is unchanged:
the agent runtime still never loads the evaluation credential.

**Not implemented in Phase 3.** The agent, gateway and adapter arrive in Phase 7 per
`BUILD_PLAN.md`.

---

# Part III — Implementation status (2026-09-05)

| Field | Value |
|---|---|
| Provider | Ollama, local inference. The project is not hosted. |
| Model | `qwen2.5:3b-instruct-q4_K_M` |
| Digest | `357c53fb659c5076de1d65ccb0b397446227b71a42be9d1603d46168015c9e4b` |
| Temperature | 0 |
| Output | schema-constrained JSON via Ollama's `format` parameter |

**Pinned by digest.** Ollama tags are mutable; the digest is the identity. `pnpm eval:run`
calls `assertPinnedModel()` before System C and refuses to run on a mismatch, so a silently
re-pulled model produces a loud failure rather than an incomparable number.

**Why a 3B model.** The evaluation host is CPU-only, 15.4 GB RAM, AMD integrated graphics.
Measured warm throughput ~14 tokens/s; a 7B q4 build runs at roughly a third of that, which
would put a 180-case scored run beyond the time available. This is a ceiling on the result,
not on the architecture, and it is reported as such wherever the result appears.

## Failure handling

`MODEL_UNAVAILABLE`, `MODEL_TIMEOUT`, `MODEL_ERROR`, `MODEL_SCHEMA_VIOLATION` each terminate
the investigation and escalate the case, with the failure code recorded on the investigation
row and in the audit trail. The kill switch (`AI_INVESTIGATION_ENABLED=false`) is checked
before any dispatcher is even constructed: with it off there is no code path from a route to
a model, and cases escalate with `MODEL_DISABLED`.
