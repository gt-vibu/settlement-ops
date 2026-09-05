/**
 * Deterministic expected-net calculation.
 *
 * This is the single canonical financial calculation (specs/AGENTS.md constraint 6).
 * Reconciliation, the future verifier and the evaluation harness all call this - there
 * is no second implementation of the arithmetic anywhere in the system.
 *
 * It is pure and takes no model input. Given the same records it always returns the
 * same breakdown, which is what makes the verifier able to override a model claim.
 */

import { type Result, ok, err } from '@settlementops/shared';
import type { Currency } from '../money/currency.js';
import { money, sum, zero, type Money } from '../money/money.js';
import { buildBreakdown, type AmountBreakdown } from '../money/amount-breakdown.js';
import { applyBasisPoints } from '../policy/rounding.js';
import { scheduleAt, type PaymentMethod } from '../policy/fee-schedule.js';

export interface ExpectedNetInput {
  readonly gross: Money;
  readonly fees: readonly Money[];
  readonly taxes: readonly Money[];
  readonly refunds: readonly Money[];
  readonly adjustments: readonly Money[];
}

export type ExpectedNetError =
  | { readonly kind: 'CURRENCY_INCONSISTENT' }
  | { readonly kind: 'NEGATIVE_COMPONENT'; readonly component: string };

const totalOf = (values: readonly Money[], currency: Currency): Result<Money, ExpectedNetError> => {
  if (values.length === 0) return ok(zero(currency));
  const total = sum(values);
  if (!total.ok) return err({ kind: 'CURRENCY_INCONSISTENT' });
  if (total.value.currency !== currency) return err({ kind: 'CURRENCY_INCONSISTENT' });
  return ok(total.value);
};

/** Expected net from OBSERVED records. No rates are assumed; the records are summed. */
export const expectedNetFromRecords = (
  input: ExpectedNetInput,
): Result<AmountBreakdown, ExpectedNetError> => {
  const currency = input.gross.currency;
  const fee = totalOf(input.fees, currency);
  if (!fee.ok) return fee;
  const tax = totalOf(input.taxes, currency);
  if (!tax.ok) return tax;
  const refund = totalOf(input.refunds, currency);
  if (!refund.ok) return refund;
  const adjustment = totalOf(input.adjustments, currency);
  if (!adjustment.ok) return adjustment;

  const built = buildBreakdown({
    gross: input.gross,
    fee: fee.value,
    tax: tax.value,
    refund: refund.value,
    adjustment: adjustment.value,
  });
  if (!built.ok) return err({ kind: 'NEGATIVE_COMPONENT', component: built.error.kind });
  return ok(built.value);
};

export interface ScheduledFee {
  readonly fee: Money;
  readonly tax: Money;
  readonly scheduleId: string;
}

/**
 * Fee and tax the published schedule says SHOULD apply.
 *
 * Used to detect a missing or unexpected fee record. It is a cross-check against the
 * schedule, never a substitute for an observed record: the system does not invent a fee
 * that no source record reports.
 */
export const scheduledFeeFor = (
  gross: Money,
  method: PaymentMethod,
  at: Date,
): ScheduledFee | null => {
  const schedule = scheduleAt(at);
  if (schedule === null) return null;
  const feeMinor = applyBasisPoints(gross.amountMinor, schedule.feeRateBps[method]);
  const taxMinor = applyBasisPoints(feeMinor, schedule.taxOnFeeBps);
  return {
    fee: money(feeMinor, gross.currency),
    tax: money(taxMinor, gross.currency),
    scheduleId: schedule.id,
  };
};
