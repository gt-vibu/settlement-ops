/**
 * Currency.
 *
 * The MVP is single-currency (INR). See EXPERIMENT_CONSTANTS.md M1 - that value is
 * structural rather than a tuned threshold, so it is safe to encode before D7 is
 * approved. Adding a currency is a deliberate change, not a configuration tweak,
 * because it introduces FX and a class of rounding causes the taxonomy does not model.
 */

export const SUPPORTED_CURRENCIES = ['INR'] as const;

export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

/** Decimal places in the minor unit. INR: 100 paise = 1 rupee. */
export const MINOR_UNIT_EXPONENT: Readonly<Record<Currency, number>> = { INR: 2 };

export const isCurrency = (value: string): value is Currency =>
  (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
