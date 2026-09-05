import { describe, it, expect } from 'vitest';
import { isErr, unwrap } from '@settlementops/shared';
import { buildBreakdown, expectedNet, matchesObserved, reconciles } from './amount-breakdown.js';
import { money, zero } from './money.js';

const lcg = (seed: number) => {
  let s = seed;
  return (): number => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
};

describe('AmountBreakdown', () => {
  it('reproduces the specification worked example exactly', () => {
    // specs/ARCHITECTURE.md section 16 and DEMO_SCENARIOS.md scenario 1:
    // 10,000.00 gross, 250.00 fee, 45.00 tax -> 9,705.00 net.
    const b = unwrap(
      buildBreakdown({
        gross: money(1_000_000n, 'INR'),
        fee: money(25_000n, 'INR'),
        tax: money(4_500n, 'INR'),
        refund: zero('INR'),
        adjustment: zero('INR'),
      }),
    );
    expect(b.expectedNetMinor).toBe(970_500n);
    expect(reconciles(b)).toBe(true);
  });

  it('treats adjustment as signed and refund as a deduction', () => {
    const b = unwrap(
      buildBreakdown({
        gross: money(1_000_000n, 'INR'),
        fee: money(25_000n, 'INR'),
        tax: money(4_500n, 'INR'),
        refund: money(100_000n, 'INR'),
        adjustment: money(-5_000n, 'INR'),
      }),
    );
    expect(b.expectedNetMinor).toBe(1_000_000n - 25_000n - 4_500n - 100_000n - 5_000n);
  });

  it('rejects a negative fee, tax, gross or refund', () => {
    const r = buildBreakdown({
      gross: money(1_000n, 'INR'),
      fee: money(-1n, 'INR'),
      tax: zero('INR'),
      refund: zero('INR'),
      adjustment: zero('INR'),
    });
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe('NEGATIVE_COMPONENT');
  });

  it('matches an observed net amount', () => {
    const b = unwrap(
      buildBreakdown({
        gross: money(1_000_000n, 'INR'),
        fee: money(25_000n, 'INR'),
        tax: money(4_500n, 'INR'),
        refund: zero('INR'),
        adjustment: zero('INR'),
      }),
    );
    expect(matchesObserved(b, money(970_500n, 'INR'))).toBe(true);
    expect(matchesObserved(b, money(970_499n, 'INR'))).toBe(false);
    expect(expectedNet(b).currency).toBe('INR');
  });

  it('property: every built breakdown reconciles', () => {
    const rand = lcg(1234);
    const pos = (): bigint => BigInt(Math.floor(rand() * 5_000_00));
    for (let i = 0; i < 500; i += 1) {
      const b = unwrap(
        buildBreakdown({
          gross: money(pos(), 'INR'),
          fee: money(pos(), 'INR'),
          tax: money(pos(), 'INR'),
          refund: money(pos(), 'INR'),
          adjustment: money(BigInt(Math.floor((rand() - 0.5) * 200_00)), 'INR'),
        }),
      );
      expect(reconciles(b)).toBe(true);
    }
  });
});
