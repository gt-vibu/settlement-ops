import { describe, it, expect } from 'vitest';
import { applyBasisPoints, mulDivHalfUp } from './rounding.js';
import { FEE_SCHEDULES, scheduleAt, scheduleById } from './fee-schedule.js';
import {
  ROUNDING_TOLERANCE_ABSOLUTE_CAP_MINOR,
  roundingToleranceFor,
  withinAmountMatchTolerance,
  withinRoundingTolerance,
} from './tolerances.js';
import {
  bankCreditWithinExpectedLag,
  expectedSettlementDate,
  isBusinessDay,
  adjustmentCanExplainSettlement,
  withinBankCreditLatenessTolerance,
} from './settlement-cycle.js';

describe('integer rounding', () => {
  it('reproduces the specification worked example exactly', () => {
    expect(applyBasisPoints(1_000_000n, 250)).toBe(25_000n); // 2.50% of 10,000.00
    expect(applyBasisPoints(25_000n, 1_800)).toBe(4_500n); // 18% GST on the fee
  });

  it('rounds half away from zero', () => {
    // 5 / 2 = 2.5 -> 3
    expect(mulDivHalfUp(5n, 1n, 2n)).toBe(3n);
    expect(mulDivHalfUp(-5n, 1n, 2n)).toBe(-3n);
    // 4 / 2 = 2 exactly
    expect(mulDivHalfUp(4n, 1n, 2n)).toBe(2n);
    // 1 / 3 = 0.33 -> 0
    expect(mulDivHalfUp(1n, 1n, 3n)).toBe(0n);
    // 2 / 3 = 0.66 -> 1
    expect(mulDivHalfUp(2n, 1n, 3n)).toBe(1n);
  });

  it('is exact on values that would lose precision as floats', () => {
    const huge = 9_007_199_254_740_993n;
    expect(mulDivHalfUp(huge, 1n, 1n)).toBe(huge);
  });

  it('rejects a zero denominator rather than returning Infinity', () => {
    expect(() => mulDivHalfUp(1n, 1n, 0n)).toThrow();
  });

  it('never produces a fractional result', () => {
    for (let amount = 0n; amount < 500n; amount += 7n) {
      const result = applyBasisPoints(amount, 250);
      expect(typeof result).toBe('bigint');
    }
  });
});

describe('fee schedule', () => {
  it('selects v1 before the 2026-04-01 change and v2 after', () => {
    expect(scheduleAt(new Date('2026-02-02T00:00:00Z'))?.id).toBe('fee-schedule-v1');
    expect(scheduleAt(new Date('2026-04-02T00:00:00Z'))?.id).toBe('fee-schedule-v2');
  });

  it('returns the v2 schedule exactly at the boundary', () => {
    expect(scheduleAt(new Date('2026-04-01T00:00:00Z'))?.id).toBe('fee-schedule-v2');
  });

  it('returns null before any schedule exists', () => {
    expect(scheduleAt(new Date('2025-06-01T00:00:00Z'))).toBeNull();
  });

  it('changes only the CARD rate between versions', () => {
    const v1 = scheduleById('fee-schedule-v1');
    const v2 = scheduleById('fee-schedule-v2');
    expect(v1?.feeRateBps.CARD).toBe(250);
    expect(v2?.feeRateBps.CARD).toBe(230);
    expect(v1?.feeRateBps.NETBANKING).toBe(v2?.feeRateBps.NETBANKING);
    expect(v1?.taxOnFeeBps).toBe(v2?.taxOnFeeBps);
  });

  it('keeps schedules in ascending effective order', () => {
    for (let i = 1; i < FEE_SCHEDULES.length; i += 1) {
      const prev = FEE_SCHEDULES[i - 1];
      const curr = FEE_SCHEDULES[i];
      expect(curr!.effectiveFrom.getTime()).toBeGreaterThan(prev!.effectiveFrom.getTime());
    }
  });
});

describe('rounding tolerance', () => {
  it('scales with contributing line count', () => {
    expect(roundingToleranceFor(1)).toBe(2n);
    expect(roundingToleranceFor(5)).toBe(10n);
  });

  it('is capped so it can never explain a material variance', () => {
    // The safety-critical property: without the cap, a large multi-line settlement
    // would accumulate an unbounded "rounding" allowance.
    expect(roundingToleranceFor(10_000)).toBe(ROUNDING_TOLERANCE_ABSOLUTE_CAP_MINOR);
    expect(ROUNDING_TOLERANCE_ABSOLUTE_CAP_MINOR).toBe(100n); // 1.00 rupee
  });

  it('accepts sub-tolerance variance in both directions', () => {
    expect(withinRoundingTolerance(2n, 1)).toBe(true);
    expect(withinRoundingTolerance(-2n, 1)).toBe(true);
    expect(withinRoundingTolerance(3n, 1)).toBe(false);
  });

  it('never accepts a material variance regardless of line count', () => {
    expect(withinRoundingTolerance(29_500n, 100_000)).toBe(false);
  });
});

describe('settlement cycle', () => {
  it('treats weekends as non-business days', () => {
    expect(isBusinessDay(new Date('2026-02-07T00:00:00Z'))).toBe(false); // Saturday
    expect(isBusinessDay(new Date('2026-02-08T00:00:00Z'))).toBe(false); // Sunday
    expect(isBusinessDay(new Date('2026-02-09T00:00:00Z'))).toBe(true); // Monday
  });

  it('settles T+2 business days from a pre-cutoff capture', () => {
    // Monday 2026-02-02 15:30 IST -> Wednesday 2026-02-04
    const settled = expectedSettlementDate(new Date('2026-02-02T10:00:00Z'));
    expect(settled.toISOString().slice(0, 10)).toBe('2026-02-04');
  });

  it('rolls a post-cutoff capture to the next day before counting', () => {
    // 2026-02-02 19:00 IST (13:30 UTC) is after the 18:00 cutoff -> counts from the 3rd
    const settled = expectedSettlementDate(new Date('2026-02-02T13:30:00Z'));
    expect(settled.toISOString().slice(0, 10)).toBe('2026-02-05');
  });

  it('skips the weekend', () => {
    // Thursday 2026-02-05 -> T+2 business days lands on Monday 2026-02-09
    const settled = expectedSettlementDate(new Date('2026-02-05T10:00:00Z'));
    expect(settled.toISOString().slice(0, 10)).toBe('2026-02-09');
  });

  it('accepts a bank credit inside the modeled lag and rejects one before settlement', () => {
    const settledAt = new Date('2026-02-04T00:00:00Z');
    expect(bankCreditWithinExpectedLag(settledAt, new Date('2026-02-04T06:00:00Z'))).toBe(true);
    expect(bankCreditWithinExpectedLag(settledAt, new Date('2026-02-05T06:00:00Z'))).toBe(false);
    // A credit that predates its settlement is not "early", it is inconsistent.
    expect(bankCreditWithinExpectedLag(settledAt, new Date('2026-02-03T00:00:00Z'))).toBe(false);
  });

  it('bounds how late a bank credit may be and still be an explanation', () => {
    const expected = new Date('2026-02-04T00:00:00Z');
    expect(withinBankCreditLatenessTolerance(expected, new Date('2026-02-06T00:00:00Z'))).toBe(
      true,
    );
    expect(withinBankCreditLatenessTolerance(expected, new Date('2026-02-10T00:00:00Z'))).toBe(
      false,
    );
  });

  describe('adjustment plausibility is causal, not a symmetric window', () => {
    // Settlement struck Wednesday 2026-02-04. Accrual window = 2 business days back,
    // i.e. from Monday 2026-02-02 inclusive.
    const settledAt = new Date('2026-02-04T00:00:00Z');

    it('CAUSALITY: rejects an adjustment effective after the settlement', () => {
      // The decisive rule, and it needs no tunable value at all: a settlement's net is
      // struck at settlementAt, so something effective later cannot be inside it.
      expect(adjustmentCanExplainSettlement(new Date('2026-02-04T00:00:01Z'), settledAt)).toBe(
        false,
      );
      expect(adjustmentCanExplainSettlement(new Date('2026-02-05T00:00:00Z'), settledAt)).toBe(
        false,
      );
      expect(adjustmentCanExplainSettlement(new Date('2026-03-10T00:00:00Z'), settledAt)).toBe(
        false,
      );
    });

    it('accepts an adjustment inside the accrual window', () => {
      expect(adjustmentCanExplainSettlement(settledAt, settledAt)).toBe(true);
      expect(adjustmentCanExplainSettlement(new Date('2026-02-03T12:00:00Z'), settledAt)).toBe(
        true,
      );
      expect(adjustmentCanExplainSettlement(new Date('2026-02-02T00:00:00Z'), settledAt)).toBe(
        true,
      );
    });

    it('RECENCY: rejects an adjustment older than one settlement cycle', () => {
      // Effective before Monday 2026-02-02 should have been carried by an earlier
      // settlement. Without this an adjustment from any past date could be claimed.
      expect(adjustmentCanExplainSettlement(new Date('2026-01-30T00:00:00Z'), settledAt)).toBe(
        false,
      );
      expect(adjustmentCanExplainSettlement(new Date('2025-06-01T00:00:00Z'), settledAt)).toBe(
        false,
      );
    });

    it('is ASYMMETRIC - the old rule treated these two identically', () => {
      // 24h before vs 24h after. The previous Math.abs-based rule accepted both.
      const before = new Date(settledAt.getTime() - 24 * 3_600_000);
      const after = new Date(settledAt.getTime() + 24 * 3_600_000);
      expect(adjustmentCanExplainSettlement(before, settledAt)).toBe(true);
      expect(adjustmentCanExplainSettlement(after, settledAt)).toBe(false);
    });

    it('skips weekends when walking the accrual window back', () => {
      // Settlement Monday 2026-02-09; 2 business days back = Thursday 2026-02-05,
      // NOT Saturday 2026-02-07.
      const monday = new Date('2026-02-09T00:00:00Z');
      expect(adjustmentCanExplainSettlement(new Date('2026-02-05T00:00:00Z'), monday)).toBe(true);
      expect(adjustmentCanExplainSettlement(new Date('2026-02-04T00:00:00Z'), monday)).toBe(false);
    });
  });
});

describe('exact amount matching (item 1: constant is now wired)', () => {
  it('accepts only a zero variance', () => {
    // AMOUNT_MATCH_TOLERANCE_MINOR is 0: outside the rounding path, amounts must agree
    // exactly. Previously this rule was emergent and the constant was never read.
    expect(withinAmountMatchTolerance(0n)).toBe(true);
    expect(withinAmountMatchTolerance(1n)).toBe(false);
    expect(withinAmountMatchTolerance(-1n)).toBe(false);
  });

  it('is strictly tighter than the rounding tolerance', () => {
    // A 2-paise variance is absorbed by rounding but must NOT pass exact matching.
    expect(withinRoundingTolerance(2n, 1)).toBe(true);
    expect(withinAmountMatchTolerance(2n)).toBe(false);
  });
});
