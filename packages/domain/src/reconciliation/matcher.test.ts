import { describe, it, expect } from 'vitest';
import { asId, type SettlementId } from '@settlementops/shared';
import { money } from '../money/money.js';
import type { RefundRecord } from '../records/financial-records.js';
import { POLICY_VERSION } from '../policy/policy-version.js';
import { reconcileUnit } from './matcher.js';
import {
  CAPTURED,
  PAYMENT_ID,
  SCOPE,
  SETTLED,
  credit,
  line,
  lineage,
  settlement,
  unit,
} from './matcher.fixtures.js';

describe('baseline: the clean case reconciles without AI', () => {
  it('closes the specification worked example', () => {
    const verdict = reconcileUnit(unit());
    expect(verdict.outcome).toBe('RECONCILED');
    expect(verdict.reasons).toEqual([]);
    expect(verdict.breakdown?.expectedNetMinor).toBe(970_500n);
    expect(verdict.discrepancy.amountMinor).toBe(0n);
  });

  it('runs every check and records evidence', () => {
    const verdict = reconcileUnit(unit());
    expect(verdict.checks.length).toBeGreaterThanOrEqual(9);
    expect(verdict.checks.every((c) => c.status !== 'NOT_RUN')).toBe(true);
    expect(verdict.evidenceRecordIds).toContain('pay_1');
    // Pinned to the frozen policy: a verdict must carry the version that produced it, so
    // a benchmark row can always be traced to the rules in force when it was scored.
    expect(verdict.policyVersion).toBe(POLICY_VERSION);
  });

  it('is deterministic - identical input gives an identical verdict', () => {
    const a = reconcileUnit(unit());
    const b = reconcileUnit(unit());
    expect(a.outcome).toBe(b.outcome);
    expect(a.discrepancy.amountMinor).toBe(b.discrepancy.amountMinor);
    expect(a.reasons).toEqual(b.reasons);
  });
});

describe('baseline strength: it closes hard-but-provable cases', () => {
  it('closes a SPLIT settlement when the legs conserve value', () => {
    // The same payment across two settlement legs. A naive one-to-one matcher fails
    // here; summing the legs proves conservation, so the baseline closes it.
    const other = asId<SettlementId>('set_2');
    const verdict = reconcileUnit(
      unit({
        settlements: [
          settlement(500_000n),
          settlement(470_500n, { id: 'set_2', settlementId: other, utr: 'UTR002' }),
        ],
        settlementLines: [line(500_000n, 'sl_1'), line(470_500n, 'sl_2', other)],
        bankCredits: [credit(500_000n, 'UTR001'), { ...credit(470_500n, 'UTR002'), id: 'bc_2' }],
      }),
    );
    expect(verdict.outcome).toBe('RECONCILED');
  });

  it('closes a refund netted within the allowed window', () => {
    const refund: RefundRecord = {
      id: 'ref_1',
      scope: SCOPE,
      lineage: lineage('src_ref_1'),
      kind: 'REFUND',
      refundId: asId('ref_1'),
      paymentId: PAYMENT_ID,
      amount: money(100_000n, 'INR'),
      status: 'PROCESSED',
      createdAt: CAPTURED,
      settledAt: SETTLED,
    };
    const verdict = reconcileUnit(
      unit({
        refunds: [refund],
        settlements: [settlement(870_500n)],
        settlementLines: [line(870_500n)],
        bankCredits: [credit(870_500n)],
      }),
    );
    expect(verdict.outcome).toBe('RECONCILED');
  });

  it('absorbs sub-rupee rounding drift but not more', () => {
    const withinTolerance = reconcileUnit(
      unit({
        settlementLines: [line(970_499n)],
        settlements: [settlement(970_499n)],
        bankCredits: [credit(970_499n)],
      }),
    );
    expect(withinTolerance.outcome).toBe('RECONCILED');

    const beyondTolerance = reconcileUnit(
      unit({
        settlementLines: [line(970_400n)],
        settlements: [settlement(970_400n)],
        bankCredits: [credit(970_400n)],
      }),
    );
    expect(beyondTolerance.outcome).toBe('EXCEPTION');
    expect(beyondTolerance.reasons).toContain('NET_AMOUNT_MISMATCH');
  });
});
