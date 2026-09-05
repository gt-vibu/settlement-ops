/**
 * Deterministic scenario record generation.
 *
 * Given a scenario and a seed, this produces the SAME import payload every time. That is
 * what makes a demo reproducible and a replay meaningful.
 *
 * Two rules this file exists to enforce:
 *
 *  1. It emits ordinary import records - the same shape any external source would send.
 *     There is no scenario-specific field, no cause label, and no hint that a defect was
 *     injected. Downstream, nothing can tell a scenario record from a real one.
 *
 *  2. It never decides an outcome. It builds a lifecycle; the ordinary deterministic
 *     matcher decides whether that lifecycle reconciles.
 */

import { applyBasisPoints, expectedSettlementDate, scheduleAt } from '@settlementops/domain';
import type { ScenarioDefinition } from './definitions.js';

/** Records are emitted as import DTOs, validated by the same schema as any other import. */
export interface GeneratedBatch {
  readonly source_type: string;
  readonly records: readonly Record<string, unknown>[];
}

const CAPTURED_AT = '2026-02-02T10:00:00.000Z';

/**
 * Settlement dates come from the canonical domain function, never from arithmetic here.
 *
 * A generator that did `capture + 2 calendar days` would land on a Saturday for any
 * Thursday or Friday capture, while the system expects T+2 BUSINESS days - manufacturing
 * timing exceptions that are generator artefacts rather than injected defects. One source
 * of truth for the settlement calendar, and the generator is a consumer of it.
 */
const SETTLED_AT = expectedSettlementDate(new Date(CAPTURED_AT)).toISOString();

const CREDITED_AT = new Date(new Date(SETTLED_AT).getTime() + 6 * 3_600_000).toISOString();

/** Deliberately outside any accrual window: 30 days AFTER the settlement it would explain. */
const IMPLAUSIBLE_ADJUSTMENT_AT = new Date(
  new Date(SETTLED_AT).getTime() + 30 * 86_400_000,
).toISOString();

/** A credit arriving three days after settlement - late enough to fail the lag check. */
const LATE_CREDIT_AT = new Date(new Date(SETTLED_AT).getTime() + 3 * 86_400_000).toISOString();

const iso = (value: string): string => new Date(value).toISOString();

const lineage = (system: string, id: string, observed: string) => ({
  source_system: system,
  source_record_id: id,
  observed_at: iso(observed),
  schema_version: 'v1',
});

const money = (minor: bigint) => ({ amount_minor: Number(minor), currency: 'INR' });

interface Ref {
  readonly payment: string;
  readonly settlement: string;
  readonly utr: string;
  readonly suffix: string;
}

const refs = (seed: number): Ref => {
  const suffix = seed.toString(36).padStart(6, '0').slice(-6);
  return {
    payment: `pay_${suffix}`,
    settlement: `set_${suffix}`,
    utr: `UTR${suffix.toUpperCase()}`,
    suffix,
  };
};

const paymentRecord = (def: ScenarioDefinition, r: Ref) => ({
  kind: 'PAYMENT',
  payment_id: r.payment,
  order_id: null,
  amount: money(def.grossMinor),
  payment_method: def.paymentMethod,
  status: 'CAPTURED',
  authorized_at: iso('2026-02-02T09:00:00Z'),
  captured_at: iso(CAPTURED_AT),
  lineage: lineage('gateway', r.payment, CAPTURED_AT),
});

const settlementRecord = (
  r: Ref,
  grossMinor: bigint,
  netMinor: bigint,
  opts: {
    id?: string;
    utr?: string;
    settledAt?: string;
  } = {},
) => ({
  kind: 'SETTLEMENT',
  settlement_id: opts.id ?? r.settlement,
  settlement_batch_reference: null,
  gross_amount: money(grossMinor),
  net_amount: money(netMinor),
  settlement_at: iso(opts.settledAt ?? SETTLED_AT),
  status: 'PROCESSED',
  utr: opts.utr ?? r.utr,
  lineage: lineage('gateway', opts.id ?? r.settlement, opts.settledAt ?? SETTLED_AT),
});

const settlementLine = (
  r: Ref,
  amountMinor: bigint,
  opts: { settlementId?: string; id?: string } = {},
) => ({
  kind: 'SETTLEMENT_LINE',
  settlement_id: opts.settlementId ?? r.settlement,
  payment_id: r.payment,
  refund_id: null,
  line_type: 'PAYMENT',
  amount: money(amountMinor),
  lineage: lineage('gateway', opts.id ?? `sl_${r.suffix}`, SETTLED_AT),
});

const bankCredit = (
  r: Ref,
  amountMinor: bigint,
  opts: { utr?: string; id?: string; creditedAt?: string } = {},
) => ({
  kind: 'BANK_CREDIT',
  utr: opts.utr ?? r.utr,
  amount: money(amountMinor),
  credited_at: iso(opts.creditedAt ?? CREDITED_AT),
  bank_reference: `REF_${opts.id ?? r.suffix}`,
  lineage: lineage('bank', opts.id ?? `bc_${r.suffix}`, opts.creditedAt ?? CREDITED_AT),
});

const feeAndTax = (def: ScenarioDefinition, r: Ref) => {
  const schedule = scheduleAt(new Date(CAPTURED_AT));
  if (schedule === null) return { fee: 0n, tax: 0n, records: [] as Record<string, unknown>[] };
  const fee = applyBasisPoints(def.grossMinor, schedule.feeRateBps[def.paymentMethod]);
  const tax = applyBasisPoints(fee, schedule.taxOnFeeBps);
  return {
    fee,
    tax,
    records: [
      {
        kind: 'FEE_LINE',
        payment_id: r.payment,
        settlement_id: null,
        fee_type: 'MDR',
        amount: money(fee),
        effective_date: iso(CAPTURED_AT),
        lineage: lineage('gateway', `fee_${r.suffix}`, CAPTURED_AT),
      },
      {
        kind: 'TAX_LINE',
        fee_line_source_id: `fee_${r.suffix}`,
        tax_type: 'GST',
        amount: money(tax),
        period: '2026-02',
        lineage: lineage('gateway', `tax_${r.suffix}`, CAPTURED_AT),
      },
    ],
  };
};

export const generateScenarioBatch = (def: ScenarioDefinition, seed: number): GeneratedBatch => {
  const r = refs(seed);
  const { fee, tax, records: feeRecords } = feeAndTax(def, r);
  const cleanNet = def.grossMinor - fee - tax;
  const records: Record<string, unknown>[] = [paymentRecord(def, r)];

  switch (def.id) {
    case 'clean-settlement': {
      records.push(
        ...feeRecords,
        settlementRecord(r, def.grossMinor, cleanNet),
        settlementLine(r, cleanNet),
        bankCredit(r, cleanNet),
      );
      break;
    }

    case 'fee-tax-discrepancy': {
      // The fee and tax were deducted but no fee record accompanies the settlement.
      // The money is gone from the net and nothing visible explains it.
      records.push(
        settlementRecord(r, def.grossMinor, cleanNet),
        settlementLine(r, cleanNet),
        bankCredit(r, cleanNet),
      );
      break;
    }

    case 'split-settlement': {
      // Value is conserved across two legs, but the second leg is credited late.
      const legA = cleanNet / 2n;
      const legB = cleanNet - legA;
      const secondId = `${r.settlement}_b`;
      const secondUtr = `${r.utr}B`;
      records.push(
        ...feeRecords,
        settlementRecord(r, def.grossMinor / 2n, legA),
        settlementRecord(r, def.grossMinor - def.grossMinor / 2n, legB, {
          id: secondId,
          utr: secondUtr,
        }),
        settlementLine(r, legA),
        settlementLine(r, legB, { settlementId: secondId, id: `sl_${r.suffix}_b` }),
        bankCredit(r, legA),
        bankCredit(r, legB, {
          utr: secondUtr,
          id: `${r.suffix}_b`,
          creditedAt: LATE_CREDIT_AT,
        }),
      );
      break;
    }

    case 'refund-netting': {
      // A refund settled well beyond the permitted netting window, and the settlement
      // net does not account for it.
      const refundMinor = 100_000n;
      records.push(
        ...feeRecords,
        {
          kind: 'REFUND',
          refund_id: `ref_${r.suffix}`,
          payment_id: r.payment,
          amount: money(refundMinor),
          status: 'PROCESSED',
          created_at: iso('2026-02-03T12:00:00Z'),
          settled_at: iso('2026-02-20T00:00:00Z'),
          lineage: lineage('gateway', `ref_${r.suffix}`, '2026-02-03T12:00:00Z'),
        },
        settlementRecord(r, def.grossMinor, cleanNet),
        settlementLine(r, cleanNet),
        bankCredit(r, cleanNet),
      );
      break;
    }

    case 'ambiguous-adjustment': {
      // Two adjustments of equal magnitude, either of which could account for the
      // shortfall. Nothing visible distinguishes them.
      const shortfall = 50_000n;
      const net = cleanNet - shortfall;
      records.push(
        ...feeRecords,
        settlementRecord(r, def.grossMinor, net),
        settlementLine(r, net),
        bankCredit(r, net),
        {
          kind: 'ADJUSTMENT',
          settlement_id: r.settlement,
          reference: `ADJ_A_${r.suffix}`,
          amount: money(-shortfall),
          effective_at: iso(SETTLED_AT),
          reason_code: 'CHARGEBACK_PROVISION',
          lineage: lineage('gateway', `adj_a_${r.suffix}`, SETTLED_AT),
        },
        {
          kind: 'ADJUSTMENT',
          settlement_id: r.settlement,
          reference: `ADJ_B_${r.suffix}`,
          amount: money(-shortfall),
          effective_at: iso(SETTLED_AT),
          reason_code: 'RESERVE_HOLD',
          lineage: lineage('gateway', `adj_b_${r.suffix}`, SETTLED_AT),
        },
      );
      break;
    }

    case 'misleading-adjustment': {
      // The adjustment amount matches the shortfall exactly, which makes it tempting -
      // but it is dated a month after the settlement it would have to explain.
      const shortfall = 50_000n;
      const net = cleanNet - shortfall;
      records.push(
        ...feeRecords,
        settlementRecord(r, def.grossMinor, net),
        settlementLine(r, net),
        bankCredit(r, net),
        {
          kind: 'ADJUSTMENT',
          settlement_id: r.settlement,
          reference: `ADJ_LATE_${r.suffix}`,
          amount: money(-shortfall),
          effective_at: iso(IMPLAUSIBLE_ADJUSTMENT_AT),
          reason_code: 'MANUAL_CORRECTION',
          lineage: lineage('gateway', `adj_late_${r.suffix}`, IMPLAUSIBLE_ADJUSTMENT_AT),
        },
      );
      break;
    }
  }

  return { source_type: `scenario:${def.id}`, records };
};
