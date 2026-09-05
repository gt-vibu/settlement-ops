# Implementation Runbook

## Purpose

This runbook turns the specification package into a practical sequence for a coding agent.

## Before first code change

Read `START_HERE.md`, `AGENTS.md`, `PRD.md`, `ARCHITECTURE.md`, `DATA_MODEL.md`, `STATE_MACHINE.md`, `AGENT_SPEC.md`, `TOOLS.md`, `DISPOSITION_SCHEMA.md`, `DATASET.md`, `EVALUATION.md`, `SECURITY.md`, and `TESTING.md`.

Inspect the repository and create `IMPLEMENTATION_READINESS.md`.

## Phase 1 — Core financial domain

Build:
- money value object;
- currency type;
- source lineage;
- lifecycle records;
- reconciliation case model.

Verify:
- arithmetic tests;
- uniqueness;
- tenant scoping;
- invalid state tests.

## Phase 2 — Persistence

Build migrations and repositories.

Verify:
- fresh DB;
- rollback/forward migration plan;
- constraints;
- idempotency.

## Phase 3 — Reconciliation

Build deterministic matcher.

Verify:
- easy cases resolve;
- hard cases become residuals;
- no AI involved.

## Phase 4 — Scenario engine

Build scenario catalog and instantiation endpoint.

Verify:
- durable case creation;
- same domain pipeline as evaluation;
- repeatable seed behavior;
- isolated scenario instances.

## Phase 5 — Evidence tools

Build allowlisted tools.

Verify:
- tenant authorization;
- typed request/response;
- bounded output;
- tool audit.

## Phase 6 — Verifier

Build deterministic candidate checks.

Verify:
- model-provided financial deltas ignored as authority;
- failed check blocks RESOLVE;
- evidence IDs must exist.

## Phase 7 — AI agent

Build model gateway and investigation loop.

Verify:
- schema enforcement;
- prompt injection handling;
- tool budget;
- loop stop;
- safe fallback.

## Phase 8 — Workflow

Build approval, staging and outcome transitions.

Verify:
- optimistic locking;
- duplicate approval protection;
- atomic staging;
- audit events.

## Phase 9 — Evaluation

Build dataset generation, leakage audit, baseline/treatment comparison and challenge evaluation.

Verify:
- hidden truth isolation;
- no leakage;
- reproducibility;
- fixed metrics.

## Phase 10 — Hardening

Run security, dependency, performance and production checks.

## Stop rule

Do not jump ahead if the current phase has a failed Critical/High gate that affects later correctness.
