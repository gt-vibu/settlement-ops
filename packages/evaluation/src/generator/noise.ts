/**
 * Benign noise.
 *
 * Added because the first leakage audit FAILED: `recordCount` predicted the hidden
 * disposition at 0.84 balanced accuracy and `adjustmentCount` at 0.77. Both were
 * artefacts of the generator, not properties of the domain - compound cases emitted more
 * records, and only unresolvable cases carried an adjustment, so counting rows was a
 * shortcut to the answer.
 *
 * The fix is to make those counts uninformative rather than to raise the ceiling:
 *
 *  - every case gets an independently drawn number of ordinary, irrelevant records, so
 *    record count carries no information about how many causes were injected;
 *  - resolvable cases can carry a properly allocated adjustment that the baseline
 *    already accounts for, so "has an adjustment" stops meaning "cannot be resolved".
 *
 * `DATASET.md` §4 asks for realistic noise in any case: real settlement data is full of
 * records that bear on nothing.
 */

import { iso, lineage, money, type Refs } from './render.js';
import type { Rng } from './rng.js';

/**
 * Records that exist in any real ledger and mean nothing for reconciliation.
 *
 * Ledger entries reference the payment but are not consumed by the matcher, and orders
 * are upstream of it. Neither can change a verdict, so they add volume without adding
 * signal - which is exactly the point.
 */
export const noiseRecords = (
  r: Refs,
  capturedAt: Date,
  grossMinor: bigint,
  rng: Rng,
): Record<string, unknown>[] => {
  const count = rng.int(0, 8);
  const records: Record<string, unknown>[] = [];

  for (let i = 0; i < count; i += 1) {
    if (rng.bool(0.5)) {
      records.push({
        kind: 'LEDGER_ENTRY',
        reference_type: 'PAYMENT',
        reference_id: r.payment,
        amount: money(grossMinor),
        entry_type: i % 2 === 0 ? 'CREDIT' : 'DEBIT',
        posted_at: iso(new Date(capturedAt.getTime() + i * 3_600_000)),
        status: 'POSTED',
        lineage: lineage('ledger', `led_${r.suffix}_${i}`, capturedAt),
      });
    } else {
      records.push({
        kind: 'ORDER',
        order_id: `ord_${r.suffix}_${i}`,
        customer_reference: null,
        amount: money(grossMinor),
        status: 'PAID',
        created_at: iso(new Date(capturedAt.getTime() - 7_200_000)),
        lineage: lineage('gateway', `ord_${r.suffix}_${i}`, capturedAt),
      });
    }
  }
  return records;
};

/**
 * A routine, properly allocated adjustment.
 *
 * Applied to a random share of cases REGARDLESS of cause. Because it is allocated to the
 * settlement and reflected in the net, the deterministic baseline already accounts for it
 * and the verdict is unchanged - but "this case has an adjustment" and "the net differs
 * from gross by an odd ratio" stop being shortcuts to the hidden disposition.
 *
 * The first leakage audit measured `adjustmentCount` predicting the disposition at 0.79
 * and `varianceRatio` at 0.74, because only unresolvable cases carried an adjustment and
 * only they had an unexplained ratio. Both are artefacts of a generator that was too
 * tidy; real settlement data is not.
 */
export const applyAccountedAdjustments = (
  records: readonly Record<string, unknown>[],
  r: Refs,
  rng: Rng,
): Record<string, unknown>[] => {
  // How MANY routine adjustments a case carries is drawn independently of its causes.
  // A fixed count of one made "two adjustments" mean "ambiguous or adversarial", which
  // the novelty probe read at 0.43.
  let current = [...records];
  const count = rng.int(0, 3);
  for (let i = 0; i < count; i += 1) current = applyOneAdjustment(current, r, rng, i);
  return current;
};

const applyOneAdjustment = (
  records: readonly Record<string, unknown>[],
  r: Refs,
  rng: Rng,
  index: number,
): Record<string, unknown>[] => {
  // Applied to EVERY case: a routine adjustment that only some cases carry is itself a
  // signal. Only its magnitude varies, and it is drawn independently of the cause.

  const settlement = records.find((rec) => rec['kind'] === 'SETTLEMENT');
  const line = records.find((rec) => rec['kind'] === 'SETTLEMENT_LINE');
  if (settlement === undefined || line === undefined) return [...records];

  const settlementId = String(settlement['settlement_id']);
  const net = (settlement['net_amount'] as { amount_minor: number }).amount_minor;
  const lineAmount = (line['amount'] as { amount_minor: number }).amount_minor;
  /**
   * Signed, and scaled to the settlement rather than a flat band.
   *
   * A fixed +/-4,000 paise was negligible against a 150,000.00 settlement, so the net-to-
   * gross ratio still tracked which causes were present and the novelty probe read 0.38
   * off (varianceRatio, paymentMethod). A routine adjustment proportional to volume is
   * both more realistic and large enough that benign variation dominates.
   */
  // Drawn over the SAME range as the cause-driven variances, so the net-to-gross ratio is
  // dominated by benign variation rather than by which causes were injected.
  const magnitude = Number((BigInt(Math.abs(net)) * BigInt(rng.int(0, 900))) / 10_000n);
  const delta = rng.bool(0.5) ? magnitude : -magnitude;
  if (delta === 0) return [...records];

  const settledAt = String(settlement['settlement_at']);
  const utr = settlement['utr'];

  const updated = records.map((rec) => {
    if (rec === settlement) {
      return { ...rec, net_amount: { amount_minor: net + delta, currency: 'INR' } };
    }
    if (rec === line) {
      return { ...rec, amount: { amount_minor: lineAmount + delta, currency: 'INR' } };
    }
    if (rec['kind'] === 'BANK_CREDIT' && rec['utr'] === utr) {
      const credit = (rec['amount'] as { amount_minor: number }).amount_minor;
      return { ...rec, amount: { amount_minor: credit + delta, currency: 'INR' } };
    }
    return rec;
  });

  updated.push({
    kind: 'ADJUSTMENT',
    settlement_id: settlementId,
    reference: `ADJ-${r.suffix}-ROUTINE-${index}`,
    amount: { amount_minor: delta, currency: 'INR' },
    reason_code: 'ROUTINE_ALLOCATION',
    effective_at: iso(new Date(Date.parse(settledAt) - 43_200_000)),
    lineage: lineage(
      'ops',
      `adjr_${r.suffix}_${index}`,
      new Date(Date.parse(settledAt) - 43_200_000),
    ),
  });
  return updated;
};

/**
 * Split the fee into component lines.
 *
 * Real gateways report MDR as several lines - scheme fee, acquirer fee, platform fee -
 * and the number of them has nothing to do with whether a case reconciles. Applied
 * independently of the cause because `feeLineCount` was otherwise a clean binary: zero
 * meant `MDR_FEE`, non-zero meant not, and the novelty probe read 0.357 off the pair
 * (varianceRatio, feeLineCount).
 */
export const splitFeeLines = (
  records: readonly Record<string, unknown>[],
  r: Refs,
  rng: Rng,
): Record<string, unknown>[] => {
  if (!rng.bool(0.4)) return [...records];
  const fee = records.find((rec) => rec['kind'] === 'FEE_LINE');
  const tax = records.find((rec) => rec['kind'] === 'TAX_LINE');
  if (fee === undefined) return [...records];

  const feeMinor = (fee['amount'] as { amount_minor: number }).amount_minor;
  if (feeMinor < 2) return [...records];
  const partA = Math.floor(feeMinor / 2);
  const partB = feeMinor - partA;

  const out = records.filter((rec) => rec !== fee && rec !== tax);
  out.push(
    { ...fee, amount: { amount_minor: partA, currency: 'INR' } },
    {
      ...fee,
      fee_type: 'SCHEME',
      amount: { amount_minor: partB, currency: 'INR' },
      lineage: {
        ...(fee['lineage'] as Record<string, unknown>),
        source_record_id: `fee_${r.suffix}_b`,
      },
    },
  );
  if (tax !== undefined) {
    const taxMinor = (tax['amount'] as { amount_minor: number }).amount_minor;
    const taxA = Math.floor(taxMinor / 2);
    out.push(
      { ...tax, amount: { amount_minor: taxA, currency: 'INR' } },
      {
        ...tax,
        amount: { amount_minor: taxMinor - taxA, currency: 'INR' },
        lineage: {
          ...(tax['lineage'] as Record<string, unknown>),
          source_record_id: `tax_${r.suffix}_b`,
        },
      },
    );
  }
  return out;
};
