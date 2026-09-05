import { describe, it, expect } from 'vitest';
import { isErr, isOk, unwrap } from '@settlementops/shared';
import { add, subtract, negate, abs, compare, equals, isZero, money, sum, zero } from './money.js';

/** Deterministic PRNG so property failures are reproducible. */
const lcg = (seed: number) => {
  let s = seed;
  return (): number => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
};

const randomMinor = (rand: () => number): bigint =>
  BigInt(Math.floor((rand() - 0.5) * 2_000_000_00));

describe('Money arithmetic', () => {
  it('adds and subtracts in minor units', () => {
    const a = money(1_000_000n, 'INR');
    const b = money(25_000n, 'INR');
    expect(unwrap(add(a, b)).amountMinor).toBe(1_025_000n);
    expect(unwrap(subtract(a, b)).amountMinor).toBe(975_000n);
  });

  it('negates, absolutes and detects zero', () => {
    expect(negate(money(500n, 'INR')).amountMinor).toBe(-500n);
    expect(abs(money(-500n, 'INR')).amountMinor).toBe(500n);
    expect(isZero(zero('INR'))).toBe(true);
  });

  it('compares within a currency', () => {
    expect(unwrap(compare(money(1n, 'INR'), money(2n, 'INR')))).toBe(-1);
    expect(unwrap(compare(money(2n, 'INR'), money(1n, 'INR')))).toBe(1);
    expect(unwrap(compare(money(2n, 'INR'), money(2n, 'INR')))).toBe(0);
  });

  it('sums a list and rejects an empty sum', () => {
    const total = unwrap(sum([money(1n, 'INR'), money(2n, 'INR'), money(3n, 'INR')]));
    expect(total.amountMinor).toBe(6n);
    expect(isErr(sum([]))).toBe(true);
  });

  it('handles values far beyond Number.MAX_SAFE_INTEGER without precision loss', () => {
    const huge = money(9_007_199_254_740_993n, 'INR'); // 2^53 + 1
    const result = unwrap(add(huge, money(1n, 'INR')));
    expect(result.amountMinor).toBe(9_007_199_254_740_994n);
    // The equivalent float computation is wrong; this is why the type is bigint.
    const viaFloat = BigInt(Number(9_007_199_254_740_993n));
    expect(viaFloat).not.toBe(9_007_199_254_740_993n);
  });

  it('handles negative amounts', () => {
    expect(unwrap(add(money(-100n, 'INR'), money(-50n, 'INR'))).amountMinor).toBe(-150n);
  });
});

describe('Money property: conservation', () => {
  it('a - b + b === a over randomised amounts', () => {
    const rand = lcg(20260831);
    for (let i = 0; i < 500; i += 1) {
      const a = money(randomMinor(rand), 'INR');
      const b = money(randomMinor(rand), 'INR');
      const roundTrip = unwrap(add(unwrap(subtract(a, b)), b));
      expect(equals(roundTrip, a)).toBe(true);
    }
  });

  it('addition is commutative and associative', () => {
    const rand = lcg(7);
    for (let i = 0; i < 500; i += 1) {
      const a = money(randomMinor(rand), 'INR');
      const b = money(randomMinor(rand), 'INR');
      const c = money(randomMinor(rand), 'INR');
      expect(equals(unwrap(add(a, b)), unwrap(add(b, a)))).toBe(true);
      const left = unwrap(add(unwrap(add(a, b)), c));
      const right = unwrap(add(a, unwrap(add(b, c))));
      expect(equals(left, right)).toBe(true);
    }
  });
});

describe('Money currency safety', () => {
  // A currency mismatch is a bug, never something to coerce away silently.
  const inr = money(100n, 'INR');
  const foreign = { amountMinor: 100n, currency: 'USD' } as unknown as typeof inr;

  it('rejects mismatched currency on add', () => {
    const r = add(inr, foreign);
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe('CURRENCY_MISMATCH');
  });

  it('rejects mismatched currency on subtract', () => {
    expect(isErr(subtract(inr, foreign))).toBe(true);
  });

  it('rejects mismatched currency on compare', () => {
    expect(isErr(compare(inr, foreign))).toBe(true);
  });

  it('rejects mismatched currency inside sum', () => {
    expect(isOk(sum([inr, inr]))).toBe(true);
    expect(isErr(sum([inr, foreign]))).toBe(true);
  });

  it('equals is false across currencies rather than throwing', () => {
    expect(equals(inr, foreign)).toBe(false);
  });
});
