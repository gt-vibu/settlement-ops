import { asId, type MerchantId, type PaymentId, type SettlementId } from '@settlementops/shared';
import { trustedMerchantScope } from '../lineage/merchant-scope.js';
import { money } from '../money/money.js';
import type { SourceLineage } from '../lineage/source-record.js';
import type {
  BankCreditRecord,
  FeeLineRecord,
  PaymentRecord,
  SettlementLineRecord,
  SettlementRecord,
  TaxLineRecord,
} from '../records/financial-records.js';
import type { ReconciliationUnit } from './unit.js';

/**
 * The specification's worked example, used as the canonical clean case:
 *   10,000.00 gross - 250.00 fee - 45.00 tax = 9,705.00 net
 * CARD at 250 bps under fee-schedule-v1, captured 2026-02-02 (a Monday, before the
 * 2026-04-01 schedule change), settling T+2 on 2026-02-04.
 */
export const SCOPE = trustedMerchantScope(asId<MerchantId>('11111111-1111-4111-8111-111111111111'));
export const CAPTURED = new Date('2026-02-02T10:00:00Z');
export const SETTLED = new Date('2026-02-04T00:00:00Z');
export const CREDITED = new Date('2026-02-04T06:00:00Z');
export const PAYMENT_ID = asId<PaymentId>('pay_1');
export const SETTLEMENT_ID = asId<SettlementId>('set_1');

export const lineage = (id: string): SourceLineage => ({
  sourceSystem: 'gateway',
  sourceRecordId: id,
  observedAt: CAPTURED,
  ingestedAt: CAPTURED,
  schemaVersion: 'v1',
});

export const payment = (over: Partial<PaymentRecord> = {}): PaymentRecord => ({
  id: 'pay_1',
  scope: SCOPE,
  lineage: lineage('src_pay_1'),
  kind: 'PAYMENT',
  paymentId: PAYMENT_ID,
  orderId: null,
  amount: money(1_000_000n, 'INR'),
  paymentMethod: 'CARD',
  status: 'CAPTURED',
  authorizedAt: CAPTURED,
  capturedAt: CAPTURED,
  ...over,
});

export const fee = (minor: bigint, id = 'fee_1'): FeeLineRecord => ({
  id,
  scope: SCOPE,
  lineage: lineage(`src_${id}`),
  kind: 'FEE_LINE',
  paymentId: PAYMENT_ID,
  settlementId: null,
  feeType: 'MDR',
  amount: money(minor, 'INR'),
  effectiveDate: CAPTURED,
});

export const tax = (minor: bigint): TaxLineRecord => ({
  id: 'tax_1',
  scope: SCOPE,
  lineage: lineage('src_tax_1'),
  kind: 'TAX_LINE',
  feeLineId: 'fee_1',
  taxType: 'GST',
  amount: money(minor, 'INR'),
  period: '2026-02',
});

export const settlement = (
  netMinor: bigint,
  over: Partial<SettlementRecord> = {},
): SettlementRecord => ({
  id: 'set_1',
  scope: SCOPE,
  lineage: lineage('src_set_1'),
  kind: 'SETTLEMENT',
  settlementId: SETTLEMENT_ID,
  settlementBatchId: null,
  grossAmount: money(1_000_000n, 'INR'),
  netAmount: money(netMinor, 'INR'),
  settlementAt: SETTLED,
  status: 'PROCESSED',
  utr: 'UTR001',
  ...over,
});

export const line = (
  minor: bigint,
  id = 'sl_1',
  settlementId: SettlementId = SETTLEMENT_ID,
): SettlementLineRecord => ({
  id,
  scope: SCOPE,
  lineage: lineage(`src_${id}`),
  kind: 'SETTLEMENT_LINE',
  settlementId,
  paymentId: PAYMENT_ID,
  refundId: null,
  lineType: 'PAYMENT',
  amount: money(minor, 'INR'),
});

export const credit = (minor: bigint, utr = 'UTR001'): BankCreditRecord => ({
  id: 'bc_1',
  scope: SCOPE,
  lineage: lineage('src_bc_1'),
  kind: 'BANK_CREDIT',
  utr,
  amount: money(minor, 'INR'),
  creditedAt: CREDITED,
  bankReference: 'REF1',
});

export const unit = (over: Partial<ReconciliationUnit> = {}): ReconciliationUnit => ({
  payment: payment(),
  fees: [fee(25_000n)],
  taxes: [tax(4_500n)],
  refunds: [],
  adjustments: [],
  settlements: [settlement(970_500n)],
  settlementLines: [line(970_500n)],
  bankCredits: [credit(970_500n)],
  duplicates: [],
  ...over,
});
