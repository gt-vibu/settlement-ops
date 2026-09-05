/**
 * The case lifecycle, and the transforms that damage it.
 *
 * REWRITTEN after two defects the leakage audit and a manual read exposed:
 *
 *  1. Each cause used to render a WHOLE lifecycle of its own, and a compound case was
 *     the union of those renderings keyed by record id. Because every injector wrote the
 *     same settlement id, the last one silently won: a `MDR_FEE + TIMING_LAG` case came
 *     out as a plain `TIMING_LAG` case with the fee records restored. Compound cases were
 *     not compound at all, which would have made the hardest stratum the easiest.
 *
 *  2. Because the surviving injector determined the whole record shape, variance ratio
 *     and record count tracked the cause, and the leakage probes could read the label off
 *     them.
 *
 * The fix is structural: build ONE clean, fully reconciling lifecycle, then apply each
 * cause as a TRANSFORM of it. Causes compose, order does not silently discard anything,
 * and a three-cause case genuinely carries three defects.
 */

import type { PaymentMethod } from '@settlementops/domain';

import {
  bankCreditRecord,
  expectedSettlementFor,
  feeRecords,
  paymentRecord,
  plusDays,
  plusHours,
  refundRecord,
  scheduledFeeAndTax,
  settlementLine,
  settlementRecord,
  type Refs,
} from './render.js';

export interface Lifecycle {
  readonly refs: Refs;
  readonly grossMinor: bigint;
  readonly method: PaymentMethod;
  readonly capturedAt: Date;
  feeMinor: bigint;
  taxMinor: bigint;
  /** Whether fee and tax records accompany the settlement. */
  feeRecordsPresent: boolean;
  settledAt: Date;
  /** Net actually paid out, before splitting. */
  netMinor: bigint;
  /** Extra deduction the settlement made that the records do not explain. */
  unexplainedMinor: bigint;
  split: boolean;
  splitCreditLateHours: number;
  refund: { minor: bigint; createdAt: Date; settledAt: Date } | null;
  unallocatedAdjustmentMinor: bigint | null;
  impossibleAdjustment: { minor: bigint; effectiveAt: Date; reference: string } | null;
}

export const cleanLifecycle = (
  refs: Refs,
  grossMinor: bigint,
  method: PaymentMethod,
  capturedAt: Date,
  jitterDays: number,
): Lifecycle => {
  const { fee, tax } = scheduledFeeAndTax(grossMinor, method, capturedAt);
  return {
    refs,
    grossMinor,
    method,
    capturedAt,
    feeMinor: fee,
    taxMinor: tax,
    feeRecordsPresent: true,
    settledAt: plusDays(expectedSettlementFor(capturedAt), jitterDays),
    netMinor: grossMinor - fee - tax,
    unexplainedMinor: 0n,
    split: false,
    splitCreditLateHours: 30,
    refund: null,
    unallocatedAdjustmentMinor: null,
    impossibleAdjustment: null,
  };
};

/** Emit the records this lifecycle implies. One place, so composition stays coherent. */
export const emit = (life: Lifecycle): Record<string, unknown>[] => {
  const r = life.refs;
  const records: Record<string, unknown>[] = [
    paymentRecord(r, life.grossMinor, life.method, life.capturedAt),
  ];

  if (life.feeRecordsPresent) {
    records.push(...feeRecords(r, life.feeMinor, life.taxMinor, life.capturedAt));
  }

  const net = life.netMinor - life.unexplainedMinor;

  if (life.split) {
    const legA = net / 2n;
    const legB = net - legA;
    const grossA = life.grossMinor / 2n;
    const secondId = `${r.settlement}b`;
    const secondUtr = `${r.utr}B`;
    records.push(
      settlementRecord(r, grossA, legA, life.settledAt),
      settlementRecord(r, life.grossMinor - grossA, legB, life.settledAt, {
        id: secondId,
        utr: secondUtr,
      }),
      settlementLine(r, legA, life.settledAt),
      settlementLine(r, legB, life.settledAt, { settlementId: secondId, id: `sl_${r.suffix}b` }),
      bankCreditRecord(r, legA, plusHours(life.settledAt, 6)),
      // Present and correct, but outside the expected lag: the bank-side view disagrees.
      bankCreditRecord(r, legB, plusHours(life.settledAt, life.splitCreditLateHours), {
        utr: secondUtr,
        id: `bc_${r.suffix}b`,
      }),
    );
  } else {
    records.push(
      settlementRecord(r, life.grossMinor, net, life.settledAt),
      settlementLine(r, net, life.settledAt),
      bankCreditRecord(r, net, plusHours(life.settledAt, 6)),
    );
  }

  if (life.refund !== null) {
    records.push(refundRecord(r, life.refund.minor, life.refund.createdAt, life.refund.settledAt));
  }

  return records;
};

/** Records that are not part of the lifecycle but bear on the case. */
export const emitAdjustments = (life: Lifecycle): Record<string, unknown>[] => {
  const records: Record<string, unknown>[] = [];
  const r = life.refs;

  if (life.unallocatedAdjustmentMinor !== null) {
    records.push({
      kind: 'ADJUSTMENT',
      settlement_id: null,
      reference: `ADJ-${r.suffix}-UNALLOCATED`,
      amount: { amount_minor: Number(life.unallocatedAdjustmentMinor), currency: 'INR' },
      reason_code: 'PARTIAL_CORRECTION',
      effective_at: plusDays(life.settledAt, -1).toISOString(),
      lineage: {
        source_system: 'ops',
        source_record_id: `adju_${r.suffix}`,
        observed_at: plusDays(life.settledAt, -1).toISOString(),
        schema_version: 'v1',
      },
    });
  }

  if (life.impossibleAdjustment !== null) {
    records.push({
      kind: 'ADJUSTMENT',
      settlement_id: r.settlement,
      reference: life.impossibleAdjustment.reference.slice(0, 128),
      amount: { amount_minor: Number(life.impossibleAdjustment.minor), currency: 'INR' },
      reason_code: 'MANUAL_CORRECTION',
      effective_at: life.impossibleAdjustment.effectiveAt.toISOString(),
      lineage: {
        source_system: 'ops',
        source_record_id: `adji_${r.suffix}`,
        observed_at: life.impossibleAdjustment.effectiveAt.toISOString(),
        schema_version: 'v1',
      },
    });
  }

  return records;
};
