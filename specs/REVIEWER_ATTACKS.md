# Reviewer Attacks and Defenses

## “Isn't Razorpay already doing reconciliation?”

Answer: The product is not positioned as replacement reconciliation. The first pass is explicitly deterministic. The target is the operational resolution layer for the residual and the associated evidence/approval workflow.

## “Why not just add more rules?”

Answer: The evaluation includes a strong deterministic baseline and a kill criterion that removes AI if a modest rule expansion performs equivalently.

## “Why does AI belong here?”

Answer: The proposed contribution is semantic interpretation across multiple heterogeneous records and deciding what explanation is supported, while deterministic checks remain authoritative.

## “Isn't this just RAG?”

Answer: Retrieval supplies evidence, but the product's decision contract requires hypothesis comparison, evidence mapping, constrained disposition and deterministic verification. Retrieval alone is insufficient.

## “What if the AI is wrong?”

Answer: The system is designed for that. A failed required verifier check overrides the model proposal; ambiguous cases escalate; human approval gates staging.

## “Your data is synthetic.”

Answer: Yes. We explicitly claim a synthetic evaluation only. The benchmark's role is to test system behavior under controlled, reproducible conditions, not to claim production impact.

## “Why modular monolith?”

Answer: The domain is bounded and transactionally cohesive. A modular monolith gives clear boundaries without adding network failure modes that do not help this MVP. Worker isolation handles long-running work.

## “What happens under concurrency?”

Answer: Case versions plus database constraints prevent stale approvals and duplicate staging.

## “Why can't the AI post the ledger?”

Answer: Financial mutation is deliberately outside the AI trust boundary. The AI proposes; deterministic services validate; the human approves; staging is durable but not a live mutation in the MVP.


---

# Part II — Attacks added by the v2.0.0 experimental redesign

## "Isn't this just an increasingly large rules engine?"

**The strongest objection to the project, and the reason System B exists.**

Answer: we built that rules engine ourselves and put it in the experiment. System B is a
good-faith attempt to extend the deterministic rules to cover the residual, developed from
the same dev and validation splits available to the agent, frozen before scoring, and
reported whatever it shows.

We then compare on cause combinations that appear in **no** build split. A rule system
needs its cases enumerated in advance; the question is what happens when the combination
was never enumerated. That is an experimental question with a measured answer, not a
rhetorical one.

And the kill criterion is explicit: if System B matches the agent on unseen combinations at
comparable complexity and safety, **the AI claim is not supported** and we report that.

## "Your AI only beat the baseline by a couple of points."

On seen combinations, that is the expected result and we say so in advance. Rules are
excellent where they have been enumerated. If the agent had won everywhere, that would be
evidence our baseline was weak — a worse outcome for the project.

The claim is located in the unseen strata, and it is reported per stratum rather than as a
headline number.

## "How do you know the cases were genuinely unseen?"

Novelty is assigned by the generator from its own combination registry **before** any
system runs, stored as hidden truth in a separate database the application cannot reach,
and probed for leakage before the benchmark is frozen. The challenge split is constructed
to contain combinations present in no other split.

## "Isn't abstention just the AI giving up?"

Abstention is measured on both sides. Correct abstention on genuinely ambiguous cases is
useful; unnecessary escalation on resolvable ones is not. We report the pair, so a system
cannot buy a safety score with reluctance. A system that escalates everything scores
perfectly on one half and fails the other.

## "You are running a small local model. Isn't that a weak result?"

Possibly, and we say so rather than hiding it. Inference runs on Ollama because the project
is not hosted, and local models are materially weaker at structured output and tool
selection.

So the frozen benchmark is additionally run against a stronger reference model as a
**capability ceiling diagnostic**. If the local model underperforms, the report states that
the evaluation does not distinguish an insufficient approach from insufficient model
capability. The local result remains the preregistered one; the reference run is never
promoted to the headline.

## "You changed the experiment design partway through."

Yes — before generating the dataset and before running any treatment, and it is recorded in
`CHANGE_CONTROL.md` CC-011 with the reasoning.

The change made the hypothesis **harder** to satisfy, not easier: it added a third
competing system built specifically to defeat the AI claim, and it introduced strata where
rules are expected to win. Nothing was scored before or after the change, so no comparison
was invalidated.
