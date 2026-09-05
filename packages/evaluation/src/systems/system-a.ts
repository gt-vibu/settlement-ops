/**
 * System A - the deterministic baseline.
 *
 * It does NOT get a new implementation for the benchmark. It runs the same `reconcileUnit`
 * the product ships, and this file only translates its verdict into the disposition
 * vocabulary the scorer speaks.
 *
 * BASELINE INTEGRITY: System A must not be weakened to make the AI look better
 * (`VALIDATION_EXPERIMENT.md` kill criterion 5). It is therefore given every deterministic
 * signal the domain has, and where a residual reason maps unambiguously onto a cause, it
 * is allowed to name that cause and resolve - through the SAME verifier the AI must pass.
 * A baseline that was forbidden to answer would be a straw man.
 */

import {
  reconcileUnit,
  type CauseCode,
  type ReconciliationUnit,
  type ResidualReason,
} from '@settlementops/domain';
import { verify, type Proposal } from '@settlementops/verification';

import type { SystemOutcome } from './outcome.js';

/**
 * Reason codes mapped to the cause each one unambiguously implies.
 *
 * This is the deterministic system's whole reasoning capability: a lookup table. It is
 * strong exactly where the enumerated rules cover the situation, and silent where they do
 * not - which is the property the experiment is trying to measure.
 */
const REASON_TO_CAUSE: Partial<Record<ResidualReason, CauseCode>> = {
  MISSING_FEE_RECORD: 'MDR_FEE',
  UNEXPECTED_FEE_AMOUNT: 'MDR_FEE',
  SETTLEMENT_TIMING_OUTSIDE_WINDOW: 'TIMING_LAG',
  BANK_CREDIT_TIMING_OUTSIDE_WINDOW: 'UTR_SPLIT',
  SPLIT_SETTLEMENT_UNRESOLVED: 'UTR_SPLIT',
  REFUND_OUTSIDE_NETTING_WINDOW: 'REFUND_NETTING',
};

export const runSystemA = (unit: ReconciliationUnit): SystemOutcome => {
  const started = Date.now();
  const verdict = reconcileUnit(unit);

  if (verdict.outcome === 'RECONCILED') {
    return {
      system: 'A',
      proposedCause: null,
      proposedDisposition: 'RESOLVE',
      effectiveDisposition: 'RESOLVE',
      verifierPassed: true,
      verifierFailures: [],
      toolCallCount: 0,
      stepCount: 1,
      latencyMs: Date.now() - started,
      stopReason: 'RECONCILED_DETERMINISTICALLY',
      rationale: 'no residual: every deterministic check passed',
      evidenceRecordIds: verdict.evidenceRecordIds,
    };
  }

  // Exactly one reason, and that reason maps to exactly one cause: the enumerated rule
  // applies and the baseline may claim it. Anything else is outside its coverage.
  const causes = [...new Set(verdict.reasons.map((r) => REASON_TO_CAUSE[r]).filter(Boolean))];
  const singleCause = verdict.reasons.length === 1 && causes.length === 1 ? causes[0] : undefined;

  if (singleCause === undefined) {
    return {
      system: 'A',
      proposedCause: null,
      proposedDisposition: 'ESCALATE',
      effectiveDisposition: 'ESCALATE',
      verifierPassed: true,
      verifierFailures: [],
      toolCallCount: 0,
      stepCount: 1,
      latencyMs: Date.now() - started,
      stopReason:
        verdict.reasons.length > 1 ? 'MULTIPLE_REASONS_NO_SINGLE_RULE' : 'NO_ENUMERATED_RULE',
      rationale: `deterministic reasons: ${verdict.reasons.join(', ')}`,
      evidenceRecordIds: verdict.evidenceRecordIds,
    };
  }

  const proposal: Proposal = {
    cause: singleCause,
    disposition: 'RESOLVE',
    evidenceRecordIds: verdict.evidenceRecordIds,
    rationale: `enumerated rule for ${verdict.reasons[0] ?? ''}`,
  };
  // The same terminal gate the AI must pass. No system resolves without it.
  const verification = verify(proposal, unit);

  return {
    system: 'A',
    proposedCause: singleCause,
    proposedDisposition: 'RESOLVE',
    effectiveDisposition: verification.effectiveDisposition,
    verifierPassed: verification.passed,
    verifierFailures: verification.failures,
    toolCallCount: 0,
    stepCount: 1,
    latencyMs: Date.now() - started,
    stopReason: 'ENUMERATED_RULE_APPLIED',
    rationale: proposal.rationale,
    evidenceRecordIds: verdict.evidenceRecordIds,
  };
};
