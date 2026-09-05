/**
 * The only place bigint money crosses a serialization boundary.
 *
 * bigint is not JSON-serializable, and JSON numbers lose integer precision above
 * 2^53. Rather than let either failure mode happen silently, encoding asserts the
 * value is representable and decoding refuses anything that is not an integer.
 */

import { type Result, ok, err } from '@settlementops/shared';
import { type Currency, isCurrency } from './currency.js';
import { type Money, money } from './money.js';

export interface MoneyDto {
  readonly amount_minor: number;
  readonly currency: string;
}

export type CodecError =
  | { readonly kind: 'NOT_SAFE_INTEGER'; readonly value: string }
  | { readonly kind: 'NOT_AN_INTEGER'; readonly value: number }
  | { readonly kind: 'UNSUPPORTED_CURRENCY'; readonly value: string };

const MAX = BigInt(Number.MAX_SAFE_INTEGER);
const MIN = -MAX;

export const encodeMoney = (value: Money): Result<MoneyDto, CodecError> => {
  if (value.amountMinor > MAX || value.amountMinor < MIN) {
    return err({ kind: 'NOT_SAFE_INTEGER', value: value.amountMinor.toString() });
  }
  return ok({ amount_minor: Number(value.amountMinor), currency: value.currency });
};

export const decodeMoney = (dto: MoneyDto): Result<Money, CodecError> => {
  if (!Number.isInteger(dto.amount_minor)) {
    return err({ kind: 'NOT_AN_INTEGER', value: dto.amount_minor });
  }
  if (!Number.isSafeInteger(dto.amount_minor)) {
    return err({ kind: 'NOT_SAFE_INTEGER', value: String(dto.amount_minor) });
  }
  if (!isCurrency(dto.currency)) {
    return err({ kind: 'UNSUPPORTED_CURRENCY', value: dto.currency });
  }
  const currency: Currency = dto.currency;
  return ok(money(BigInt(dto.amount_minor), currency));
};
