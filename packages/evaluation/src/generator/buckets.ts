/**
 * Configuration buckets (`NOVELTY_ALLOCATION_REVIEW.md` §4.3).
 *
 * Novelty is decided by lookup against a frozen registry, never hand-labelled. These
 * buckets define what "the same configuration" means, so their boundaries are frozen
 * with the registry and hashed into the manifest.
 */

import type { PaymentMethod } from '@settlementops/domain';

export const AMOUNT_BANDS = ['<1k', '1k-10k', '10k-100k', '>100k'] as const;
export type AmountBand = (typeof AMOUNT_BANDS)[number];

export const TIMING_BANDS = [
  'within_window',
  'one_cycle_late',
  'more_than_one_cycle_late',
] as const;
export type TimingBand = (typeof TIMING_BANDS)[number];

export const LINE_COUNT_BANDS = ['1', '2-4', '5+'] as const;
export type LineCountBand = (typeof LINE_COUNT_BANDS)[number];

export interface ConfigurationBucket {
  readonly amountBand: AmountBand;
  readonly timingBand: TimingBand;
  readonly lineCountBand: LineCountBand;
  readonly paymentMethod: PaymentMethod;
}

/** Bands are on the gross amount in minor units (paise). */
export const amountBandOf = (grossMinor: bigint): AmountBand => {
  if (grossMinor < 100_000n) return '<1k';
  if (grossMinor < 1_000_000n) return '1k-10k';
  if (grossMinor < 10_000_000n) return '10k-100k';
  return '>100k';
};

/** Cycles late, relative to the expected settlement date. */
export const timingBandOf = (cyclesLate: number): TimingBand => {
  if (cyclesLate <= 0) return 'within_window';
  if (cyclesLate <= 1) return 'one_cycle_late';
  return 'more_than_one_cycle_late';
};

export const lineCountBandOf = (lines: number): LineCountBand => {
  if (lines <= 1) return '1';
  if (lines <= 4) return '2-4';
  return '5+';
};

export const bucketKey = (b: ConfigurationBucket): string =>
  `${b.amountBand}|${b.timingBand}|${b.lineCountBand}|${b.paymentMethod}`;

/** Causes are sorted so that {A,B} and {B,A} are one tuple, never two. */
export const causeTupleKey = (causes: readonly string[]): string => [...causes].sort().join(',');
