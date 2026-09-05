/**
 * Sensitivity probe population.
 *
 * METHOD NOTE - why this sweeps DATA rather than mocking CONSTANTS
 *
 * The policy constants are module-level values. Mocking them would let the probe drift
 * from the code that actually runs. Instead the probe holds the constants fixed at their
 * proposed values and sweeps the underlying quantity across each decision boundary,
 * driving the REAL `reconcileUnit`. Where the verdict flips IS the effective constant.
 *
 * That gives the same answer with no production change and no risk of the probe testing
 * something the system does not do.
 *
 * This population is a PROBE, not the benchmark. It is in-memory, never persisted, and
 * has nothing to do with the frozen evaluation dataset.
 */

import { asId, type MerchantId, type PaymentId, type SettlementId } from '@settlementops/shared';
import {
  money,
  trustedMerchantScope,
  type AdjustmentRecord,
  type BankCreditRecord,
  type FeeLineRecord,
  type PaymentRecord,
  type ReconciliationUnit,
  type RefundRecord,
  type SettlementLineRecord,
  type SettlementRecord,
  type SourceLineage,
  type TaxLineRecord,
} from '@settlementops/domain';

const SCOPE = trustedMerchantScope(asId<MerchantId>('11111111-1111-4111-8111-111111111111'));
const PAYMENT_ID = asId<PaymentId>('pay_probe');
const SETTLEMENT_ID = asId<SettlementId>('set_probe');

export const CAPTURED = new Date('2026-02-02T10:00:00Z');
export const SETTLED = new Date('2026-02-04T00:00:00Z');
export const CREDITED = new Date('2026-02-04T06:00:00Z');

const GROSS = 1_000_000n;
const FEE = 25_000n;
const TAX = 4_500n;
export const CLEAN_NET = GROSS - FEE - TAX; // 970_500

const lineage = (id: string, at: Date = CAPTURED): SourceLineage => ({
  sourceSystem: 'probe',
  sourceRecordId: id,
  observedAt: at,
  ingestedAt: at,
  schemaVersion: 'v1',
});

export const payment = (over: Partial<PaymentRecord> = {}): PaymentRecord => ({
  id: 'pay_probe',
  scope: SCOPE,
  lineage: lineage('pay_probe'),
  kind: 'PAYMENT',
  paymentId: PAYMENT_ID,
  orderId: null,
  amount: money(GROSS, 'INR'),
  paymentMethod: 'CARD',
  status: 'CAPTURED',
  authorizedAt: CAPTURED,
  capturedAt: CAPTURED,
  ...over,
});

export const fee = (minor: bigint = FEE): FeeLineRecord => ({
  id: 'fee_probe',
  scope: SCOPE,
  lineage: lineage('fee_probe'),
  kind: 'FEE_LINE',
  paymentId: PAYMENT_ID,
  settlementId: null,
  feeType: 'MDR',
  amount: money(minor, 'INR'),
  effectiveDate: CAPTURED,
});

export const tax = (minor: bigint = TAX): TaxLineRecord => ({
  id: 'tax_probe',
  scope: SCOPE,
  lineage: lineage('tax_probe'),
  kind: 'TAX_LINE',
  feeLineId: 'fee_probe',
  taxType: 'GST',
  amount: money(minor, 'INR'),
  period: '2026-02',
});

export const settlement = (
  netMinor: bigint,
  over: Partial<SettlementRecord> = {},
): SettlementRecord => ({
  id: 'set_probe',
  scope: SCOPE,
  lineage: lineage('set_probe', SETTLED),
  kind: 'SETTLEMENT',
  settlementId: SETTLEMENT_ID,
  settlementBatchId: null,
  grossAmount: money(GROSS, 'INR'),
  netAmount: money(netMinor, 'INR'),
  settlementAt: SETTLED,
  status: 'PROCESSED',
  utr: 'UTRPROBE',
  ...over,
});

export const line = (
  minor: bigint,
  id = 'sl_probe',
  settlementId: SettlementId = SETTLEMENT_ID,
): SettlementLineRecord => ({
  id,
  scope: SCOPE,
  lineage: lineage(id, SETTLED),
  kind: 'SETTLEMENT_LINE',
  settlementId,
  paymentId: PAYMENT_ID,
  refundId: null,
  lineType: 'PAYMENT',
  amount: money(minor, 'INR'),
});

export const credit = (
  minor: bigint,
  over: { utr?: string; id?: string; creditedAt?: Date } = {},
): BankCreditRecord => ({
  id: over.id ?? 'bc_probe',
  scope: SCOPE,
  lineage: lineage(over.id ?? 'bc_probe', over.creditedAt ?? CREDITED),
  kind: 'BANK_CREDIT',
  utr: over.utr ?? 'UTRPROBE',
  amount: money(minor, 'INR'),
  creditedAt: over.creditedAt ?? CREDITED,
  bankReference: 'REFPROBE',
});

export const adjustment = (minor: bigint, effectiveAt: Date): AdjustmentRecord => ({
  id: 'adj_probe',
  scope: SCOPE,
  lineage: lineage('adj_probe', effectiveAt),
  kind: 'ADJUSTMENT',
  settlementId: SETTLEMENT_ID,
  reference: 'ADJ_PROBE',
  amount: money(minor, 'INR'),
  effectiveAt,
  reasonCode: 'MANUAL_CORRECTION',
});

export const refund = (minor: bigint, createdAt: Date, settledAt: Date): RefundRecord => ({
  id: 'ref_probe',
  scope: SCOPE,
  lineage: lineage('ref_probe', createdAt),
  kind: 'REFUND',
  refundId: asId('ref_probe'),
  paymentId: PAYMENT_ID,
  amount: money(minor, 'INR'),
  status: 'PROCESSED',
  createdAt,
  settledAt,
});

/** A fully clean unit; individual probes override one dimension at a time. */
export const cleanUnit = (over: Partial<ReconciliationUnit> = {}): ReconciliationUnit => ({
  payment: payment(),
  fees: [fee()],
  taxes: [tax()],
  refunds: [],
  adjustments: [],
  settlements: [settlement(CLEAN_NET)],
  settlementLines: [line(CLEAN_NET)],
  bankCredits: [credit(CLEAN_NET)],
  duplicates: [],
  ...over,
});

export const hoursAfter = (base: Date, hours: number): Date =>
  new Date(base.getTime() + hours * 3_600_000);

export const daysAfter = (base: Date, days: number): Date =>
  new Date(base.getTime() + days * 86_400_000);
