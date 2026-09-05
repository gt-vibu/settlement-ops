/**
 * Assembles a ReconciliationUnit from the database.
 *
 * Every query filters on `merchant_id` from the MerchantScope. A record id supplied by a
 * caller is never enough to reach a row - the tenant predicate is always present, which
 * is what makes `SECURITY.md` threat T1 (cross-tenant access by manipulated id) fail
 * closed rather than depend on a handler remembering to check.
 */

import { asId, type PaymentId, type RefundId, type SettlementId } from '@settlementops/shared';
import {
  money,
  trustedMerchantScope,
  type Currency,
  type MerchantScope,
  type ReconciliationUnit,
  type SourceLineage,
} from '@settlementops/domain';
import type { DatabaseHandle } from '../client.js';

interface BaseRow {
  id: string;
  source_system: string | null;
  source_record_id: string;
  amount_minor: string;
  currency: string;
}

const lineageOf = (row: {
  source_system: string | null;
  source_record_id: string;
}): SourceLineage => ({
  sourceSystem: row.source_system ?? 'internal',
  sourceRecordId: row.source_record_id,
  // Lineage timestamps are not needed for matching; the matcher uses domain timestamps.
  observedAt: new Date(0),
  ingestedAt: new Date(0),
  schemaVersion: 'v1',
});

export const loadUnit = async (
  db: DatabaseHandle,
  scope: MerchantScope,
  paymentId: PaymentId,
): Promise<ReconciliationUnit | null> => {
  const m = scope.merchantId;

  const paymentResult = await db.pool.query<
    BaseRow & {
      payment_method: string;
      status: string;
      authorized_at: Date | null;
      captured_at: Date | null;
      order_id: string | null;
    }
  >(
    `SELECT id, order_id, amount_minor, currency, payment_method, status,
            authorized_at, captured_at, source_system, source_record_id
       FROM payments WHERE id = $1 AND merchant_id = $2`,
    [paymentId, m],
  );
  const p = paymentResult.rows[0];
  if (p === undefined) return null;

  const currency = p.currency.trim() as Currency;
  const scopeValue = trustedMerchantScope(m);
  const base = { scope: scopeValue };

  const [fees, taxes, refunds, adjustments, lines, settlements, credits] = await Promise.all([
    db.pool.query<BaseRow & { fee_type: string; effective_date: Date }>(
      `SELECT id, fee_type, amount_minor, currency, effective_date, NULL AS source_system,
              source_record_id
         FROM fee_lines WHERE merchant_id = $1 AND payment_id = $2`,
      [m, p.id],
    ),
    db.pool.query<BaseRow & { tax_type: string; period: string; fee_line_id: string | null }>(
      `SELECT t.id, t.tax_type, t.period, t.fee_line_id, t.amount_minor, t.currency,
              NULL AS source_system, t.source_record_id
         FROM tax_lines t
         JOIN fee_lines f ON f.id = t.fee_line_id
        WHERE t.merchant_id = $1 AND f.payment_id = $2`,
      [m, p.id],
    ),
    db.pool.query<BaseRow & { status: string; created_at: Date; settled_at: Date | null }>(
      `SELECT id, status, created_at, settled_at, amount_minor, currency,
              source_system, source_record_id
         FROM refunds WHERE merchant_id = $1 AND payment_id = $2`,
      [m, p.id],
    ),
    db.pool.query<BaseRow & { reference: string; effective_at: Date; reason_code: string }>(
      `SELECT a.id, a.reference, a.effective_at, a.reason_code, a.amount_minor, a.currency,
              NULL AS source_system, a.source_record_id
         FROM adjustments a
         JOIN settlement_lines sl ON sl.settlement_id = a.settlement_id
        WHERE a.merchant_id = $1 AND sl.payment_id = $2`,
      [m, p.id],
    ),
    db.pool.query<BaseRow & { settlement_id: string; line_type: string }>(
      `SELECT id, settlement_id, line_type, amount_minor, currency,
              NULL AS source_system, source_record_id
         FROM settlement_lines WHERE merchant_id = $1 AND payment_id = $2`,
      [m, p.id],
    ),
    db.pool.query<{
      id: string;
      gross_amount_minor: string;
      net_amount_minor: string;
      currency: string;
      settlement_at: Date;
      status: string;
      utr: string | null;
      source_system: string;
      source_record_id: string;
    }>(
      `SELECT DISTINCT s.id, s.gross_amount_minor, s.net_amount_minor, s.currency,
              s.settlement_at, s.status, s.utr, s.source_system, s.source_record_id
         FROM settlements s
         JOIN settlement_lines sl ON sl.settlement_id = s.id
        WHERE s.merchant_id = $1 AND sl.payment_id = $2`,
      [m, p.id],
    ),
    db.pool.query<BaseRow & { utr: string; credited_at: Date; bank_reference: string }>(
      `SELECT DISTINCT b.id, b.utr, b.credited_at, b.bank_reference, b.amount_minor,
              b.currency, b.source_system, b.source_record_id
         FROM bank_credits b
         JOIN settlements s ON s.utr = b.utr AND s.merchant_id = b.merchant_id
         JOIN settlement_lines sl ON sl.settlement_id = s.id
        WHERE b.merchant_id = $1 AND sl.payment_id = $2`,
      [m, p.id],
    ),
  ]);

  return {
    payment: {
      ...base,
      id: p.id,
      kind: 'PAYMENT',
      paymentId: asId<PaymentId>(p.id),
      orderId: null,
      amount: money(BigInt(p.amount_minor), currency),
      paymentMethod: p.payment_method as ReconciliationUnit['payment']['paymentMethod'],
      status: p.status as ReconciliationUnit['payment']['status'],
      authorizedAt: p.authorized_at,
      capturedAt: p.captured_at,
      lineage: lineageOf(p),
    },
    fees: fees.rows.map((r) => ({
      ...base,
      id: r.id,
      kind: 'FEE_LINE' as const,
      paymentId: asId<PaymentId>(p.id),
      settlementId: null,
      feeType: r.fee_type,
      amount: money(BigInt(r.amount_minor), r.currency.trim() as Currency),
      effectiveDate: r.effective_date,
      lineage: lineageOf(r),
    })),
    taxes: taxes.rows.map((r) => ({
      ...base,
      id: r.id,
      kind: 'TAX_LINE' as const,
      feeLineId: r.fee_line_id,
      taxType: r.tax_type,
      period: r.period,
      amount: money(BigInt(r.amount_minor), r.currency.trim() as Currency),
      lineage: lineageOf(r),
    })),
    refunds: refunds.rows.map((r) => ({
      ...base,
      id: r.id,
      kind: 'REFUND' as const,
      refundId: asId<RefundId>(r.id),
      paymentId: asId<PaymentId>(p.id),
      amount: money(BigInt(r.amount_minor), r.currency.trim() as Currency),
      status: r.status as 'CREATED' | 'PROCESSED' | 'FAILED',
      createdAt: r.created_at,
      settledAt: r.settled_at,
      lineage: lineageOf(r),
    })),
    adjustments: adjustments.rows.map((r) => ({
      ...base,
      id: r.id,
      kind: 'ADJUSTMENT' as const,
      settlementId: null,
      reference: r.reference,
      amount: money(BigInt(r.amount_minor), r.currency.trim() as Currency),
      effectiveAt: r.effective_at,
      reasonCode: r.reason_code,
      lineage: lineageOf(r),
    })),
    settlements: settlements.rows.map((r) => ({
      ...base,
      id: r.id,
      kind: 'SETTLEMENT' as const,
      settlementId: asId<SettlementId>(r.id),
      settlementBatchId: null,
      grossAmount: money(BigInt(r.gross_amount_minor), r.currency.trim() as Currency),
      netAmount: money(BigInt(r.net_amount_minor), r.currency.trim() as Currency),
      settlementAt: r.settlement_at,
      status: r.status as 'PENDING' | 'PROCESSED' | 'FAILED',
      utr: r.utr,
      lineage: lineageOf(r),
    })),
    settlementLines: lines.rows.map((r) => ({
      ...base,
      id: r.id,
      kind: 'SETTLEMENT_LINE' as const,
      settlementId: asId<SettlementId>(r.settlement_id),
      paymentId: asId<PaymentId>(p.id),
      refundId: null,
      lineType: r.line_type as 'PAYMENT' | 'REFUND' | 'ADJUSTMENT' | 'FEE' | 'TAX',
      amount: money(BigInt(r.amount_minor), r.currency.trim() as Currency),
      lineage: lineageOf(r),
    })),
    bankCredits: credits.rows.map((r) => ({
      ...base,
      id: r.id,
      kind: 'BANK_CREDIT' as const,
      utr: r.utr,
      amount: money(BigInt(r.amount_minor), r.currency.trim() as Currency),
      creditedAt: r.credited_at,
      bankReference: r.bank_reference,
      lineage: lineageOf(r),
    })),
    duplicates: [],
  };
};
