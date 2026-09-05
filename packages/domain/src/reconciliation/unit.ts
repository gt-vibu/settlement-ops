/**
 * The unit of reconciliation.
 *
 * One captured payment together with every record that bears on its settlement. The
 * matcher works on this shape and nothing else - it has no repository, no clock of its
 * own and no access to hidden truth, which is what makes the baseline independently
 * testable (`BASELINES.md`).
 */

import type { Money } from '../money/money.js';
import type { AmountBreakdown } from '../money/amount-breakdown.js';
import type {
  AdjustmentRecord,
  BankCreditRecord,
  FeeLineRecord,
  PaymentRecord,
  RefundRecord,
  SettlementLineRecord,
  SettlementRecord,
  TaxLineRecord,
} from '../records/financial-records.js';
import type { DuplicateGroup } from './duplicate-detection.js';
import type { ResidualReason } from './reason-codes.js';

export interface ReconciliationUnit {
  readonly payment: PaymentRecord;
  readonly fees: readonly FeeLineRecord[];
  readonly taxes: readonly TaxLineRecord[];
  readonly refunds: readonly RefundRecord[];
  readonly adjustments: readonly AdjustmentRecord[];
  readonly settlements: readonly SettlementRecord[];
  readonly settlementLines: readonly SettlementLineRecord[];
  readonly bankCredits: readonly BankCreditRecord[];
  readonly duplicates: readonly DuplicateGroup[];
}

export type CheckStatus = 'PASS' | 'FAIL' | 'NOT_RUN';

export interface ReconciliationCheck {
  readonly name: string;
  readonly status: CheckStatus;
  readonly expected: string | null;
  readonly observed: string | null;
  readonly detail: string | null;
  readonly reason: ResidualReason | null;
  readonly sourceRecordIds: readonly string[];
}

export interface ReconciliationVerdict {
  readonly outcome: 'RECONCILED' | 'EXCEPTION';
  readonly reasons: readonly ResidualReason[];
  readonly discrepancy: Money;
  readonly breakdown: AmountBreakdown | null;
  readonly checks: readonly ReconciliationCheck[];
  readonly evidenceRecordIds: readonly string[];
  readonly policyVersion: string;
}

export const pass = (
  name: string,
  sourceRecordIds: readonly string[] = [],
  detail: string | null = null,
): ReconciliationCheck => ({
  name,
  status: 'PASS',
  expected: null,
  observed: null,
  detail,
  reason: null,
  sourceRecordIds,
});

export const fail = (
  name: string,
  reason: ResidualReason,
  fields: {
    expected?: string;
    observed?: string;
    detail?: string;
    sourceRecordIds?: readonly string[];
  } = {},
): ReconciliationCheck => ({
  name,
  status: 'FAIL',
  expected: fields.expected ?? null,
  observed: fields.observed ?? null,
  detail: fields.detail ?? null,
  reason,
  sourceRecordIds: fields.sourceRecordIds ?? [],
});

export const notRun = (name: string, detail: string): ReconciliationCheck => ({
  name,
  status: 'NOT_RUN',
  expected: null,
  observed: null,
  detail,
  reason: null,
  sourceRecordIds: [],
});
