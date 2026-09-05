# Evaluation Report — Exploratory Addendum

**Status: EXPLORATORY. Not a preregistered result. Not comparable to the primary run.**

Run on the **validation split only** — the split that exists for prompt and policy iteration
and is never scored (`EXPERIMENT_CONSTANTS.md` §7). The frozen primary result in
`EVALUATION_REPORT.md` is unchanged and unaffected.

---

## 1. The question

The frozen run produced a specific failure: System C proposed **zero** resolutions across
180 cases, choosing `REQUEST_EVIDENCE` on 107 — including 71 that were provably resolvable —
while the verifier rejected almost nothing.

That is a disposition-selection failure, not obviously a reasoning failure. So: **was the
frozen result a limit of the architecture, or of a prompt that never told the model what
proof looks like?**

Prompt `v2` (`AGENT_PROMPT_VARIANT=v2`, `packages/agent/src/prompts.ts`) states what evidence
constitutes proof for each cause — the same conditions the verifier already checks
deterministically. It does not instruct the model to resolve more, and it changes no safety
rule. `v1` is kept verbatim so the frozen run stays reproducible.

## 2. Result

| System | Split | n | ESRR | URR | Wrong cause | Abstained | Tools | Latency |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| B fixed workflow | validation | 60 | **65.0%** | 0.0% | 0.0% | 35.0% | 8.0 | <1 ms |
| C agent, prompt v2 | validation | 60 | **16.7%** | 0.0% | 11.7% | 71.7% | 2.0 | 12.5 s |

For reference, System C with prompt `v1` scored **0.0%** ESRR on the scored splits.

## 3. What it shows

**The frozen failure was partly prompt-shaped.** With `v2` the agent proposed 47 resolutions
where `v1` proposed none, and `PROPOSAL_MADE` became the stop reason on all 60 cases — no
loop-detection terminations at all.

**It does not change the verdict.** Even unblocked, the agent reaches 16.7% against the rule
system's 65.0% on the same cases. The AI resolution claim stays killed. A prompt fix moved
System C from *useless* to *substantially worse than rules*.

**The verifier did real work, and this is the most important line in this document.**

| Verifier outcome on C's resolution attempts | n |
|---|---:|
| accepted | 17 |
| `ROUNDING_EXCEEDS_CAP` — rounding claimed beyond the ₹1.00 ceiling | 18 |
| `CAUSE_NOT_SUPPORTED_BY_EVIDENCE` | 6 |
| `REFUND_OUTSIDE_WINDOW` | 3 |
| `ARITHMETIC_UNSUPPORTED` | 1 |

**28 of 45 resolution attempts were rejected and downgraded to escalation.** Without the
verifier, this run's unsupported-resolution rate would have been catastrophic instead of
zero. The single most common rejection is the model claiming "rounding drift" for a variance
far above the cap rounding may ever explain — exactly the laundering channel the absolute
cap exists to close.

That is the clearest evidence in this project that the terminal deterministic gate is
load-bearing rather than decorative.

## 4. A weakness the metric does not punish enough

Seven cases (11.7%) were `WRONG_CAUSE_RESOLVE`: the case was genuinely resolvable, the
proposal passed the verifier, but the cause named was not one of the true causes.

Our `URR` counts only resolving an **unresolvable** case, so these do not appear in the
safety number. In an operational setting, closing a case with the wrong explanation is not
harmless — the money moves for a stated reason, and the reason is wrong. This is recorded as
a gap in the metric definition, not smoothed over.

## 5. What would have to change for a different answer

Stated as hypotheses, none of them tested here:

1. **A larger model.** The measured failure is judgement about sufficiency of evidence, which
   is where a 3B quantised model is weakest. A 7B–14B model at the same temperature is the
   obvious next experiment; it needs a GPU or considerably more time.
2. **Cause-specific evidence checklists surfaced as tool output** rather than prompt text,
   so the model reads what it has rather than recalling what it needs.
3. **A harder dataset for System B.** The rule system's 65% on validation partly reflects
   that the generated causes are individually clean. Real settlement data is messier, and
   the gap might narrow — but that is a claim about data we do not have.

Any of these would require a new experiment version and a fresh freeze. None of them may be
applied to the primary split retrospectively.
