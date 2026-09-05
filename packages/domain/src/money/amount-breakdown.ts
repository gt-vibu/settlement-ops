/**
 * The canonical financial calculation shape (specs/ARCHITECTURE.md section 16).
 *
 * Every fee/tax/refund/adjustment computation in reconciliation, tools, the verifier
 * and the evaluation harness returns THIS structure. One shape, one reconciliation
 * rule - which is what specs/AGENTS.md constraint 6 ("one canonical implementation
 * for financial rules") means in practice.
 *
 * Sign convention (EXPERIMENT_CONSTANTS.md section 1):
 *     expected_net = gross - fee - tax - refund + adjustment
 * adjustment is signed; every other component is a non-negative magnitude.
 */

import { type Result, ok, err } from '@settlementops/shared';
import type { Currency } from './currency.js';
import { type Money, money, equals } from './money.js';

export interface AmountBreakdown {
  readonly grossMinor: bigint;
  readonly feeMinor: bigint;
  readonly taxMinor: bigint;
  readonly refundMinor: bigint;
  readonly adjustmentMinor: bigint;
  readonly expectedNetMinor: bigint;
  readonly currency: Currency;
}

export type BreakdownError =
  | { readonly kind: 'NEGATIVE_COMPONENT'; readonly component: string; readonly value: string }
  | {
      readonly kind: 'DOES_NOT_RECONCILE';
      readonly computed: string;
      readonly declared: string;
    };

export interface BreakdownInput {
  readonly gross: Money;
  readonly fee: Money;
  readonly tax: Money;
  readonly refund: Money;
  readonly adjustment: Money;
}

const NON_NEGATIVE: readonly (keyof BreakdownInput)[] = ['gross', 'fee', 'tax', 'refund'];

/** Builds a breakdown and computes expected net. Cannot produce a non-reconciling value. */
export const buildBreakdown = (input: BreakdownInput): Result<AmountBreakdown, BreakdownError> => {
  for (const key of NON_NEGATIVE) {
    const component = input[key];
    if (component.amountMinor < 0n) {
      return err({
        kind: 'NEGATIVE_COMPONENT',
        component: key,
        value: component.amountMinor.toString(),
      });
    }
  }
  const currency = input.gross.currency;
  const expectedNetMinor =
    input.gross.amountMinor -
    input.fee.amountMinor -
    input.tax.amountMinor -
    input.refund.amountMinor +
    input.adjustment.amountMinor;

  return ok({
    grossMinor: input.gross.amountMinor,
    feeMinor: input.fee.amountMinor,
    taxMinor: input.tax.amountMinor,
    refundMinor: input.refund.amountMinor,
    adjustmentMinor: input.adjustment.amountMinor,
    expectedNetMinor,
    currency,
  });
};

/** Independent re-check. The verifier uses this rather than trusting a stored value. */
export const reconciles = (b: AmountBreakdown): boolean =>
  b.grossMinor - b.feeMinor - b.taxMinor - b.refundMinor + b.adjustmentMinor === b.expectedNetMinor;

export const expectedNet = (b: AmountBreakdown): Money => money(b.expectedNetMinor, b.currency);

export const matchesObserved = (b: AmountBreakdown, observed: Money): boolean =>
  equals(expectedNet(b), observed);
