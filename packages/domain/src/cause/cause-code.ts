/**
 * Closed cause taxonomy (specs/CAUSE_TAXONOMY.md section 2).
 *
 * The set is closed on purpose: the agent may propose only these codes, and changing
 * the set changes the benchmark and the evidence requirements. Extension requires a
 * CHANGE_CONTROL.md record, not a code edit.
 */

export const CAUSE_CODES = [
  'MDR_FEE',
  'UTR_SPLIT',
  'REFUND_NETTING',
  'TIMING_LAG',
  'ROUNDING_DRIFT',
  'AMBIGUOUS',
  'COMPOUND',
] as const;

export type CauseCode = (typeof CAUSE_CODES)[number];

export const isCauseCode = (value: string): value is CauseCode =>
  (CAUSE_CODES as readonly string[]).includes(value);
