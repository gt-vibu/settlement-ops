import { describe, it, expect } from 'vitest';
import { asId, type SettlementId } from '@settlementops/shared';
import { money } from '../money/money.js';
import type { RefundRecord } from '../records/financial-records.js';
import { reconcileUnit } from './matcher.js';
import {
  CAPTURED,
  PAYMENT_ID,
  SCOPE,
  SETTLED,
  credit,
  fee,
  line,
  lineage,
  payment,
  settlement,
  tax,
  unit,
} from './matcher.fixtures.js';

describe('baseline safety: it fails closed', () => {
  it('raises an exception when the net amount does not reconcile', () => {
    const verdict = reconcileUnit(
      unit({
        settlementLines: [line(941_000n)],
        settlements: [settlement(941_000n)],
        bankCredits: [credit(941_000n)],
      }),
    );
    expect(verdict.outcome).toBe('EXCEPTION');
    expect(verdict.reasons).toContain('NET_AMOUNT_MISMATCH');
    expect(verdict.discrepancy.amountMinor).toBe(29_500n);
  });

  it('raises an exception when no settlement references the payment', () => {
    const verdict = reconcileUnit(unit({ settlementLines: [], settlements: [], bankCredits: [] }));
    expect(verdict.outcome).toBe('EXCEPTION');
    expect(verdict.reasons).toContain('NO_SETTLEMENT_FOUND');
  });

  it('raises an exception when a fee record is missing entirely', () => {
    const verdict = reconcileUnit(unit({ fees: [], taxes: [] }));
    expect(verdict.outcome).toBe('EXCEPTION');
    expect(verdict.reasons).toContain('MISSING_FEE_RECORD');
  });

  it('raises an exception when the fee disagrees with the schedule', () => {
    const verdict = reconcileUnit(unit({ fees: [fee(40_000n)] }));
    expect(verdict.outcome).toBe('EXCEPTION');
    expect(verdict.reasons).toContain('UNEXPECTED_FEE_AMOUNT');
  });

  it('raises an exception when the bank credit is missing', () => {
    const verdict = reconcileUnit(unit({ bankCredits: [] }));
    expect(verdict.outcome).toBe('EXCEPTION');
    expect(verdict.reasons).toContain('MISSING_BANK_CREDIT');
  });

  it('raises an exception when the bank credit amount disagrees', () => {
    const verdict = reconcileUnit(unit({ bankCredits: [credit(900_000n)] }));
    expect(verdict.outcome).toBe('EXCEPTION');
    expect(verdict.reasons).toContain('BANK_CREDIT_AMOUNT_MISMATCH');
  });

  it('raises an exception when settlement timing is outside the window', () => {
    const late = new Date('2026-03-01T00:00:00Z');
    const verdict = reconcileUnit(
      unit({ settlements: [settlement(970_500n, { settlementAt: late })] }),
    );
    expect(verdict.outcome).toBe('EXCEPTION');
    expect(verdict.reasons).toContain('SETTLEMENT_TIMING_OUTSIDE_WINDOW');
  });

  it('raises an exception on a duplicate source record', () => {
    const verdict = reconcileUnit(
      unit({ duplicates: [{ key: 'k', ids: ['a', 'b'], detection: 'EXACT_SOURCE_ID' }] }),
    );
    expect(verdict.outcome).toBe('EXCEPTION');
    expect(verdict.reasons).toContain('DUPLICATE_SOURCE_RECORD');
  });

  it('raises an exception when refunds exceed the captured amount', () => {
    const refund: RefundRecord = {
      id: 'ref_1',
      scope: SCOPE,
      lineage: lineage('src_ref_1'),
      kind: 'REFUND',
      refundId: asId('ref_1'),
      paymentId: PAYMENT_ID,
      amount: money(2_000_000n, 'INR'),
      status: 'PROCESSED',
      createdAt: CAPTURED,
      settledAt: SETTLED,
    };
    const verdict = reconcileUnit(unit({ refunds: [refund] }));
    expect(verdict.outcome).toBe('EXCEPTION');
    expect(verdict.reasons).toContain('LIFECYCLE_INCONSISTENT');
  });

  it('reports SPLIT_SETTLEMENT_UNRESOLVED when legs do not conserve value', () => {
    const other = asId<SettlementId>('set_2');
    const verdict = reconcileUnit(
      unit({
        settlements: [
          settlement(500_000n),
          settlement(400_000n, { id: 'set_2', settlementId: other, utr: 'UTR002' }),
        ],
        settlementLines: [line(500_000n, 'sl_1'), line(400_000n, 'sl_2', other)],
        bankCredits: [credit(500_000n, 'UTR001'), { ...credit(400_000n, 'UTR002'), id: 'bc_2' }],
      }),
    );
    expect(verdict.outcome).toBe('EXCEPTION');
    expect(verdict.reasons).toContain('SPLIT_SETTLEMENT_UNRESOLVED');
  });

  it('never emits a cause code - only deterministic reason codes', () => {
    // The matcher must not label a cause. Causes belong to the closed taxonomy that
    // only the investigation layer proposes from; conflating them would make the
    // benchmark measure the generator's own labelling.
    const causeCodes = [
      'MDR_FEE',
      'UTR_SPLIT',
      'REFUND_NETTING',
      'TIMING_LAG',
      'ROUNDING_DRIFT',
      'AMBIGUOUS',
      'COMPOUND',
    ];
    const verdict = reconcileUnit(unit({ fees: [fee(40_000n)] }));
    for (const reason of verdict.reasons) expect(causeCodes).not.toContain(reason);
  });
});

describe('fee schedule versioning', () => {
  it('applies the v2 CARD rate (230 bps) after 2026-04-01', () => {
    const at = new Date('2026-04-06T10:00:00Z');
    const settledAt = new Date('2026-04-08T00:00:00Z');
    const feeMinor = 23_000n;
    const taxMinor = 4_140n;
    const net = 1_000_000n - feeMinor - taxMinor;
    const verdict = reconcileUnit(
      unit({
        payment: payment({ authorizedAt: at, capturedAt: at }),
        fees: [fee(feeMinor)],
        taxes: [tax(taxMinor)],
        settlements: [settlement(net, { settlementAt: settledAt })],
        settlementLines: [line(net)],
        bankCredits: [{ ...credit(net), creditedAt: new Date('2026-04-08T06:00:00Z') }],
      }),
    );
    expect(verdict.outcome).toBe('RECONCILED');
  });
});
