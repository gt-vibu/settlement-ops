# SettlementOps — Start Here

## 0. Purpose

This directory is the authoritative engineering specification for **SettlementOps**, a Razorpay AI Builder 2026 Track 4 project concept.

The project is intentionally defined as a real, persistent finance-operations application rather than a report generator. It models a merchant payment-to-settlement lifecycle, deterministically closes straightforward records, and routes only unresolved residual cases into a bounded AI investigation and human-approved disposition workflow.

This document is the first file a coding agent must read. It establishes the document hierarchy, non-negotiable boundaries, implementation sequence, and stop conditions.

## 1. Locked product direction

**Track:** AI Finance Controller.

**Product:** SettlementOps — AI Finance Operations Control Center.

**Core intelligence:** Reconciliation Exception Resolver.

**Primary workflow:**

```text
Financial events
    -> normalization
    -> deterministic reconciliation
    -> residual exception
    -> bounded AI investigation
    -> deterministic verification
    -> bounded disposition
    -> human approval
    -> staged action
    -> outcome
    -> audit
```

The AI is not the source of financial truth. The model may propose hypotheses and a bounded disposition, but deterministic services independently recompute financial facts and may override the model output.

## 2. Why this product exists

Payment operations become difficult when the aggregate settlement can be numerically correct while individual records are hard to explain. Examples include fees and taxes, split settlement, refund netting across settlement windows, delayed events, rounding differences, duplicate records, and conflicting evidence. The first-pass reconciliation system should handle obvious cases; the product value is in making the remaining exception queue operationally useful.

## 3. What makes it a product

The backend must support persistent state and user actions, not just a benchmark report. The user can:

- instantiate a controlled scenario;
- inspect a financial lifecycle;
- see an exception become active;
- launch or observe an investigation;
- inspect evidence and hypotheses;
- accept/reject/request-evidence/escalate a proposal;
- see the case state persist after refresh;
- inspect the audit trail;
- inspect evaluation and health metrics.

UI implementation is explicitly out of scope for the coding agent in this phase. Stable backend contracts must support these product surfaces.

## 4. Mandatory safety boundary

The system is a financial decision-support prototype. The MVP does not move real money or mutate a live merchant ledger.

The agent cannot:

- execute payments, refunds, payouts, transfers, or bank operations;
- directly write accounting truth;
- issue irreversible financial instructions;
- access hidden dataset truth;
- call arbitrary SQL, shell, filesystem, HTTP, or code-execution tools;
- override the deterministic verifier.

## 5. Document authority

Use this precedence when documents conflict:

1. `START_HERE.md`
2. `PROJECT_CHARTER.md`
3. `PRD.md`
4. `PRODUCT_SCOPE.md`
5. `PRODUCT_PRINCIPLES.md`
6. `CONTEXT.md`
7. `ARCHITECTURE.md`
8. `SYSTEM_DESIGN.md`
9. `DATA_MODEL.md`
10. `EVENT_MODEL.md`
11. `STATE_MACHINE.md`
12. `AGENT_SPEC.md`
13. `AGENT_POLICY.md`
14. `TOOLS.md`
15. `DISPOSITION_SCHEMA.md`
16. `CAUSE_TAXONOMY.md`
17. `DATASET.md`
18. `BASELINES.md`
19. `VALIDATION_EXPERIMENT.md`
20. `EVALUATION.md`
21. `EXPERIMENTS.md`
22. `SAFETY.md`
23. `SECURITY.md`
24. `AUDIT_TRAIL.md`
25. `OBSERVABILITY.md`
26. `RELIABILITY.md`
27. `API_SPEC.md`
28. `APPROVAL_AND_STAGING.md`
29. `SCENARIO_ENGINE.md`
30. `DEMO_SCENARIOS.md`
31. engineering/control documents thereafter.

If a contradiction affects financial semantics, security, evaluation validity, or architecture, stop the affected implementation path and document it under `CHANGE_CONTROL.md`. Do not silently guess.

## 6. Build order

Do not build the UI.

Implement in this sequence:

1. repository inspection;
2. domain primitives and money model;
3. persistence and migrations;
4. ingestion/normalization;
5. deterministic reconciliation;
6. scenario engine;
7. residual exception state machine;
8. evidence/tool layer;
9. verifier;
10. AI investigation;
11. approval and staging;
12. audit and observability;
13. evaluation harness and leakage audit;
14. API hardening;
15. CI and production-readiness checks.

## 7. Non-negotiable definition of done

A phase is not complete because code exists. It is complete only when its acceptance tests pass, architecture boundaries hold, documentation matches implementation, and no Critical/High security or financial-safety issue remains.

## 8. Source-of-truth rule for Razorpay facts

Public Razorpay material is context, not a specification of private internals. Do not claim an internal capability gap from absence of public documentation. Use public sources to establish relevance, documented products, documented APIs, and explicit buildathon requirements.
