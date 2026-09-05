/**
 * The deterministic reconciliation baseline.
 *
 * BASELINE INTEGRITY (`BASELINES.md`, `VALIDATION_EXPERIMENT.md` kill criterion 5)
 *
 * This baseline is deliberately strong. It is written before any agent exists, and it
 * must stay strong: weakening it later to make the AI treatment look better would
 * invalidate the entire experiment. It uses every deterministic signal available in the
 * domain model - schedule arithmetic, amount conservation, lifecycle order, timing
 * windows, duplicate detection - and escalates only what it genuinely cannot close.
 *
 * It has no access to hidden truth, no model, no network and no clock of its own. Given
 * the same unit it returns the same verdict, which is what makes it independently
 * testable and what lets the future verifier reuse the same arithmetic.
 */

import { money, subtract, type Money } from '../money/money.js';
import type { AmountBreakdown } from '../money/amount-breakdown.js';
import { POLICY_VERSION } from '../policy/policy-version.js';
import { withinRoundingTolerance } from '../policy/tolerances.js';
import { expectedNetFromRecords } from './expected-net.js';
import type { ResidualReason } from './reason-codes.js';
import {
  checkAdjustmentTiming,
  checkBankCredit,
  checkCurrencyConsistency,
  checkFeeAgainstSchedule,
  checkLifecycleConsistency,
  checkNoDuplicates,
  checkRefundNettingWindow,
  checkSettlementPresence,
  checkSettlementTiming,
  settledTotalFor,
} from './checks.js';
import {
  fail,
  pass,
  type ReconciliationCheck,
  type ReconciliationUnit,
  type ReconciliationVerdict,
} from './unit.js';

/** Expected net for the unit, from OBSERVED records only. No rate is assumed. */
const breakdownFor = (unit: ReconciliationUnit): AmountBreakdown | null => {
  const result = expectedNetFromRecords({
    gross: unit.payment.amount,
    fees: unit.fees.map((f) => f.amount),
    taxes: unit.taxes.map((t) => t.amount),
    refunds: unit.refunds.map((r) => r.amount),
    adjustments: unit.adjustments.map((a) => a.amount),
  });
  return result.ok ? result.value : null;
};

/**
 * Amount conservation: does what was actually settled for this payment equal what the
 * observed records say it should be?
 *
 * This is the single most important check in the baseline, and it is what makes split
 * settlement closable: the lines are summed across every settlement leg, so a payment
 * split across two legs reconciles as long as the total conserves value.
 */
const checkAmountConservation = (
  unit: ReconciliationUnit,
  breakdown: AmountBreakdown | null,
): { check: ReconciliationCheck; discrepancy: Money } => {
  const currency = unit.payment.amount.currency;
  const zeroMoney = money(0n, currency);

  if (breakdown === null) {
    return {
      check: fail('amount_conservation', 'CURRENCY_INCONSISTENT', {
        detail: 'expected net could not be computed',
        sourceRecordIds: [unit.payment.id],
      }),
      discrepancy: zeroMoney,
    };
  }

  const lines = unit.settlementLines.filter((l) => l.paymentId === unit.payment.paymentId);
  if (lines.length === 0) {
    return {
      check: fail('amount_conservation', 'NO_SETTLEMENT_FOUND', {
        sourceRecordIds: [unit.payment.id],
      }),
      discrepancy: money(breakdown.expectedNetMinor, currency),
    };
  }

  const settled = settledTotalFor(unit);
  const expected = money(breakdown.expectedNetMinor, currency);
  const delta = subtract(expected, settled);
  if (!delta.ok) {
    return {
      check: fail('amount_conservation', 'CURRENCY_INCONSISTENT', {
        sourceRecordIds: [unit.payment.id],
      }),
      discrepancy: zeroMoney,
    };
  }

  const discrepancy = delta.value;
  const distinctSettlements = new Set(lines.map((l) => l.settlementId)).size;
  const isSplit = distinctSettlements > 1;

  if (withinRoundingTolerance(discrepancy.amountMinor, lines.length)) {
    return {
      check: pass(
        'amount_conservation',
        lines.map((l) => l.id),
        isSplit ? `conserved across ${distinctSettlements} settlement legs` : null,
      ),
      discrepancy,
    };
  }

  const reason: ResidualReason = isSplit ? 'SPLIT_SETTLEMENT_UNRESOLVED' : 'NET_AMOUNT_MISMATCH';
  return {
    check: fail('amount_conservation', reason, {
      expected: expected.amountMinor.toString(),
      observed: settled.amountMinor.toString(),
      detail: `variance ${discrepancy.amountMinor.toString()} minor units`,
      sourceRecordIds: lines.map((l) => l.id),
    }),
    discrepancy,
  };
};

/**
 * Reconcile one unit.
 *
 * Fails closed: any failed check produces an EXCEPTION. The baseline never closes a case
 * it could not fully substantiate, because an incorrectly closed financial record is
 * worse than one more item in the operator's queue.
 */
export const reconcileUnit = (unit: ReconciliationUnit): ReconciliationVerdict => {
  const breakdown = breakdownFor(unit);
  const conservation = checkAmountConservation(unit, breakdown);

  const checks: readonly ReconciliationCheck[] = [
    checkCurrencyConsistency(unit),
    checkLifecycleConsistency(unit),
    checkNoDuplicates(unit),
    checkFeeAgainstSchedule(unit),
    checkSettlementPresence(unit),
    conservation.check,
    checkSettlementTiming(unit),
    checkRefundNettingWindow(unit),
    checkAdjustmentTiming(unit),
    checkBankCredit(unit),
  ];

  const failures = checks.filter((c) => c.status === 'FAIL');
  const reasons = [...new Set(failures.flatMap((c) => (c.reason === null ? [] : [c.reason])))];

  const evidenceRecordIds = [
    ...new Set([unit.payment.id, ...checks.flatMap((c) => c.sourceRecordIds)]),
  ];

  return {
    outcome: failures.length === 0 ? 'RECONCILED' : 'EXCEPTION',
    reasons,
    discrepancy: conservation.discrepancy,
    breakdown,
    checks,
    evidenceRecordIds,
    policyVersion: POLICY_VERSION,
  };
};
