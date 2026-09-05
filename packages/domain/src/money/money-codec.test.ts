import { describe, it, expect } from 'vitest';
import { isErr, unwrap } from '@settlementops/shared';
import { decodeMoney, encodeMoney } from './money-codec.js';
import { money } from './money.js';

describe('Money codec', () => {
  it('round-trips a normal amount', () => {
    const original = money(970_500n, 'INR');
    const dto = unwrap(encodeMoney(original));
    expect(dto).toEqual({ amount_minor: 970500, currency: 'INR' });
    expect(unwrap(decodeMoney(dto)).amountMinor).toBe(970_500n);
  });

  it('refuses to encode above MAX_SAFE_INTEGER rather than silently losing precision', () => {
    const r = encodeMoney(money(9_007_199_254_740_993n, 'INR'));
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe('NOT_SAFE_INTEGER');
  });

  it('refuses to decode a fractional value', () => {
    const r = decodeMoney({ amount_minor: 10.5, currency: 'INR' });
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe('NOT_AN_INTEGER');
  });

  it('refuses an unsupported currency', () => {
    const r = decodeMoney({ amount_minor: 100, currency: 'USD' });
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe('UNSUPPORTED_CURRENCY');
  });

  it('round-trips negative amounts', () => {
    const dto = unwrap(encodeMoney(money(-4_500n, 'INR')));
    expect(unwrap(decodeMoney(dto)).amountMinor).toBe(-4_500n);
  });
});
