/**
 * Deterministic residual reason codes.
 *
 * These say why the BASELINE stopped - not what the cause is. The cause taxonomy is a
 * separate, closed set that only the investigation layer proposes from. Keeping them
 * apart matters: if the matcher could emit a cause, the benchmark would be measuring
 * the generator's own labelling rather than reasoning.
 */

export const RESIDUAL_REASONS = [
  'NO_SETTLEMENT_FOUND',
  'MULTIPLE_SETTLEMENT_CANDIDATES',
  'NET_AMOUNT_MISMATCH',
  'SPLIT_SETTLEMENT_UNRESOLVED',
  'MISSING_BANK_CREDIT',
  'BANK_CREDIT_AMOUNT_MISMATCH',
  'SETTLEMENT_TIMING_OUTSIDE_WINDOW',
  'BANK_CREDIT_TIMING_OUTSIDE_WINDOW',
  'MISSING_FEE_RECORD',
  'UNEXPECTED_FEE_AMOUNT',
  'DUPLICATE_SOURCE_RECORD',
  'REFUND_OUTSIDE_NETTING_WINDOW',
  'LIFECYCLE_INCONSISTENT',
  'CURRENCY_INCONSISTENT',
] as const;

export type ResidualReason = (typeof RESIDUAL_REASONS)[number];

export const isResidualReason = (value: string): value is ResidualReason =>
  (RESIDUAL_REASONS as readonly string[]).includes(value);
