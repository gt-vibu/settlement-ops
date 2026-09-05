/**
 * Visible-record rendering.
 *
 * Turns a decided blueprint into ordinary import records - the same shape any external
 * source would send. Nothing here writes a cause code, a novelty label, a seed, a defect
 * id or a split name into a record. If it did, the benchmark would be measuring the
 * generator's own labelling instead of reasoning (`LEAKAGE_AUDIT.md` §7).
 *
 * Identifiers are derived from a counter, not from the defect, so an id reveals nothing.
 */

import { applyBasisPoints, expectedSettlementDate, scheduleAt } from '@settlementops/domain';
import type { PaymentMethod } from '@settlementops/domain';

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

export const iso = (at: Date): string => at.toISOString();

export const money = (minor: bigint) => ({ amount_minor: Number(minor), currency: 'INR' });

export const lineage = (system: string, id: string, observedAt: Date) => ({
  source_system: system,
  source_record_id: id,
  observed_at: iso(observedAt),
  schema_version: 'v1',
});

export interface Refs {
  readonly payment: string;
  readonly settlement: string;
  readonly utr: string;
  readonly suffix: string;
}

/** Opaque, sequential suffix. Carries no information about the injected defect. */
export const refsFor = (ordinal: number): Refs => {
  const suffix = ordinal.toString(36).padStart(7, '0').slice(-7);
  return {
    payment: `pay_${suffix}`,
    settlement: `set_${suffix}`,
    utr: `UTR${suffix.toUpperCase()}`,
    suffix,
  };
};

export const scheduledFeeAndTax = (
  grossMinor: bigint,
  method: PaymentMethod,
  capturedAt: Date,
): { fee: bigint; tax: bigint; scheduleId: string } => {
  const schedule = scheduleAt(capturedAt);
  if (schedule === null) return { fee: 0n, tax: 0n, scheduleId: 'none' };
  const fee = applyBasisPoints(grossMinor, schedule.feeRateBps[method]);
  const tax = applyBasisPoints(fee, schedule.taxOnFeeBps);
  return { fee, tax, scheduleId: schedule.id };
};

export const paymentRecord = (
  r: Refs,
  grossMinor: bigint,
  method: PaymentMethod,
  capturedAt: Date,
) => ({
  kind: 'PAYMENT',
  payment_id: r.payment,
  order_id: null,
  amount: money(grossMinor),
  payment_method: method,
  status: 'CAPTURED',
  authorized_at: iso(new Date(capturedAt.getTime() - MS_PER_HOUR)),
  captured_at: iso(capturedAt),
  lineage: lineage('gateway', r.payment, capturedAt),
});

export const feeRecords = (r: Refs, fee: bigint, tax: bigint, capturedAt: Date) => [
  {
    kind: 'FEE_LINE',
    payment_id: r.payment,
    settlement_id: null,
    fee_type: 'MDR',
    amount: money(fee),
    effective_date: iso(capturedAt),
    lineage: lineage('gateway', `fee_${r.suffix}`, capturedAt),
  },
  {
    kind: 'TAX_LINE',
    fee_line_source_id: `fee_${r.suffix}`,
    tax_type: 'GST',
    amount: money(tax),
    period: `${capturedAt.getUTCFullYear()}-${String(capturedAt.getUTCMonth() + 1).padStart(2, '0')}`,
    lineage: lineage('gateway', `tax_${r.suffix}`, capturedAt),
  },
];

export const settlementRecord = (
  r: Refs,
  grossMinor: bigint,
  netMinor: bigint,
  settledAt: Date,
  opts: { id?: string; utr?: string } = {},
) => ({
  kind: 'SETTLEMENT',
  settlement_id: opts.id ?? r.settlement,
  settlement_batch_reference: null,
  gross_amount: money(grossMinor),
  net_amount: money(netMinor),
  settlement_at: iso(settledAt),
  status: 'PROCESSED',
  utr: opts.utr ?? r.utr,
  lineage: lineage('gateway', opts.id ?? r.settlement, settledAt),
});

export const settlementLine = (
  r: Refs,
  amountMinor: bigint,
  settledAt: Date,
  opts: { settlementId?: string; id?: string; lineType?: string } = {},
) => ({
  kind: 'SETTLEMENT_LINE',
  settlement_id: opts.settlementId ?? r.settlement,
  payment_id: r.payment,
  refund_id: null,
  line_type: opts.lineType ?? 'PAYMENT',
  amount: money(amountMinor),
  lineage: lineage('gateway', opts.id ?? `sl_${r.suffix}`, settledAt),
});

export const bankCreditRecord = (
  r: Refs,
  amountMinor: bigint,
  creditedAt: Date,
  opts: { utr?: string; id?: string } = {},
) => ({
  kind: 'BANK_CREDIT',
  utr: opts.utr ?? r.utr,
  amount: money(amountMinor),
  credited_at: iso(creditedAt),
  bank_reference: `REF_${opts.id ?? r.suffix}`,
  lineage: lineage('bank', opts.id ?? `bc_${r.suffix}`, creditedAt),
});

export const refundRecord = (
  r: Refs,
  amountMinor: bigint,
  createdAt: Date,
  settledAt: Date | null,
  opts: { id?: string } = {},
) => ({
  kind: 'REFUND',
  refund_id: opts.id ?? `rfnd_${r.suffix}`,
  payment_id: r.payment,
  amount: money(amountMinor),
  status: 'PROCESSED',
  created_at: iso(createdAt),
  settled_at: settledAt === null ? null : iso(settledAt),
  lineage: lineage('gateway', opts.id ?? `rfnd_${r.suffix}`, createdAt),
});

/**
 * An adjustment attaches to a payment THROUGH its settlement, which is how the unit
 * loader joins them. `reference` is operator-entered free text - a real, ordinary field,
 * and therefore the honest place for untrusted narration to arrive.
 */
export const adjustmentRecord = (
  r: Refs,
  amountMinor: bigint,
  effectiveAt: Date,
  opts: {
    id?: string;
    reason?: string;
    reference?: string;
    settlementId?: string | null;
  } = {},
) => ({
  kind: 'ADJUSTMENT',
  settlement_id: opts.settlementId === undefined ? r.settlement : opts.settlementId,
  reference: (opts.reference ?? `ADJ-${r.suffix}`).slice(0, 128),
  amount: money(amountMinor),
  reason_code: opts.reason ?? 'MANUAL_CORRECTION',
  effective_at: iso(effectiveAt),
  lineage: lineage('ops', opts.id ?? `adj_${r.suffix}`, effectiveAt),
});

export const expectedSettlementFor = (capturedAt: Date): Date => expectedSettlementDate(capturedAt);

export const plusDays = (at: Date, days: number): Date =>
  new Date(at.getTime() + days * MS_PER_DAY);
export const plusHours = (at: Date, hours: number): Date =>
  new Date(at.getTime() + hours * MS_PER_HOUR);
