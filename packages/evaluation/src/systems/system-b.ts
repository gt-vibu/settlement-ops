/**
 * System B - the strong fixed workflow.
 *
 * This is the arm that decides whether the AI earns its place. It uses the SAME typed
 * tools as the agent, in a fixed, documented, hand-written order, with hand-written
 * decision rules. If it matches System C on the unseen strata, the AI contribution is
 * killed (`EXPERIMENT_CONSTANTS.md` kill criterion 6, `EXPERIMENTS.md` Part II).
 *
 * It is therefore written to WIN. Every rule a competent engineer would write after
 * reading the domain is here; nothing is held back to flatter the agent. It gets the same
 * evidence, the same arithmetic and the same terminal verifier.
 *
 * What it cannot do is decide which evidence to gather - it gathers all of it, always, in
 * the same order - and it cannot compose an explanation the rules do not already
 * enumerate. That, and only that, is the difference being measured.
 */

import {
  ROUNDING_TOLERANCE_ABSOLUTE_CAP_MINOR,
  REFUND_NETTING_MAX_CYCLES,
  daysBetween,
  reconcileUnit,
  type CauseCode,
  type ReconciliationUnit,
} from '@settlementops/domain';
import { verify, type Proposal } from '@settlementops/verification';
import type { ToolContext, ToolRegistry } from '@settlementops/tools';

import type { SystemOutcome } from './outcome.js';

/** The fixed order. Documented, deterministic, and identical for every case. */
const WORKFLOW = [
  'get_settlement_breakup',
  'get_fee_tax_lines',
  'calculate_expected_net_amount',
  'get_bank_credit',
  'get_refunds',
  'search_related_adjustments',
  'get_fee_schedule',
  'validate_tax_line_mapping',
] as const;

const abs = (value: bigint): bigint => (value < 0n ? -value : value);

/**
 * Hand-written cause selection.
 *
 * Ordered most-specific first. This is what "more rules would have done just as well"
 * actually looks like when someone writes it out.
 */
const decide = (unit: ReconciliationUnit, varianceMinor: bigint): CauseCode | null => {
  const verdict = reconcileUnit(unit);
  const reasons = new Set(verdict.reasons);

  // An adjustment that could not have affected this settlement is a trap, not evidence.
  const hasImpossibleAdjustment = reasons.has('LIFECYCLE_INCONSISTENT');
  if (hasImpossibleAdjustment) return null;

  // An unallocated adjustment matching the variance means two explanations fit.
  const unallocatedMatch = unit.adjustments.some(
    (a) => a.settlementId === null && abs(a.amount.amountMinor) === abs(varianceMinor),
  );
  if (unallocatedMatch) return null;

  const lateRefund = unit.refunds.some(
    (r) =>
      r.settledAt !== null && daysBetween(r.settledAt, r.createdAt) / 2 > REFUND_NETTING_MAX_CYCLES,
  );
  if (lateRefund) return null;

  if (reasons.has('REFUND_OUTSIDE_NETTING_WINDOW')) return 'REFUND_NETTING';

  // Small, bounded variance is rounding - and only inside the ceiling.
  if (varianceMinor !== 0n && abs(varianceMinor) <= ROUNDING_TOLERANCE_ABSOLUTE_CAP_MINOR) {
    return 'ROUNDING_DRIFT';
  }

  if (reasons.has('MISSING_FEE_RECORD') || reasons.has('UNEXPECTED_FEE_AMOUNT')) return 'MDR_FEE';

  if (
    reasons.has('SPLIT_SETTLEMENT_UNRESOLVED') ||
    reasons.has('BANK_CREDIT_TIMING_OUTSIDE_WINDOW') ||
    reasons.has('MISSING_BANK_CREDIT') ||
    unit.settlements.length > 1
  ) {
    return 'UTR_SPLIT';
  }

  if (reasons.has('SETTLEMENT_TIMING_OUTSIDE_WINDOW')) return 'TIMING_LAG';

  return null;
};

export const runSystemB = async (
  unit: ReconciliationUnit,
  registry: ToolRegistry,
  ctx: ToolContext,
): Promise<SystemOutcome> => {
  const started = Date.now();
  const evidenceRecordIds = new Set<string>([unit.payment.id]);
  let varianceMinor = 0n;
  let toolCallCount = 0;

  // Gather everything, always, in the same order.
  for (const name of WORKFLOW) {
    const result = await registry.invoke(ctx, name, {});
    toolCallCount += 1;
    for (const id of result.recordIds) evidenceRecordIds.add(id);
    if (name === 'calculate_expected_net_amount' && result.ok) {
      varianceMinor = BigInt(String(result.data['variance_minor'] ?? '0'));
    }
  }

  const cause = decide(unit, varianceMinor);
  if (cause === null) {
    return {
      system: 'B',
      proposedCause: null,
      proposedDisposition: 'ESCALATE',
      effectiveDisposition: 'ESCALATE',
      verifierPassed: true,
      verifierFailures: [],
      toolCallCount,
      stepCount: WORKFLOW.length,
      latencyMs: Date.now() - started,
      stopReason: 'NO_RULE_MATCHED',
      rationale: 'no enumerated rule fits the evidence gathered',
      evidenceRecordIds: [...evidenceRecordIds],
    };
  }

  const proposal: Proposal = {
    cause,
    disposition: 'RESOLVE',
    evidenceRecordIds: [...evidenceRecordIds],
    rationale: `fixed workflow rule for ${cause}`,
  };
  const verification = verify(proposal, unit);

  return {
    system: 'B',
    proposedCause: cause,
    proposedDisposition: 'RESOLVE',
    effectiveDisposition: verification.effectiveDisposition,
    verifierPassed: verification.passed,
    verifierFailures: verification.failures,
    toolCallCount,
    stepCount: WORKFLOW.length,
    latencyMs: Date.now() - started,
    stopReason: 'RULE_MATCHED',
    rationale: proposal.rationale,
    evidenceRecordIds: [...evidenceRecordIds],
  };
};
