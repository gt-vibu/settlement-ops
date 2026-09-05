# Cause Taxonomy — SettlementOps

## 1. Purpose

This taxonomy constrains the agent. The agent may propose only causes from this closed set. A cause may be extended only through controlled specification change because changing the taxonomy changes the benchmark and evidence requirements.

## 2. Cause classes

### MDR_FEE
A settlement difference is explained by a valid processor fee deduction.

**AI may infer:** that fee-related records plausibly explain the observed difference and identify the relevant schedule/fee line.

**Verifier must prove:** applicable fee schedule, fee amount, currency, timing/effective period, and arithmetic relationship between gross, fee, tax and observed net.

**Safe disposition:** `RESOLVE` only if deterministic checks pass; otherwise `REQUEST_EVIDENCE` or `ESCALATE`.

### UTR_SPLIT
A settlement appears inconsistent because one payment/order's value is represented across multiple settlement legs or bank references.

**AI may infer:** that multiple records may belong to the same underlying transaction flow.

**Verifier must prove:** identifiers/lineage, amount conservation, lifecycle consistency and absence of contradictory ownership.

**Safe disposition:** `RESOLVE` only after amount and lineage validation.

### REFUND_NETTING
A refund affects the settlement in a later or different settlement window.

**AI may infer:** a refund record is a plausible explanation for part of the settlement delta.

**Verifier must prove:** refund belongs to the correct payment/order, amount matches, timing permits netting in the modeled synthetic settlement window, and no duplicate refund explanation exists.

**Safe disposition:** resolve only after checks pass.

### TIMING_LAG
Records representing the same financial activity arrive in different asynchronous windows.

**AI may infer:** that observed records may be temporally misaligned rather than financially inconsistent.

**Verifier must prove:** permitted timing relationship exists and the amounts reconcile under the known window rules.

**Safe disposition:** often `REQUEST_EVIDENCE` when another window must be observed; `RESOLVE` only when the modelled timing rule is deterministic.

### ROUNDING_DRIFT
A small residual is caused by documented rounding/conversion behavior.

**AI may infer:** that the variance is consistent with known rounding rules.

**Verifier must prove:** the drift lies within the configured bounded tolerance and can be reproduced from source values.

**Safe disposition:** `RESOLVE` only within the deterministic tolerance policy.

### AMBIGUOUS
Two or more explanations remain materially plausible, or no clean explanation is supported.

**AI may infer:** competing hypotheses and exactly what evidence is missing.

**Verifier must prove:** that no safe unique resolution exists under current evidence.

**Safe disposition:** `ESCALATE`; `AMBIGUOUS` can never become `RESOLVE`.

### COMPOUND
A case contains more than one interacting cause class.

**AI may infer:** a bounded combination of causes and component relationships.

**Verifier must prove:** every component's required checks pass and the combination conserves amounts without double counting.

**Safe disposition:** resolve only if every component passes; otherwise escalate or request evidence.

## 3. Generator constraints

The dataset generator must not expose the cause code through an obvious visible proxy. Hidden cause is injected after the hidden financial world exists. Visible records must resemble naturally messy records, not a label encoded in a field.

`LEAKAGE_AUDIT.md` must test every cause for field-level and low-complexity-combination leakage before the final benchmark is frozen.

## 4. Cause-to-evidence contract

Every cause class must define its minimum sufficient evidence set. A model may not claim resolution using a source record it never fetched through the same trace.

## 5. Cause-to-action policy

```text
MDR_FEE       -> RESOLVE | REQUEST_EVIDENCE | ESCALATE
UTR_SPLIT     -> RESOLVE | REQUEST_EVIDENCE | ESCALATE
REFUND_NETTING-> RESOLVE | REQUEST_EVIDENCE | ESCALATE
TIMING_LAG    -> RESOLVE | REQUEST_EVIDENCE | ESCALATE
ROUNDING_DRIFT-> RESOLVE | ESCALATE
AMBIGUOUS     -> ESCALATE
COMPOUND      -> RESOLVE | REQUEST_EVIDENCE | ESCALATE
```
