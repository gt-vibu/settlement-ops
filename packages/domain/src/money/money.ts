/**
 * Money - integer minor units, never floating point.
 *
 * specs/AGENTS.md constraint 7 and specs/DATA_MODEL.md section 1 require integer
 * minor units; specs/PRODUCTION_READINESS.md lists floating-point authoritative
 * money math as a hard release blocker.
 *
 * bigint rather than number: it removes the 2^53 ceiling and makes it impossible to
 * silently acquire a fractional value. There is deliberately no multiply-by-float
 * operation - percentage fee computation is a domain service with an explicit,
 * tested rounding rule, not a primitive on this type.
 */

import { type Result, ok, err } from '@settlementops/shared';
import type { Currency } from './currency.js';

export interface Money {
  readonly amountMinor: bigint;
  readonly currency: Currency;
}

export type MoneyError =
  | { readonly kind: 'CURRENCY_MISMATCH'; readonly left: Currency; readonly right: Currency }
  | { readonly kind: 'NOT_AN_INTEGER'; readonly value: string }
  | { readonly kind: 'EMPTY_SUM' };

export const money = (amountMinor: bigint, currency: Currency): Money => ({
  amountMinor,
  currency,
});

export const zero = (currency: Currency): Money => money(0n, currency);

const sameCurrency = (a: Money, b: Money): Result<true, MoneyError> =>
  a.currency === b.currency
    ? ok(true)
    : err({ kind: 'CURRENCY_MISMATCH', left: a.currency, right: b.currency });

export const add = (a: Money, b: Money): Result<Money, MoneyError> => {
  const check = sameCurrency(a, b);
  return check.ok ? ok(money(a.amountMinor + b.amountMinor, a.currency)) : check;
};

export const subtract = (a: Money, b: Money): Result<Money, MoneyError> => {
  const check = sameCurrency(a, b);
  return check.ok ? ok(money(a.amountMinor - b.amountMinor, a.currency)) : check;
};

export const negate = (a: Money): Money => money(-a.amountMinor, a.currency);

export const abs = (a: Money): Money =>
  money(a.amountMinor < 0n ? -a.amountMinor : a.amountMinor, a.currency);

export const isZero = (a: Money): boolean => a.amountMinor === 0n;

export const isNegative = (a: Money): boolean => a.amountMinor < 0n;

/** -1 | 0 | 1, or a CURRENCY_MISMATCH error. Comparison across currencies is a bug. */
export const compare = (a: Money, b: Money): Result<-1 | 0 | 1, MoneyError> => {
  const check = sameCurrency(a, b);
  if (!check.ok) return check;
  if (a.amountMinor < b.amountMinor) return ok(-1);
  if (a.amountMinor > b.amountMinor) return ok(1);
  return ok(0);
};

export const equals = (a: Money, b: Money): boolean =>
  a.currency === b.currency && a.amountMinor === b.amountMinor;

export const sum = (values: readonly Money[]): Result<Money, MoneyError> => {
  const [head, ...rest] = values;
  if (head === undefined) return err({ kind: 'EMPTY_SUM' });
  let acc: Money = head;
  for (const next of rest) {
    const r = add(acc, next);
    if (!r.ok) return r;
    acc = r.value;
  }
  return ok(acc);
};
