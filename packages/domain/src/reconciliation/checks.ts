/**
 * Individual deterministic checks.
 *
 * Each is pure, independently testable, and names the source records it consulted so a
 * reviewer can reconstruct the decision. A NOT_RUN check is never treated as a pass -
 * that rule matters more later, when the verifier reuses this vocabulary.
 */

import { money, subtract, sum, zero, type Money } from '../money/money.js';
import {
  SETTLEMENT_DATE_MATCH_TOLERANCE_DAYS,
  withinAmountMatchTolerance,
  withinRoundingTolerance,
} from '../policy/tolerances.js';
import {
  REFUND_NETTING_MAX_CYCLES,
  adjustmentCanExplainSettlement,
  bankCreditWithinExpectedLag,
  daysBetween,
  expectedSettlementDate,
} from '../policy/settlement-cycle.js';
import { scheduledFeeFor } from './expected-net.js';
import { fail, pass, type ReconciliationCheck, type ReconciliationUnit } from './unit.js';

const ids = (records: readonly { id: string }[]): string[] => records.map((r) => r.id);

export const checkCurrencyConsistency = (unit: ReconciliationUnit): ReconciliationCheck => {
  const currency = unit.payment.amount.currency;
  const all: Money[] = [
    ...unit.fees.map((f) => f.amount),
    ...unit.taxes.map((t) => t.amount),
    ...unit.refunds.map((r) => r.amount),
    ...unit.adjustments.map((a) => a.amount),
    ...unit.settlementLines.map((l) => l.amount),
    ...unit.bankCredits.map((b) => b.amount),
  ];
  const mismatch = all.find((m) => m.currency !== currency);
  return mismatch === undefined
    ? pass('currency_consistency', [unit.payment.id])
    : fail('currency_consistency', 'CURRENCY_INCONSISTENT', {
        expected: currency,
        observed: mismatch.currency,
      });
};

export const checkLifecycleConsistency = (unit: ReconciliationUnit): ReconciliationCheck => {
  const p = unit.payment;
  if (p.status === 'CAPTURED' && p.capturedAt === null) {
    return fail('lifecycle_consistency', 'LIFECYCLE_INCONSISTENT', {
      detail: 'payment is CAPTURED but has no capture timestamp',
      sourceRecordIds: [p.id],
    });
  }
  if (p.capturedAt !== null && p.authorizedAt !== null && p.capturedAt < p.authorizedAt) {
    return fail('lifecycle_consistency', 'LIFECYCLE_INCONSISTENT', {
      detail: 'capture precedes authorization',
      sourceRecordIds: [p.id],
    });
  }
  const refundTotal = sum(unit.refunds.map((r) => r.amount));
  if (refundTotal.ok && refundTotal.value.amountMinor > p.amount.amountMinor) {
    return fail('lifecycle_consistency', 'LIFECYCLE_INCONSISTENT', {
      expected: `<= ${p.amount.amountMinor}`,
      observed: refundTotal.value.amountMinor.toString(),
      detail: 'refunds exceed the captured payment amount',
      sourceRecordIds: ids(unit.refunds),
    });
  }
  return pass('lifecycle_consistency', [p.id]);
};

export const checkNoDuplicates = (unit: ReconciliationUnit): ReconciliationCheck =>
  unit.duplicates.length === 0
    ? pass('duplicate_detection', [unit.payment.id])
    : fail('duplicate_detection', 'DUPLICATE_SOURCE_RECORD', {
        detail: unit.duplicates.map((d) => `${d.detection}:${d.key}`).join(', '),
        sourceRecordIds: unit.duplicates.flatMap((d) => d.ids),
      });

/**
 * The fee the published schedule says should apply, against what was actually recorded.
 *
 * A missing fee record is reported as missing rather than silently substituted with the
 * scheduled amount. The system never invents a financial record no source reports.
 */
export const checkFeeAgainstSchedule = (unit: ReconciliationUnit): ReconciliationCheck => {
  const p = unit.payment;
  const at = p.capturedAt ?? p.authorizedAt;
  if (at === null) {
    return fail('fee_matches_schedule', 'LIFECYCLE_INCONSISTENT', {
      detail: 'no capture or authorization time to select a fee schedule',
      sourceRecordIds: [p.id],
    });
  }
  const scheduled = scheduledFeeFor(p.amount, p.paymentMethod, at);
  if (scheduled === null) {
    return fail('fee_matches_schedule', 'MISSING_FEE_RECORD', {
      detail: 'no fee schedule in force at the payment date',
      sourceRecordIds: [p.id],
    });
  }

  const observedFee = sum(unit.fees.map((f) => f.amount));
  const feeTotal = observedFee.ok ? observedFee.value : zero(p.amount.currency);

  if (unit.fees.length === 0 && scheduled.fee.amountMinor !== 0n) {
    return fail('fee_matches_schedule', 'MISSING_FEE_RECORD', {
      expected: scheduled.fee.amountMinor.toString(),
      observed: '0',
      detail: `schedule ${scheduled.scheduleId} expects a fee but no fee record exists`,
      sourceRecordIds: [p.id],
    });
  }

  const delta = subtract(feeTotal, scheduled.fee);
  if (!delta.ok) {
    return fail('fee_matches_schedule', 'CURRENCY_INCONSISTENT', {
      sourceRecordIds: ids(unit.fees),
    });
  }
  if (!withinRoundingTolerance(delta.value.amountMinor, Math.max(1, unit.fees.length))) {
    return fail('fee_matches_schedule', 'UNEXPECTED_FEE_AMOUNT', {
      expected: scheduled.fee.amountMinor.toString(),
      observed: feeTotal.amountMinor.toString(),
      detail: `against schedule ${scheduled.scheduleId}`,
      sourceRecordIds: ids(unit.fees),
    });
  }
  return pass('fee_matches_schedule', ids(unit.fees), `schedule ${scheduled.scheduleId}`);
};

export const checkSettlementPresence = (unit: ReconciliationUnit): ReconciliationCheck => {
  const lines = unit.settlementLines.filter((l) => l.paymentId === unit.payment.paymentId);
  if (lines.length === 0) {
    return fail('settlement_present', 'NO_SETTLEMENT_FOUND', {
      detail: 'no settlement line references this payment',
      sourceRecordIds: [unit.payment.id],
    });
  }
  const distinctSettlements = new Set(lines.map((l) => l.settlementId));
  if (distinctSettlements.size > 1) {
    // Split settlement is legitimate, but the baseline must prove conservation before
    // closing it. Reported so the split check can adjudicate.
    return pass(
      'settlement_present',
      ids(lines),
      `split across ${distinctSettlements.size} settlements`,
    );
  }
  return pass('settlement_present', ids(lines));
};

export const checkSettlementTiming = (unit: ReconciliationUnit): ReconciliationCheck => {
  const p = unit.payment;
  if (p.capturedAt === null)
    return pass('settlement_timing', [p.id], 'no capture time; not applicable');
  const settlements = unit.settlements;
  if (settlements.length === 0) {
    return fail('settlement_timing', 'NO_SETTLEMENT_FOUND', { sourceRecordIds: [p.id] });
  }
  const expected = expectedSettlementDate(p.capturedAt);
  const outside = settlements.filter(
    (s) => daysBetween(s.settlementAt, expected) > SETTLEMENT_DATE_MATCH_TOLERANCE_DAYS,
  );
  return outside.length === 0
    ? pass('settlement_timing', ids(settlements))
    : fail('settlement_timing', 'SETTLEMENT_TIMING_OUTSIDE_WINDOW', {
        expected: expected.toISOString(),
        observed: outside.map((s) => s.settlementAt.toISOString()).join(', '),
        sourceRecordIds: ids(outside),
      });
};

export const checkRefundNettingWindow = (unit: ReconciliationUnit): ReconciliationCheck => {
  const late = unit.refunds.filter((r) => {
    if (r.settledAt === null) return false;
    const cycles = daysBetween(r.settledAt, r.createdAt) / 2;
    return cycles > REFUND_NETTING_MAX_CYCLES;
  });
  return late.length === 0
    ? pass('refund_netting_window', ids(unit.refunds))
    : fail('refund_netting_window', 'REFUND_OUTSIDE_NETTING_WINDOW', {
        detail: `${late.length} refund(s) settled beyond ${REFUND_NETTING_MAX_CYCLES} cycles`,
        sourceRecordIds: ids(late),
      });
};

export const checkBankCredit = (unit: ReconciliationUnit): ReconciliationCheck => {
  const settlements = unit.settlements.filter((s) => s.utr !== null);
  if (settlements.length === 0) {
    return pass('bank_credit', [], 'no settlement UTR to match; not applicable');
  }
  const credited: string[] = [];
  for (const settlement of settlements) {
    const match = unit.bankCredits.find((b) => b.utr === settlement.utr);
    if (match === undefined) {
      return fail('bank_credit', 'MISSING_BANK_CREDIT', {
        expected: `credit for UTR ${settlement.utr ?? ''}`,
        observed: 'none',
        sourceRecordIds: [settlement.id],
      });
    }
    // Exact agreement required: this is outside the rounding path, so the modeled
    // amount tolerance (zero) applies rather than the rounding allowance.
    const creditVariance = subtract(match.amount, settlement.netAmount);
    if (!creditVariance.ok || !withinAmountMatchTolerance(creditVariance.value.amountMinor)) {
      return fail('bank_credit', 'BANK_CREDIT_AMOUNT_MISMATCH', {
        expected: settlement.netAmount.amountMinor.toString(),
        observed: match.amount.amountMinor.toString(),
        sourceRecordIds: [settlement.id, match.id],
      });
    }
    if (!bankCreditWithinExpectedLag(settlement.settlementAt, match.creditedAt)) {
      return fail('bank_credit', 'BANK_CREDIT_TIMING_OUTSIDE_WINDOW', {
        expected: settlement.settlementAt.toISOString(),
        observed: match.creditedAt.toISOString(),
        sourceRecordIds: [settlement.id, match.id],
      });
    }
    credited.push(match.id);
  }
  return pass('bank_credit', credited);
};

/**
 * An adjustment can only explain a settlement it could actually have affected.
 *
 * Added after a scenario exposed the gap: an adjustment whose amount matched the
 * discrepancy exactly, but dated a month AFTER the settlement, was being accepted as an
 * explanation purely on arithmetic. Amount agreement is not evidence when the lifecycle
 * makes the relationship impossible.
 *
 * The rule is causal and cycle-relative rather than a fixed symmetric window - see
 * `adjustmentCanExplainSettlement`.
 */
export const checkAdjustmentTiming = (unit: ReconciliationUnit): ReconciliationCheck => {
  if (unit.adjustments.length === 0 || unit.settlements.length === 0) {
    return pass('adjustment_timing', [], 'no adjustments to relate');
  }
  const impossible = unit.adjustments.filter((adjustment) =>
    unit.settlements.every(
      (settlement) =>
        !adjustmentCanExplainSettlement(adjustment.effectiveAt, settlement.settlementAt),
    ),
  );
  return impossible.length === 0
    ? pass('adjustment_timing', ids(unit.adjustments))
    : fail('adjustment_timing', 'LIFECYCLE_INCONSISTENT', {
        detail: `${impossible.length} adjustment(s) fall outside every settlement window`,
        observed: impossible.map((a) => a.effectiveAt.toISOString()).join(', '),
        sourceRecordIds: ids(impossible),
      });
};

export const settledTotalFor = (unit: ReconciliationUnit): Money => {
  const lines = unit.settlementLines.filter((l) => l.paymentId === unit.payment.paymentId);
  const total = sum(lines.map((l) => l.amount));
  return total.ok ? total.value : money(0n, unit.payment.amount.currency);
};
