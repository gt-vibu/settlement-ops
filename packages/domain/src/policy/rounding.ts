/**
 * Integer rounding for money.
 *
 * All rate application (fees, taxes) goes through here. HALF_UP means half away from
 * zero, applied to integer minor units - there is no floating point anywhere in the
 * computation, so the result is exactly reproducible by the verifier.
 */

export type RoundingMode = 'HALF_UP';

/**
 * (amount * numerator) / denominator, rounded HALF_UP, entirely in bigint.
 *
 * Worked example from the specification: 1_000_000 minor units at 250 bps
 *   (1_000_000 * 250) / 10_000 = 25_000 exactly -> no rounding needed.
 */
export const mulDivHalfUp = (amount: bigint, numerator: bigint, denominator: bigint): bigint => {
  if (denominator === 0n) throw new Error('mulDivHalfUp: denominator must be non-zero');

  const product = amount * numerator;
  const negative = product < 0n;
  const magnitude = negative ? -product : product;
  const absDenominator = denominator < 0n ? -denominator : denominator;

  const quotient = magnitude / absDenominator;
  const remainder = magnitude % absDenominator;

  // Half away from zero: promote when the remainder is at least half the divisor.
  const rounded = remainder * 2n >= absDenominator ? quotient + 1n : quotient;

  return negative ? -rounded : rounded;
};

const BPS_DENOMINATOR = 10_000n;

/** Applies a basis-point rate to an amount in minor units. */
export const applyBasisPoints = (amountMinor: bigint, bps: number): bigint =>
  mulDivHalfUp(amountMinor, BigInt(bps), BPS_DENOMINATOR);
